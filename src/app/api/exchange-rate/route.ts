import { NextRequest, NextResponse } from 'next/server';
import { isRequestAuthorized } from '@/lib/auth';
import { getAudCnyRate } from '@/lib/fx';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!isRequestAuthorized(request)) {
    return NextResponse.json(
      { error: 'Unauthorized', message: '请先输入访问口令' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const { searchParams } = new URL(request.url);
  const forceRefresh =
    searchParams.get('refresh') === '1' || searchParams.get('refresh') === 'true';

  const fx = await getAudCnyRate(forceRefresh);
  if (!fx) {
    return NextResponse.json(
      { error: 'Unable to fetch AUD/CNY exchange rate', fx: null },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  return NextResponse.json(
    {
      ...fx,
      fx,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
