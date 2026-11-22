import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';

export const AUTH_COOKIE_NAME = 'au_news_auth';
export const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export function getConfiguredAccessPassword(): string {
  return process.env.ACCESS_PASSWORD?.trim() ?? '';
}

export function isAccessPasswordEnabled(): boolean {
  return getConfiguredAccessPassword().length > 0;
}

export function computeSessionToken(password: string): string {
  return crypto
    .createHmac('sha256', password)
    .update('au-news-digest-session-v1')
    .digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function verifyPlainPassword(candidate: string): boolean {
  const configured = getConfiguredAccessPassword();
  if (!configured) return true;
  if (!candidate) return false;
  return safeEqual(candidate.trim(), configured);
}

export function verifySessionToken(token: string | undefined | null): boolean {
  const configured = getConfiguredAccessPassword();
  if (!configured) return true;
  if (!token) return false;
  const expected = computeSessionToken(configured);
  return safeEqual(token, expected);
}

export function isRequestAuthorized(request: NextRequest): boolean {
  if (!isAccessPasswordEnabled()) return true;

  // 1. Check 30-day HttpOnly session cookie
  const cookieToken = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (verifySessionToken(cookieToken)) {
    return true;
  }

  // 2. Allow header-based auth for scripts / webhooks (x-access-password or Bearer)
  const headerPassword = request.headers.get('x-access-password');
  if (headerPassword && verifyPlainPassword(headerPassword)) {
    return true;
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader?.toLowerCase().startsWith('bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (verifyPlainPassword(bearer) || verifySessionToken(bearer)) {
      return true;
    }
  }

  return false;
}

export async function isServerComponentAuthorized(): Promise<boolean> {
  if (!isAccessPasswordEnabled()) return true;
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  return verifySessionToken(token);
}

export function isHttpsRequest(request: NextRequest): boolean {
  const forwardedProto = request.headers.get('x-forwarded-proto');
  if (forwardedProto) {
    return forwardedProto.split(',')[0].trim().toLowerCase() === 'https';
  }
  return request.nextUrl.protocol === 'https:';
}
