import { NextRequest, NextResponse } from 'next/server';
import { isRequestAuthorized } from '@/lib/auth';
import { getRefreshState, refreshNews } from '@/lib/ingest';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!isRequestAuthorized(request)) {
    return NextResponse.json(
      { error: 'Unauthorized', message: '请先输入访问口令' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  return NextResponse.json(getRefreshState(), {
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST(request: NextRequest) {
  if (!isRequestAuthorized(request)) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized', message: '未授权请求，禁止触发刷新' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const { searchParams } = new URL(request.url);
  const asyncMode = searchParams.get('async') === '1' || searchParams.get('async') === 'true';

  // Non-blocking background mode prevents NAS reverse-proxy timeouts during large initial global syncs
  if (asyncMode) {
    void refreshNews('manual');
    return NextResponse.json(
      {
        ok: true,
        async: true,
        refreshState: getRefreshState(),
      },
      { status: 202, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  try {
    const result = await refreshNews('manual');
    return NextResponse.json(result, {
      status: result.ok ? 200 : 500,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error('[API /api/refresh] Error:', err);
    return NextResponse.json(
      {
        ok: false,
        message: err instanceof Error ? err.message : 'Refresh failed',
      },
      { status: 500 }
    );
  }
}
