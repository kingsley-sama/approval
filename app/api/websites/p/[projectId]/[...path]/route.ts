import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { normalizeUrl, assertSafeUrl, UnsafeUrlError } from '@/lib/website/url';
import { rewriteHtml, rewriteCss, shouldStripHeader, isSameSite, type ProxyContext } from '@/lib/website/proxy-html';
import { fromProxyPath, toProxyPath, TOKEN_PARAM } from '@/lib/website/proxy-path';
import {
  canOpenWebsiteProject,
  proxyCookieName,
  proxyCookieOptions,
  signProxyPass,
  verifyProxyPass,
} from '@/lib/website/proxy-session';

/**
 * GET /api/websites/p/<projectId>/<scheme>/<host>/<path>[?query]
 *
 * Serves a page of the site under review — and everything it loads — through
 * our own origin, so the viewer can frame it and place comments on it. See
 * lib/website/proxy-path.ts for why the site's path is part of ours.
 *
 * Three gates, all necessary — this endpoint makes outbound requests on the
 * server's behalf, which is exactly what an attacker wants:
 *   1. the caller must have access to the review: checked in full on the
 *      document request (session or share token), which then issues a signed,
 *      path-scoped pass that the page's assets present instead;
 *   2. a *document* must belong to the review's site, so the frame cannot be
 *      aimed anywhere else (assets may come from CDNs);
 *   3. the SSRF guard from lib/website/url.ts rejects private addresses.
 */

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_REWRITE_BYTES = 15 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 20000;

// Presenting a real browser UA matters: a bare fetch UA gets a consent wall or
// a 403 from a lot of sites.
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

function fail(status: number, message: string) {
  // Rendered inside the iframe, so it must be readable as a page, not JSON.
  const body = `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;display:flex;align-items:center;justify-content:center;height:100vh;
      font:14px/1.6 system-ui,sans-serif;background:#f7f4ed;color:#0c3133;padding:24px}
    div{max-width:34rem;text-align:center}
    h1{font-size:15px;margin:0 0 8px}p{margin:0;color:#4a5a5b}
  </style><div><h1>This page could not be loaded</h1><p>${message
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')}</p></div>`;
  return new NextResponse(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export async function GET(request: NextRequest, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params;
  const parsed = fromProxyPath(request.nextUrl.pathname, request.nextUrl.search);
  if (!parsed || parsed.projectId !== projectId) return fail(400, 'That address could not be read.');

  // Sec-Fetch-Dest is the browser's own statement of what the request is for,
  // and page script cannot spoof it. Anything that is not a navigation is an
  // asset.
  const dest = (request.headers.get('sec-fetch-dest') || '').toLowerCase();
  const isNavigation = dest === '' || dest === 'document' || dest === 'iframe' || dest === 'frame';

  // ── access ──────────────────────────────────────────────────────────────
  const cookieName = proxyCookieName(projectId);
  let issuePass = false;
  if (!(await verifyProxyPass(request.cookies.get(cookieName)?.value, projectId))) {
    const token = request.nextUrl.searchParams.get(TOKEN_PARAM);
    if (!(await canOpenWebsiteProject(projectId, token))) {
      return fail(403, 'You do not have access to this review.');
    }
    issuePass = true;
  }

  // ── target validation ───────────────────────────────────────────────────
  let target: URL;
  try {
    target = normalizeUrl(parsed.target.toString());
    // normalizeUrl drops the fragment; the server never sees it anyway.
    assertSafeUrl(target);
  } catch (err) {
    return fail(400, err instanceof UnsafeUrlError ? err.message : 'That address could not be read.');
  }

  // Documents are scoped to the review's site. The lookup is only needed here:
  // assets may legitimately come from any CDN the page uses.
  let site: URL | null = null;
  if (isNavigation) {
    const { data: projectRow } = await supabaseAdmin
      .from('markup_projects')
      .select('id, kind, site_url')
      .eq('id', projectId)
      .maybeSingle();
    const project = projectRow as { id: string; kind: string | null; site_url: string | null } | null;
    if (!project || project.kind !== 'website' || !project.site_url) {
      return fail(404, 'This review no longer exists.');
    }
    try {
      site = normalizeUrl(project.site_url);
    } catch {
      return fail(400, 'That review has no usable site address.');
    }
    if (!isSameSite(target, site)) {
      // A frame *inside* a proxied page (a video player, a map, a booking
      // widget) is not a page anyone navigated to, so the site lock does not
      // apply to it. It goes to its real address rather than through us: an
      // embed provider serves those from a real browser session, and several
      // (Vimeo among them) answer 401 to any server-side fetch, whatever
      // referrer it carries. An embed locked to the client's own domain still
      // will not play here — nothing a review tool does can change that.
      const framedByProxiedPage = dest === 'iframe' && fromProxyPath(request.headers.get('referer') ?? '') !== null;
      if (framedByProxiedPage) return NextResponse.redirect(target, 307);
      return fail(403, `Only pages on ${site.hostname} can be opened here. This review is scoped to that site.`);
    }
  }

  // ── fetch ───────────────────────────────────────────────────────────────
  // The page the asset was requested from, as the site knows it: hotlink
  // protection on image CDNs checks this.
  const referer = fromProxyPath(request.headers.get('referer') ?? '')?.target.toString() ?? `${target.origin}/`;

  const upstreamHeaders: Record<string, string> = {
    'User-Agent': USER_AGENT,
    Accept: request.headers.get('accept') ?? 'text/html,application/xhtml+xml,*/*;q=0.8',
    'Accept-Language': request.headers.get('accept-language') ?? 'de,en;q=0.9',
    Referer: referer,
  };
  if (!isNavigation) {
    // Byte ranges (video seeking) and revalidation go straight through.
    for (const h of ['range', 'if-none-match', 'if-modified-since', 'if-range']) {
      const v = request.headers.get(h);
      if (v) upstreamHeaders[h] = v;
    }
  }

  let upstream: Response;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    upstream = await fetch(target.toString(), {
      headers: upstreamHeaders,
      // A document redirect is handed back to the browser (below) so the
      // frame's own address — which relative URLs resolve against — follows it.
      redirect: isNavigation ? 'manual' : 'follow',
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const message = err instanceof Error && err.name === 'AbortError'
      ? 'The site took too long to respond.'
      : `The site could not be reached (${err instanceof Error ? err.message : 'unknown error'}).`;
    return fail(504, message);
  }

  const withPass = async (res: NextResponse) => {
    if (issuePass) res.cookies.set(cookieName, await signProxyPass(projectId), proxyCookieOptions(projectId));
    return res;
  };

  // ── document redirects ──────────────────────────────────────────────────
  if (isNavigation && upstream.status >= 300 && upstream.status < 400) {
    clearTimeout(timer);
    const location = upstream.headers.get('location');
    if (!location) return fail(502, 'The site sent a redirect without an address.');
    let next: URL;
    try {
      next = new URL(location, target);
    } catch {
      return fail(502, 'The site redirected to an address that could not be read.');
    }
    if (site && !isSameSite(next, site)) {
      return fail(403, `The site redirected to ${next.hostname}, which is outside this review.`);
    }
    return withPass(NextResponse.redirect(new URL(toProxyPath(next, projectId), request.nextUrl.origin), 307));
  }

  const contentType = upstream.headers.get('content-type') ?? 'application/octet-stream';
  const lower = contentType.toLowerCase();
  const headers = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!shouldStripHeader(key)) headers.set(key, value);
  });
  headers.set('X-Robots-Tag', 'noindex, nofollow');

  const ctx: ProxyContext = { pageUrl: target.toString(), projectId };
  const isHtml = lower.includes('text/html');
  const isCss = lower.includes('text/css');

  // ── assets that pass through: streamed, cacheable, range-capable ────────
  if (!isHtml && !isCss) {
    clearTimeout(timer);
    // Assets rarely change between two looks at a page; documents always
    // might, so only assets are cached. Private: it sits behind access control.
    headers.set('Cache-Control', upstream.ok || upstream.status === 304 ? 'private, max-age=3600' : 'no-store');
    return withPass(new NextResponse(upstream.body, { status: upstream.status, headers }));
  }

  // A revalidated stylesheet: the browser's cached copy is already rewritten.
  if (upstream.status === 304) {
    clearTimeout(timer);
    headers.set('Cache-Control', 'private, max-age=3600');
    return withPass(new NextResponse(null, { status: 304, headers }));
  }

  let text: string;
  try {
    text = await upstream.text();
  } finally {
    clearTimeout(timer);
  }
  if (text.length > MAX_REWRITE_BYTES) return fail(413, 'That page is too large to open here.');

  // ── stylesheets: rewrite url() and @import so fonts and images come back
  // through the proxy. Webfonts are the reason this matters — @font-face is
  // CORS-checked, so a font left on the origin server is simply blocked. ────
  if (isCss) {
    headers.set('Content-Type', contentType);
    headers.set('Cache-Control', upstream.ok ? 'private, max-age=3600' : 'no-store');
    return withPass(new NextResponse(rewriteCss(text, ctx), { status: upstream.status, headers }));
  }

  const { html } = rewriteHtml(text, ctx);
  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  // Validators describe the original bytes, not our rewrite.
  headers.delete('etag');
  headers.delete('last-modified');
  return withPass(new NextResponse(html, { status: upstream.status, headers }));
}
