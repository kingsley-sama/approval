/**
 * URL handling for the Websites section.
 *
 * Everything here runs against a URL a user typed, which then gets fetched
 * server-side (for the page title) and visited by the capture worker. That
 * makes it an SSRF surface: without a guard, "http://169.254.169.254/..." or
 * "http://localhost:5432" would let anyone with an account probe the machine
 * the app runs on. `assertSafeUrl` is the gate; call it before any fetch.
 */

/** Hostnames that never belong to a customer's public website. */
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'metadata.google.internal',
]);

/** Suffixes for names that only resolve inside a private network. */
const BLOCKED_SUFFIXES = ['.local', '.internal', '.localdomain', '.home.arpa'];

/**
 * IPv4 literals in ranges that are not publicly routable — loopback, RFC1918
 * private space, link-local (which is where cloud metadata endpoints live),
 * CGNAT, and 0.0.0.0/8.
 */
function isPrivateIPv4(host: string): boolean {
  const parts = host.split('.');
  if (parts.length !== 4) return false;

  const octets = parts.map((p) => {
    if (!/^\d{1,3}$/.test(p)) return NaN;
    return Number(p);
  });
  if (octets.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false;

  const [a, b] = octets;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;            // link-local + metadata
  if (a === 172 && b >= 16 && b <= 31) return true;   // 172.16/12
  if (a === 192 && b === 168) return true;            // 192.168/16
  if (a === 100 && b >= 64 && b <= 127) return true;  // CGNAT 100.64/10
  return false;
}

/** IPv6 loopback, unique-local (fc00::/7) and link-local (fe80::/10). */
function isPrivateIPv6(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (h === '::1' || h === '::') return true;
  if (/^f[cd][0-9a-f]{2}:/.test(h)) return true;
  if (/^fe[89ab][0-9a-f]:/.test(h)) return true;
  // IPv4-mapped (::ffff:10.0.0.1) inherits the IPv4 rules.
  const mapped = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}

export class UnsafeUrlError extends Error {}

/**
 * Parses and normalises user input into an absolute http(s) URL.
 * Bare hostnames get https://. Fragments are dropped — they never change what
 * a screenshot looks like, and keeping them would create duplicate captures of
 * the same page.
 */
export function normalizeUrl(input: string): URL {
  const trimmed = input.trim();
  if (!trimmed) throw new UnsafeUrlError('Enter a URL');

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new UnsafeUrlError(`"${input}" is not a valid URL`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeUrlError('Only http and https URLs can be captured');
  }

  url.hash = '';
  return url;
}

/**
 * Throws unless the URL points somewhere on the public internet.
 *
 * This is hostname-level only: a public name whose DNS record resolves to a
 * private address still slips through. The capture worker should run without
 * access to your internal network as the real defence — treat this as the
 * first gate, not the only one.
 */
export function assertSafeUrl(url: URL): void {
  const host = url.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(host)) {
    throw new UnsafeUrlError(`${url.hostname} is not a public address`);
  }
  if (BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new UnsafeUrlError(`${url.hostname} is not a public address`);
  }
  if (isPrivateIPv4(host) || isPrivateIPv6(host)) {
    throw new UnsafeUrlError(`${url.hostname} is a private address`);
  }
  if (!host.includes('.') && !host.includes(':')) {
    throw new UnsafeUrlError(`${url.hostname} is not a fully qualified domain`);
  }
}

/** Parse + guard in one step. Returns the normalised absolute URL string. */
export function safeUrlString(input: string): string {
  const url = normalizeUrl(input);
  assertSafeUrl(url);
  return url.toString();
}

/** "https://www.example.com/a/b" -> "example.com" — the default project name. */
export function deriveProjectName(url: URL | string): string {
  const u = typeof url === 'string' ? new URL(url) : url;
  return u.hostname.replace(/^www\./, '');
}

/**
 * A short, human label for one captured page.
 * "https://example.com/"            -> "Home"
 * "https://example.com/about/team"  -> "/about/team"
 */
export function derivePageName(url: URL | string): string {
  const u = typeof url === 'string' ? new URL(url) : url;
  const path = u.pathname.replace(/\/+$/, '');
  const label = path === '' ? 'Home' : path;
  return u.search ? `${label}${u.search}` : label;
}

/** Filename-safe slug for the Storage key of a capture. */
export function urlToSlug(url: URL | string): string {
  const u = typeof url === 'string' ? new URL(url) : url;
  const raw = `${u.hostname}${u.pathname}${u.search}`;
  return (
    raw
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'page'
  );
}

/** Splits a textarea of pasted URLs into individual candidates. */
export function parseUrlList(input: string): string[] {
  return input
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Query parameters that never change what a page shows. */
const TRACKING_PARAMS = /^(utm_[a-z]+|gclid|fbclid|msclkid|mc_cid|mc_eid|_ga|_gl|__rvt)$/i;

/**
 * The identity of a page for matching purposes: `http://www.site.de/about/`,
 * `https://site.de/about#team` and `https://site.de/about?utm_source=x` are
 * all the same page. Used wherever a URL in the frame is matched to a page of
 * the review, so the workspace, the share view and page registration agree.
 */
export function pageKey(input: string): string {
  try {
    const u = new URL(input);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const path = u.pathname.replace(/\/+$/, '') || '/';
    const params = Array.from(u.searchParams.entries())
      .filter(([k]) => !TRACKING_PARAMS.test(k))
      .sort(([a], [b]) => a.localeCompare(b));
    const qs = params.length ? `?${new URLSearchParams(params).toString()}` : '';
    return `${host}${path}${qs}`;
  } catch {
    return input.trim();
  }
}

export function samePage(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return pageKey(a) === pageKey(b);
}

/** The page of the review a URL belongs to, if any. */
export function matchPage<T extends { sourceUrl?: string | null }>(url: string | null | undefined, pages: T[]): T | undefined {
  if (!url) return undefined;
  const key = pageKey(url);
  return pages.find((p) => p.sourceUrl && pageKey(p.sourceUrl) === key);
}
