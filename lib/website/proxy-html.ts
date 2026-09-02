/**
 * HTML rewriting for the live website viewer.
 *
 * The viewer needs the reviewed page inside an iframe *and* needs to place
 * comments on it. A plain cross-origin iframe gives neither: most sites send
 * `X-Frame-Options` or a `frame-ancestors` CSP that blocks framing outright,
 * and even when framing works, cross-origin rules stop us reading the document
 * to anchor a pin.
 *
 * Serving the page through our own origin solves both. The frame-blocking
 * headers are dropped on the way through, and because the result is same-origin
 * the viewer can drive the document directly — no injected message bridge.
 *
 * What is deliberately NOT rewritten: asset URLs. A `<base href>` pointing at
 * the original page makes every relative stylesheet, script and image load
 * straight from the real site, which browsers allow cross-origin. Only
 * navigation needs intercepting, and the viewer does that on the client where
 * it can see the resolved href.
 */

/** Response headers that would stop the page being framed or scripted. */
const STRIPPED_HEADERS = new Set([
  'x-frame-options',
  'content-security-policy',
  'content-security-policy-report-only',
  'cross-origin-opener-policy',
  'cross-origin-embedder-policy',
  'cross-origin-resource-policy',
  'permissions-policy',
  // Hop-by-hop / encoding headers that must not be forwarded verbatim.
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

/**
 * A CSP delivered in a <meta> tag survives header stripping, so it has to be
 * removed from the markup too — otherwise the page can still forbid framing
 * or block the styles the viewer injects for pins.
 */
function stripBlockingMeta(html: string): string {
  return html.replace(
    /<meta[^>]+http-equiv\s*=\s*["']?(content-security-policy|x-frame-options)["']?[^>]*>/gi,
    ''
  );
}

/**
 * Some sites break out of frames with `if (top !== self) top.location = ...`.
 * The iframe is sandboxed without `allow-top-navigation`, so the attempt fails
 * harmlessly — but it often throws first and halts the rest of that script.
 * Defining a benign shim keeps those pages running.
 */
const FRAME_BUST_SHIM = `<script>(function(){try{
  var noop=function(){};
  Object.defineProperty(window,'onbeforeunload',{get:function(){return null},set:noop,configurable:true});
}catch(e){}})();</script>`;

export interface RewriteResult {
  html: string;
  /** True when a <base> could be placed; false means relative assets may 404. */
  baseInjected: boolean;
}

/**
 * Prepares a fetched HTML document to be framed from our origin.
 * `pageUrl` is the absolute URL the HTML came from, after redirects.
 */
export function rewriteHtml(html: string, pageUrl: string): RewriteResult {
  let out = stripBlockingMeta(html);

  const baseTag = `<base href="${escapeAttr(pageUrl)}">`;

  // Never leave an existing <base> in place — it would override ours and point
  // relative URLs somewhere we cannot predict.
  out = out.replace(/<base[^>]*>/gi, '');

  let baseInjected = false;
  const headOpen = /<head[^>]*>/i.exec(out);
  if (headOpen) {
    const at = headOpen.index + headOpen[0].length;
    out = out.slice(0, at) + baseTag + FRAME_BUST_SHIM + out.slice(at);
    baseInjected = true;
  } else {
    const htmlOpen = /<html[^>]*>/i.exec(out);
    if (htmlOpen) {
      const at = htmlOpen.index + htmlOpen[0].length;
      out = out.slice(0, at) + `<head>${baseTag}${FRAME_BUST_SHIM}</head>` + out.slice(at);
      baseInjected = true;
    } else {
      out = `<head>${baseTag}${FRAME_BUST_SHIM}</head>` + out;
      baseInjected = true;
    }
  }

  return { html: out, baseInjected };
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
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
