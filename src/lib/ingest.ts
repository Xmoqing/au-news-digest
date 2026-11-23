import {
  enforceDatabaseSizeLimit,
  getExistingUrlStatus,
  getPendingUntranslatedArticles,
  getRecentLeadArticles,
  getTotalArticleCount,
  setMeta,
  upsertArticle,
} from '@/lib/db';
import {
  getGeminiModel,
  hasConfiguredGeminiKey,
  translateArticlesBatch,
} from '@/lib/gemini';
import { fetchArticleFullText, fetchRssSource, type ParsedFeedItem } from '@/lib/rss';
import {
  RSS_SOURCES,
  type RecentLeadContext,
  type RefreshResult,
  type RefreshState,
} from '@/types/news';

declare global {
  // eslint-disable-next-line no-var
  var __auNewsRefreshPromise: Promise<RefreshResult> | undefined;
  // eslint-disable-next-line no-var
  var __auNewsRefreshState: RefreshState | undefined;
}

const DEFAULT_MAX_ITEMS_PER_AU_FEED = 10;
const DEFAULT_MAX_ITEMS_PER_GLOBAL_FEED = 12;
const DEFAULT_MAX_DB_SIZE_GB = 10;
const BYTES_PER_GB = 1024 * 1024 * 1024;
const EXTRACT_CONCURRENCY = 6;
const TRANSLATE_BATCH_SIZE = 6;

const SOURCE_REGION_MAP = new Map(RSS_SOURCES.map((s) => [s.id, s.region]));

export function getMaxItemsPerFeed(): number {
  const parsed = Number(process.env.MAX_ITEMS_PER_FEED);
  if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 50) {
    return Math.floor(parsed);
  }
  return DEFAULT_MAX_ITEMS_PER_AU_FEED;
}

export function getMaxItemsPerGlobalFeed(): number {
  const parsed = Number(process.env.MAX_ITEMS_PER_GLOBAL_FEED);
  if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 100) {
    return Math.floor(parsed);
  }
  return DEFAULT_MAX_ITEMS_PER_GLOBAL_FEED;
}

export function getMaxDbSizeGb(): number {
  const parsed = Number(process.env.MAX_DB_SIZE_GB);
  if (Number.isFinite(parsed) && parsed > 0 && parsed <= 1000) {
    return parsed;
  }
  return DEFAULT_MAX_DB_SIZE_GB;
}

export function getMaxDbSizeBytes(): number {
  return Math.floor(getMaxDbSizeGb() * BYTES_PER_GB);
}

export function getRefreshState(): RefreshState {
  return (
    globalThis.__auNewsRefreshState ?? {
      isRefreshing: false,
      startedAt: null,
      progress: null,
      lastResult: null,
    }
  );
}

function setRefreshState(state: RefreshState): void {
  globalThis.__auNewsRefreshState = state;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
  return results;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function executeRefreshPipeline(reason: string): Promise<RefreshResult> {
  const startedAt = new Date().toISOString();
  const hasGeminiKey = hasConfiguredGeminiKey();
  const maxAuPerFeed = getMaxItemsPerFeed();
  const maxGlobalPerFeed = getMaxItemsPerGlobalFeed();
  const maxDbSizeGb = getMaxDbSizeGb();
  const maxDbSizeBytes = getMaxDbSizeBytes();
  const feedErrors: string[] = [];

  setRefreshState({
    isRefreshing: true,
    startedAt,
    progress: {
      current: 0,
      total: RSS_SOURCES.length,
      stage: `正在并行拉取 ${RSS_SOURCES.length} 个澳洲与国际主流媒体 RSS...`,
    },
    lastResult: null,
  });

  console.log(
    `[Ingest] Starting refresh (${reason}), auPerFeed=${maxAuPerFeed}, globalPerFeed=${maxGlobalPerFeed}, maxDbSizeGb=${maxDbSizeGb}, gemini=${hasGeminiKey}, primaryModel=${getGeminiModel()}`
  );

  try {
    // 1. Fetch all 8 RSS sources in parallel
    const settledFeeds = await Promise.allSettled(
      RSS_SOURCES.map((source) =>
        fetchRssSource(
          source,
          source.region === 'global' ? maxGlobalPerFeed : maxAuPerFeed
        )
      )
    );

    const candidateMap = new Map<string, ParsedFeedItem>();
    settledFeeds.forEach((result, idx) => {
      const source = RSS_SOURCES[idx];
      if (result.status === 'fulfilled') {
        for (const item of result.value) {
          if (!candidateMap.has(item.original_url)) {
            candidateMap.set(item.original_url, item);
          }
        }
      } else {
        const msg = `${source.shortName}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`;
        feedErrors.push(msg);
        console.error(`[Ingest] RSS fetch failed -> ${msg}`);
      }
    });

    const candidates = Array.from(candidateMap.values());
    const existingStatus = await getExistingUrlStatus(candidates.map((c) => c.original_url));

    const toProcess: Array<ParsedFeedItem & { existingContent?: string }> = [];
    let skipped = 0;
    for (const item of candidates) {
      const existing = existingStatus.get(item.original_url);
      if (!existing) {
        toProcess.push(item);
      } else if (hasGeminiKey && !existing.ai_translated) {
        toProcess.push(item);
      } else {
        skipped++;
      }
    }

    const pendingOlder = hasGeminiKey ? await getPendingUntranslatedArticles(60) : [];
    for (const pending of pendingOlder) {
      if (!toProcess.some((item) => item.original_url === pending.original_url)) {
        toProcess.push({
          original_url: pending.original_url,
          source_id: pending.source_id,
          source_name: pending.source_name,
          region: SOURCE_REGION_MAP.get(pending.source_id) ?? 'au',
          original_title: pending.original_title,
          original_excerpt: pending.original_excerpt,
          rss_categories: [],
          image_url: pending.image_url,
          author: pending.author,
          published_at: pending.published_at,
          existingContent: pending.original_content,
        });
      }
    }

    let added = 0;
    let updated = 0;
    let clustered = 0;
    let failed = 0;
    let aiFailed = 0;
    let lastAiError: string | undefined;
    let usedModel = getGeminiModel();

    if (toProcess.length > 0) {
      setRefreshState({
        isRefreshing: true,
        startedAt,
        progress: {
          current: 0,
          total: toProcess.length,
          stage: `正在提取 ${toProcess.length} 篇新闻正文与配图...`,
        },
        lastResult: null,
      });

      const enriched = await mapWithConcurrency(
        toProcess,
        EXTRACT_CONCURRENCY,
        async (item) => {
          if (item.existingContent && item.existingContent.length > 200) {
            return {
              item,
              content: item.existingContent,
              imageUrl: item.image_url,
            };
          }
          const extracted = await fetchArticleFullText(item.original_url, item.original_excerpt);
          return {
            item,
            content: extracted.content,
            imageUrl: extracted.imageUrl || item.image_url,
          };
        }
      );

      // Load past 24h lead articles for cross-media smart topic clustering
      const recentLeads: RecentLeadContext[] = await getRecentLeadArticles(24, 60);

      const batches = chunkArray(enriched, TRANSLATE_BATCH_SIZE);
      const exhaustedModels = new Set<string>();
      let processedCount = 0;

      // Run batches sequentially so newly created lead topics in batch B immediately serve as cluster targets for batch B+1
      for (let b = 0; b < batches.length; b++) {
        const batch = batches[b];
        setRefreshState({
          isRefreshing: true,
          startedAt,
          progress: {
            current: processedCount,
            total: enriched.length,
            stage: hasGeminiKey
              ? `Gemini 批量编译与智能聚合中 (第 ${b + 1}/${batches.length} 批 · ${processedCount}/${enriched.length} 篇)...`
              : `正在保存资讯 (${processedCount}/${enriched.length})...`,
          },
          lastResult: null,
        });

        const translations = await translateArticlesBatch(
          batch.map(({ item, content }) => ({
            source_id: item.source_id,
            source_name: item.source_name,
            region: item.region,
            original_title: item.original_title,
            original_excerpt: item.original_excerpt,
            original_content: content,
            rss_categories: item.rss_categories,
          })),
          recentLeads,
          exhaustedModels
        );

        // Track canonical root cluster ID for each item saved in this batch
        const batchRootIds: Array<number | null> = new Array(batch.length).fill(null);

        for (let i = 0; i < batch.length; i++) {
          const { item, content, imageUrl } = batch[i];
          const translated = translations[i];
          try {
            if (translated.model_used) {
              usedModel = translated.model_used;
            }
            if (hasGeminiKey && !translated.ai_translated) {
              aiFailed++;
              if (translated.error && !lastAiError) {
                lastAiError = translated.error;
              }
            }

            // Resolve cross-media cluster_id (existing 24h lead OR earlier lead in this same batch)
            let resolvedClusterId: number | null = translated.matched_cluster_id;
            if (
              resolvedClusterId === null &&
              translated.matched_batch_idx !== null &&
              translated.matched_batch_idx < i
            ) {
              resolvedClusterId = batchRootIds[translated.matched_batch_idx];
            }

            const { status, id: savedId } = await upsertArticle({
              original_url: item.original_url,
              source_id: item.source_id,
              source_name: item.source_name,
              original_title: item.original_title,
              original_excerpt: item.original_excerpt,
              original_content: content,
              zh_title: translated.zh_title,
              zh_summary: translated.zh_summary,
              zh_key_points: translated.zh_key_points,
              zh_content: translated.zh_content,
              category: translated.category,
              image_url: imageUrl,
              author: item.author,
              published_at: item.published_at,
              fetched_at: new Date().toISOString(),
              ai_translated: translated.ai_translated,
              cluster_id: resolvedClusterId,
            });

            if (resolvedClusterId !== null) {
              batchRootIds[i] = resolvedClusterId;
              clustered++;
            } else {
              batchRootIds[i] = savedId;
              // Add newly created lead article to recentLeads for subsequent batches
              if (translated.ai_translated && savedId > 0) {
                recentLeads.unshift({
                  id: savedId,
                  zh_title: translated.zh_title,
                  source_name: item.source_name,
                  category: translated.category,
                });
                if (recentLeads.length > 70) recentLeads.pop();
              }
            }

            if (status === 'inserted') added++;
            else updated++;
          } catch (err) {
            failed++;
            console.error(`[Ingest] DB upsert failed for ${item.original_url}:`, err);
          } finally {
            processedCount++;
          }
        }
      }
    }

    // Storage-watermark cleanup: retain 100% of historical news until total DB size reaches MAX_DB_SIZE_GB (default 10GB)
    await enforceDatabaseSizeLimit(maxDbSizeBytes, 500);

    const finishedAt = new Date().toISOString();
    const totalInDb = await getTotalArticleCount();
    const translatedSuccess = added + updated - aiFailed;
    const clusterNote = clustered > 0 ? `，智能合并 ${clustered} 篇同主题报道` : '';
    const message = !hasGeminiKey
      ? `已抓取原文 ${added} 篇（跳过 ${skipped} 篇），配置 GEMINI_API_KEY 后将自动翻译为中文`
      : aiFailed > 0
        ? `成功编译 ${Math.max(0, translatedSuccess)} 篇，失败 ${aiFailed} 篇（模型额度或网络受限，请查看日志）`
        : `同步完成（${usedModel}）：新增 ${added} 篇${clusterNote}，跳过重复 ${skipped} 篇（库内共 ${totalInDb} 篇）`;

    await setMeta('last_updated_at', finishedAt);
    await setMeta('last_refresh_summary', message);

    console.log(
      `[Ingest] Done (${reason}): model=${usedModel}, added=${added}, updated=${updated}, clustered=${clustered}, skipped=${skipped}, failed=${failed}, aiFailed=${aiFailed}, total=${totalInDb}`
    );

    const finalResult: RefreshResult = {
      ok: aiFailed === 0 || translatedSuccess > 0,
      added,
      updated,
      skipped,
      failed: failed + aiFailed,
      totalInDb,
      lastUpdated: finishedAt,
      hasGeminiKey,
      message,
      feedErrors: lastAiError ? [...feedErrors, lastAiError] : feedErrors,
    };

    setRefreshState({
      isRefreshing: false,
      startedAt: null,
      progress: null,
      lastResult: finalResult,
    });

    return finalResult;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[Ingest] Pipeline error:', errorMsg);
    const totalInDb = await getTotalArticleCount().catch(() => 0);
    const errResult: RefreshResult = {
      ok: false,
      added: 0,
      updated: 0,
      skipped: 0,
      failed: 1,
      totalInDb,
      lastUpdated: null,
      hasGeminiKey,
      message: `刷新失败: ${errorMsg}`,
      feedErrors: [...feedErrors, errorMsg],
    };
    setRefreshState({
      isRefreshing: false,
      startedAt: null,
      progress: null,
      lastResult: errResult,
    });
    return errResult;
  }
}

export async function refreshNews(reason = 'manual'): Promise<RefreshResult> {
  if (globalThis.__auNewsRefreshPromise) {
    return globalThis.__auNewsRefreshPromise;
  }

  globalThis.__auNewsRefreshPromise = executeRefreshPipeline(reason).finally(() => {
    globalThis.__auNewsRefreshPromise = undefined;
  });

  return globalThis.__auNewsRefreshPromise;
}
