/**
 * HTML and CSS rewriting for the live website viewer.
 *
 * The viewer needs the reviewed page inside an iframe *and* needs to read the
 * document to anchor comments. Both require the page to be same-origin, so it
 * is served through our own origin at a path that mirrors the site's
 * (lib/website/proxy-path.ts).
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
 * So nothing is left pointing at the origin server. Relative URLs already
 * resolve to proxied paths because the page lives at one; absolute and
 * root-relative URLs in the markup are rewritten here, and a small shim
 * (below) catches the ones the page builds at runtime.
 */

import { toProxyPath, PROXY_ROOT, INDEX_SEGMENT, proxyPrefix } from '@/lib/website/proxy-path';

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
  // Caching is decided by the proxy, per response type.
  'cache-control',
  'expires',
  'pragma',
  'age',
  'vary',
]);

export function shouldStripHeader(name: string): boolean {
  return STRIPPED_HEADERS.has(name.toLowerCase());
}

export interface ProxyContext {
  /** Absolute URL the document was fetched from, after redirects. */
  pageUrl: string;
  projectId: string;
}

/**
 * Resolves a possibly-relative URL against the page, then points it at the
 * proxy. Returns null for anything that must be left alone — data:, blob:,
 * mailto:, tel:, javascript:, bare fragments, and URLs already proxied.
 */
export function rewriteUrl(raw: string, ctx: ProxyContext): string | null {
  const value = decodeEntities(raw).trim();
  if (!value) return null;
  if (value.startsWith('#')) return null;
  if (/^(data|blob|mailto|tel|javascript|about|sms|geo|intent):/i.test(value)) return null;
  if (value.startsWith(`${PROXY_ROOT}/`)) return null;

  let abs: URL;
  try {
    abs = new URL(value, ctx.pageUrl);
  } catch {
    return null;
  }
  if (abs.protocol !== 'http:' && abs.protocol !== 'https:') return null;

  return toProxyPath(abs, ctx.projectId);
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

/**
 * Splits a srcset into [url, descriptor] pairs the way browsers do: a URL is
 * a run of non-whitespace, so a comma *inside* it (Cloudinary's
 * `w_300,h_200`) stays part of it. Splitting on every comma cut those in half.
 */
export function parseSrcset(value: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  let i = 0;
  while (i < value.length) {
    while (i < value.length && /[\s,]/.test(value[i])) i++;
    if (i >= value.length) break;
    const start = i;
    while (i < value.length && !/\s/.test(value[i])) i++;
    let url = value.slice(start, i);
    let descriptor = '';
    if (url.endsWith(',')) {
      url = url.replace(/,+$/, '');
    } else {
      const ds = i;
      while (i < value.length && value[i] !== ',') i++;
      descriptor = value.slice(ds, i).trim();
      i++;
    }
    if (url) out.push([url, descriptor]);
  }
  return out;
}

function rewriteSrcset(value: string, ctx: ProxyContext): string {
  return parseSrcset(decodeEntities(value))
    .map(([url, descriptor]) => [rewriteUrl(url, ctx) ?? url, descriptor].filter(Boolean).join(' '))
    .join(', ');
}

/**
 * `url(...)` with any quoting, including HTML-entity quotes: inline styles
 * from WordPress page builders arrive as `url(&quot;/img.jpg&quot;)`, and the
 * quotes used to be read as part of the address.
 */
const CSS_URL_RE = /url\(\s*(?:(&quot;|&#0?39;|&#x27;|["'])(.*?)\1|([^'")\s]+))\s*\)/gi;

/** Rewrites `url(...)` and `@import "..."` inside a stylesheet or style block. */
export function rewriteCss(css: string, ctx: ProxyContext): string {
  let out = css.replace(CSS_URL_RE, (match, quote: string | undefined, quoted: string | undefined, bare: string | undefined) => {
    const target = quoted ?? bare ?? '';
    const next = rewriteUrl(target, ctx);
    if (!next) return match;
    const q = quote ?? '';
    return `url(${q}${next}${q})`;
  });

  out = out.replace(/@import\s+(['"])([^'"]+)\1/gi, (match, quote, target) => {
    const next = rewriteUrl(target, ctx);
    return next ? `@import ${quote}${next}${quote}` : match;
  });

  return out;
}

/** Attributes that carry a single URL — including the common lazy-load ones. */
const URL_ATTRS = [
  'src', 'href', 'xlink:href', 'action', 'poster', 'formaction',
  'data-src', 'data-lazy-src', 'data-original', 'data-bg', 'data-background', 'data-background-image',
];
/** Attributes that carry a srcset. */
const SRCSET_ATTRS = ['srcset', 'imagesrcset', 'data-srcset', 'data-lazy-srcset'];

/** `name="v"`, `name='v'` or `name=v`, preceded by whitespace. */
function attrRe(name: string): RegExp {
  const n = name.replace(/[-:]/g, (c) => `\\${c}`);
  // `=` is allowed in the bare form: browsers keep it, and minified markup
  // really does ship `src=/img.php?w=300`.
  return new RegExp(`(\\s${n}\\s*=\\s*)(?:"([^"]*)"|'([^']*)'|([^\\s"'<>\`]+))`, 'gi');
}

/**
 * The runtime shim.
 *
 * Static rewriting cannot see a URL the page assembles in JavaScript — a
 * router prefetch, an XHR to `/api/…`, markup set through innerHTML. This
 * patches the entry points those go through, and watches the DOM for the ones
 * that bypass all of them, so they come back to the proxy too. It also tells
 * the viewer which page is really showing — after a redirect, and after a
 * client-side route change the viewer would otherwise never hear about.
 *
 * It runs before any of the page's own scripts, and is deliberately defensive:
 * a throw here would take the whole page down, so every patch is wrapped.
 */
function runtimeShim(ctx: ProxyContext): string {
  const config = JSON.stringify({
    page: ctx.pageUrl,
    origin: new URL(ctx.pageUrl).origin,
    root: PROXY_ROOT + '/',
    prefix: proxyPrefix(ctx.projectId),
    index: INDEX_SEGMENT,
  });

  return `<script data-revision-shim>(function(){
try{
  var C = ${config};
  var SELF = location.origin;

  // The real address of the page on show, read back out of our own path so it
  // stays right after the page's router pushes a new one.
  function currentReal(){
    try{
      var p = location.pathname;
      if (p.indexOf(C.prefix) !== 0) return C.page;
      var m = /^(https?)\\/([^\\/]+)(\\/.*)?$/.exec(p.slice(C.prefix.length));
      if (!m) return C.page;
      var path = m[3] || '/';
      var idx = '/' + C.index;
      if (path.slice(-idx.length) === idx) path = path.slice(0, -C.index.length);
      return m[1] + '://' + m[2] + path + location.search + location.hash;
    }catch(e){ return C.page; }
  }

  function toPath(abs){
    var path = abs.pathname || '/';
    if (path.charAt(path.length - 1) === '/') path += C.index;
    return C.prefix + abs.protocol.replace(':','') + '/' + abs.host + path + abs.search + abs.hash;
  }

  function proxied(u){
    try{
      if (u == null) return u;
      var s = String(u).trim();
      if (!s || s.charAt(0) === '#') return u;
      if (/^(data|blob|mailto|tel|javascript|about|sms):/i.test(s)) return u;
      // Already ours. Resolved against the site it would look like a site
      // path and be wrapped again — forever, once the DOM watcher saw it.
      if (s.indexOf(C.root) === 0) return u;
      var abs = new URL(s, currentReal());
      if (abs.protocol !== 'http:' && abs.protocol !== 'https:') return u;
      if (abs.origin === SELF){
        if (abs.pathname.indexOf(C.root) === 0) return u;
        // A URL the page built against our origin is really a site path.
        abs = new URL(abs.pathname + abs.search + abs.hash, C.origin);
      }
      return toPath(abs);
    }catch(e){ return u; }
  }
  window.__revisionProxyUrl = proxied;

  function parseSrcset(v){
    var out = [], i = 0; v = String(v);
    while (i < v.length){
      while (i < v.length && /[\\s,]/.test(v.charAt(i))) i++;
      if (i >= v.length) break;
      var st = i;
      while (i < v.length && !/\\s/.test(v.charAt(i))) i++;
      var url = v.slice(st, i), d = '';
      if (/,$/.test(url)) url = url.replace(/,+$/, '');
      else { var ds = i; while (i < v.length && v.charAt(i) !== ',') i++; d = v.slice(ds, i).trim(); i++; }
      if (url) out.push([url, d]);
    }
    return out;
  }
  function fixSrcset(v){
    try{
      return parseSrcset(v).map(function(c){ return c[1] ? proxied(c[0]) + ' ' + c[1] : proxied(c[0]); }).join(', ');
    }catch(e){ return v; }
  }
  function fixCss(css){
    try{
      return String(css).replace(/url\\(\\s*(?:(["'])(.*?)\\1|([^'")\\s]+))\\s*\\)/gi, function(m, q, a, b){
        var n = proxied(a != null ? a : b);
        return 'url(' + (q || '') + n + (q || '') + ')';
      });
    }catch(e){ return css; }
  }

  var URL_ATTR = {src:1, href:1, 'xlink:href':1, poster:1, action:1, formaction:1,
    'data-src':1, 'data-lazy-src':1, 'data-original':1, 'data-bg':1, 'data-background':1, 'data-background-image':1};
  var SET_ATTR = {srcset:1, imagesrcset:1, 'data-srcset':1, 'data-lazy-srcset':1};

  function fixAttr(name, value){
    if (value == null) return value;
    var k = String(name).toLowerCase();
    if (k === 'style') return /url\\(/i.test(value) ? fixCss(value) : value;
    if (SET_ATTR[k]) return fixSrcset(value);
    if (URL_ATTR[k]) return /^\\s*url\\(/i.test(value) ? fixCss(value) : proxied(value);
    return value;
  }

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

  // Tell the viewer which page is showing.
  function report(){
    try{ parent.postMessage({ __rv: 'url', url: currentReal(), title: document.title }, SELF); }catch(e){}
  }

  // History — the router writes site URLs, which would throw SecurityError on
  // our origin. Keep the entry same-origin by writing our path for it.
  try{
    ['pushState','replaceState'].forEach(function(name){
      var orig = history[name];
      history[name] = function(state, title, url){
        var r;
        try{
          if (url != null){
            var abs = new URL(String(url), currentReal());
            if (abs.origin !== SELF) { r = orig.call(this, state, title, proxied(abs.href)); report(); return r; }
          }
        }catch(e){}
        try{ r = orig.apply(this, arguments); }
        catch(e){ r = orig.call(this, state, title); }
        report();
        return r;
      };
    });
    addEventListener('popstate', report);
    addEventListener('hashchange', report);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', report);
    else report();
  }catch(e){}

  // setAttribute: how most lazy loaders and templating libraries set URLs.
  try{
    var osa = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function(n, v){
      try{ v = fixAttr(n, v); }catch(e){}
      return osa.call(this, n, v);
    };
  }catch(e){}

  // Property setters on elements created at runtime.
  try{
    [[window.HTMLImageElement,'src'],[window.HTMLImageElement,'srcset',1],[window.HTMLScriptElement,'src'],
     [window.HTMLLinkElement,'href'],[window.HTMLSourceElement,'src'],[window.HTMLSourceElement,'srcset',1],
     [window.HTMLIFrameElement,'src'],[window.HTMLMediaElement,'src'],[window.HTMLVideoElement,'poster']].forEach(function(t){
      var proto = t[0] && t[0].prototype, prop = t[1], set = t[2];
      if (!proto) return;
      var d = Object.getOwnPropertyDescriptor(proto, prop);
      if (!d || !d.set) return;
      Object.defineProperty(proto, prop, {
        configurable: true, enumerable: d.enumerable,
        get: function(){ return d.get.call(this); },
        set: function(v){ try{ d.set.call(this, set ? fixSrcset(v) : proxied(v)); }catch(e){ d.set.call(this, v); } }
      });
    });
  }catch(e){}

  // The catch-all: markup parsed from innerHTML / insertAdjacentHTML never
  // passes through a setter. Relative URLs in it already resolve to our path;
  // this fixes the absolute and root-relative ones as they land.
  try{
    var osaRaw = Element.prototype.setAttribute;
    var ATTRS = Object.keys(URL_ATTR).concat(Object.keys(SET_ATTR)).concat(['style']);
    var SEL = ATTRS.filter(function(a){ return a !== 'xlink:href' && a !== 'style'; })
      .map(function(a){ return '[' + a + ']'; }).concat(['[style*="url("]']).join(',');

    function fixEl(el){
      if (!el || el.nodeType !== 1) return;
      for (var i = 0; i < ATTRS.length; i++){
        var a = ATTRS[i];
        if (!el.hasAttribute(a)) continue;
        var v = el.getAttribute(a), n = fixAttr(a, v);
        if (n !== v && n != null) osaRaw.call(el, a, n);
      }
      if (el.tagName === 'STYLE' && /url\\(/i.test(el.textContent || '')){
        var css = el.textContent, fixed = fixCss(css);
        if (fixed !== css) el.textContent = fixed;
      }
    }
    function fixTree(root){
      fixEl(root);
      if (root.querySelectorAll){
        var list = root.querySelectorAll(SEL + ',style');
        for (var i = 0; i < list.length; i++) fixEl(list[i]);
      }
    }
    new MutationObserver(function(records){
      for (var r = 0; r < records.length; r++){
        var rec = records[r];
        if (rec.type === 'attributes') fixEl(rec.target);
        else for (var j = 0; j < rec.addedNodes.length; j++){
          var node = rec.addedNodes[j];
          if (node.nodeType === 1) fixTree(node);
          else if (node.nodeType === 3 && node.parentNode && node.parentNode.tagName === 'STYLE') fixEl(node.parentNode);
        }
      }
    }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ATTRS });
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

  // Single-URL attributes, in any quoting.
  for (const attr of URL_ATTRS) {
    out = out.replace(attrRe(attr), (match, lead, dq, sq, bare) => {
      const value: string | undefined = dq ?? sq ?? bare;
      if (value === undefined) return match;
      const next = /^\s*url\(/i.test(decodeEntities(value))
        ? rewriteCss(decodeEntities(value), ctx)
        : rewriteUrl(value, ctx);
      if (!next || next === value) return match;
      count++;
      return `${lead}"${escapeAttr(next)}"`;
    });
  }

  for (const attr of SRCSET_ATTRS) {
    out = out.replace(attrRe(attr), (match, lead, dq, sq, bare) => {
      const value: string | undefined = dq ?? sq ?? bare;
      if (value === undefined) return match;
      count++;
      return `${lead}"${escapeAttr(rewriteSrcset(value, ctx))}"`;
    });
  }

  // <style> blocks and inline style attributes, in either quoting.
  out = out.replace(/<style([^>]*)>([\s\S]*?)<\/style>/gi, (_m, attrs, css) => {
    count++;
    return `<style${attrs}>${rewriteCss(css, ctx)}</style>`;
  });
  out = out.replace(/(\sstyle\s*=\s*)(?:"([^"]*url\([^"]*)"|'([^']*url\([^']*)')/gi, (match, lead, dq, sq) => {
    const css: string = dq ?? sq;
    count++;
    return `${lead}"${escapeAttr(rewriteCss(decodeEntities(css), ctx))}"`;
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
 * at anything. Same registrable host, or a subdomain of it, counts.
 */
export function isSameSite(target: URL, site: URL): boolean {
  const a = target.hostname.toLowerCase().replace(/^www\./, '');
  const b = site.hostname.toLowerCase().replace(/^www\./, '');
  return a === b || a.endsWith(`.${b}`);
}
