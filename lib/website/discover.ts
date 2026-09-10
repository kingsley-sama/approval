/**
 * Finding the pages of a site, so a reviewer does not have to type them in.
 *
 * Two sources, in order of trust:
 *
 *   sitemap — what the site says about itself. Accurate, usually complete, and
 *             one request. robots.txt is read first because that is where a
 *             sitemap in a non-default location is declared.
 *   crawl   — the links on the entry page. Plenty of small sites publish no
 *             sitemap at all, and this is the only thing that works for them.
 *
 * Both run server-side against a URL a user supplied, which makes this an SSRF
 * surface exactly like the proxy: everything is filtered back to the reviewed
 * host and pushed through `assertSafeUrl` before it is fetched or returned.
 */

import { normalizeUrl, assertSafeUrl } from '@/lib/website/url';
import { isSameSite } from '@/lib/website/proxy-html';

const FETCH_TIMEOUT_MS = 12_000;
const MAX_BYTES = 5 * 1024 * 1024;
/** Enough to cover a marketing site without turning a review into a crawl job. */
export const DISCOVERY_LIMIT = 150;
/** Sitemap indexes point at more sitemaps; follow a few, not a tree. */
const MAX_CHILD_SITEMAPS = 5;

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

/** Things that are files rather than pages — nothing to annotate on them. */
const ASSET_EXTENSIONS =
  /\.(jpg|jpeg|png|gif|webp|avif|svg|ico|css|js|mjs|json|xml|txt|pdf|zip|gz|rar|mp4|webm|mov|mp3|wav|woff2?|ttf|otf|eot)$/i;

export type DiscoverySource = 'sitemap' | 'crawl';

export interface DiscoveredPage {
  url: string;
  /** Path shown in the picker — "/" for the entry page. */
  path: string;
  source: DiscoverySource;
}

export interface DiscoveryResult {
  pages: DiscoveredPage[];
  /** Which sources actually produced anything, for the UI to explain itself. */
  sources: DiscoverySource[];
  /** True when the cap was hit and the list is a prefix of what exists. */
  truncated: boolean;
  error?: string;
}

async function fetchText(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: '*/*' },
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) return null;
    return new TextDecoder().decode(buf);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Same-site, safe, http(s) — the checks that apply to anything we fetch.
 * Returns the parsed URL, or null when it should not be touched.
 */
function reachable(raw: string, site: URL, base?: string): URL | null {
  let url: URL;
  try {
    url = base ? new URL(raw, base) : normalizeUrl(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (!isSameSite(url, site)) return null;
  try {
    assertSafeUrl(url);
  } catch {
    return null;
  }
  return url;
}

/**
 * Keeps a candidate only if it is a safe, same-site, http(s) page URL.
 * Returns the normalised string, or null when it should be dropped.
 */
function acceptable(raw: string, site: URL, base?: string): string | null {
  let url: URL;
  try {
    url = base ? new URL(raw, base) : normalizeUrl(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (!isSameSite(url, site)) return null;
  if (ASSET_EXTENSIONS.test(url.pathname)) return null;
  try {
    assertSafeUrl(url);
  } catch {
    return null;
  }
  // A fragment is the same page; a trailing slash is the same page too.
  url.hash = '';
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.replace(/\/+$/, '');
  }
  return url.toString();
}

/** <loc> entries, and whether this document was an index of other sitemaps. */
function parseSitemap(xml: string): { locs: string[]; isIndex: boolean } {
  const locs: string[] = [];
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) locs.push(decodeXml(m[1]));
  return { locs, isIndex: /<sitemapindex[\s>]/i.test(xml) };
}

function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/** Sitemap locations declared in robots.txt, which is where non-default ones live. */
function sitemapsFromRobots(robots: string): string[] {
  const out: string[] = [];
  for (const line of robots.split('\n')) {
    const m = line.match(/^\s*sitemap:\s*(\S+)/i);
    if (m) out.push(m[1]);
  }
  return out;
}

async function fromSitemaps(site: URL): Promise<string[]> {
  const roots: string[] = [];

  const robots = await fetchText(new URL('/robots.txt', site).toString());
  if (robots) roots.push(...sitemapsFromRobots(robots));
  roots.push(new URL('/sitemap.xml', site).toString());
  roots.push(new URL('/sitemap_index.xml', site).toString());

  const seenDocs = new Set<string>();
  const found: string[] = [];
  const queue = roots.slice();
  let childrenFollowed = 0;

  while (queue.length > 0) {
    const docUrl = queue.shift()!;
    if (seenDocs.has(docUrl)) continue;
    seenDocs.add(docUrl);

    // A sitemap declared in robots.txt could point anywhere; hold it to the
    // same host rule as everything else before fetching it. Note this uses
    // `reachable`, not `acceptable` — a sitemap ends in .xml, which the page
    // filter drops, and running it through that check meant every sitemap was
    // rejected before it was ever read.
    if (!reachable(docUrl, site)) continue;

    const xml = await fetchText(docUrl);
    if (!xml) continue;

    const { locs, isIndex } = parseSitemap(xml);
    if (isIndex) {
      for (const loc of locs) {
        if (childrenFollowed >= MAX_CHILD_SITEMAPS) break;
        childrenFollowed++;
        queue.push(loc);
      }
      continue;
    }
    found.push(...locs);
    if (found.length > DISCOVERY_LIMIT * 4) break;
  }

  return found;
}

async function fromCrawl(site: URL, entry: string): Promise<string[]> {
  const html = await fetchText(entry);
  if (!html) return [];

  const out: string[] = [];
  const re = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    out.push(m[1]);
    if (out.length > DISCOVERY_LIMIT * 6) break;
  }
  return out;
}

/**
 * Discovers the reviewable pages of a site.
 *
 * The entry URL is always first in the result: it is the page the review was
 * created for, and a reviewer expects to see it at the top of the list.
 */
export async function discoverRoutes(
  siteUrl: string,
  opts?: { limit?: number }
): Promise<DiscoveryResult> {
  const limit = Math.max(1, Math.min(opts?.limit ?? DISCOVERY_LIMIT, DISCOVERY_LIMIT));

  let site: URL;
  try {
    site = normalizeUrl(siteUrl);
    assertSafeUrl(site);
  } catch {
    return { pages: [], sources: [], truncated: false, error: 'That site address could not be read.' };
  }

  const entry = site.toString();
  const seen = new Map<string, DiscoveredPage>();
  const sources: DiscoverySource[] = [];

  /**
   * Dedupe key, not an address. A sitemap routinely lists www.example.com
   * while the review was created for example.com — same page, and offering
   * both would put two identical rows in the picker.
   */
  const key = (u: URL) =>
    `${u.hostname.toLowerCase().replace(/^www\./, '')}${u.pathname}${u.search}`;

  const add = (raw: string, source: DiscoverySource, base?: string) => {
    const url = acceptable(raw, site, base);
    if (!url) return;
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return;
    }
    const k = key(parsed);
    if (seen.has(k)) return;
    seen.set(k, { url, path: `${parsed.pathname}${parsed.search}` || '/', source });
  };

  // The entry page always belongs in the list.
  add(entry, 'sitemap');

  const sitemapLocs = await fromSitemaps(site);
  if (sitemapLocs.length > 0) {
    const before = seen.size;
    for (const loc of sitemapLocs) add(loc, 'sitemap');
    if (seen.size > before) sources.push('sitemap');
  }

  // Crawl when the sitemap gave us little or nothing — a sitemap holding only
  // the home page is as useless as no sitemap at all.
  if (seen.size <= 1) {
    const before = seen.size;
    const links = await fromCrawl(site, entry);
    for (const href of links) add(href, 'crawl', entry);
    if (seen.size > before) sources.push('crawl');
  }

  const all = Array.from(seen.values());
  // Entry first, then shallowest paths, then alphabetical — the order someone
  // scanning a list of pages expects.
  all.sort((a, b) => {
    if (a.url === entry) return -1;
    if (b.url === entry) return 1;
    const depth = a.path.split('/').length - b.path.split('/').length;
    return depth !== 0 ? depth : a.path.localeCompare(b.path);
  });

  return {
    pages: all.slice(0, limit),
    sources,
    truncated: all.length > limit,
  };
}
