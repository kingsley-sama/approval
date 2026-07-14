import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Bearer-token auth for the public automation API (/api/v1/*).
 *
 * Valid keys are configured via the MARKUP_API_KEYS env var as a
 * comma-separated list, so keys can be rotated without downtime
 * (add the new key, migrate callers, remove the old one).
 */

function getConfiguredKeys(): string[] {
  return (process.env.MARKUP_API_KEYS || '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
}

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function apiError(status: number, code: string, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json(
    { success: false, error: { code, message, ...extra } },
    { status }
  );
}

/**
 * Validates the Authorization header. Returns null when authorized,
 * or a ready-to-return error response when not.
 */
export function requireApiKey(request: NextRequest): NextResponse | null {
  const keys = getConfiguredKeys();
  if (keys.length === 0) {
    return apiError(
      503,
      'api_not_configured',
      'The API is not enabled: no MARKUP_API_KEYS configured on the server.'
    );
  }

  const header = request.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return apiError(
      401,
      'missing_token',
      'Missing bearer token. Send an "Authorization: Bearer <api-key>" header.'
    );
  }

  const token = match[1].trim();
  const valid = keys.some((key) => safeCompare(key, token));
  if (!valid) {
    return apiError(401, 'invalid_token', 'The provided API key is not valid.');
  }

  return null;
}

/**
 * Origin of the incoming request (respects reverse-proxy headers) so
 * returned URLs are correct for whatever host the API is served from.
 */
export function getRequestOrigin(request: NextRequest): string {
  const host =
    request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (host) {
    const proto =
      request.headers.get('x-forwarded-proto') ??
      (host.startsWith('localhost') ? 'http' : 'https');
    return `${proto}://${host}`;
  }
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'https://revision.exposeprofi.de';
}
