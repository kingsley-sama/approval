import { NextRequest, NextResponse } from 'next/server';
import { toProxyPath, TOKEN_PARAM } from '@/lib/website/proxy-path';

/**
 * GET /api/websites/proxy?projectId=…&url=…[&token=…]
 *
 * The original query-string form of the website proxy, kept so existing links
 * and bookmarks still open. It now only forwards to the path-based proxy
 * (app/api/websites/p/…), which is where access, site scope and the SSRF guard
 * are enforced.
 */

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const projectId = params.get('projectId');
  const rawUrl = params.get('url');
  const token = params.get('token');
  if (!projectId || !rawUrl) {
    return NextResponse.json({ success: false, error: 'Missing projectId or url.' }, { status: 400 });
  }

  let path: string;
  try {
    path = toProxyPath(rawUrl, projectId);
  } catch {
    return NextResponse.json({ success: false, error: 'That address could not be read.' }, { status: 400 });
  }
  const target = new URL(path, request.nextUrl.origin);
  if (token) target.searchParams.set(TOKEN_PARAM, token);
  return NextResponse.redirect(target, 307);
}
