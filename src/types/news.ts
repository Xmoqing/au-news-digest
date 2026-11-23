export type NewsCategory = '澳洲要闻' | '国际热点' | '财经市场' | '科技前沿' | '社会生活';

export const NEWS_CATEGORIES: readonly NewsCategory[] = [
  '澳洲要闻',
  '国际热点',
  '财经市场',
  '科技前沿',
  '社会生活',
] as const;

export type CategoryFilter = '全部' | NewsCategory;

export const CATEGORY_FILTERS: readonly CategoryFilter[] = [
  '全部',
  ...NEWS_CATEGORIES,
] as const;

export type SourceId =
  | 'abc-au'
  | 'abc-nsw'
  | 'abc-business'
  | 'guardian-au'
  | 'sbs-news'
  | 'smh-sydney'
  | 'asx-smallcaps'
  | 'bbc-world'
  | 'guardian-world'
  | 'aljazeera'
  | 'npr-news'
  | 'techcrunch'
  | 'cnbc-investing'
  | 'cnbc-markets'
  | 'marketwatch-live'
  | 'seeking-alpha'
  // Legacy source IDs retained for lossless display of historical DB rows
  | 'guardian-au-biz'
  | 'smh-business'
  | 'bbc-business'
  | 'cnbc-top'
  | 'cnbc-finance'
  | 'marketwatch';

export interface RssSource {
  id: SourceId;
  name: string;
  shortName: string;
  region: 'au' | 'global';
  url: string;
  defaultCategory: NewsCategory;
}

export const RSS_SOURCES: readonly RssSource[] = [
  // Australian General & Macro News (6)
  {
    id: 'abc-au',
    name: 'ABC News Australia',
    shortName: 'ABC News',
    region: 'au',
    url: 'https://www.abc.net.au/news/feed/51120/rss.xml',
    defaultCategory: '澳洲要闻',
  },
  {
    id: 'abc-nsw',
    name: 'ABC Sydney / NSW',
    shortName: 'ABC NSW',
    region: 'au',
    url: 'https://www.abc.net.au/news/feed/52498/rss.xml',
    defaultCategory: '澳洲要闻',
  },
  {
    id: 'abc-business',
    name: 'ABC News Business',
    shortName: 'ABC Business',
    region: 'au',
    url: 'https://www.abc.net.au/news/feed/51892/rss.xml',
    defaultCategory: '澳洲要闻',
  },
  {
    id: 'guardian-au',
    name: 'The Guardian Australia',
    shortName: 'Guardian AU',
    region: 'au',
    url: 'https://www.theguardian.com/au/rss',
    defaultCategory: '澳洲要闻',
  },
  {
    id: 'sbs-news',
    name: 'SBS News',
    shortName: 'SBS News',
    region: 'au',
    url: 'https://www.sbs.com.au/news/topic/latest/feed',
    defaultCategory: '澳洲要闻',
  },
  {
    id: 'smh-sydney',
    name: 'The Sydney Morning Herald',
    shortName: 'SMH Sydney',
    region: 'au',
    url: 'https://www.smh.com.au/rss/feed.xml',
    defaultCategory: '澳洲要闻',
  },
  // Pure Stocks, Equities & Trading Markets (5)
  {
    id: 'asx-smallcaps',
    name: 'ASX Markets (Small Caps)',
    shortName: 'ASX Markets',
    region: 'au',
    url: 'https://smallcaps.com.au/feed/',
    defaultCategory: '财经市场',
  },
  {
    id: 'cnbc-investing',
    name: 'CNBC Investing',
    shortName: 'CNBC Investing',
    region: 'global',
    url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=15839069',
    defaultCategory: '财经市场',
  },
  {
    id: 'cnbc-markets',
    name: 'CNBC Markets',
    shortName: 'CNBC Markets',
    region: 'global',
    url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258',
    defaultCategory: '财经市场',
  },
  {
    id: 'marketwatch-live',
    name: 'MarketWatch Live',
    shortName: 'MarketWatch Live',
    region: 'global',
    // Dow Jones froze mw_realtimeheadlines in Jun 2025; mw_bulletins is MarketWatch's active live wire
    url: 'https://feeds.content.dowjones.io/public/rss/mw_bulletins',
    defaultCategory: '财经市场',
  },
  {
    id: 'seeking-alpha',
    name: 'Seeking Alpha',
    shortName: 'Seeking Alpha',
    region: 'global',
    url: 'https://seekingalpha.com/market_currents.xml',
    defaultCategory: '财经市场',
  },
  // Global News & Frontier Tech (5)
  {
    id: 'bbc-world',
    name: 'BBC World News',
    shortName: 'BBC World',
    region: 'global',
    url: 'https://feeds.bbci.co.uk/news/world/rss.xml',
    defaultCategory: '国际热点',
  },
  {
    id: 'guardian-world',
    name: 'The Guardian World',
    shortName: 'Guardian World',
    region: 'global',
    url: 'https://www.theguardian.com/world/rss',
    defaultCategory: '国际热点',
  },
  {
    id: 'aljazeera',
    name: 'Al Jazeera English',
    shortName: 'Al Jazeera',
    region: 'global',
    url: 'https://www.aljazeera.com/xml/rss/all.xml',
    defaultCategory: '国际热点',
  },
  {
    id: 'npr-news',
    name: 'NPR News',
    shortName: 'NPR News',
    region: 'global',
    url: 'https://feeds.npr.org/1001/rss.xml',
    defaultCategory: '国际热点',
  },
  {
    id: 'techcrunch',
    name: 'TechCrunch',
    shortName: 'TechCrunch',
    region: 'global',
    url: 'https://techcrunch.com/feed/',
    defaultCategory: '科技前沿',
  },
] as const;

export interface NewsItem {
  id: number;
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
  cluster_id: number | null;
  related_articles?: NewsItem[];
}

export interface RecentLeadContext {
  id: number;
  zh_title: string;
  source_name: string;
  category: NewsCategory;
}

export interface RefreshState {
  isRefreshing: boolean;
  startedAt: string | null;
  progress: {
    current: number;
    total: number;
    stage: string;
  } | null;
  lastResult?: RefreshResult | null;
}

export interface RefreshResult {
  ok: boolean;
  added: number;
  updated: number;
  skipped: number;
  failed: number;
  totalInDb: number;
  lastUpdated: string | null;
  hasGeminiKey: boolean;
  message: string;
  feedErrors: string[];
}

export interface FxRateInfo {
  pair: 'AUD/CNY';
  rate: number;
  inverseRate: number;
  change: number | null;
  changePercent: number | null;
  updatedAt: string;
  source: string;
}

export interface NewsListResponse {
  items: NewsItem[];
  total: number;
  totalInDb?: number;
  categoryCounts: Record<CategoryFilter, number>;
  dateBounds?: {
    minPublishedAt: string | null;
    maxPublishedAt: string | null;
  };
  lastUpdated: string | null;
  lastRefreshSummary: string | null;
  hasGeminiKey: boolean;
  authEnabled: boolean;
  refreshState: RefreshState;
  cronSchedule: string;
  fxRate: FxRateInfo | null;
}
