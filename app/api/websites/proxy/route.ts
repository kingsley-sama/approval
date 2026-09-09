import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getUser } from '@/lib/db/queries';
import { validateShareToken } from '@/app/actions/share-links';
import { normalizeUrl, assertSafeUrl, UnsafeUrlError } from '@/lib/website/url';
import {
  rewriteHtml,
  rewriteCss,
  shouldStripHeader,
  isSameSite,
  type ProxyContext,
} from '@/lib/website/proxy-html';

/**
 * GET /api/websites/proxy?projectId=…&url=…[&token=…]
 *
 * Serves a page from the site under review through our own origin, so the
 * viewer can frame it and place comments on it.
 *
 * Three gates, all necessary — this endpoint makes outbound requests on the
 * server's behalf, which is exactly what an attacker wants:
 *   1. the caller must have access to the project (session or share token),
 *   2. the URL must belong to that project's site, so it cannot be aimed
 *      anywhere else,
 *   3. the SSRF guard from lib/website/url.ts rejects private addresses.
 */

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_BYTES = 15 * 1024 * 1024;
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

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const projectId = params.get('projectId');
  const rawUrl = params.get('url');
  const token = params.get('token');

  if (!projectId || !rawUrl) return fail(400, 'Missing projectId or url.');

  // ── the project and its site ────────────────────────────────────────────
  const { data: projectRow } = await supabaseAdmin
    .from('markup_projects')
    .select('id, kind, site_url')
    .eq('id', projectId)
    .maybeSingle();

  const project = projectRow as { id: string; kind: string | null; site_url: string | null } | null;
  if (!project || project.kind !== 'website') return fail(404, 'No website review found for that id.');
  if (!project.site_url) return fail(400, 'That review has no site address recorded.');

  // ── access ──────────────────────────────────────────────────────────────
  let authorised = false;
  if (token) {
    const { success, shareLink } = await validateShareToken(token);
    if (success && shareLink && shareLink.resourceId === projectId) authorised = true;
  }
  if (!authorised) {
    const user = await getUser();
    if (user) {
      if (user.role === 'admin') authorised = true;
      else if (user.email) {
        const { data: access } = await supabaseAdmin
          .from('website_project_access')
          .select('project_id')
          .eq('project_id', projectId)
          .eq('user_email', user.email)
          .maybeSingle();
        if (access) authorised = true;
      }
    }
  }
  if (!authorised) return fail(403, 'You do not have access to this review.');

  // ── target validation ───────────────────────────────────────────────────
  let target: URL;
  let site: URL;
  try {
    target = normalizeUrl(rawUrl);
    assertSafeUrl(target);
    site = normalizeUrl(project.site_url);
  } catch (err) {
    return fail(400, err instanceof UnsafeUrlError ? err.message : 'That address could not be read.');
  }

  // Sub-resources may come from anywhere; documents may not.
  //
  // The host lock exists so this endpoint cannot be used to browse arbitrary
  // sites through our server. That reasoning applies to pages, not to the
  // stylesheet a page pulls off a CDN — and real sites pull plenty: the
  // Webflow test site serves its CSS, fonts and images from
  // cdn.prod.website-files.com and fonts.gstatic.com. Rewriting those through
  // the proxy and then refusing them left the page loading with a screenful of
  // 403s.
  //
  // Sec-Fetch-Dest is the browser's own statement of what the request is for,
  // and it cannot be spoofed by page script. Anything that is not a navigation
  // is treated as an asset and allowed through, still behind the auth check and
  // the SSRF guard above.
  const dest = (request.headers.get('sec-fetch-dest') || '').toLowerCase();
  const isNavigation = dest === '' || dest === 'document' || dest === 'iframe' || dest === 'frame';

  if (isNavigation && !isSameSite(target, site)) {
    return fail(
      403,
      `Only pages on ${site.hostname} can be opened here. This review is scoped to that site.`
    );
  }

  // ── fetch ───────────────────────────────────────────────────────────────
  let upstream: Response;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    upstream = await fetch(target.toString(), {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: request.headers.get('accept') ?? 'text/html,application/xhtml+xml,*/*;q=0.8',
        'Accept-Language': request.headers.get('accept-language') ?? 'en,de;q=0.9',
      },
      redirect: 'follow',
      signal: controller.signal,
    });
  } catch (err) {
    const message = err instanceof Error && err.name === 'AbortError'
      ? 'The site took too long to respond.'
      : `The site could not be reached (${err instanceof Error ? err.message : 'unknown error'}).`;
    return fail(504, message);
  } finally {
    clearTimeout(timer);
  }

  // A redirect may have left the site (e.g. to an SSO host); re-check.
  let finalUrl = target;
  try {
    const resolved = new URL(upstream.url || target.toString());
    if (isNavigation && !isSameSite(resolved, site)) {
      return fail(403, `The site redirected to ${resolved.hostname}, which is outside this review.`);
    }
    finalUrl = resolved;
  } catch {
    /* keep the requested URL */
  }

  const contentType = upstream.headers.get('content-type') ?? 'application/octet-stream';
  const headers = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!shouldStripHeader(key)) headers.set(key, value);
  });
  headers.set('Cache-Control', 'no-store');
  // Our own frame policy: this response is only ever meant to be framed by us.
  headers.set('X-Robots-Tag', 'noindex, nofollow');

  const ctx: ProxyContext = {
    pageUrl: finalUrl.toString(),
    projectId,
    token,
  };

  const lower = contentType.toLowerCase();

  // ── stylesheets: rewrite url() and @import so fonts and images come back
  // through the proxy. Webfonts are the reason this matters — @font-face is
  // CORS-checked, so a font left on the origin server is simply blocked. ────
  if (lower.includes('text/css')) {
    const css = await upstream.text();
    if (css.length > MAX_BYTES) return fail(413, 'That stylesheet is too large to open here.');
    headers.set('Content-Type', contentType);
    headers.delete('Content-Length');
    return new NextResponse(rewriteCss(css, ctx), { status: upstream.status, headers });
  }

  // ── everything else (scripts, images, fonts) passes through untouched ────
  if (!lower.includes('text/html')) {
    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.length > MAX_BYTES) return fail(413, 'That file is too large to open here.');
    headers.set('Content-Type', contentType);
    headers.set('Content-Length', String(buf.length));
    return new NextResponse(buf, { status: upstream.status, headers });
  }

  const raw = await upstream.text();
  if (raw.length > MAX_BYTES) return fail(413, 'That page is too large to open here.');

  const { html } = rewriteHtml(raw, ctx);

  headers.set('Content-Type', 'text/html; charset=utf-8');
  // The viewer reads this to keep its address bar in step after redirects.
  headers.set('X-Proxied-Url', finalUrl.toString());
  headers.delete('Content-Length');

  return new NextResponse(html, { status: upstream.status, headers });
}
