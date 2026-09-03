/**
 * HTML and CSS rewriting for the live website viewer.
 *
 * The viewer needs the reviewed page inside an iframe *and* needs to read the
 * document to anchor comments. Both require the page to be same-origin, so it
 * is served through /api/websites/proxy.
 *
 * The first version of this leaned on `<base href>` so the site's own assets
 * would load straight from the real server. That is simple, and wrong for
 * anything but a static page:
 *
 *   - `@font-face` is CORS-checked (unlike <img> and <script>), so every
 *     webfont was blocked and the page fell back to system fonts.
 *   - A `<base>` on another origin makes the framework's router resolve its
 *     history URLs against that origin, and `history.replaceState` then throws
 *     SecurityError — which killed hydration on any Next.js/SPA site.
 *
 * So nothing is left pointing at the origin server. Every URL in the markup is
 * rewritten to come back through the proxy, and a small shim (below) catches
 * the URLs the page builds at runtime, which no amount of static rewriting can
 * see. The page then believes it is entirely same-origin, which is the only
 * arrangement a framework router is happy with.
 */

/** Response headers that would stop the page being framed, scripted or styled. */
const STRIPPED_HEADERS = new Set([
  'x-frame-options',
  'content-security-policy',
  'content-security-policy-report-only',
  'cross-origin-opener-policy',
  'cross-origin-embedder-policy',
  'cross-origin-resource-policy',
  'permissions-policy',
  // Encoding/hop-by-hop headers that must not be forwarded verbatim.
  'content-encoding',
  'content-length',
  'transfer-encoding',
  'connection',
  'keep-alive',
  'strict-transport-security',
  'set-cookie',
]);

export function shouldStripHeader(name: string): boolean {
  return STRIPPED_HEADERS.has(name.toLowerCase());
}

export interface ProxyContext {
  /** Absolute URL the document was fetched from, after redirects. */
  pageUrl: string;
  projectId: string;
  token?: string | null;
  /** Path the proxy is mounted at. */
  endpoint?: string;
}

/** Builds the proxy URL for one absolute target. */
export function toProxyUrl(target: string, ctx: ProxyContext): string {
  const endpoint = ctx.endpoint ?? '/api/websites/proxy';
  const q = new URLSearchParams({ projectId: ctx.projectId, url: target });
  if (ctx.token) q.set('token', ctx.token);
  return `${endpoint}?${q.toString()}`;
}

/**
 * Resolves a possibly-relative URL against the page, then points it at the
 * proxy. Returns null for anything that must be left alone — data:, blob:,
 * mailto:, tel:, javascript:, and bare fragments.
 */
export function rewriteUrl(raw: string, ctx: ProxyContext): string | null {
  const value = decodeEntities(raw).trim();
  if (!value) return null;
  if (value.startsWith('#')) return null;
  if (/^(data|blob|mailto|tel|javascript|about|sms|geo|intent):/i.test(value)) return null;

  let abs: URL;
  try {
    abs = new URL(value, ctx.pageUrl);
  } catch {
    return null;
  }
  if (abs.protocol !== 'http:' && abs.protocol !== 'https:') return null;

  return toProxyUrl(abs.toString(), ctx);
}

/**
 * Attribute values in the source markup are HTML-encoded, so a query string
 * arrives as `?url=x&amp;w=256`. Parsing that as a URL keeps the `amp;`, and
 * the origin server then rejects the request — Next's image optimizer answers
 * 400 because `amp;w` is not a width it recognises. Decode before parsing.
 */
function decodeEntities(value: string): string {
  return value
    .replace(/&(amp|lt|gt|quot|apos|#39|#x27|nbsp);/gi, (_m, name) => {
      switch (name.toLowerCase()) {
        case 'amp': return '&';
        case 'lt': return '<';
        case 'gt': return '>';
        case 'quot': return '"';
        case 'apos':
        case '#39':
        case '#x27': return "'";
        case 'nbsp': return ' ';
        default: return _m;
      }
    })
    .replace(/&#(\d+);/g, (_m, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, code) => String.fromCodePoint(parseInt(code, 16)));
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** `a.png 1x, b.png 2x` — rewrite each candidate, keep the descriptors. */
function rewriteSrcset(value: string, ctx: ProxyContext): string {
  return value
    .split(',')
    .map((part) => {
      const trimmed = part.trim();
      if (!trimmed) return '';
      const [url, ...descriptors] = trimmed.split(/\s+/);
      const next = rewriteUrl(url, ctx);
      return [next ?? url, ...descriptors].join(' ');
    })
    .filter(Boolean)
    .join(', ');
}

/** Rewrites `url(...)` and `@import "..."` inside a stylesheet or style block. */
export function rewriteCss(css: string, ctx: ProxyContext): string {
  let out = css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (match, quote, target) => {
    const next = rewriteUrl(target, ctx);
    return next ? `url(${quote}${next}${quote})` : match;
  });

  out = out.replace(/@import\s+(['"])([^'"]+)\1/gi, (match, quote, target) => {
    const next = rewriteUrl(target, ctx);
    return next ? `@import ${quote}${next}${quote}` : match;
  });

  return out;
}

/** Attributes that carry a single URL. */
const URL_ATTRS = ['src', 'href', 'action', 'poster', 'data-src', 'formaction'];

/**
 * The runtime shim.
 *
 * Static rewriting cannot see a URL the page assembles in JavaScript — a
 * router prefetch, an XHR to `/api/…`, a dynamically inserted <img>. This
 * patches the handful of entry points those go through so they come back to
 * the proxy too.
 *
 * It runs before any of the page's own scripts, and is deliberately defensive:
 * a throw here would take the whole page down, so every patch is wrapped.
 */
function runtimeShim(ctx: ProxyContext): string {
  const config = JSON.stringify({
    page: ctx.pageUrl,
    origin: new URL(ctx.pageUrl).origin,
    endpoint: ctx.endpoint ?? '/api/websites/proxy',
    projectId: ctx.projectId,
    token: ctx.token ?? null,
  });

  return `<script data-revision-shim>(function(){
try{
  var C = ${config};
  var SELF = location.origin;

  function proxied(u){
    try{
      if (u == null) return u;
      var s = String(u);
      if (!s || s.charAt(0) === '#') return u;
      if (/^(data|blob|mailto|tel|javascript|about):/i.test(s)) return u;
      // Already pointing at the proxy — leave it alone.
      if (s.indexOf(C.endpoint) !== -1) return u;
      var abs = new URL(s, C.page);
      if (abs.protocol !== 'http:' && abs.protocol !== 'https:') return u;
      // A URL the page built against our origin is really a site path.
      if (abs.origin === SELF) abs = new URL(abs.pathname + abs.search + abs.hash, C.origin);
      var q = C.endpoint + '?projectId=' + encodeURIComponent(C.projectId) +
              (C.token ? '&token=' + encodeURIComponent(C.token) : '') +
              '&url=' + encodeURIComponent(abs.href);
      return q;
    }catch(e){ return u; }
  }
  window.__revisionProxyUrl = proxied;

  // fetch
  try{
    var of = window.fetch;
    if (of) window.fetch = function(input, init){
      try{
        if (typeof input === 'string' || input instanceof URL) return of.call(this, proxied(input), init);
        if (input && input.url) return of.call(this, new Request(proxied(input.url), input), init);
      }catch(e){}
      return of.apply(this, arguments);
    };
  }catch(e){}

  // XMLHttpRequest
  try{
    var oo = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url){
      var args = Array.prototype.slice.call(arguments);
      try{ args[1] = proxied(url); }catch(e){}
      return oo.apply(this, args);
    };
  }catch(e){}

  // History — the router writes site URLs, which would throw SecurityError on
  // our origin. Keep the entry same-origin by carrying the site path in the
  // proxy's own query string.
  try{
    ['pushState','replaceState'].forEach(function(name){
      var orig = history[name];
      history[name] = function(state, title, url){
        try{
          if (url != null){
            var abs = new URL(String(url), C.page);
            if (abs.origin !== SELF) return orig.call(this, state, title, proxied(abs.href));
          }
        }catch(e){}
        try{ return orig.apply(this, arguments); }
        catch(e){ return orig.call(this, state, title); }
      };
    });
  }catch(e){}

  // Elements created at runtime (img/script/link) get their URL fixed on set.
  try{
    [[HTMLImageElement,'src'],[HTMLScriptElement,'src'],[HTMLLinkElement,'href'],
     [HTMLSourceElement,'src'],[HTMLIFrameElement,'src']].forEach(function(pair){
      var proto = pair[0] && pair[0].prototype, prop = pair[1];
      if (!proto) return;
      var d = Object.getOwnPropertyDescriptor(proto, prop);
      if (!d || !d.set) return;
      Object.defineProperty(proto, prop, {
        configurable: true, enumerable: d.enumerable,
        get: function(){ return d.get.call(this); },
        set: function(v){ try{ d.set.call(this, proxied(v)); }catch(e){ d.set.call(this, v); } }
      });
    });
  }catch(e){}
}catch(e){ /* never break the page */ }
})();</script>`;
}

/** A CSP in a meta tag survives header stripping, so it goes too. */
function stripBlockingMeta(html: string): string {
  return html.replace(
    /<meta[^>]+http-equiv\s*=\s*["']?(content-security-policy|x-frame-options|refresh)["']?[^>]*>/gi,
    ''
  );
}

export interface RewriteResult {
  html: string;
  rewrittenUrls: number;
}

/**
 * Prepares a fetched HTML document to be framed and annotated from our origin.
 */
export function rewriteHtml(html: string, ctx: ProxyContext): RewriteResult {
  let count = 0;
  let out = stripBlockingMeta(html);

  // A <base> would send everything back to the origin server; that is exactly
  // what we are avoiding.
  out = out.replace(/<base[^>]*>/gi, '');

  // Subresource integrity and crossorigin no longer apply: the bytes now come
  // from us, and CSS is rewritten so its hash legitimately differs.
  out = out.replace(/\s(integrity|crossorigin|nonce)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  // Single-URL attributes.
  for (const attr of URL_ATTRS) {
    const re = new RegExp(`(\\s${attr}\\s*=\\s*)("([^"]*)"|'([^']*)')`, 'gi');
    out = out.replace(re, (match, lead, _q, dq, sq) => {
      const value = dq !== undefined ? dq : sq;
      if (value === undefined) return match;
      const next = rewriteUrl(value, ctx);
      if (!next) return match;
      count++;
      return `${lead}"${escapeAttr(next)}"`;
    });
  }

  // srcset / imagesrcset.
  out = out.replace(
    /(\s(?:srcset|imagesrcset)\s*=\s*)("([^"]*)"|'([^']*)')/gi,
    (match, lead, _q, dq, sq) => {
      const value = dq !== undefined ? dq : sq;
      if (value === undefined) return match;
      count++;
      return `${lead}"${escapeAttr(rewriteSrcset(value, ctx))}"`;
    }
  );

  // <style> blocks and inline style attributes.
  out = out.replace(/<style([^>]*)>([\s\S]*?)<\/style>/gi, (_m, attrs, css) => {
    count++;
    return `<style${attrs}>${rewriteCss(css, ctx)}</style>`;
  });
  out = out.replace(/(\sstyle\s*=\s*)"([^"]*url\([^"]*)"/gi, (match, lead, css) => {
    count++;
    return `${lead}"${escapeAttr(rewriteCss(css, ctx))}"`;
  });

  // The shim must run before any of the page's own scripts.
  const shim = runtimeShim(ctx);
  const headOpen = /<head[^>]*>/i.exec(out);
  if (headOpen) {
    const at = headOpen.index + headOpen[0].length;
    out = out.slice(0, at) + shim + out.slice(at);
  } else {
    const htmlOpen = /<html[^>]*>/i.exec(out);
    const at = htmlOpen ? htmlOpen.index + htmlOpen[0].length : 0;
    out = out.slice(0, at) + `<head>${shim}</head>` + out.slice(at);
  }

  return { html: out, rewrittenUrls: count };
}

/**
 * A page can only be reviewed if it belongs to the site under review —
 * otherwise this endpoint is an open proxy anyone with an account could point
 * anywhere. Same registrable host, or a subdomain of it, counts.
 */
export function isSameSite(target: URL, site: URL): boolean {
  const a = target.hostname.toLowerCase().replace(/^www\./, '');
  const b = site.hostname.toLowerCase().replace(/^www\./, '');
  return a === b || a.endsWith(`.${b}`);
}
