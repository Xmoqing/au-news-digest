import { AccessGate } from '@/components/AccessGate';
import { NewsDigestClient } from '@/components/NewsDigestClient';
import { isAccessPasswordEnabled, isServerComponentAuthorized } from '@/lib/auth';
import { getMeta, queryArticles } from '@/lib/db';
import { getAudCnyRate } from '@/lib/fx';
import { hasConfiguredGeminiKey } from '@/lib/gemini';
import { getRefreshState } from '@/lib/ingest';
import { getCronSchedule } from '@/lib/scheduler';
import type { NewsListResponse } from '@/types/news';

export const dynamic = 'force-dynamic';

interface HomePageProps {
  searchParams: Promise<{ article?: string }>;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const authorized = await isServerComponentAuthorized();
  if (!authorized) {
    return <AccessGate />;
  }

  const params = await searchParams;
  const parsedId = Number(params.article);
  const initialArticleId = Number.isFinite(parsedId) && parsedId > 0 ? parsedId : null;

  const [{ items, total, categoryCounts }, lastUpdated, lastRefreshSummary, fxRate] =
    await Promise.all([
      queryArticles({ limit: 300 }),
      getMeta('last_updated_at'),
      getMeta('last_refresh_summary'),
      getAudCnyRate(),
    ]);

  const initialData: NewsListResponse = {
    items,
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
      initialArticleId={initialArticleId}
    />
  );
}
