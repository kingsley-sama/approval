import { createHash } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase';
import type { CaptureResult, CapturedAsset } from '@/lib/website/snapshot/capture';

/**
 * Puts a capture into Storage and rewrites every URL in it to point at our own
 * copy, so the snapshot never contacts the original site again. That is the
 * whole point: a page that still hotlinks the origin is not durable, it just
 * looks durable until the client redeploys.
 *
 * Assets are referenced at their Storage URLs rather than proxied. Supabase
 * serves them with `access-control-allow-origin: *` and a one-year cache, so
 * webfonts — the one asset class that is CORS-checked — load correctly and the
 * CDN does the work.
 */

const BUCKET = process.env.NEXT_PUBLIC_SUPABASE_BUCKET_NAME || 'screenshots';

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
  'image/x-icon': 'ico',
  'text/css': 'css',
  'font/woff2': 'woff2',
  'font/woff': 'woff',
  'font/ttf': 'ttf',
  'font/otf': 'otf',
  'application/font-woff2': 'woff2',
  'application/font-woff': 'woff',
  'application/x-font-ttf': 'ttf',
};

function extFor(contentType: string, url: string): string {
  const known = EXT_BY_TYPE[contentType.toLowerCase()];
  if (known) return known;
  const m = /\.([a-z0-9]{2,5})(?:[?#]|$)/i.exec(url);
  return m ? m[1].toLowerCase() : 'bin';
}

/** Stable, collision-free name derived from the source URL. */
function assetName(asset: CapturedAsset): string {
  const hash = createHash('sha1').update(asset.url).digest('hex').slice(0, 20);
  return `${hash}.${extFor(asset.contentType, asset.url)}`;
}

function publicUrlFor(path: string): string {
  return supabaseAdmin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

async function upload(path: string, body: Buffer, contentType: string): Promise<boolean> {
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(
    path,
    new Blob([new Uint8Array(body)], { type: contentType }),
    { contentType, cacheControl: '31536000', upsert: true }
  );
  if (error) {
    console.error('[snapshot] upload failed', path, error);
    return false;
  }
  return true;
}

/**
 * Swaps source URLs for stored ones. Longest-first so a URL that is a prefix of
 * another cannot claim the wrong replacement.
 */
function applyUrlMap(text: string, map: Map<string, string>): string {
  if (map.size === 0) return text;
  const sources = Array.from(map.keys()).sort((a, b) => b.length - a.length);
  let out = text;
  for (const src of sources) {
    const replacement = map.get(src)!;
    // Both the raw URL and its HTML-escaped form appear in real markup.
    out = out.split(src).join(replacement);
    const escaped = src.replace(/&/g, '&amp;');
    if (escaped !== src) out = out.split(escaped).join(replacement);
  }
  return out;
}

export interface StoredSnapshot {
  htmlPath: string;
  screenshotPath: string;
  assetCount: number;
  bytesStored: number;
}

export async function storeSnapshot(
  snapshotId: string,
  capture: CaptureResult
): Promise<StoredSnapshot> {
  const base = `snapshots/${snapshotId}`;
  const urlMap = new Map<string, string>();
  let bytesStored = 0;
  let assetCount = 0;

  // Stylesheets are held back: they reference the other assets, so they can
  // only be rewritten once those have storage URLs.
  const stylesheets: CapturedAsset[] = [];
  const binaries: CapturedAsset[] = [];
  for (const asset of capture.assets) {
    if (asset.contentType.toLowerCase().includes('css')) stylesheets.push(asset);
    else binaries.push(asset);
  }

  // ── images and fonts ────────────────────────────────────────────────────
  // Uploaded in parallel: the Webflow test page stores 113 files, and doing
  // that one at a time took nearly two minutes of the capture's wall clock.
  const CONCURRENCY = 8;
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, binaries.length) }, async () => {
      while (cursor < binaries.length) {
        const asset = binaries[cursor++];
        const path = `${base}/assets/${assetName(asset)}`;
        if (!(await upload(path, asset.body, asset.contentType))) continue;
        urlMap.set(asset.url, publicUrlFor(path));
        bytesStored += asset.body.length;
        assetCount++;
      }
    })
  );

  // ── stylesheets, with their own url() references remapped ───────────────
  for (const asset of stylesheets) {
    const css = applyUrlMap(asset.body.toString('utf8'), urlMap);
    const body = Buffer.from(css, 'utf8');
    const path = `${base}/assets/${assetName(asset)}`;
    if (!(await upload(path, body, 'text/css'))) continue;
    urlMap.set(asset.url, publicUrlFor(path));
    bytesStored += body.length;
    assetCount++;
  }

  // ── the document ────────────────────────────────────────────────────────
  const html = applyUrlMap(capture.html, urlMap);
  const htmlPath = `${base}/index.html`;
  const htmlBody = Buffer.from(html, 'utf8');
  await upload(htmlPath, htmlBody, 'text/html; charset=utf-8');
  bytesStored += htmlBody.length;

  const screenshotPath = `${base}/page.jpg`;
  await upload(screenshotPath, capture.screenshot, 'image/jpeg');
  bytesStored += capture.screenshot.length;

  return { htmlPath, screenshotPath, assetCount, bytesStored };
}

/** Reads a stored object back — used to serve the HTML and to crop screenshots. */
export async function readStored(path: string): Promise<Buffer | null> {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(path);
  if (error || !data) {
    console.error('[snapshot] download failed', path, error);
    return null;
  }
  return Buffer.from(await data.arrayBuffer());
}

export function storagePublicUrl(path: string): string {
  return publicUrlFor(path);
}
