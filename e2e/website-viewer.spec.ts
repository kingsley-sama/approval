import { test, expect, type Page } from '@playwright/test';
import { buildSync } from 'esbuild';
import path from 'path';
import { rewriteHtml, rewriteCss } from '../lib/website/proxy-html';
import { fromProxyPath, toProxyPath } from '../lib/website/proxy-path';

/**
 * The website viewer's page-side behaviour, against fixture pages.
 *
 * Two things are exercised in a real browser because only a browser can
 * answer them: whether an anchored pin stays on its element when the page
 * around it moves (lib/website/anchor.ts), and whether the runtime shim gets
 * every image of a script-built page through the proxy.
 *
 * Those two need no site and no database. Anchor tests use setContent; shim
 * tests route the proxy's own URL space to an in-memory site, run through the
 * real rewriter, so what the browser receives is exactly what the proxy would
 * send.
 *
 * The last block drives the real viewer, as a guest, against the website
 * review that e2e/fixtures/seed.mjs creates over example.com: pins on their
 * anchors, overlap, device marking, and what happens across page switches.
 */

const PID = '00000000-0000-4000-8000-000000000000';

// ── anchors ─────────────────────────────────────────────────────────────────

const anchorBundle = buildSync({
  entryPoints: [path.join(__dirname, '../lib/website/anchor.ts')],
  bundle: true,
  format: 'iife',
  globalName: 'RvAnchor',
  write: false,
  platform: 'browser',
}).outputFiles[0].text;

const FIXTURE = `<!doctype html><html><head><style>
  body{margin:0;font:16px/1.5 sans-serif}
  header{position:fixed;top:0;left:0;right:0;height:60px;background:#eee}
  main{max-width:900px;margin:0 auto;padding:80px 20px}
  #target{width:300px;height:120px;margin:0 auto;background:#fc0}
  .block{height:400px;background:#ddd;margin:20px 0}
</style></head><body>
  <header><nav id="nav">Menu</nav></header>
  <main>
    <div id="above" class="block"></div>
    <section><p>Intro</p><div id="target">Target</div></section>
    <div class="block"></div><div class="block"></div>
  </main>
</body></html>`;

async function loadAnchorFixture(page: Page) {
  await page.setViewportSize({ width: 1400, height: 800 });
  await page.setContent(FIXTURE);
  await page.addScriptTag({ content: anchorBundle });
}

/** Anchor a point 25%/75% into #target, then return that point's true spot and the pin's resolved spot. */
async function anchorAndResolve(page: Page, mutate: () => Promise<void>) {
  const anchor = await page.evaluate(() => {
    const r = document.getElementById('target')!.getBoundingClientRect();
    const px = r.left + r.width * 0.25 + scrollX;
    const py = r.top + r.height * 0.75 + scrollY;
    const box = { docWidth: document.documentElement.scrollWidth, docHeight: document.documentElement.scrollHeight };
    // @ts-expect-error injected bundle
    return RvAnchor.buildAnchor(document, px, py, { ...box, device: 'desktop', pageUrl: location.href, overlayId: '__none__' });
  });
  await mutate();
  return page.evaluate((a) => {
    const r = document.getElementById('target')?.getBoundingClientRect();
    const expected = r ? { x: r.left + r.width * 0.25 + scrollX, y: r.top + r.height * 0.75 + scrollY } : null;
    const box = { w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight };
    // @ts-expect-error injected bundle
    const got = RvAnchor.resolveAnchor(document, a, { x: 50, y: 50 }, box);
    return { anchor: a, expected, got };
  }, anchor);
}

test.describe('pin anchors', () => {
  test('anchor to the element under the pin, on the embed script’s 0–100 scale', async ({ page }) => {
    await loadAnchorFixture(page);
    const { anchor } = await anchorAndResolve(page, async () => {});
    expect(anchor.selector).toBe('#target');
    expect(anchor.xPct).toBeCloseTo(25, 0);
    expect(anchor.yPct).toBeCloseTo(75, 0);
  });

  test('stay on their element when content above grows', async ({ page }) => {
    await loadAnchorFixture(page);
    const { expected, got } = await anchorAndResolve(page, () =>
      page.evaluate(() => { document.getElementById('above')!.style.height = '1100px'; })
    );
    expect(got.via).toBe('element');
    expect(Math.abs(got.x - expected!.x)).toBeLessThan(4);
    expect(Math.abs(got.y - expected!.y)).toBeLessThan(4);
  });

  test('stay on their element when content above shrinks', async ({ page }) => {
    await loadAnchorFixture(page);
    const { expected, got } = await anchorAndResolve(page, () =>
      page.evaluate(() => { document.getElementById('above')!.style.height = '40px'; })
    );
    expect(Math.abs(got.y - expected!.y)).toBeLessThan(4);
  });

  test('stay on their element at another screen width', async ({ page }) => {
    await loadAnchorFixture(page);
    const { expected, got } = await anchorAndResolve(page, () => page.setViewportSize({ width: 700, height: 800 }));
    expect(Math.abs(got.x - expected!.x)).toBeLessThan(4);
    expect(Math.abs(got.y - expected!.y)).toBeLessThan(4);
  });

  test('fall back to the stored position when the element is gone', async ({ page }) => {
    await loadAnchorFixture(page);
    const { anchor, got } = await anchorAndResolve(page, () =>
      page.evaluate(() => document.getElementById('target')!.remove())
    );
    expect(got.via).toBe('pixels');
    expect(got.y).toBe(anchor.pageY);
  });

  test('know when they are on a fixed header', async ({ page }) => {
    await loadAnchorFixture(page);
    const result = await page.evaluate(() => {
      // @ts-expect-error injected bundle
      const a = RvAnchor.buildAnchor(document, 30, 20, { docWidth: 1400, docHeight: 2000, device: 'desktop', pageUrl: '', overlayId: '__none__' });
      scrollTo(0, 600);
      // @ts-expect-error injected bundle
      return { a, got: RvAnchor.resolveAnchor(document, a, { x: 0, y: 0 }, { w: 1400, h: 2000 }) };
    });
    expect(result.a.fixed).toBe(true);
    // Viewport coordinates: still at the top of the screen after scrolling.
    expect(result.got.fixed).toBe(true);
    expect(result.got.y).toBeLessThan(60);
  });
});

// ── runtime shim ────────────────────────────────────────────────────────────

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
  'base64'
);

const SITE: Record<string, { type: string; body: string | Buffer }> = {
  'https://fixture.test/de/': {
    type: 'text/html',
    body: `<!doctype html><html><head><link rel="stylesheet" href="/css/site.css"></head><body>
      <img id="unquoted" src=/img/a.png>
      <div id="bg" style="width:10px;height:10px;background-image:url(&quot;/img/b.png&quot;)"></div>
      <img id="lazy" data-src="/img/c.png">
      <img id="cdn" srcset="https://cdn.fixture.test/w_1,h_1/f.png 1x">
      <div id="host"></div>
      <script>
        var lazy = document.getElementById('lazy');
        lazy.setAttribute('src', lazy.getAttribute('data-src'));
        // A template-built page: innerHTML never passes through a setter.
        document.getElementById('host').innerHTML =
          '<img id="relative" src="assets/d.png"><img id="rooted" src="/img/e.png">';
      </script>
    </body></html>`,
  },
  'https://fixture.test/css/site.css': { type: 'text/css', body: 'body{background:url(/img/g.png)}' },
};
for (const f of ['a', 'b', 'c', 'e', 'g']) SITE[`https://fixture.test/img/${f}.png`] = { type: 'image/png', body: PNG };
SITE['https://fixture.test/de/assets/d.png'] = { type: 'image/png', body: PNG };
SITE['https://cdn.fixture.test/w_1,h_1/f.png'] = { type: 'image/png', body: PNG };

/** Serves the fixture site through the proxy's URL space, rewritten exactly as the proxy would. */
async function routeFixtureProxy(page: Page, served: string[], missed: string[]) {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    const parsed = fromProxyPath(url.pathname, url.search);
    if (!parsed) {
      if (url.pathname.startsWith('/api/') || url.hostname.endsWith('fixture.test')) missed.push(url.href);
      return route.fulfill({ status: 404, body: '' });
    }
    const target = parsed.target.toString();
    const file = SITE[target];
    if (!file) { missed.push(target); return route.fulfill({ status: 404, body: '' }); }
    served.push(target);
    const ctx = { pageUrl: target, projectId: PID };
    const body =
      file.type === 'text/html' ? rewriteHtml(String(file.body), ctx).html
      : file.type === 'text/css' ? rewriteCss(String(file.body), ctx)
      : file.body;
    return route.fulfill({ status: 200, contentType: file.type, body });
  });
}

test.describe('runtime shim', () => {
  test('every image of a script-built page loads through the proxy', async ({ page, baseURL }) => {
    const served: string[] = [];
    const missed: string[] = [];
    await routeFixtureProxy(page, served, missed);
    await page.goto(`${baseURL}${toProxyPath('https://fixture.test/de/', PID)}`);
    await page.waitForFunction(() => Array.from(document.images).every((i) => i.complete));
    await page.waitForTimeout(300);

    const broken = await page.evaluate(() =>
      Array.from(document.images).filter((i) => i.naturalWidth === 0).map((i) => i.id)
    );
    expect(broken, 'images that did not load').toEqual([]);
    for (const f of ['img/a.png', 'img/b.png', 'img/c.png', 'de/assets/d.png', 'img/e.png', 'img/g.png', 'css/site.css']) {
      expect(served).toContain(`https://fixture.test/${f}`);
    }
    expect(served).toContain('https://cdn.fixture.test/w_1,h_1/f.png');
    // A root-relative image inserted through innerHTML may first be requested
    // from our origin before the shim corrects it; nothing else may miss.
    expect(missed.filter((m) => !m.endsWith('/img/e.png'))).toEqual([]);
  });

  test('reports the real page address, including client-side route changes', async ({ page, baseURL }) => {
    await routeFixtureProxy(page, [], []);
    await page.addInitScript(() => {
      (window as unknown as { __rvReports: string[] }).__rvReports = [];
      addEventListener('message', (e) => {
        if (e.data && e.data.__rv === 'url') (window as unknown as { __rvReports: string[] }).__rvReports.push(e.data.url);
      });
    });
    await page.goto(`${baseURL}${toProxyPath('https://fixture.test/de/', PID)}`);
    await page.evaluate(() => history.pushState({}, '', '/de/kontakt?x=1'));
    const reports = await page.evaluate(() => (window as unknown as { __rvReports: string[] }).__rvReports);
    expect(reports[0]).toBe('https://fixture.test/de/');
    expect(reports.at(-1)).toBe('https://fixture.test/de/kontakt?x=1');
    // And the entry itself stayed on our origin, inside the proxy.
    expect(fromProxyPath(page.url())?.target.toString()).toBe('https://fixture.test/de/kontakt?x=1');
  });
});

// ── the viewer, against the seeded review (e2e/fixtures/seed.mjs) ───────────

const WEBSITE_TOKEN = 'playwright-test-website-token';

async function openSeededReview(page: Page) {
  await page.setViewportSize({ width: 1600, height: 950 });
  await page.goto(`/share/${WEBSITE_TOKEN}`);
  await page.getByPlaceholder('Your name').fill('Playwright');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Comment', exact: true }).click();
  await expect(page.getByText('Loading page…')).toHaveCount(0, { timeout: 60_000 });
  await expect(page.getByText('Placing pins…')).toHaveCount(0, { timeout: 20_000 });
}

/** Pins drawn in the framed page, with their on-screen centre. */
function framePins(page: Page) {
  const frame = page.frames().find((f) => f.url().includes('/api/websites/p/'));
  if (!frame) return Promise.resolve([] as Array<{ id: string; x: number; y: number; opacity: string; badge: string | null }>);
  return frame.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('[data-rv-pin]')).map((el) => {
      const r = el.getBoundingClientRect();
      return {
        id: el.getAttribute('data-rv-pin')!,
        x: r.left + r.width / 2,
        y: r.top + r.height / 2,
        opacity: el.style.opacity,
        badge: el.querySelector('span')?.textContent ?? null,
      };
    })
  ).catch(() => []);
}

test.describe('viewer pins on a live page', () => {
  test('sit on their anchored element, fan out when they overlap, and mark other devices', async ({ page }) => {
    await openSeededReview(page);
    const pins = await framePins(page);
    expect(pins.map((p) => p.id).sort()).toEqual(['pw-web-h1', 'pw-web-legacy', 'pw-web-mobile', 'pw-web-p-a', 'pw-web-p-b']);

    const frame = page.frames().find((f) => f.url().includes('/api/websites/p/'))!;
    const h1 = await frame.evaluate(() => {
      const r = document.querySelector('h1')!.getBoundingClientRect();
      return { x: r.left + r.width * 0.1, y: r.top + r.height * 0.5 };
    });
    const onHeading = pins.find((p) => p.id === 'pw-web-h1')!;
    expect(Math.abs(onHeading.x - h1.x)).toBeLessThan(3);
    expect(Math.abs(onHeading.y - h1.y)).toBeLessThan(3);

    const a = pins.find((p) => p.id === 'pw-web-p-a')!;
    const b = pins.find((p) => p.id === 'pw-web-p-b')!;
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(20);

    const mobile = pins.find((p) => p.id === 'pw-web-mobile')!;
    expect(mobile.badge).toBe('M');
    expect(Number(mobile.opacity)).toBeLessThan(1);
  });

  test('switching page never shows the previous page’s pins, and an untracked page shows none', async ({ page }) => {
    await openSeededReview(page);
    await page.getByTitle('Other').click();

    // Sample through the whole transition, not just the end state.
    for (let i = 0; i < 40; i++) {
      const ids = (await framePins(page)).map((p) => p.id);
      expect(ids.filter((id) => id !== 'pw-web-other')).toEqual([]);
      await page.waitForTimeout(100);
    }
    await expect(page.getByText('Placing pins…')).toHaveCount(0, { timeout: 20_000 });
    expect((await framePins(page)).map((p) => p.id)).toEqual(['pw-web-other']);

    const address = page.getByLabel('Page address');
    await address.fill('https://example.com/not-in-the-review');
    await address.press('Enter');
    await expect(page.getByText('Loading page…')).toHaveCount(0, { timeout: 60_000 });
    await page.waitForTimeout(1500);
    expect(await framePins(page)).toEqual([]);
  });

  test('a selected pin opens its comment next to where it is drawn', async ({ page }) => {
    await openSeededReview(page);
    const pin = (await framePins(page)).find((p) => p.id === 'pw-web-h1')!;
    const frameBox = (await page.locator('iframe[title="Website under review"]').boundingBox())!;
    await page.mouse.click(frameBox.x + pin.x, frameBox.y + pin.y);
    const modal = page.getByText('Anchored to the heading').last();
    await expect(modal).toBeVisible();
    const box = (await modal.boundingBox())!;
    expect(Math.abs(box.y - (frameBox.y + pin.y))).toBeLessThan(250);
  });
});
