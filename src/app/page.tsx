import type { Metadata } from 'next';
import { AccessGate } from '@/components/AccessGate';
import { NewsDigestClient } from '@/components/NewsDigestClient';
import { isAccessPasswordEnabled, isServerComponentAuthorized } from '@/lib/auth';
import {
  getArticleById,
  getArticleDateBounds,
  getMeta,
  getTotalArticleCount,
  queryArticles,
} from '@/lib/db';
import { getAudCnyRate } from '@/lib/fx';
import { hasConfiguredGeminiKey } from '@/lib/gemini';
import { getRefreshState } from '@/lib/ingest';
import { getCronSchedule } from '@/lib/scheduler';
import type { NewsListResponse } from '@/types/news';

export const dynamic = 'force-dynamic';

interface HomePageProps {
  searchParams: Promise<{ article?: string }>;
}

const DEFAULT_TITLE = 'AU News Digest · 澳洲与国际热点速览';
const DEFAULT_DESCRIPTION =
  '汇聚澳洲与国际主流媒体热点，Gemini AI 深度中文编译与核心要点提炼，专为折叠屏双屏与长辈大字阅读优化。';

export async function generateMetadata({ searchParams }: HomePageProps): Promise<Metadata> {
  const params = await searchParams;
  const parsedId = Number(params.article);

  if (Number.isInteger(parsedId) && parsedId > 0) {
    try {
      const article = await getArticleById(parsedId);
      if (article) {
        const title = article.zh_title;
        const description = article.zh_summary || DEFAULT_DESCRIPTION;
        const images = article.image_url
          ? [{ url: article.image_url, alt: article.zh_title }]
          : [{ url: '/icons/icon-512.png', width: 512, height: 512, alt: DEFAULT_TITLE }];

        return {
          title,
          description,
          openGraph: {
            type: 'article',
            locale: 'zh_CN',
            siteName: DEFAULT_TITLE,
            title,
            description,
            publishedTime: article.published_at,
            images,
          },
          twitter: {
            card: article.image_url ? 'summary_large_image' : 'summary',
            title,
            description,
            images: article.image_url ? [article.image_url] : ['/icons/icon-512.png'],
          },
        };
      }
    } catch (err) {
      console.error('[Metadata] Failed to query article for OG metadata:', err);
    }
  }

  return {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    openGraph: {
      type: 'website',
      locale: 'zh_CN',
      siteName: DEFAULT_TITLE,
      title: DEFAULT_TITLE,
      description: DEFAULT_DESCRIPTION,
      images: [{ url: '/icons/icon-512.png', width: 512, height: 512, alt: DEFAULT_TITLE }],
    },
  };
}

function getServerLocalDayWindow(referenceDate: Date): {
  dateStr: string;
  startIso: string;
  endIso: string;
} {
  const y = referenceDate.getFullYear();
  const m = referenceDate.getMonth();
  const d = referenceDate.getDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    dateStr: `${y}-${pad(m + 1)}-${pad(d)}`,
    startIso: new Date(y, m, d, 0, 0, 0, 0).toISOString(),
    endIso: new Date(y, m, d + 1, 0, 0, 0, 0).toISOString(),
  };
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const parsedId = Number(params.article);
  const requestedArticleId = Number.isInteger(parsedId) && parsedId > 0 ? parsedId : null;

  const authorized = await isServerComponentAuthorized();
  if (!authorized) {
    return <AccessGate hasDeepLinkArticle={requestedArticleId !== null} />;
  }

  let deepArticle = null;
  let resolvedArticleId: number | null = requestedArticleId;
  let archivedArticleNotice = false;

  if (requestedArticleId !== null) {
    deepArticle = await getArticleById(requestedArticleId);
    if (!deepArticle) {
      archivedArticleNotice = true;
      resolvedArticleId = null;
    }
  }

  // Default to server-local "today", or the exact day of the deep-linked historical article
  const initialWindow = getServerLocalDayWindow(
    deepArticle ? new Date(deepArticle.published_at) : new Date()
  );

  const [
    { items, total, categoryCounts },
    dateBounds,
    totalInDb,
    lastUpdated,
    lastRefreshSummary,
    fxRate,
  ] = await Promise.all([
    queryArticles({
      startIso: initialWindow.startIso,
      endIso: initialWindow.endIso,
      limit: 5000,
    }),
    getArticleDateBounds(),
    getTotalArticleCount(),
    getMeta('last_updated_at'),
    getMeta('last_refresh_summary'),
    getAudCnyRate(),
  ]);

  let resolvedItems = items;
  if (deepArticle) {
    const foundInLoaded = items.some(
      (a) =>
        a.id === deepArticle.id ||
        a.related_articles?.some((r) => r.id === deepArticle.id)
    );
    if (!foundInLoaded) {
      resolvedItems = [deepArticle, ...items];
    }
  }

  const initialData: NewsListResponse = {
    items: resolvedItems,
    total,
    totalInDb,
    categoryCounts,
    dateBounds,
    lastUpdated,
    lastRefreshSummary,
    hasGeminiKey: hasConfiguredGeminiKey(),
    authEnabled: isAccessPasswordEnabled(),
    refreshState: getRefreshState(),
    cronSchedule: getCronSchedule(),
    fxRate,
  };

  return (
    <NewsDigestClient
      initialData={initialData}
      initialWindow={initialWindow}
      initialArticleId={resolvedArticleId}
      initialArticlePublishedAt={deepArticle?.published_at ?? null}
      archivedArticleNotice={archivedArticleNotice}
    />
  );
}
