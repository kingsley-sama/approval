/**
 * Path-based proxy addresses for the live website viewer.
 *
 *   https://site.de/about/team?x=1  →  /api/websites/p/<projectId>/https/site.de/about/team?x=1
 *
 * The query-string form this replaces (`/api/websites/proxy?url=…`) put every
 * page at the same path, so a relative URL the page built at runtime —
 * `assets/img.webp` inserted through innerHTML, which no rewriting can see —
 * resolved against `/api/websites/` and 404'd. With the site's own path in
 * ours, the browser resolves relative URLs to the right proxied address by
 * itself.
 *
 * A path ending in `/` gets a trailing `INDEX` segment. Next.js strips trailing
 * slashes with a redirect, and `/about` and `/about/` resolve relative URLs
 * differently, so the slash has to survive as something that is not a slash.
 *
 * Shared by the server (proxy route, rewriter) and the client (viewer), so it
 * has no server-only imports.
 */

export const PROXY_ROOT = '/api/websites/p';
export const INDEX_SEGMENT = '__rv_index';
/** Query parameter carrying a share token on the first document request. */
export const TOKEN_PARAM = '__rvt';

export function proxyPrefix(projectId: string): string {
  return `${PROXY_ROOT}/${projectId}/`;
}

/** Absolute site URL → proxied path (same origin as the app). */
export function toProxyPath(target: string | URL, projectId: string): string {
  const u = typeof target === 'string' ? new URL(target) : target;
  const scheme = u.protocol.replace(':', '');
  let path = u.pathname || '/';
  if (path.endsWith('/')) path += INDEX_SEGMENT;
  return `${proxyPrefix(projectId)}${scheme}/${u.host}${path}${u.search}${u.hash}`;
}

export interface ParsedProxyPath {
  projectId: string;
  target: URL;
}

/**
 * Proxied path (or full URL on our origin) → the site URL it stands for.
 * Returns null for anything that is not a proxied address.
 */
export function fromProxyPath(pathOrUrl: string, search = ''): ParsedProxyPath | null {
  let pathname = pathOrUrl;
  let query = search;
  if (/^https?:\/\//i.test(pathOrUrl)) {
    try {
      const u = new URL(pathOrUrl);
      pathname = u.pathname;
      query = u.search;
    } catch {
      return null;
    }
  } else {
    const q = pathOrUrl.indexOf('?');
    if (q !== -1) {
      pathname = pathOrUrl.slice(0, q);
      query = pathOrUrl.slice(q);
    }
  }

  if (!pathname.startsWith(`${PROXY_ROOT}/`)) return null;
  const rest = pathname.slice(PROXY_ROOT.length + 1);
  const m = /^([^/]+)\/(https?)\/([^/]+)(\/.*)?$/i.exec(rest);
  if (!m) return null;
  const [, projectId, scheme, host, rawPath = '/'] = m;

  let path = rawPath;
  if (path.endsWith(`/${INDEX_SEGMENT}`)) path = path.slice(0, -INDEX_SEGMENT.length);

  // Leave the site's query byte-for-byte unless ours is in it: re-serialising
  // changes encodings, and some servers (image CDNs, signed URLs) notice.
  let qs = query.startsWith('?') ? query.slice(1) : query;
  if (qs.includes(`${TOKEN_PARAM}=`)) {
    qs = qs.split('&').filter((kv) => !kv.startsWith(`${TOKEN_PARAM}=`)).join('&');
  }

  try {
    return { projectId, target: new URL(`${scheme.toLowerCase()}://${host}${path}${qs ? `?${qs}` : ''}`) };
  } catch {
    return null;
  }
}
