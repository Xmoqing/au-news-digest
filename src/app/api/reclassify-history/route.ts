import { NextRequest, NextResponse } from 'next/server';
import { isRequestAuthorized } from '@/lib/auth';
import {
  batchUpdateArticleCategories,
  getAllArticlesForReclassify,
} from '@/lib/db';
import { hasConfiguredGeminiKey, reclassifyArticlesBatch } from '@/lib/gemini';
import { NEWS_CATEGORIES, type NewsCategory } from '@/types/news';

export const dynamic = 'force-dynamic';

const BATCH_SIZE = 50;

export interface ReclassifyChangeRecord {
  id: number;
  source_name: string;
  zh_title: string;
  from: NewsCategory;
  to: NewsCategory;
}

export interface ReclassifyHistoryResult {
  ok: boolean;
  totalScanned: number;
  updatedCount: number;
  unchangedCount: number;
  batchesProcessed: number;
  modelsUsed: string[];
  categoryCountsAfter: Record<NewsCategory, number>;
  changes: ReclassifyChangeRecord[];
  errors: string[];
  message: string;
}

declare global {
  // eslint-disable-next-line no-var
  var __auNewsReclassifyPromise: Promise<ReclassifyHistoryResult> | undefined;
}

async function runHistoryReclassification(): Promise<ReclassifyHistoryResult> {
  if (!hasConfiguredGeminiKey()) {
    return {
      ok: false,
      totalScanned: 0,
      updatedCount: 0,
      unchangedCount: 0,
      batchesProcessed: 0,
      modelsUsed: [],
      categoryCountsAfter: Object.fromEntries(
        NEWS_CATEGORIES.map((c) => [c, 0])
      ) as Record<NewsCategory, number>,
      changes: [],
      errors: ['未配置 GEMINI_API_KEY'],
      message: '未检测到有效的 GEMINI_API_KEY，无法校准历史文章分类',
    };
  }

  const allArticles = await getAllArticlesForReclassify();
  const categoryCountsAfter = Object.fromEntries(
    NEWS_CATEGORIES.map((c) => [c, 0])
  ) as Record<NewsCategory, number>;

  if (allArticles.length === 0) {
    return {
      ok: true,
      totalScanned: 0,
      updatedCount: 0,
      unchangedCount: 0,
      batchesProcessed: 0,
      modelsUsed: [],
      categoryCountsAfter,
      changes: [],
      errors: [],
      message: '数据库中暂无历史文章需要校准',
    };
  }

  const exhaustedModels = new Set<string>();
  const modelsUsedSet = new Set<string>();
  const allChanges: ReclassifyChangeRecord[] = [];
  const errors: string[] = [];
  let batchesProcessed = 0;
  let updatedCount = 0;

  for (let i = 0; i < allArticles.length; i += BATCH_SIZE) {
    const batch = allArticles.slice(i, i + BATCH_SIZE);
    batchesProcessed += 1;

    try {
      const { mapping, modelUsed } = await reclassifyArticlesBatch(
        batch.map((a) => ({
          id: a.id,
          source_name: a.source_name,
          zh_title: a.zh_title,
        })),
        exhaustedModels
      );

      if (modelUsed && modelUsed !== 'none') {
        modelsUsedSet.add(modelUsed);
      }

      const batchUpdates: Array<{ id: number; category: NewsCategory }> = [];

      for (const article of batch) {
        const nextCategory = mapping[article.id] ?? article.category;
        categoryCountsAfter[nextCategory] = (categoryCountsAfter[nextCategory] ?? 0) + 1;

        if (nextCategory !== article.category) {
          batchUpdates.push({ id: article.id, category: nextCategory });
          allChanges.push({
            id: article.id,
            source_name: article.source_name,
            zh_title: article.zh_title,
            from: article.category,
            to: nextCategory,
          });
        }
      }

      if (batchUpdates.length > 0) {
        const applied = await batchUpdateArticleCategories(batchUpdates);
        updatedCount += applied;
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[API /api/reclassify-history] Batch ${batchesProcessed} failed:`, errMsg);
      errors.push(`批次 ${batchesProcessed} 失败: ${errMsg.slice(0, 200)}`);

      // Preserve original category counts for failed batch
      for (const article of batch) {
        categoryCountsAfter[article.category] =
          (categoryCountsAfter[article.category] ?? 0) + 1;
      }
    }
  }

  const totalScanned = allArticles.length;
  const unchangedCount = Math.max(0, totalScanned - updatedCount);
  const ok = errors.length === 0 || updatedCount > 0;

  const message =
    errors.length === 0
      ? `校准完成：共扫描 ${totalScanned} 篇历史文章，已修正 ${updatedCount} 篇分类`
      : `部分完成：共扫描 ${totalScanned} 篇，已修正 ${updatedCount} 篇（${errors.length} 个批次失败）`;

  console.log(
    `[ReclassifyHistory] ${message} | models=${Array.from(modelsUsedSet).join(', ')}`
  );

  return {
    ok,
    totalScanned,
    updatedCount,
    unchangedCount,
    batchesProcessed,
    modelsUsed: Array.from(modelsUsedSet),
    categoryCountsAfter,
    changes: allChanges,
    errors,
    message,
  };
}

async function handleReclassifyRequest(request: NextRequest): Promise<NextResponse> {
  if (!isRequestAuthorized(request, { allowQueryPassword: true })) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Unauthorized',
        message: '未授权请求：请先登录网站，或在浏览器 URL 后附带 ?pwd=你的访问口令',
      },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  try {
    if (!globalThis.__auNewsReclassifyPromise) {
      globalThis.__auNewsReclassifyPromise = runHistoryReclassification().finally(() => {
        globalThis.__auNewsReclassifyPromise = undefined;
      });
    }

    const result = await globalThis.__auNewsReclassifyPromise;
    return NextResponse.json(result, {
      status: result.ok ? 200 : 500,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error('[API /api/reclassify-history] Unexpected error:', err);
    return NextResponse.json(
      {
        ok: false,
        message: err instanceof Error ? err.message : '历史分类校准失败',
      },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

export async function POST(request: NextRequest) {
  return handleReclassifyRequest(request);
}

export async function GET(request: NextRequest) {
  return handleReclassifyRequest(request);
}
