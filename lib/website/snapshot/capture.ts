import type { Browser, BrowserContext } from 'playwright-core';

/**
 * Server-side capture of a website into a durable, annotatable copy.
 *
 * A real browser renders the page, we take away three things — the rendered
 * DOM, the assets it needed, and a full-page screenshot — and from then on the
 * copy is what everyone annotates. The reviewed site is never asked to include
 * a script and is never contacted again.
 *
 * Why a serialized DOM rather than rrweb-snapshot, which solves a similar
 * problem: rrweb deprecated `inlineStylesheet`/`inlineImages` in 2.0 and the
 * replacement asset API has not shipped, and assets are exactly what "durable"
 * means here — the WordPress test page pulls 20 MB of images and fonts.
 * rrweb also emits a JSON tree that needs its `rebuild()` bundle on the client,
 * whereas serialized HTML is served same-origin and its CSS selectors resolve
 * natively, which is what the anchor system needs. rrweb is built for replaying
 * a stream of mutations; we want one frozen page.
 */

export interface CaptureOptions {
  url: string;
  viewportWidth?: number;
  /** Selectors removed before capture — cookie banners, chat bubbles. */
  hideSelectors?: string[];
  /** Settle time after the network goes quiet, for late fonts and images. */
  waitMs?: number;
  timeoutMs?: number;
  maxAssetBytes?: number;
}

export interface CapturedAsset {
  url: string;
  contentType: string;
  body: Buffer;
}

export interface CaptureResult {
  html: string;
  assets: CapturedAsset[];
  screenshot: Buffer;
  finalUrl: string;
  title: string;
  docWidth: number;
  docHeight: number;
  viewportWidth: number;
  /** Elements stamped for anchoring — a quality signal worth recording. */
  elementCount: number;
}

const DEFAULTS = {
  viewportWidth: 1440,
  waitMs: 1200,
  timeoutMs: 60_000,
  maxAssetBytes: 12 * 1024 * 1024,
};

/** Only what a frozen page needs to look right. JS is dropped deliberately. */
function isKeepableAsset(contentType: string): boolean {
  const ct = contentType.toLowerCase();
  return (
    ct.startsWith('image/') ||
    ct.startsWith('font/') ||
    ct.includes('css') ||
    ct.includes('font-woff') ||
    ct.includes('opentype') ||
    ct.includes('truetype')
  );
}

/**
 * Runs inside the page, as a self-invoking expression.
 *
 * Playwright evaluates a *string* as an expression, so a bare "() => {…}"
 * would simply produce a function object and return undefined. The wrapper
 * must call itself. Strings are used rather than real functions because this
 * module is bundled, and a bundler is free to rewrite a function body in ways
 * that do not survive being stringified into the page.
 *
 * Freezes the document into serializable HTML:
 *
 *   - stamps every element with data-rv, giving anchors an exact handle that
 *     cannot drift within a snapshot,
 *   - copies live form/scroll state into attributes so it survives,
 *   - removes scripts, since a frozen page must not try to route or refetch,
 *   - makes every URL absolute so the caller can map them to stored copies.
 */
const SERIALIZE = `(() => {
  const abs = (v, base) => { try { return new URL(v, base || location.href).href; } catch (e) { return v; } };

  // Freeze state the DOM holds in properties rather than attributes, or the
  // copy loses whatever the page had actually rendered.
  document.querySelectorAll('input,textarea,select,option').forEach((el) => {
    try {
      if (el.tagName === 'OPTION') { if (el.selected) el.setAttribute('selected',''); else el.removeAttribute('selected'); }
      else if (el.type === 'checkbox' || el.type === 'radio') { if (el.checked) el.setAttribute('checked',''); else el.removeAttribute('checked'); }
      else if ('value' in el && el.value != null) el.setAttribute('value', el.value);
    } catch (e) {}
  });

  // Stamp an anchor handle on every element, in document order.
  let n = 0;
  document.querySelectorAll('*').forEach((el) => { el.setAttribute('data-rv', String(n++)); });

  // Absolutise everything so the caller can swap in stored copies.
  const urlAttrs = ['src','href','poster','data-src'];
  document.querySelectorAll('*').forEach((el) => {
    urlAttrs.forEach((a) => {
      const v = el.getAttribute && el.getAttribute(a);
      if (v && !/^(data|blob|javascript|mailto|tel|#):?/i.test(v)) {
        try { el.setAttribute(a, abs(v)); } catch (e) {}
      }
    });
    // srcset is removed rather than rewritten: the page was rendered at one
    // width, the browser fetched exactly one candidate, and keeping the others
    // would leave live links to the origin in a copy that is meant to stand on
    // its own. The chosen image is already in src.
    if (el.removeAttribute) { el.removeAttribute('srcset'); el.removeAttribute('imagesrcset'); }
  });

  // Inline what the browser actually computed for same-origin stylesheets;
  // cross-origin ones stay as <link> and are fetched from our stored copy.
  document.querySelectorAll('style').forEach((el) => {
    try {
      const sheet = el.sheet;
      if (!sheet || !sheet.cssRules) return;
      el.textContent = Array.from(sheet.cssRules).map((r) => r.cssText).join('\\n');
    } catch (e) {}
  });

  // Subresource Integrity has to go. Once an asset is rewritten to our stored
  // copy it is cross-origin, and SRI then requires a matching crossorigin
  // attribute or the browser refuses the resource outright — silently. That is
  // what left the Webflow capture unstyled: a 460 KB stylesheet fetched with a
  // clean 200 and never applied.
  document.querySelectorAll('[integrity],[crossorigin],[nonce]').forEach((el) => {
    el.removeAttribute('integrity');
    el.removeAttribute('crossorigin');
    el.removeAttribute('nonce');
  });

  // A frozen page must not run its own code.
  document.querySelectorAll('script').forEach((el) => el.remove());
  document.querySelectorAll('link[rel="preload"][as="script"],link[rel="modulepreload"],link[rel="prefetch"]')
    .forEach((el) => el.remove());
  document.querySelectorAll('*').forEach((el) => {
    Array.from(el.attributes || []).forEach((a) => {
      if (/^on/i.test(a.name)) el.removeAttribute(a.name);
    });
  });

  const de = document.documentElement;
  return {
    html: '<!doctype html>\\n' + de.outerHTML,
    title: document.title || '',
    docWidth: Math.max(de.scrollWidth, document.body ? document.body.scrollWidth : 0),
    docHeight: Math.max(de.scrollHeight, document.body ? document.body.scrollHeight : 0),
    elementCount: n,
  };
})()`;

/** Walks the page so lazy-loaded content is present before we freeze it. */
const SCROLL_THROUGH = `(async () => {
  await new Promise((resolve) => {
    let y = 0;
    const step = () => {
      y += window.innerHeight;
      window.scrollTo(0, y);
      const end = Math.min(document.body ? document.body.scrollHeight : 0, 80000);
      if (y < end) setTimeout(step, 90);
      else { window.scrollTo(0, 0); setTimeout(resolve, 350); }
    };
    step();
  });
})()`;

export async function captureSite(options: CaptureOptions): Promise<CaptureResult> {
  const opts = { ...DEFAULTS, ...options };

  // Imported lazily so a deployment without the browser binary only fails when
  // a capture is actually requested, not at module load.
  const { chromium } = await import('playwright-core');

  let browser: Browser | null = null;
  let context: BrowserContext | null = null;

  try {
    browser = await chromium.launch({
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    context = await browser.newContext({
      viewport: { width: opts.viewportWidth, height: 900 },
      deviceScaleFactor: 1,
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      locale: 'de-DE',
    });

    const page = await context.newPage();

    const assets = new Map<string, CapturedAsset>();
    let assetBytes = 0;

    page.on('response', async (res) => {
      try {
        const url = res.url();
        if (!/^https?:/i.test(url) || assets.has(url)) return;
        const contentType = (res.headers()['content-type'] || '').split(';')[0].trim();
        if (!isKeepableAsset(contentType)) return;
        if (assetBytes > opts.maxAssetBytes) return;

        const body = await res.body().catch(() => null);
        if (!body || body.length === 0) return;
        assetBytes += body.length;
        assets.set(url, { url, contentType, body });
      } catch {
        /* a response that cannot be read is simply not stored */
      }
    });

    await page.goto(opts.url, { waitUntil: 'networkidle', timeout: opts.timeoutMs }).catch(async () => {
      // networkidle never settles on pages that poll; the load state is enough.
      await page.waitForLoadState('domcontentloaded').catch(() => {});
    });

    if (opts.hideSelectors?.length) {
      const sels = JSON.stringify(opts.hideSelectors);
      await page
        .evaluate(
          `(() => { ${sels}.forEach(function (s) { try { document.querySelectorAll(s).forEach(function (el) { el.remove(); }); } catch (e) {} }); })()`
        )
        .catch(() => {});
    }

    await page.evaluate(SCROLL_THROUGH).catch(() => {});
    await page.waitForTimeout(opts.waitMs);

    const screenshot = await page.screenshot({ fullPage: true, type: 'jpeg', quality: 82 });

    const serialized = (await page.evaluate(SERIALIZE)) as {
      html: string;
      title: string;
      docWidth: number;
      docHeight: number;
      elementCount: number;
    };

    // A rendered page does not request everything its markup mentions — a
    // preloaded font the browser skipped, an <img> below a lazy threshold that
    // never tripped. Anything still referenced but uncaptured is fetched now,
    // through the same browser context so cookies and headers match, otherwise
    // the snapshot silently keeps hotlinking the site it is meant to outlive.
    const referenced = new Set<string>();
    const attrRe = /(?:src|href)\s*=\s*"([^"]+)"/gi;
    let m: RegExpExecArray | null;
    while ((m = attrRe.exec(serialized.html))) referenced.add(m[1].replace(/&amp;/g, '&'));
    const cssRe = /url\(\s*['"]?([^'")]+)['"]?\s*\)/gi;
    while ((m = cssRe.exec(serialized.html))) referenced.add(m[1].replace(/&amp;/g, '&'));

    const missing = Array.from(referenced).filter(
      (u) => /^https?:/i.test(u) && !assets.has(u) && !/\.(html?|xml|json|txt|js|mjs)(\?|$)/i.test(u)
    );

    for (const url of missing.slice(0, 60)) {
      if (assetBytes > opts.maxAssetBytes) break;
      try {
        const res = await context.request.get(url, { timeout: 12_000 });
        if (!res.ok()) continue;
        const contentType = (res.headers()['content-type'] || '').split(';')[0].trim();
        if (!isKeepableAsset(contentType)) continue;
        const body = Buffer.from(await res.body());
        if (!body.length) continue;
        assetBytes += body.length;
        assets.set(url, { url, contentType, body });
      } catch {
        /* unreachable asset: the reference is left as-is rather than failing */
      }
    }

    return {
      html: serialized.html,
      assets: Array.from(assets.values()),
      screenshot,
      finalUrl: page.url(),
      title: serialized.title,
      docWidth: serialized.docWidth,
      docHeight: serialized.docHeight,
      viewportWidth: opts.viewportWidth,
      elementCount: serialized.elementCount,
    };
  } finally {
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
  }
}
