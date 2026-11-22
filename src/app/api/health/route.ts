import { NextResponse } from 'next/server';
import { isAccessPasswordEnabled } from '@/lib/auth';
import { getMeta, getTotalArticleCount } from '@/lib/db';
import { getGeminiModel, hasConfiguredGeminiKey } from '@/lib/gemini';
import {
  getMaxItemsPerFeed,
  getMaxItemsPerGlobalFeed,
  getMaxStoredArticles,
} from '@/lib/ingest';
import { getCronSchedule } from '@/lib/scheduler';
import { RSS_SOURCES } from '@/types/news';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [totalArticles, lastUpdated] = await Promise.all([
      getTotalArticleCount(),
      getMeta('last_updated_at'),
    ]);

    return NextResponse.json({
      status: 'ok',
      totalArticles,
      maxStoredArticles: getMaxStoredArticles(),
      maxItemsPerFeed: getMaxItemsPerFeed(),
      maxItemsPerGlobalFeed: getMaxItemsPerGlobalFeed(),
      sourceCount: RSS_SOURCES.length,
      lastUpdated,
      hasGeminiKey: hasConfiguredGeminiKey(),
      geminiModel: getGeminiModel(),
      authEnabled: isAccessPasswordEnabled(),
      timezone: process.env.TZ || 'Australia/Sydney',
      cronSchedule: getCronSchedule(),
    });
  } catch (err) {
    return NextResponse.json(
      {
        status: 'error',
        error: err instanceof Error ? err.message : 'Database unavailable',
      },
      { status: 503 }
    );
  }
}
