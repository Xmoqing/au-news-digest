import { NextRequest, NextResponse } from 'next/server';
import {
  AUTH_COOKIE_MAX_AGE,
  AUTH_COOKIE_NAME,
  computeSessionToken,
  getConfiguredAccessPassword,
  isAccessPasswordEnabled,
  isHttpsRequest,
  verifyPlainPassword,
} from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Simple per-IP brute-force protection (12 attempts per 5 minutes)
const MAX_ATTEMPTS = 12;
const WINDOW_MS = 5 * 60 * 1000;

declare global {
  // eslint-disable-next-line no-var
  var __auNewsAuthAttempts: Map<string, { count: number; resetAt: number }> | undefined;
}

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

function checkRateLimit(ip: string): { allowed: boolean; retryAfterSec: number } {
  if (!globalThis.__auNewsAuthAttempts) {
    globalThis.__auNewsAuthAttempts = new Map();
  }
  const now = Date.now();
  const entry = globalThis.__auNewsAuthAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    return { allowed: true, retryAfterSec: 0 };
  }
  if (entry.count >= MAX_ATTEMPTS) {
    return { allowed: false, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { allowed: true, retryAfterSec: 0 };
}

function recordFailedAttempt(ip: string): void {
  if (!globalThis.__auNewsAuthAttempts) {
    globalThis.__auNewsAuthAttempts = new Map();
  }
  const now = Date.now();
  const entry = globalThis.__auNewsAuthAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    globalThis.__auNewsAuthAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

export async function POST(request: NextRequest) {
  if (!isAccessPasswordEnabled()) {
    return NextResponse.json({ ok: true, authEnabled: false });
  }

  const ip = getClientIp(request);
  const rate = checkRateLimit(ip);
  if (!rate.allowed) {
    return NextResponse.json(
      { ok: false, message: `尝试次数过多，请 ${rate.retryAfterSec} 秒后再试` },
      { status: 429 }
    );
  }

  let password = '';
  try {
    const body = (await request.json()) as { password?: unknown };
    password = typeof body?.password === 'string' ? body.password : '';
  } catch {
    return NextResponse.json({ ok: false, message: '请求格式错误' }, { status: 400 });
  }

  if (!verifyPlainPassword(password)) {
    recordFailedAttempt(ip);
    return NextResponse.json(
      { ok: false, message: '访问口令不正确，请重新输入' },
      { status: 401 }
    );
  }

  globalThis.__auNewsAuthAttempts?.delete(ip);

  const token = computeSessionToken(getConfiguredAccessPassword());
  const response = NextResponse.json({ ok: true, expiresInDays: 30 });

  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttpsRequest(request),
    path: '/',
    maxAge: AUTH_COOKIE_MAX_AGE,
  });

  return response;
}
