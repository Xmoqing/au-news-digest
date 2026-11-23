import { NextRequest, NextResponse } from 'next/server';
import { isRequestAuthorized } from '@/lib/auth';
import { getAvailableLocalDates } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!isRequestAuthorized(request)) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized', message: '请先输入访问口令' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const timeZone = searchParams.get('tz')?.trim() || undefined;
    const rawOffset = searchParams.get('offset');
    const parsedOffset = rawOffset !== null ? Number(rawOffset) : undefined;
    const offsetMinutes =
      parsedOffset !== undefined && Number.isFinite(parsedOffset) ? parsedOffset : undefined;

    const result = await getAvailableLocalDates({ timeZone, offsetMinutes });

    return NextResponse.json(
      {
        ok: true,
        ...result,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('[API /api/available-dates] Error:', err);
    return NextResponse.json(
      { ok: false, error: 'Failed to query available dates' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
