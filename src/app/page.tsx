import type { Metadata } from 'next';
import { AccessGate } from '@/components/AccessGate';
import { NewsDigestClient } from '@/components/NewsDigestClient';
import { isAccessPasswordEnabled, isServerComponentAuthorized } from '@/lib/auth';
import { getArticleById, getMeta, queryArticles } from '@/lib/db';
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

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const parsedId = Number(params.article);
  const requestedArticleId = Number.isInteger(parsedId) && parsedId > 0 ? parsedId : null;

  const authorized = await isServerComponentAuthorized();
  if (!authorized) {
    return <AccessGate hasDeepLinkArticle={requestedArticleId !== null} />;
  }

  const [{ items, total, categoryCounts }, lastUpdated, lastRefreshSummary, fxRate] =
    await Promise.all([
      queryArticles({ limit: 300 }),
      getMeta('last_updated_at'),
      getMeta('last_refresh_summary'),
      getAudCnyRate(),
    ]);

  let resolvedItems = items;
  let resolvedArticleId: number | null = requestedArticleId;
  let archivedArticleNotice = false;

  if (requestedArticleId !== null) {
    const foundInLoaded = items.some(
      (a) =>
        a.id === requestedArticleId ||
        a.related_articles?.some((r) => r.id === requestedArticleId)
    );

    if (!foundInLoaded) {
      const deepArticle = await getArticleById(requestedArticleId);
      if (deepArticle) {
        resolvedItems = [deepArticle, ...items];
      } else {
        // Article was pruned after exceeding rolling storage limit
        archivedArticleNotice = true;
        resolvedArticleId = null;
      }
    }
  }

  const initialData: NewsListResponse = {
    items: resolvedItems,
    total,
    categoryCounts,
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
      initialArticleId={resolvedArticleId}
      archivedArticleNotice={archivedArticleNotice}
    />
  );
}
