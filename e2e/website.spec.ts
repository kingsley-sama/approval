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
