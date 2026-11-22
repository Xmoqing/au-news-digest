import fs from 'node:fs';
import path from 'node:path';
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import type {
  CategoryFilter,
  NewsCategory,
  NewsItem,
  RecentLeadContext,
  SourceId,
} from '@/types/news';
import { CATEGORY_FILTERS, NEWS_CATEGORIES } from '@/types/news';

export interface UpsertArticleInput {
  original_url: string;
  source_id: SourceId;
  source_name: string;
  original_title: string;
  original_excerpt: string;
  original_content: string;
  zh_title: string;
  zh_summary: string;
  zh_key_points: string[];
  zh_content: string;
  category: NewsCategory;
  image_url: string | null;
  author: string | null;
  published_at: string;
  fetched_at: string;
  ai_translated: boolean;
  cluster_id?: number | null;
}

declare global {
  // eslint-disable-next-line no-var
  var __auNewsSqlJs: Promise<SqlJsStatic> | undefined;
  // eslint-disable-next-line no-var
  var __auNewsDb: Promise<Database> | undefined;
  // eslint-disable-next-line no-var
  var __auNewsDbPath: string | undefined;
}

const VALID_CATEGORY_SET = new Set<string>(NEWS_CATEGORIES);

const FINANCE_SOURCE_IDS = new Set<string>([
  'asx-smallcaps',
  'cnbc-investing',
  'cnbc-markets',
  'marketwatch-live',
  'seeking-alpha',
  'cnbc-top',
  'cnbc-finance',
  'marketwatch',
]);

const LEGACY_CATEGORY_MAP: Record<string, NewsCategory> = {
  全澳要闻: '澳洲要闻',
  悉尼新州: '澳洲要闻',
  经济房产: '财经市场',
  经济科技: '财经市场',
  科技社会: '社会生活',
};

export function normalizeCategory(
  raw: string | null | undefined,
  sourceId?: string | null
): NewsCategory {
  if (!raw) {
    if (sourceId && FINANCE_SOURCE_IDS.has(sourceId)) return '财经市场';
    if (sourceId === 'techcrunch') return '科技前沿';
    return '澳洲要闻';
  }
  if (VALID_CATEGORY_SET.has(raw)) return raw as NewsCategory;
  if (raw === '经济科技' && sourceId === 'techcrunch') return '科技前沿';
  return LEGACY_CATEGORY_MAP[raw] ?? '澳洲要闻';
}

export function resolveDatabasePath(): string {
  if (process.env.DATABASE_PATH) {
    return path.resolve(process.env.DATABASE_PATH);
  }
  if (fs.existsSync('/app/data')) {
    return '/app/data/news.db';
  }
  return path.join(process.cwd(), 'data', 'news.db');
}

function resolveWasmFile(file: string): string {
  const candidates = [
    path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', file),
    path.join('/app', 'node_modules', 'sql.js', 'dist', file),
    path.join('/app', file),
    path.join(process.cwd(), file),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', file);
}

async function getSqlJs(): Promise<SqlJsStatic> {
  if (!globalThis.__auNewsSqlJs) {
    globalThis.__auNewsSqlJs = initSqlJs({
      locateFile: (file: string) => resolveWasmFile(file),
      useOldExtensionFunctions: false,
    });
  }
  return globalThis.__auNewsSqlJs;
}

function selectAll(
  db: Database,
  sql: string,
  params: (string | number | null)[] = []
): Record<string, unknown>[] {
  const stmt = db.prepare(sql);
  try {
    if (params.length > 0) {
      stmt.bind(params);
    }
    const rows: Record<string, unknown>[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    return rows;
  } finally {
    stmt.free();
  }
}

/**
 * Lossless, idempotent schema initialization & migration.
 * NEVER drops or overwrites existing tables or historical rows.
 */
function initializeSchema(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_url TEXT NOT NULL UNIQUE,
      source_id TEXT NOT NULL,
      source_name TEXT NOT NULL,
      original_title TEXT NOT NULL,
      original_excerpt TEXT NOT NULL DEFAULT '',
      original_content TEXT NOT NULL DEFAULT '',
      zh_title TEXT NOT NULL,
      zh_summary TEXT NOT NULL,
      zh_key_points TEXT NOT NULL DEFAULT '[]',
      zh_content TEXT NOT NULL,
      category TEXT NOT NULL,
      image_url TEXT,
      author TEXT,
      published_at TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      ai_translated INTEGER NOT NULL DEFAULT 1,
      cluster_id INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles (published_at DESC);
    CREATE INDEX IF NOT EXISTS idx_articles_category ON articles (category);
    CREATE INDEX IF NOT EXISTS idx_articles_ai_translated ON articles (ai_translated);

    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Safe non-destructive migrations via PRAGMA table_info(articles)
  const columns = selectAll(db, `PRAGMA table_info(articles)`);
  const existingCols = new Set(columns.map((c) => String(c.name)));

  if (!existingCols.has('zh_key_points')) {
    console.log('[DB Migration] Adding missing column: articles.zh_key_points');
    db.run(`ALTER TABLE articles ADD COLUMN zh_key_points TEXT NOT NULL DEFAULT '[]'`);
  }

  if (!existingCols.has('cluster_id')) {
    console.log('[DB Migration] Adding missing column: articles.cluster_id');
    db.run(`ALTER TABLE articles ADD COLUMN cluster_id INTEGER`);
  }

  db.run(`CREATE INDEX IF NOT EXISTS idx_articles_cluster_id ON articles (cluster_id)`);

  // Lossless historical category migrations (preserve all existing rows & translations)
  // 1. Only migrate pure market/trading sources from legacy categories into 财经市场
  db.run(
    `UPDATE articles SET category = '财经市场'
     WHERE source_id IN ('asx-smallcaps', 'cnbc-investing', 'cnbc-markets', 'marketwatch-live', 'seeking-alpha', 'cnbc-top', 'cnbc-finance')
       AND category IN ('经济科技', '经济房产')`
  );

  // 2. Existing TechCrunch or AI/tech articles previously labeled 经济科技 -> 科技前沿
  db.run(
    `UPDATE articles SET category = '科技前沿'
     WHERE category = '经济科技'
       AND (
         source_id = 'techcrunch'
         OR zh_title LIKE '%AI%' OR zh_title LIKE '%人工智能%' OR zh_title LIKE '%芯片%'
         OR zh_title LIKE '%科技%' OR zh_title LIKE '%机器人%' OR zh_title LIKE '%数据中心%'
         OR original_title LIKE '%AI%' OR original_title LIKE '%Nvidia%' OR original_title LIKE '%Anthropic%'
       )`
  );

  // 3. Map all remaining legacy categories seamlessly
  for (const [legacy, modern] of Object.entries(LEGACY_CATEGORY_MAP)) {
    db.run(`UPDATE articles SET category = ? WHERE category = ?`, [modern, legacy]);
  }
}

export async function getDb(): Promise<Database> {
  const dbPath = resolveDatabasePath();
  if (globalThis.__auNewsDb && globalThis.__auNewsDbPath === dbPath) {
    return globalThis.__auNewsDb;
  }

  globalThis.__auNewsDbPath = dbPath;
  globalThis.__auNewsDb = (async () => {
    const SQL = await getSqlJs();
    const dir = path.dirname(dbPath);
    fs.mkdirSync(dir, { recursive: true });

    let db: Database;
    if (fs.existsSync(dbPath)) {
      const buffer = fs.readFileSync(dbPath);
      db = new SQL.Database(buffer);
    } else {
      db = new SQL.Database();
    }

    initializeSchema(db);
    persistDatabase(db, dbPath);
    return db;
  })();

  return globalThis.__auNewsDb;
}

function persistDatabase(db: Database, dbPath: string): void {
  const dir = path.dirname(dbPath);
  fs.mkdirSync(dir, { recursive: true });
  const data = db.export();
  const tmpPath = `${dbPath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, Buffer.from(data));
  fs.renameSync(tmpPath, dbPath);
}

function parseKeyPoints(raw: unknown): string[] {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean)
        .slice(0, 3);
    }
  } catch {
    // ignore malformed JSON
  }
  return [];
}

function mapRowToNewsItem(row: Record<string, unknown>): NewsItem {
  const rawCluster = row.cluster_id;
  const clusterId =
    rawCluster !== null && rawCluster !== undefined && Number.isFinite(Number(rawCluster))
      ? Number(rawCluster)
      : null;

  return {
    id: Number(row.id),
    original_url: String(row.original_url),
    source_id: String(row.source_id) as SourceId,
    source_name: String(row.source_name),
    original_title: String(row.original_title),
    original_excerpt: String(row.original_excerpt ?? ''),
    original_content: String(row.original_content ?? ''),
    zh_title: String(row.zh_title),
    zh_summary: String(row.zh_summary),
    zh_key_points: parseKeyPoints(row.zh_key_points),
    zh_content: String(row.zh_content),
    category: normalizeCategory(String(row.category), String(row.source_id)),
    image_url: row.image_url ? String(row.image_url) : null,
    author: row.author ? String(row.author) : null,
    published_at: String(row.published_at),
    fetched_at: String(row.fetched_at),
    ai_translated: Number(row.ai_translated) === 1,
    cluster_id: clusterId,
  };
}

export async function getExistingUrlStatus(
  urls: string[]
): Promise<Map<string, { ai_translated: boolean }>> {
  const result = new Map<string, { ai_translated: boolean }>();
  if (urls.length === 0) return result;
  const db = await getDb();
  const placeholders = urls.map(() => '?').join(',');
  const rows = selectAll(
    db,
    `SELECT original_url, ai_translated FROM articles WHERE original_url IN (${placeholders})`,
    urls
  );
  for (const row of rows) {
    result.set(String(row.original_url), {
      ai_translated: Number(row.ai_translated) === 1,
    });
  }
  return result;
}

export async function getRecentLeadArticles(
  hours = 24,
  limit = 60
): Promise<RecentLeadContext[]> {
  const db = await getDb();
  const cutoffIso = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const rows = selectAll(
    db,
    `SELECT id, zh_title, source_name, category
     FROM articles
     WHERE (cluster_id IS NULL OR cluster_id = id)
       AND ai_translated = 1
       AND (published_at >= ? OR fetched_at >= ?)
     ORDER BY published_at DESC, id DESC
     LIMIT ?`,
    [cutoffIso, cutoffIso, limit]
  );

  return rows.map((row) => ({
    id: Number(row.id),
    zh_title: String(row.zh_title),
    source_name: String(row.source_name),
    category: normalizeCategory(String(row.category), String(row.source_id)),
  }));
}

export async function getPendingUntranslatedArticles(limit = 60): Promise<NewsItem[]> {
  const db = await getDb();
  const rows = selectAll(
    db,
    `SELECT * FROM articles WHERE ai_translated = 0 ORDER BY published_at DESC LIMIT ?`,
    [limit]
  );
  return rows.map(mapRowToNewsItem);
}

export async function upsertArticle(
  input: UpsertArticleInput
): Promise<{ status: 'inserted' | 'updated'; id: number }> {
  const db = await getDb();
  const serializedKeyPoints = JSON.stringify(input.zh_key_points.slice(0, 3));
  const clusterIdVal =
    typeof input.cluster_id === 'number' && Number.isFinite(input.cluster_id) && input.cluster_id > 0
      ? Math.floor(input.cluster_id)
      : null;

  const existing = selectAll(
    db,
    `SELECT id FROM articles WHERE original_url = ? LIMIT 1`,
    [input.original_url]
  );

  if (existing.length > 0) {
    const existingId = Number(existing[0].id);
    // Prevent an article from pointing cluster_id to itself via update unless explicitly cleared
    const safeClusterId = clusterIdVal === existingId ? null : clusterIdVal;
    db.run(
      `UPDATE articles SET
        zh_title = ?,
        zh_summary = ?,
        zh_key_points = ?,
        zh_content = ?,
        category = ?,
        image_url = COALESCE(?, image_url),
        original_content = CASE WHEN length(?) > length(original_content) THEN ? ELSE original_content END,
        fetched_at = ?,
        ai_translated = ?,
        cluster_id = COALESCE(?, cluster_id)
      WHERE original_url = ?`,
      [
        input.zh_title,
        input.zh_summary,
        serializedKeyPoints,
        input.zh_content,
        input.category,
        input.image_url,
        input.original_content,
        input.original_content,
        input.fetched_at,
        input.ai_translated ? 1 : 0,
        safeClusterId,
        input.original_url,
      ]
    );
    persistDatabase(db, resolveDatabasePath());
    return { status: 'updated', id: existingId };
  }

  db.run(
    `INSERT INTO articles (
      original_url,
      source_id,
      source_name,
      original_title,
      original_excerpt,
      original_content,
      zh_title,
      zh_summary,
      zh_key_points,
      zh_content,
      category,
      image_url,
      author,
      published_at,
      fetched_at,
      ai_translated,
      cluster_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.original_url,
      input.source_id,
      input.source_name,
      input.original_title,
      input.original_excerpt,
      input.original_content,
      input.zh_title,
      input.zh_summary,
      serializedKeyPoints,
      input.zh_content,
      input.category,
      input.image_url,
      input.author,
      input.published_at,
      input.fetched_at,
      input.ai_translated ? 1 : 0,
      clusterIdVal,
    ]
  );
  const idRows = selectAll(db, `SELECT last_insert_rowid() AS id`);
  const insertedId = Number(idRows[0]?.id ?? 0);
  persistDatabase(db, resolveDatabasePath());
  return { status: 'inserted', id: insertedId };
}

/**
 * Group cross-media articles sharing the same `cluster_id` into single topic cards.
 * Each lead item receives `related_articles` containing all reports in that topic cluster.
 */
function buildClusteredTopics(allArticles: NewsItem[]): NewsItem[] {
  const byId = new Map<number, NewsItem>(allArticles.map((a) => [a.id, a]));
  const clusterGroups = new Map<number, NewsItem[]>();

  for (const article of allArticles) {
    // Resolve canonical root ID (fallback to self if parent lead was pruned or missing)
    const rootId =
      article.cluster_id !== null &&
      article.cluster_id !== article.id &&
      byId.has(article.cluster_id)
        ? article.cluster_id
        : article.id;

    const list = clusterGroups.get(rootId) ?? [];
    list.push(article);
    clusterGroups.set(rootId, list);
  }

  const topics: Array<{ lead: NewsItem; latestTs: number }> = [];

  for (const [rootId, members] of clusterGroups.entries()) {
    // Put the canonical lead article first, followed by related articles sorted newest-first
    members.sort((a, b) => {
      if (a.id === rootId) return -1;
      if (b.id === rootId) return 1;
      return b.published_at.localeCompare(a.published_at) || b.id - a.id;
    });

    const lead = members[0];
    let latestTs = new Date(lead.published_at).getTime() || 0;
    for (const m of members) {
      const ts = new Date(m.published_at).getTime() || 0;
      if (ts > latestTs) latestTs = ts;
    }

    topics.push({
      lead: {
        ...lead,
        related_articles: members.length > 1 ? members : undefined,
      },
      latestTs,
    });
  }

  topics.sort((a, b) => b.latestTs - a.latestTs || b.lead.id - a.lead.id);
  return topics.map((t) => t.lead);
}

export async function queryArticles(options: {
  category?: CategoryFilter;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{
  items: NewsItem[];
  total: number;
  categoryCounts: Record<CategoryFilter, number>;
}> {
  const db = await getDb();
  const limit = Math.min(Math.max(options.limit ?? 300, 1), 1000);
  const offset = Math.max(options.offset ?? 0, 0);

  // Load up to 1000 recent raw rows and cluster cross-media reports into deduplicated topic cards
  const rawRows = selectAll(
    db,
    `SELECT * FROM articles ORDER BY published_at DESC, id DESC LIMIT 1000`
  );
  const allItems = rawRows.map(mapRowToNewsItem);
  const allTopics = buildClusteredTopics(allItems);

  // Compute deduplicated topic counts per category so tab badges match visible cards
  const categoryCounts = Object.fromEntries(
    CATEGORY_FILTERS.map((cat) => [cat, 0])
  ) as Record<CategoryFilter, number>;

  for (const topic of allTopics) {
    if (topic.category in categoryCounts) {
      categoryCounts[topic.category] += 1;
    }
    categoryCounts['全部'] += 1;
  }

  const trimmedSearch = options.search?.trim().toLowerCase();
  const filtered = allTopics.filter((topic) => {
    if (options.category && options.category !== '全部' && topic.category !== options.category) {
      return false;
    }
    if (!trimmedSearch) return true;
    const pool = topic.related_articles ?? [topic];
    return pool.some(
      (a) =>
        a.zh_title.toLowerCase().includes(trimmedSearch) ||
        a.zh_summary.toLowerCase().includes(trimmedSearch) ||
        a.original_title.toLowerCase().includes(trimmedSearch) ||
        a.source_name.toLowerCase().includes(trimmedSearch)
    );
  });

  return {
    items: filtered.slice(offset, offset + limit),
    total: filtered.length,
    categoryCounts,
  };
}

export async function getArticleById(id: number): Promise<NewsItem | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  const db = await getDb();
  const rows = selectAll(db, `SELECT * FROM articles WHERE id = ? LIMIT 1`, [id]);
  if (rows.length === 0) return null;
  return mapRowToNewsItem(rows[0]);
}

export async function getTotalArticleCount(): Promise<number> {
  const db = await getDb();
  const rows = selectAll(db, `SELECT COUNT(*) AS count FROM articles`);
  return Number(rows[0]?.count ?? 0);
}

export interface ArticleForReclassify {
  id: number;
  source_id: string;
  source_name: string;
  zh_title: string;
  category: NewsCategory;
}

export async function getAllArticlesForReclassify(): Promise<ArticleForReclassify[]> {
  const db = await getDb();
  const rows = selectAll(
    db,
    `SELECT id, source_id, source_name, zh_title, category
     FROM articles
     ORDER BY id ASC`
  );
  return rows.map((row) => ({
    id: Number(row.id),
    source_id: String(row.source_id),
    source_name: String(row.source_name),
    zh_title: String(row.zh_title),
    category: normalizeCategory(String(row.category), String(row.source_id)),
  }));
}

/**
 * Lossless batch category update: ONLY modifies `category` column,
 * preserving all historical rows, titles, summaries, key points, and translations.
 */
export async function batchUpdateArticleCategories(
  updates: Array<{ id: number; category: NewsCategory }>
): Promise<number> {
  const validUpdates = updates.filter(
    (u) => Number.isInteger(u.id) && u.id > 0 && VALID_CATEGORY_SET.has(u.category)
  );
  if (validUpdates.length === 0) return 0;

  const db = await getDb();
  let applied = 0;

  db.run('BEGIN TRANSACTION');
  try {
    const stmt = db.prepare(`UPDATE articles SET category = ? WHERE id = ?`);
    try {
      for (const item of validUpdates) {
        stmt.run([item.category, item.id]);
        applied += 1;
      }
    } finally {
      stmt.free();
    }
    db.run('COMMIT');
  } catch (err) {
    db.run('ROLLBACK');
    throw err;
  }

  persistDatabase(db, resolveDatabasePath());
  return applied;
}

export async function pruneOldArticles(keepLatest = 1000): Promise<number> {
  const db = await getDb();
  const countBefore = await getTotalArticleCount();
  if (countBefore <= keepLatest) return 0;

  db.run(
    `DELETE FROM articles WHERE id NOT IN (
      SELECT id FROM articles ORDER BY published_at DESC, id DESC LIMIT ?
    )`,
    [keepLatest]
  );
  persistDatabase(db, resolveDatabasePath());
  const countAfter = await getTotalArticleCount();
  return Math.max(0, countBefore - countAfter);
}

export async function getMeta(key: string): Promise<string | null> {
  const db = await getDb();
  const rows = selectAll(db, `SELECT value FROM app_meta WHERE key = ? LIMIT 1`, [key]);
  return rows[0]?.value != null ? String(rows[0].value) : null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  const db = await getDb();
  db.run(
    `INSERT INTO app_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value]
  );
  persistDatabase(db, resolveDatabasePath());
}
