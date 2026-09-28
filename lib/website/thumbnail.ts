import type { Browser } from 'playwright-core';
import sharp from 'sharp';
import { supabaseAdmin } from '@/lib/supabase';
import { DEFAULT_CAPTURE_SETTINGS } from '@/lib/website/viewports';
import { readStored } from '@/lib/website/snapshot/store';
import { launchChromium } from '@/lib/website/browser';

/**
 * Sidebar thumbnails for website pages: the page as it first appears in a
 * desktop browser, scaled down to tile size.
 *
 * Rendered once per page and kept in Storage, so after the first visit a tile
 * is a plain CDN image. When the page already has a snapshot its screenshot is
 * cropped instead — no browser needed, and the tile matches the copy being
 * reviewed.
 *
 * A review can list dozens of pages and the sidebar asks for all of them at
 * once, so renders share one browser and run a couple at a time rather than
 * launching a Chromium per tile.
 */

const BUCKET = process.env.NEXT_PUBLIC_SUPABASE_BUCKET_NAME || 'screenshots';

// Taller than a screen on purpose. The dashboard card is a tall rectangle, and
// a 16:10 shot dropped into it survives only as a narrow strip through the
// middle of the page. Capturing more of the page keeps the card recognisable
// as that site's landing page.
const VIEWPORT = { width: 1280, height: 1600 };
// Wide enough for the dashboard card, which shows it several times the size of
// a sidebar tile; still only tens of kilobytes.
const THUMB_WIDTH = 640;
const THUMB_HEIGHT = Math.round((THUMB_WIDTH * VIEWPORT.height) / VIEWPORT.width);
const CONCURRENCY = 2;
const BROWSER_IDLE_MS = 30_000;

export function thumbnailPath(threadId: string): string {
  return `thumbnails/${threadId}.jpg`;
}

export function thumbnailPublicUrl(threadId: string): string {
  return supabaseAdmin.storage.from(BUCKET).getPublicUrl(thumbnailPath(threadId)).data.publicUrl;
}

export async function hasStoredThumbnail(threadId: string): Promise<boolean> {
  const { data } = await supabaseAdmin.storage
    .from(BUCKET)
    .list('thumbnails', { search: `${threadId}.jpg`, limit: 1 });
  return Boolean(data?.some(f => f.name === `${threadId}.jpg`));
}

/** Drops a stored thumbnail so the next request renders a fresh one. */
export async function clearThumbnail(threadId: string): Promise<void> {
  await supabaseAdmin.storage.from(BUCKET).remove([thumbnailPath(threadId)]);
}

// ── shared browser ─────────────────────────────────────────────────────────

let browserPromise: Promise<Browser> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let active = 0;
const waiting: Array<() => void> = [];

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = launchChromium();
    browserPromise.catch(() => { browserPromise = null; });
  }
  return browserPromise;
}

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= CONCURRENCY) await new Promise<void>(resolve => waiting.push(resolve));
  active++;
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
    if (active === 0 && waiting.length === 0) {
      idleTimer = setTimeout(() => {
        const closing = browserPromise;
        browserPromise = null;
        closing?.then(b => b.close()).catch(() => {});
      }, BROWSER_IDLE_MS);
    }
  }
}

async function renderPage(url: string, hideSelectors: string[]): Promise<Buffer> {
  return withSlot(async () => {
    const browser = await getBrowser();
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      locale: 'de-DE',
    });
    try {
      const page = await context.newPage();
      // Only the first screen matters, so `load` plus a short settle is plenty;
      // waiting for networkidle cost 30s on sites that keep polling.
      await page.goto(url, { waitUntil: 'load', timeout: 10_000 }).catch(async () => {
        await page.waitForLoadState('domcontentloaded').catch(() => {});
      });
      if (hideSelectors.length) {
        const sels = JSON.stringify(hideSelectors);
        await page
          .evaluate(
            `(() => { ${sels}.forEach(function (s) { try { document.querySelectorAll(s).forEach(function (el) { el.remove(); }); } catch (e) {} }); })()`
          )
          .catch(() => {});
      }
      await page.waitForTimeout(1200);
      // Straight through CDP rather than page.screenshot(): Playwright waits
      // for webfonts first, and on sites whose fonts never finish loading that
      // wait runs into the timeout. A tile rendered with a fallback font is fine.
      const cdp = await context.newCDPSession(page);
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
      return Buffer.from(data, 'base64');
    } finally {
      await context.close().catch(() => {});
    }
  });
}

// ── generation ─────────────────────────────────────────────────────────────

/** Several tiles for the same page can be asked for at once; render it once. */
const inFlight = new Map<string, Promise<boolean>>();

interface ThumbnailSource {
  threadId: string;
  url: string;
  /** Storage path of the page's current snapshot screenshot, when it has one. */
  snapshotScreenshotPath?: string | null;
  hideSelectors?: string[];
}

/**
 * Makes sure a thumbnail exists in Storage. Resolves false when the page could
 * not be rendered — the caller falls back to an icon tile.
 */
export function ensureThumbnail(source: ThumbnailSource): Promise<boolean> {
  const existing = inFlight.get(source.threadId);
  if (existing) return existing;

  const job = (async () => {
    try {
      let shot: Buffer | null = null;
      if (source.snapshotScreenshotPath) shot = await readStored(source.snapshotScreenshotPath);
      if (!shot) {
        shot = await renderPage(source.url, source.hideSelectors ?? DEFAULT_CAPTURE_SETTINGS.hideSelectors);
      }

      // A full-page snapshot is very tall; the tile shows the top of it.
      const thumb = await sharp(shot)
        .resize(THUMB_WIDTH, THUMB_HEIGHT, { fit: 'cover', position: 'top' })
        .jpeg({ quality: 78 })
        .toBuffer();

      const { error } = await supabaseAdmin.storage.from(BUCKET).upload(
        thumbnailPath(source.threadId),
        new Blob([new Uint8Array(thumb)], { type: 'image/jpeg' }),
        { contentType: 'image/jpeg', cacheControl: '86400', upsert: true }
      );
      if (error) {
        console.error('[thumbnail] upload failed', source.threadId, error);
        return false;
      }
      return true;
    } catch (err) {
      console.error('[thumbnail] render failed', source.url, err);
      return false;
    } finally {
      inFlight.delete(source.threadId);
    }
  })();

  inFlight.set(source.threadId, job);
  return job;
}

/** The stored thumbnail's bytes, for serving inline. */
export async function readThumbnail(key: string): Promise<Buffer | null> {
  return readStored(thumbnailPath(key));
}
