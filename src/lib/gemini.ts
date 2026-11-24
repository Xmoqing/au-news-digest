import { GoogleGenAI, Type, type Schema } from '@google/genai';
import type { NewsCategory, RecentLeadContext, SourceId } from '@/types/news';
import { NEWS_CATEGORIES } from '@/types/news';

export interface ArticleToTranslate {
  source_id: SourceId;
  source_name: string;
  region: 'au' | 'global';
  original_title: string;
  original_excerpt: string;
  original_content: string;
  rss_categories: string[];
}

export interface TranslatedNewsOutput {
  zh_title: string;
  zh_summary: string;
  zh_key_points: string[];
  zh_content: string;
  category: NewsCategory;
  matched_cluster_id: number | null;
  matched_batch_idx: number | null;
  ai_translated: boolean;
  model_used?: string;
  error?: string;
}

const DEFAULT_GEMINI_MODEL = 'gemini-flash-lite-latest';

const FALLBACK_MODELS = [
  'gemini-flash-lite-latest',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.8-flash',
  'gemini-flash-latest',
];

const RECLASSIFY_MODELS = [
  'gemini-flash-lite-latest',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.8-flash',
  'gemini-flash-latest',
];

const RECLASSIFY_BATCH_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    classifications: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: {
            type: Type.INTEGER,
            description: '对应输入文章的整数 id',
          },
          category: {
            type: Type.STRING,
            enum: ['澳洲要闻', '国际热点', '财经市场', '科技前沿', '社会生活'],
            description: '按最新严格规则判定后的新分类名称',
          },
        },
        required: ['id', 'category'],
      },
    },
  },
  required: ['classifications'],
};

const VALID_CATEGORIES = new Set<string>(NEWS_CATEGORIES);

const CATEGORY_ENUM: NewsCategory[] = ['澳洲要闻', '国际热点', '财经市场', '科技前沿', '社会生活'];

const SINGLE_ARTICLE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    zh_title: {
      type: Type.STRING,
      description: '地道、精炼、易懂的简体中文新闻标题，不加引号或书名号，30字以内。',
    },
    zh_summary: {
      type: Type.STRING,
      description: '严格控制在60字以内的连贯核心摘要，适合手机端目录卡片快速浏览。',
    },
    zh_key_points: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        '2至3条清晰简短的分点核心要点（每条不超过45字），用平实直白的中文分别概括“发生了什么”以及“有什么影响”，方便长辈一眼看懂。',
    },
    zh_content: {
      type: Type.STRING,
      description:
        '基于英文原文的完整、准确、流畅的简体中文新闻正文翻译。使用自然分段（段落之间用两个换行符 \\n\\n 分隔），忠实于原文信息，不编造事实。',
    },
    category: {
      type: Type.STRING,
      enum: CATEGORY_ENUM,
      description:
        '从五个固定分类中选择最贴切的一个：澳洲要闻、国际热点、财经市场、科技前沿、社会生活。',
    },
    matched_cluster_id: {
      type: Type.INTEGER,
      nullable: true,
      description:
        '如果本篇新闻与「近24小时已入库主新闻列表」中的某一条报道的是完全相同的具体突发事件或同一核心新闻主题，返回那条主新闻的整数 id；若是全新事件，返回 null。',
    },
  },
  required: ['zh_title', 'zh_summary', 'zh_key_points', 'zh_content', 'category'],
};

const BATCH_ARTICLES_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    articles: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          idx: {
            type: Type.INTEGER,
            description: '对应输入新闻的编号 idx（从 0 开始）。',
          },
          zh_title: {
            type: Type.STRING,
            description: '地道、精炼、易懂的简体中文新闻标题，30字以内。',
          },
          zh_summary: {
            type: Type.STRING,
            description: '严格控制在60字以内的连贯核心摘要。',
          },
          zh_key_points: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description:
              '2至3条简明分点要点（每条不超过45字），清晰概括“发生了什么”和“有什么影响”，语言通俗易懂，方便长辈阅读。',
          },
          zh_content: {
            type: Type.STRING,
            description: '完整流畅的简体中文正文翻译，使用 \\n\\n 合理分段。',
          },
          category: {
            type: Type.STRING,
            enum: CATEGORY_ENUM,
          },
          matched_cluster_id: {
            type: Type.INTEGER,
            nullable: true,
            description:
              '如果本篇新闻与「近24小时已入库主新闻列表」中的某条主新闻报道的是同一具体突发事件/同一主题，填入那条主新闻的整数 id；否则填 null。',
          },
          matched_batch_idx: {
            type: Type.INTEGER,
            nullable: true,
            description:
              '仅当 matched_cluster_id 为 null 时：如果本篇新闻与本批次中编号更小（idx < 当前 idx）的某篇新闻报道的是同一具体事件，填入那个更小的 idx；否则填 null。',
          },
        },
        required: ['idx', 'zh_title', 'zh_summary', 'zh_key_points', 'zh_content', 'category'],
      },
    },
  },
  required: ['articles'],
};

export function getGeminiModel(): string {
  const configured = process.env.GEMINI_MODEL?.trim();
  return configured && configured.length > 0 ? configured : DEFAULT_GEMINI_MODEL;
}

export function getModelChain(): string[] {
  const primary = getGeminiModel();
  return Array.from(new Set([primary, ...FALLBACK_MODELS]));
}

export function hasConfiguredGeminiKey(): boolean {
  const key = process.env.GEMINI_API_KEY?.trim();
  return Boolean(key && key.length > 10 && key !== 'your_gemini_api_key_here');
}

function getClient(): GoogleGenAI | null {
  if (!hasConfiguredGeminiKey()) return null;
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY!.trim() });
}

export function inferFallbackCategory(
  sourceId: SourceId,
  region: 'au' | 'global',
  title: string,
  rssCategories: string[]
): NewsCategory {
  const haystack = `${title} ${rssCategories.join(' ')}`.toLowerCase();

  // Exclude obvious consumer/lifestyle/personal-finance/lawsuit/cyber fluff from 财经市场
  const isNonMarketFluff =
    /\b(retired|husband|wife|marriage|grocery|supermarket|cyberattack|hacked|crime database|store opening|court|lawsuit|crime|murder|sport|cricket|afl|recipe|travel)\b/.test(
      haystack
    );

  // Strict Stocks, Equities, Central Banks, FX & Commodities check
  const isPureMarketTopic =
    /\b(asx|s&p|dow jones|nasdaq|nyse|stock|stocks|shares|equities|wall street|ipo|earnings|eps|revenue beat|guidance|dividend|upgrade|downgrade|price target|merger|acquisition|m&a|rba|fed|federal reserve|interest rate|rate cut|rate hike|cpi|inflation|bond yield|treasury|forex|aud\/usd|aud\/cny|exchange rate|gold price|crude oil|iron ore|lithium|copper|commodit|etf|bull market|bear market|sell-off|rally)\b/.test(
      haystack
    );

  if (
    !isNonMarketFluff &&
    (sourceId === 'asx-smallcaps' ||
      sourceId === 'cnbc-investing' ||
      sourceId === 'cnbc-markets' ||
      sourceId === 'seeking-alpha' ||
      isPureMarketTopic)
  ) {
    return '财经市场';
  }

  // Dedicated Tech & Frontier Science
  if (
    sourceId === 'techcrunch' ||
    /\b(ai|artificial intelligence|openai|anthropic|nvidia|apple|google|meta|microsoft|tech|startup|chip|semiconductor|data center|cybersecurity|software|robot|space|nasa|quantum|ev|battery)\b/.test(
      haystack
    )
  ) {
    return '科技前沿';
  }

  if (
    /\b(health|medical|hospital|sport|cricket|afl|aflw|football|olympic|culture|review|film|music|weather|climate|lifestyle|family|education|travel|food|retired|grocery)\b/.test(
      haystack
    )
  ) {
    return '社会生活';
  }

  if (
    region === 'global' ||
    sourceId === 'bbc-world' ||
    sourceId === 'guardian-world' ||
    sourceId === 'aljazeera' ||
    sourceId === 'npr-news'
  ) {
    return '国际热点';
  }

  return '澳洲要闻';
}

function normalizeSummary(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= 64) return cleaned;
  return `${cleaned.slice(0, 58).replace(/[，、；：,.;:\s]+$/, '')}…`;
}

function normalizeKeyPoints(points: unknown): string[] {
  if (!Array.isArray(points)) return [];
  return points
    .map((p) =>
      typeof p === 'string'
        ? p
            .replace(/^[\s•·\-*\d.、]+/, '')
            .replace(/\s+/g, ' ')
            .trim()
        : ''
    )
    .filter((p) => p.length >= 4)
    .slice(0, 3);
}

function normalizeParagraphs(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n');
}

function parseNullableInt(val: unknown): number | null {
  if (typeof val === 'number' && Number.isInteger(val) && val >= 0) {
    return val;
  }
  return null;
}

function buildRecentLeadsContextBlock(recentLeads: RecentLeadContext[]): string {
  if (recentLeads.length === 0) {
    return '（当前暂无近24小时已入库主新闻，所有 matched_cluster_id 请填 null）';
  }
  return recentLeads
    .slice(0, 60)
    .map((lead) => `[id=${lead.id}] (${lead.source_name}/${lead.category}) ${lead.zh_title}`)
    .join('\n');
}

function buildFallbackOutput(input: ArticleToTranslate, error?: string): TranslatedNewsOutput {
  const fallbackCategory = inferFallbackCategory(
    input.source_id,
    input.region,
    input.original_title,
    input.rss_categories
  );
  const fallbackContent = input.original_content || input.original_excerpt || input.original_title;
  return {
    zh_title: input.original_title,
    zh_summary: normalizeSummary(input.original_excerpt || input.original_title),
    zh_key_points: [],
    zh_content: normalizeParagraphs(fallbackContent),
    category: fallbackCategory,
    matched_cluster_id: null,
    matched_batch_idx: null,
    ai_translated: false,
    error,
  };
}

const RETRY_BACKOFF_MS = [5000, 10000] as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPermanentModelSkipError(errMsg: string): boolean {
  return /404|NOT_FOUND|GenerateRequestsPerDay|PerDay/i.test(errMsg);
}

function isTransientRetryableError(errMsg: string): boolean {
  return /429|RESOURCE_EXHAUSTED|quota exceeded|rate limit|503|502|504|UNAVAILABLE|DEADLINE_EXCEEDED|timeout|timed out|ETIMEDOUT|ECONNRESET|fetch failed/i.test(
    errMsg
  );
}

async function generateWithFallback(
  client: GoogleGenAI,
  contents: string,
  responseSchema: Schema,
  exhaustedModels: Set<string>,
  options?: { modelChain?: string[]; temperature?: number }
): Promise<{ text: string; model: string }> {
  const chain = options?.modelChain ?? getModelChain();
  const models = chain.filter((m) => !exhaustedModels.has(m));
  if (models.length === 0) {
    throw new Error('所有可用 Gemini 模型的当日免费额度均已耗尽，请稍后或明日再试。');
  }

  let lastError = 'Unknown Gemini error';
  for (const model of models) {
    for (let attempt = 0; attempt <= RETRY_BACKOFF_MS.length; attempt++) {
      try {
        const response = await client.models.generateContent({
          model,
          contents,
          config: {
            responseMimeType: 'application/json',
            responseSchema,
            temperature: options?.temperature ?? 0.25,
          },
        });

        const rawText = response.text?.trim();
        if (!rawText) {
          throw new Error('Empty response text from Gemini');
        }
        return { text: rawText, model };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        lastError = `${model}: ${errMsg}`;

        // Daily quota or 404: skip this model immediately without wasting backoff time
        if (isPermanentModelSkipError(errMsg)) {
          exhaustedModels.add(model);
          console.warn(
            `[Gemini] Model "${model}" permanently unavailable/daily quota reached, switching to fallback:`,
            errMsg.slice(0, 220)
          );
          break;
        }

        // Transient 429 RPM / 503 / timeout: wait 5s -> 10s before retrying same model
        if (isTransientRetryableError(errMsg) && attempt < RETRY_BACKOFF_MS.length) {
          const waitMs = RETRY_BACKOFF_MS[attempt];
          console.warn(
            `[Gemini] Model "${model}" hit transient limit/timeout (attempt ${attempt + 1}/${RETRY_BACKOFF_MS.length + 1}), retrying in ${waitMs / 1000}s:`,
            errMsg.slice(0, 180)
          );
          await sleep(waitMs);
          continue;
        }

        // After exhausting retries on transient 429/quota, fall back to next model in chain
        if (/429|RESOURCE_EXHAUSTED|quota exceeded/i.test(errMsg)) {
          exhaustedModels.add(model);
        }
        console.warn(
          `[Gemini] Model "${model}" failed after ${attempt + 1} attempt(s), trying fallback if available:`,
          errMsg.slice(0, 240)
        );
        break;
      }
    }
  }

  throw new Error(lastError);
}

export async function translateArticlesBatch(
  inputs: ArticleToTranslate[],
  recentLeads: RecentLeadContext[] = [],
  exhaustedModels: Set<string> = new Set()
): Promise<TranslatedNewsOutput[]> {
  if (inputs.length === 0) return [];

  const client = getClient();
  if (!client) {
    return inputs.map((item) => buildFallbackOutput(item));
  }

  const validLeadIds = new Set(recentLeads.map((l) => l.id));

  const articlesBlock = inputs
    .map((item, idx) => {
      const body = (item.original_content || item.original_excerpt || item.original_title).slice(
        0,
        2200
      );
      return [
        `=== 新闻 #${idx} ===`,
        `idx: ${idx}`,
        `媒体来源: ${item.source_name}（${item.region === 'au' ? '澳洲媒体' : '国际媒体'}）`,
        `原始标签: ${item.rss_categories.join(', ') || '无'}`,
        `英文标题: ${item.original_title}`,
        `英文导语: ${item.original_excerpt || '无'}`,
        `英文正文:\n${body}`,
      ].join('\n');
    })
    .join('\n\n');

  const prompt = [
    '你是一位资深国际与澳洲中文新闻编辑，正在为澳洲华人及家中长辈编译精选国际与澳洲主流新闻（AU News Digest）。',
    `下面共有 ${inputs.length} 篇新抓取的英文新闻，请逐篇准确翻译、提炼要点、分类，并判断是否与已有新闻属于**同一突发事件/同一新闻主题**，按原 idx 返回结构化 JSON 数组（必须包含全部 ${inputs.length} 篇，不得遗漏）：`,
    '',
    '【翻译与编辑要求】',
    '1. zh_title：地道、清楚、易懂的简体中文新闻标题，30字以内，避免晦涩直译。',
    '2. zh_summary：严格控制在 60 字以内的连贯核心摘要，用于目录卡片快速预览。',
    '3. zh_key_points：提炼 2 至 3 条简明分点要点（每条不超过 45 字），用平实易懂的话分别讲清「发生了什么」和「有什么影响/后续看点」，方便长辈快速抓重点。',
    '4. zh_content：将每篇英文正文完整、流畅、忠实地翻译为简体中文，合理分段（段落之间用 \\n\\n 分隔）。常见英文专有名词首次出现时可加简明中文解释（如 RBA 澳联储、Fed 美联储、NSW 新州）。',
    '5. category：必须严格遵循以下规则，从 ["澳洲要闻", "国际热点", "财经市场", "科技前沿", "社会生活"] 中选择最贴切的一项：',
    '   - 财经市场（**严格限定为纯正的股市证券与交易市场频道**）：仅当新闻直接涉及【① 股票市场与大盘指数（美股标普/纳指/道指、澳股 ASX、亚太/欧股涨跌、IPO 上市、上市公司并购重组）；② 上市公司财报、股价异动、华尔街/投行评级调整；③ 央行货币政策（美联储 Fed、澳洲联储 RBA 利率决议、CPI 通胀、国债收益率）；④ 外汇汇率（AUD/USD/CNY）与大宗商品交易（黄金、原油、铁矿石、锂矿价格）】时，才归入「财经市场」。',
    '   - **严格排除出「财经市场」**：普通消费者零售纠纷（如超市选址/开店诉讼、商场促销）、个人/家庭理财情感或退休生活建议、普通企业或政府机构的非金融类行政/黑客网络安全事件，一律**禁止**归入「财经市场」（请按内容分别归入「澳洲要闻」「国际热点」「科技前沿」或「社会生活」）。',
    '   - 科技前沿：AI 人工智能、芯片半导体、互联网大厂技术与产品、创业投资、航天科学与网络安全（来自 TechCrunch 的报道通常归入「科技前沿」）。',
    '   - 澳洲要闻：澳洲联邦与各州政经政策、悉尼/墨尔本本地重大新闻及澳洲本土非证券类企业/司法新闻。',
    '   - 国际热点：全球地缘政治、外交与重大海外突发事件。',
    '   - 社会生活：医疗健康、文体赛事、消费零售、个人理财生活故事、气候环境与日常生活话题。',
    '6. 跨媒体主题合并规则（严格判定，宁缺毋滥）：',
    '   - 只有当两篇报道讲述的是**同一个具体突发事件或同一个核心新闻事件**（例如多家媒体同时报道同一场外交会谈、同一场自然灾害、同一家公司同一天的财报/IPO）时，才归为同一主题。',
    '   - 仅仅是大方向相似（例如两篇分别报道不同国家的大选、或不同公司的财报）绝对**不要**合并，应各自保持 null。',
    '   - 如果匹配到下方「近24小时已入库主新闻列表」中的某条新闻，将 matched_cluster_id 设为该条的整数 id，matched_batch_idx 设为 null。',
    '   - 如果未匹配已有新闻，但与本批次中编号更小（idx < 当前 idx）的某篇新闻报道的是同一事件，将 matched_cluster_id 设为 null，matched_batch_idx 设为那个更小的 idx。',
    '   - 如果是全新独立事件，两者均设为 null。',
    '',
    '【近24小时已入库主新闻列表】',
    buildRecentLeadsContextBlock(recentLeads),
    '',
    '【本批次待编译新文章】',
    articlesBlock,
  ].join('\n');

  try {
    const { text, model } = await generateWithFallback(
      client,
      prompt,
      BATCH_ARTICLES_SCHEMA,
      exhaustedModels
    );

    let parsed: {
      articles?: Array<{
        idx?: number;
        zh_title?: string;
        zh_summary?: string;
        zh_key_points?: string[];
        zh_content?: string;
        category?: string;
        matched_cluster_id?: number | null;
        matched_batch_idx?: number | null;
      }>;
    };

    try {
      parsed = JSON.parse(text);
      if (!parsed || !Array.isArray(parsed.articles) || parsed.articles.length === 0) {
        throw new Error('Empty or invalid articles array in batch JSON response');
      }
    } catch (parseErr) {
      // Fault isolation: if batch JSON parsing fails, fall back to translating each article individually
      const parseMsg = parseErr instanceof Error ? parseErr.message : String(parseErr);
      console.warn(
        `[Gemini] Batch JSON parse failed (${inputs.length} articles via ${model}), degrading to per-article translation:`,
        parseMsg.slice(0, 200)
      );
      const individualOutputs: TranslatedNewsOutput[] = [];
      for (let i = 0; i < inputs.length; i++) {
        if (i > 0) await sleep(1000);
        const single = await translateAndSummarizeArticle(inputs[i], recentLeads, exhaustedModels);
        individualOutputs.push(single);
      }
      return individualOutputs;
    }

    const byIdx = new Map<number, NonNullable<typeof parsed.articles>[number]>();
    for (const row of parsed.articles ?? []) {
      if (typeof row?.idx === 'number') {
        byIdx.set(row.idx, row);
      }
    }

    const outputs: TranslatedNewsOutput[] = [];
    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i];
      const match = byIdx.get(i);
      if (match && match.zh_title && match.zh_content) {
        const fallbackCategory = inferFallbackCategory(
          input.source_id,
          input.region,
          input.original_title,
          input.rss_categories
        );
        const category =
          match.category && VALID_CATEGORIES.has(match.category)
            ? (match.category as NewsCategory)
            : fallbackCategory;

        const rawLeadId = parseNullableInt(match.matched_cluster_id);
        const matchedClusterId = rawLeadId !== null && validLeadIds.has(rawLeadId) ? rawLeadId : null;
        const rawBatchIdx = parseNullableInt(match.matched_batch_idx);
        const matchedBatchIdx =
          matchedClusterId === null && rawBatchIdx !== null && rawBatchIdx < i ? rawBatchIdx : null;

        outputs.push({
          zh_title: match.zh_title.trim(),
          zh_summary: normalizeSummary(
            match.zh_summary?.trim() || input.original_excerpt || match.zh_title
          ),
          zh_key_points: normalizeKeyPoints(match.zh_key_points),
          zh_content: normalizeParagraphs(match.zh_content.trim()),
          category,
          matched_cluster_id: matchedClusterId,
          matched_batch_idx: matchedBatchIdx,
          ai_translated: true,
          model_used: model,
        });
      } else {
        await sleep(1000);
        const single = await translateAndSummarizeArticle(input, recentLeads, exhaustedModels);
        outputs.push(single);
      }
    }

    console.log(`[Gemini] Batch translated ${inputs.length} articles via ${model}`);
    return outputs;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(
      `[Gemini] Batch translation failed (${inputs.length} articles):`,
      errMsg.slice(0, 320)
    );

    // If models are not all exhausted (e.g. single article triggered response error/truncation), isolate per-article
    const remainingModels = getModelChain().filter((m) => !exhaustedModels.has(m));
    if (inputs.length > 1 && remainingModels.length > 0) {
      console.warn(
        `[Gemini] Falling back to individual translation for ${inputs.length} articles to prevent batch-wide failure`
      );
      const individualOutputs: TranslatedNewsOutput[] = [];
      for (let i = 0; i < inputs.length; i++) {
        if (i > 0) await sleep(1000);
        const single = await translateAndSummarizeArticle(inputs[i], recentLeads, exhaustedModels);
        individualOutputs.push(single);
      }
      return individualOutputs;
    }

    return inputs.map((item) => buildFallbackOutput(item, errMsg));
  }
}

export async function translateAndSummarizeArticle(
  input: ArticleToTranslate,
  recentLeads: RecentLeadContext[] = [],
  exhaustedModels: Set<string> = new Set()
): Promise<TranslatedNewsOutput> {
  const client = getClient();
  if (!client) {
    return buildFallbackOutput(input);
  }

  const validLeadIds = new Set(recentLeads.map((l) => l.id));
  const fallbackCategory = inferFallbackCategory(
    input.source_id,
    input.region,
    input.original_title,
    input.rss_categories
  );

  const prompt = [
    '你是一位资深国际与澳洲中文新闻编辑，负责为华人读者及家中长辈编译精选主流媒体新闻。',
    '请将以下英文新闻准确翻译并整理为结构化 JSON：',
    '1. zh_title：地道、清楚、易懂的简体中文新闻标题，30字以内。',
    '2. zh_summary：严格控制在 60 字以内的连贯核心摘要。',
    '3. zh_key_points：提炼 2 至 3 条简明分点要点（每条不超过 45 字），概括“发生了什么”和“有什么影响”。',
    '4. zh_content：完整流畅的简体中文正文翻译，使用 \\n\\n 合理分段。',
    '5. category：必须从 ["澳洲要闻", "国际热点", "财经市场", "科技前沿", "社会生活"] 中选择最匹配的一项。「财经市场」仅限股市大盘/ASX/美股/上市公司财报/股价评级/Fed与RBA利率通胀/外汇与黄金原油铁矿石锂矿大宗商品交易；超市开店诉讼、个人家庭理财建议、非金融黑客/行政新闻严禁归入「财经市场」。',
    '6. matched_cluster_id：如果与下方「近24小时已入库主新闻列表」中的某一条报道的是完全相同的具体事件，填入其整数 id；否则填 null。',
    '',
    '【近24小时已入库主新闻列表】',
    buildRecentLeadsContextBlock(recentLeads),
    '',
    `媒体来源: ${input.source_name}（${input.region === 'au' ? '澳洲媒体' : '国际媒体'}）`,
    `原始标签: ${input.rss_categories.join(', ') || '无'}`,
    `英文标题: ${input.original_title}`,
    `英文导语: ${input.original_excerpt || '无'}`,
    `英文正文:\n${(input.original_content || input.original_excerpt || input.original_title).slice(0, 3400)}`,
  ].join('\n');

  try {
    const { text, model } = await generateWithFallback(
      client,
      prompt,
      SINGLE_ARTICLE_SCHEMA,
      exhaustedModels
    );

    const parsed = JSON.parse(text) as Partial<TranslatedNewsOutput>;
    const category =
      parsed.category && VALID_CATEGORIES.has(parsed.category)
        ? (parsed.category as NewsCategory)
        : fallbackCategory;

    const rawLeadId = parseNullableInt(parsed.matched_cluster_id);
    const matchedClusterId = rawLeadId !== null && validLeadIds.has(rawLeadId) ? rawLeadId : null;

    return {
      zh_title: parsed.zh_title?.trim() || input.original_title,
      zh_summary: normalizeSummary(
        parsed.zh_summary?.trim() || input.original_excerpt || input.original_title
      ),
      zh_key_points: normalizeKeyPoints(parsed.zh_key_points),
      zh_content: normalizeParagraphs(
        parsed.zh_content?.trim() || input.original_content || input.original_excerpt
      ),
      category,
      matched_cluster_id: matchedClusterId,
      matched_batch_idx: null,
      ai_translated: true,
      model_used: model,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Gemini] Translation failed for "${input.original_title}":`, errMsg.slice(0, 260));
    return buildFallbackOutput(input, errMsg);
  }
}

export interface ReclassifyBatchItemInput {
  id: number;
  source_name: string;
  zh_title: string;
}

export interface ReclassifyBatchOutput {
  mapping: Record<number, NewsCategory>;
  modelUsed: string;
}

/**
 * Reclassify a batch of historical articles (up to 50 per call) using ONLY id, source, and zh_title.
 * Tries gemini-3.8-flash first, with automatic fallback to high-quota Flash-Lite models if rate-limited.
 */
export async function reclassifyArticlesBatch(
  articles: ReclassifyBatchItemInput[],
  exhaustedModels: Set<string> = new Set()
): Promise<ReclassifyBatchOutput> {
  if (articles.length === 0) {
    return { mapping: {}, modelUsed: 'none' };
  }

  const client = getClient();
  if (!client) {
    throw new Error('未配置有效的 GEMINI_API_KEY，无法执行历史分类校准。');
  }

  const validIds = new Set(articles.map((a) => a.id));
  const payloadLines = articles
    .map((a) => JSON.stringify({ id: a.id, source: a.source_name, zh_title: a.zh_title }))
    .join('\n');

  const prompt = [
    '你是一位资深金融与国际新闻分类主编，现在需要对历史新闻库中的文章按最新【严格分类标准】重新归类。',
    `下方共有 ${articles.length} 篇文章（每行包含 id、source 媒体来源、zh_title 中文标题）。请逐篇独立重新判定最准确的一个分类，不得遗漏任何一篇 id。`,
    '',
    '【五个固定分类及严格边界定义】',
    '1. 财经市场（**纯正的股市证券与交易市场频道，严格把关**）：',
    '   - ✅ 仅限直接涉及以下内容的新闻：',
    '     ① 股票市场与大盘指数（美股标普/纳指/道指、澳股 ASX、亚太/欧股涨跌、IPO 上市、上市公司并购重组）；',
    '     ② 上市公司财报、股价异动、华尔街/投行目标价与评级调整、基金/ETF 资金流向；',
    '     ③ 央行货币政策与宏观金融市场（美联储 Fed、澳洲联储 RBA 利率决议、通胀 CPI、国债收益率）；',
    '     ④ 外汇汇率（AUD/USD/CNY 等）与大宗商品交易（黄金、原油、铁矿石、锂矿、铜等期货/现货价格走势）。',
    '   - ❌ **必须坚决排除出「财经市场」**（严禁归入财经市场）：',
    '     • 普通消费者零售纠纷、超市开店/选址诉讼、商场促销、普通企业劳资/行政/监管罚单（澳洲本土归「澳洲要闻」，海外归「国际热点」或「社会生活」）；',
    '     • 个人/家庭理财情感建议、退休夫妻开支故事、买房/租房生活体验（归「社会生活」）；',
    '     • 普通机构或政府部门被黑客攻击、数据泄露、网络犯罪（科技/网络安全归「科技前沿」，政法事件归「国际热点」或「澳洲要闻」）。',
    '2. 科技前沿：AI 人工智能、大模型、芯片半导体、互联网大厂技术与产品、创业与科技创投、航天科学、新能源汽车技术、网络安全与黑客攻击事件。',
    '3. 澳洲要闻：澳洲联邦与各州政经政策、悉尼/墨尔本等澳洲本地重大新闻、澳洲本土司法诉讼与非证券类商业/民生事件。',
    '4. 国际热点：全球地缘政治、外交、战争冲突、欧美亚太各国政局与重大海外突发事件。',
    '5. 社会生活：医疗健康、文体赛事、消费与零售生活、个人理财/退休家庭故事、教育、旅游美食、气候天气与社会百态。',
    '',
    '【待重新分类的历史文章列表】',
    payloadLines,
  ].join('\n');

  const { text, model } = await generateWithFallback(
    client,
    prompt,
    RECLASSIFY_BATCH_SCHEMA,
    exhaustedModels,
    {
      modelChain: RECLASSIFY_MODELS,
      temperature: 0.1,
    }
  );

  const parsed = JSON.parse(text) as {
    classifications?: Array<{ id?: number; category?: string }>;
  };

  const mapping: Record<number, NewsCategory> = {};
  for (const row of parsed.classifications ?? []) {
    if (
      typeof row?.id === 'number' &&
      validIds.has(row.id) &&
      typeof row.category === 'string' &&
      VALID_CATEGORIES.has(row.category)
    ) {
      mapping[row.id] = row.category as NewsCategory;
    }
  }

  console.log(
    `[Gemini] Reclassified batch of ${articles.length} articles (matched ${Object.keys(mapping).length}) via ${model}`
  );
  return { mapping, modelUsed: model };
}
