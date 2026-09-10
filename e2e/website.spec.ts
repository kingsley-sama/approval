import { test, expect } from '@playwright/test';

/**
 * End-to-end coverage for the website review tool's guest-facing surface.
 *
 * Everything here runs without a login, which is deliberate: the paths a
 * client actually touches — a shared review, the embed widget on their own
 * site — are exactly the ones with no session, and they are the ones worth
 * guarding against regressions.
 *
 * Requires a website review to point at. Supply:
 *   E2E_WEBSITE_PROJECT_ID   a markup project with kind='website'
 *   E2E_WEBSITE_TOKEN        an active share token for it (comment permission)
 *   E2E_WEBSITE_URL          a page on that project's site
 *   E2E_SNAPSHOT_ID          (optional) a captured snapshot of that page
 *
 * Without them the suite skips rather than failing, so it stays useful in a
 * checkout that has no data.
 */

const PROJECT_ID = process.env.E2E_WEBSITE_PROJECT_ID;
const TOKEN = process.env.E2E_WEBSITE_TOKEN;
const SITE_URL = process.env.E2E_WEBSITE_URL;
const SNAPSHOT_ID = process.env.E2E_SNAPSHOT_ID;

const configured = Boolean(PROJECT_ID && TOKEN && SITE_URL);

test.describe('website review — proxy viewer', () => {
  test.skip(!configured, 'set E2E_WEBSITE_PROJECT_ID / TOKEN / URL');

  const proxyUrl = () =>
    `/api/websites/proxy?projectId=${PROJECT_ID}&token=${TOKEN}&url=${encodeURIComponent(SITE_URL!)}`;

  test('serves the reviewed page from our own origin', async ({ page, baseURL }) => {
    const response = await page.goto(proxyUrl());
    expect(response?.status()).toBe(200);
    // Same-origin is the whole point: it is what lets the viewer read the
    // document to place pins.
    expect(new URL(page.url()).origin).toBe(new URL(baseURL!).origin);
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('rewrites assets so nothing is fetched from the reviewed site', async ({ page }) => {
    const offSite: string[] = [];
    const siteHost = new URL(SITE_URL!).host;
    page.on('request', (r) => {
      if (new URL(r.url()).host === siteHost) offSite.push(r.url());
    });
    await page.goto(proxyUrl(), { waitUntil: 'networkidle' }).catch(() => {});
    expect(offSite, `requests still going to ${siteHost}`).toHaveLength(0);
  });

  test('injects the runtime shim and removes any base tag', async ({ page }) => {
    await page.goto(proxyUrl());
    await expect(page.locator('[data-revision-shim]')).toHaveCount(1);
    // A <base> on another origin is what broke framework routers.
    await expect(page.locator('base')).toHaveCount(0);
  });

  test('the page renders with its own styles, fonts and images', async ({ page }) => {
    // Deliberately not "zero console errors". A real site loads analytics,
    // pixels and reCAPTCHA, and those legitimately fail behind a proxy — the
    // POST beacons get 405 and the reCAPTCHA iframe is refused by the
    // navigation lock, both correctly. None of it changes what a reviewer
    // sees, so asserting on it only produces a test that cries wolf.
    //
    // What must hold is that the site's own presentation arrives.
    const failed: string[] = [];
    page.on('requestfailed', (r) => {
      const type = r.resourceType();
      if (['stylesheet', 'font', 'image'].includes(type)) failed.push(`${type} ${r.url().slice(0, 90)}`);
    });
    page.on('response', (r) => {
      const type = r.request().resourceType();
      if (['stylesheet', 'font', 'image'].includes(type) && r.status() >= 400) {
        failed.push(`${type} ${r.status()} ${r.url().slice(0, 90)}`);
      }
    });

    await page.goto(proxyUrl(), { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(2000);

    expect(failed.join('\n'), 'presentation assets must all load').toEqual('');

    // And the styles actually applied — the failure mode worth catching is a
    // page that loads cleanly but renders in the browser's default serif.
    const font = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(font.toLowerCase()).not.toContain('times');

    const brokenImages = await page.evaluate(() =>
      Array.from(document.images).filter((i) => i.complete && i.naturalWidth === 0).length
    );
    expect(brokenImages).toBe(0);
  });

  test('refuses a URL outside the reviewed site', async ({ page }) => {
    const res = await page.goto(
      `/api/websites/proxy?projectId=${PROJECT_ID}&token=${TOKEN}&url=${encodeURIComponent('https://example.com/')}`
    );
    expect(res?.status()).toBe(403);
  });

  test('refuses a private address', async ({ page }) => {
    const res = await page.goto(
      `/api/websites/proxy?projectId=${PROJECT_ID}&token=${TOKEN}&url=${encodeURIComponent('http://169.254.169.254/')}`
    );
    expect(res?.status()).toBe(400);
  });

  test('refuses an invalid token', async ({ page }) => {
    const res = await page.goto(
      `/api/websites/proxy?projectId=${PROJECT_ID}&token=not-a-token&url=${encodeURIComponent(SITE_URL!)}`
    );
    expect(res?.status()).toBe(403);
  });
});

test.describe('website review — captured snapshot', () => {
  test.skip(!SNAPSHOT_ID || !TOKEN, 'set E2E_SNAPSHOT_ID');

  test('serves a frozen, self-contained copy', async ({ page }) => {
    const res = await page.goto(`/api/websites/snapshot/${SNAPSHOT_ID}?token=${TOKEN}`);
    expect(res?.status()).toBe(200);

    // A snapshot must not run the site's code, and must carry the anchor
    // stamps the comment system relies on.
    await expect(page.locator('script')).toHaveCount(0);
    const stamped = await page.locator('[data-rv]').count();
    expect(stamped).toBeGreaterThan(10);

    // Subresource Integrity has to be gone or stylesheets are silently refused.
    await expect(page.locator('[integrity]')).toHaveCount(0);

    // CSS actually applied — the failure mode was a page that looked loaded
    // but rendered in the browser's default serif.
    const font = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(font.toLowerCase()).not.toContain('times');
  });

  test('every image resolves', async ({ page }) => {
    await page.goto(`/api/websites/snapshot/${SNAPSHOT_ID}?token=${TOKEN}`, { waitUntil: 'networkidle' }).catch(() => {});
    const broken = await page.evaluate(() =>
      Array.from(document.images).filter((i) => i.complete && i.naturalWidth === 0).length
    );
    expect(broken).toBe(0);
  });

  test('is not reachable without a token', async ({ page }) => {
    const res = await page.goto(`/api/websites/snapshot/${SNAPSHOT_ID}`);
    expect(res?.status()).toBe(403);
  });
});

test.describe('website review — embed widget', () => {
  test.skip(!TOKEN, 'set E2E_WEBSITE_TOKEN');

  test('script is served and is valid JavaScript', async ({ request }) => {
    const res = await request.get('/embed/v1.js');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('javascript');
    const body = await res.text();
    expect(body.length).toBeGreaterThan(1000);
    // Cross-origin by nature: it is loaded from the client's own domain.
    expect(res.headers()['access-control-allow-origin']).toBe('*');
  });

  test('rejects an unknown key', async ({ request }) => {
    const res = await request.get(
      `/api/embed/comments?key=nope&url=${encodeURIComponent('https://example.com/')}`
    );
    expect(res.status()).toBe(403);
  });

  test('answers preflight so it works from another origin', async ({ request }) => {
    const res = await request.fetch('/api/embed/comments', { method: 'OPTIONS' });
    expect(res.status()).toBe(204);
    expect(res.headers()['access-control-allow-methods']).toContain('POST');
  });

  test('lists comments for a page', async ({ request }) => {
    const res = await request.get(
      `/api/embed/comments?key=${TOKEN}&url=${encodeURIComponent(SITE_URL ?? 'https://example.com/')}`
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.comments)).toBe(true);
    expect(typeof body.canComment).toBe('boolean');
  });
});

test.describe('website review — shared with a guest', () => {
  test.skip(!TOKEN || !SITE_URL, 'set E2E_WEBSITE_TOKEN / E2E_WEBSITE_URL');

  /**
   * The regression this guards: a website review's pages carry no screenshot,
   * and the share page used to drop every image-less thread on the way out.
   * A client opening the link got "No images in this project" — the whole
   * review, invisible — while the same project was fully populated for the
   * team. It must serve the live page instead.
   */
  test('opens the live site rather than an empty project', async ({ page }) => {
    await page.goto(`/share/${TOKEN}`);

    await expect(page.getByText('No images in this project')).toHaveCount(0);

    const frame = page.locator('iframe[title="Website under review"]');
    await expect(frame).toHaveCount(1);
    // Served through our own proxy, carrying the share token — that is what
    // authorises a guest with no session.
    const src = await frame.getAttribute('src');
    expect(src).toContain('/api/websites/proxy');
    expect(src).toContain(`token=${TOKEN}`);
  });

  test('lists the reviewed pages, not images', async ({ page }) => {
    await page.goto(`/share/${TOKEN}`);
    await expect(page.getByText('PAGES', { exact: true })).toBeVisible();
    await expect(page.getByText('IMAGES', { exact: true })).toHaveCount(0);
  });

  test('the framed page actually renders for the guest', async ({ page }) => {
    await page.goto(`/share/${TOKEN}`);
    const frame = page.frameLocator('iframe[title="Website under review"]');
    await expect(frame.locator('body')).not.toBeEmpty();
  });

  /**
   * The comment box positions itself off `[data-annotation-image-container]`,
   * reading a pin's x/y as a percentage of that element's rect. The website
   * viewer has no image to hang that on — pins live inside the iframe — so it
   * publishes a mirror of the framed document instead.
   *
   * When that mirror was missing, the modal found no anchor, skipped
   * positioning altogether and rendered in the bottom-left corner of the
   * screen instead of next to the pin. These assertions are the contract that
   * kept it there.
   */
  test('publishes the anchor the comment box measures', async ({ page }) => {
    await page.goto(`/share/${TOKEN}`);
    await page.waitForSelector('iframe[title="Website under review"]');

    const anchor = page.locator('[data-annotation-image-container]');
    await expect(anchor).toHaveCount(1);

    await expect
      .poll(async () =>
        page.evaluate(() => {
          const a = document.querySelector('[data-annotation-image-container]');
          const f = document.querySelector('iframe[title="Website under review"]');
          const d = (f as HTMLIFrameElement).contentDocument;
          if (!a || !d?.documentElement) return null;
          const r = a.getBoundingClientRect();
          const fr = (f as HTMLElement).getBoundingClientRect();
          return {
            // The mirror spans the whole scrollable document, not the visible
            // frame — that is what makes a percentage resolve to the right spot.
            matchesDocument: Math.abs(r.height - d.documentElement.scrollHeight) <= 2,
            tallerThanFrame: r.height > fr.height,
            originAtFrame: Math.abs(r.top - fr.top) <= 2,
          };
        }),
      { timeout: 30_000 }
      )
      .toEqual({ matchesDocument: true, tallerThanFrame: true, originAtFrame: true });
  });

  test('the anchor follows the framed page as it scrolls', async ({ page }) => {
    await page.goto(`/share/${TOKEN}`);
    await page.waitForSelector('[data-annotation-image-container]');

    const topBefore = async () =>
      page.evaluate(() =>
        document.querySelector('[data-annotation-image-container]')!.getBoundingClientRect().top,
      );

    const before = await topBefore();
    await page.evaluate(() => {
      const f = document.querySelector('iframe[title="Website under review"]') as HTMLIFrameElement;
      f.contentDocument!.defaultView!.scrollTo(0, 300);
    });

    // Scrolling the site must move the mirror by the same amount, or a pin
    // halfway down the page would open its comment box somewhere else entirely.
    await expect.poll(topBefore, { timeout: 15_000 }).toBeCloseTo(before - 300, 0);
  });
});
