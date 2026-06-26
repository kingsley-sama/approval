/**
 * Same-origin proxy for panorama images.
 *
 * Pannellum loads the panorama as a WebGL texture, which requires the image to
 * be same-origin or served with permissive CORS headers. Raw Supabase Storage
 * object URLs are cross-origin and can fail the WebGL texture upload (the image
 * still displays in a plain <img>, which is why thumbnails work). Streaming the
 * original bytes through this route makes it same-origin — full quality, no CORS
 * problem. Host is allow-listed to prevent the route being used as an open proxy.
 */

import { NextRequest, NextResponse } from 'next/server';

function allowedHosts(): Set<string> {
  const hosts = new Set<string>([
    'mjvthppljacmcftgcjeb.supabase.co',
    'grukocsepesmslwfjnpk.supabase.co',
  ]);
  try {
    if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
      hosts.add(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host);
    }
  } catch {
    /* ignore */
  }
  return hosts;
}

export async function GET(request: NextRequest) {
  const target = request.nextUrl.searchParams.get('url');
  if (!target) return new NextResponse('Missing url', { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return new NextResponse('Invalid url', { status: 400 });
  }

  if (parsed.protocol !== 'https:' || !allowedHosts().has(parsed.host)) {
    return new NextResponse('Forbidden host', { status: 403 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(parsed.toString());
  } catch {
    return new NextResponse('Upstream fetch failed', { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    return new NextResponse('Upstream error', { status: upstream.status || 502 });
  }

  const headers = new Headers();
  headers.set('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
  headers.set('Cache-Control', 'public, max-age=86400, s-maxage=86400, immutable');
  // Same-origin response, but be explicit so WebGL is happy in every context.
  headers.set('Access-Control-Allow-Origin', '*');

  return new NextResponse(upstream.body, { status: 200, headers });
}
