'use client';

/**
 * Browser-side creation of tour scene web variants (see lib/tour-variants.ts).
 * Done in the editor's browser rather than on the server so a 50 MB original
 * never has to pass through a serverless function: right after an upload we
 * already hold the file locally, and older scenes are backfilled from their
 * public URL the next time an editor opens the tour.
 */

import { getTourSceneWebUploadUrl } from '@/app/actions/tour-scenes';
import { xhrUpload } from '@/lib/upload';
import { TOUR_WEB_JPEG_QUALITY, TOUR_WEB_MAX_WIDTH } from '@/lib/tour-variants';

async function loadImage(source: Blob): Promise<{ img: HTMLImageElement; release: () => void }> {
  const url = URL.createObjectURL(source);
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
  return { img, release: () => URL.revokeObjectURL(url) };
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('JPEG encoding failed'))),
      'image/jpeg',
      TOUR_WEB_JPEG_QUALITY,
    );
  });
}

/** Downscale (never upscale) a panorama to TOUR_WEB_MAX_WIDTH as JPEG. */
export async function createWebPanorama(source: Blob): Promise<Blob> {
  const { img, release } = await loadImage(source);
  try {
    const scale = Math.min(1, TOUR_WEB_MAX_WIDTH / img.naturalWidth);
    const width = Math.round(img.naturalWidth * scale);
    const height = Math.round(img.naturalHeight * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // createImageBitmap's resampler is noticeably sharper than a single
    // drawImage downscale in Chromium; fall back where resize isn't supported.
    let drawn = false;
    if (scale < 1 && typeof createImageBitmap === 'function') {
      try {
        const bitmap = await createImageBitmap(img, {
          resizeWidth: width,
          resizeHeight: height,
          resizeQuality: 'high',
        });
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
        drawn = true;
      } catch { /* fall through */ }
    }
    if (!drawn) ctx.drawImage(img, 0, 0, width, height);

    const jpeg = await canvasToJpeg(canvas);
    canvas.width = canvas.height = 0; // free the backing store promptly
    // An already-small JPEG original beats a re-encode of itself.
    if (scale === 1 && source.type === 'image/jpeg' && source.size <= jpeg.size) return source;
    return jpeg;
  } finally {
    release();
  }
}

/**
 * Generate and upload a scene's web variant. Returns its public URL, or null
 * on any failure — the original keeps working, so this is strictly best-effort.
 */
export async function uploadSceneWebVariant(sceneId: string, source: Blob): Promise<string | null> {
  try {
    const jpeg = await createWebPanorama(source);
    const target = await getTourSceneWebUploadUrl(sceneId);
    if (!target.success || !target.signedUrl || !target.webUrl) {
      console.warn('[tour-web] no upload URL for', sceneId, target.error);
      return null;
    }
    await xhrUpload(new File([jpeg], 'web.jpg', { type: 'image/jpeg' }), target.signedUrl, () => {});
    return target.webUrl;
  } catch (err) {
    console.warn('[tour-web] could not create web variant for', sceneId, err);
    return null;
  }
}

/** Backfill: fetch a scene's original from storage, then upload its variant. */
export async function backfillSceneWebVariant(sceneId: string, originalUrl: string): Promise<string | null> {
  try {
    const res = await fetch(originalUrl, { mode: 'cors' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return uploadSceneWebVariant(sceneId, await res.blob());
  } catch (err) {
    console.warn('[tour-web] could not fetch original for', sceneId, err);
    return null;
  }
}
