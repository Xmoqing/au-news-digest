import { NextRequest, NextResponse } from 'next/server';
import { isAccessPasswordEnabled, isRequestAuthorized } from '@/lib/auth';
import { getMeta, queryArticles } from '@/lib/db';
import { getAudCnyRate } from '@/lib/fx';
import { hasConfiguredGeminiKey } from '@/lib/gemini';
import { getRefreshState } from '@/lib/ingest';
import { getCronSchedule } from '@/lib/scheduler';
import { CATEGORY_FILTERS, type CategoryFilter, type NewsListResponse } from '@/types/news';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!isRequestAuthorized(request)) {
    return NextResponse.json(
      { error: 'Unauthorized', message: '请先输入访问口令' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const rawCategory = searchParams.get('category') ?? '全部';
    const category = CATEGORY_FILTERS.includes(rawCategory as CategoryFilter)
      ? (rawCategory as CategoryFilter)
      : '全部';
    const search = searchParams.get('search') ?? undefined;
    const limit = Number(searchParams.get('limit') ?? 300);
    const offset = Number(searchParams.get('offset') ?? 0);

    const [{ items, total, categoryCounts }, lastUpdated, lastRefreshSummary, fxRate] =
      await Promise.all([
        queryArticles({ category, search, limit, offset }),
        getMeta('last_updated_at'),
        getMeta('last_refresh_summary'),
        getAudCnyRate(),
      ]);

    const payload: NewsListResponse = {
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

    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error('[API /api/news] Error:', err);
    return NextResponse.json(
      { error: 'Failed to load news articles' },
      { status: 500 }
    );
  }
}
