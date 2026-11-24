import { NextRequest, NextResponse } from 'next/server';
import { isRequestAuthorized } from '@/lib/auth';
import {
  translateMissingRecentArticles,
  type TranslateMissingResult,
} from '@/lib/ingest';

export const dynamic = 'force-dynamic';

declare global {
  // eslint-disable-next-line no-var
  var __auNewsTranslateMissingPromise: Promise<TranslateMissingResult> | undefined;
}

async function handleTranslateMissing(request: NextRequest): Promise<NextResponse> {
  if (!isRequestAuthorized(request, { allowQueryPassword: true })) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Unauthorized',
        message: '未授权请求：请先登录网站，或在 URL 后附带 ?pwd=你的访问口令',
      },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const rawHours = Number(searchParams.get('hours'));
    const hours = Number.isFinite(rawHours) && rawHours > 0 ? Math.floor(rawHours) : 24;
    const rawLimit = Number(searchParams.get('limit'));
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : 60;
    const forceRetry =
      searchParams.get('force') === '1' || searchParams.get('force') === 'true';

    if (!globalThis.__auNewsTranslateMissingPromise) {
      globalThis.__auNewsTranslateMissingPromise = translateMissingRecentArticles({
        hours,
        limit,
        forceRetry,
      }).finally(() => {
        globalThis.__auNewsTranslateMissingPromise = undefined;
      });
    }

    const result = await globalThis.__auNewsTranslateMissingPromise;
    return NextResponse.json(result, {
      status: result.ok ? 200 : 500,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error('[API /api/translate-missing] Error:', err);
    return NextResponse.json(
      {
        ok: false,
        message: err instanceof Error ? err.message : '漏翻补译失败',
      },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

export async function POST(request: NextRequest) {
  return handleTranslateMissing(request);
}

export async function GET(request: NextRequest) {
  return handleTranslateMissing(request);
}
