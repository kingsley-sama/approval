/**
 * Supabase image-transformation helpers for panoramas.
 *
 * Panorama source files are large equirectangular JPEGs (2–10 MB). Serving the
 * raw object burns bandwidth and is slow to download and upload into a WebGL
 * texture. On the Pro plan Supabase resizes/re-encodes on read via the render
 * endpoint, and its Smart CDN caches the transformed result — so subsequent
 * viewers get the small version straight from the edge.
 *
 * We cap the long edge at Supabase's maximum (2500px) and drop quality;
 * Supabase content-negotiates WebP/AVIF automatically, so the payload typically
 * shrinks several-fold with no visible loss in the viewer. Specifying only a
 * width keeps the 2:1 equirectangular aspect ratio (no `height`/resize mode
 * needed).
 *
 * The transform only applies to Supabase public-object URLs; blob:/data:/local
 * placeholder URLs (and anything already pointing at the render endpoint) are
 * returned untouched. If a source exceeds Supabase's transform limits
 * (25MB / 50MP) the render endpoint 400s — callers should fall back to the
 * original URL (see panorama-viewer's error handler).
 */

// Supabase caps transform width/height at 2500px; requesting more errors out.
export const PANORAMA_MAX_WIDTH = 2500;
const PANORAMA_QUALITY = 75;

const OBJECT_PUBLIC = '/storage/v1/object/public/';
const RENDER_PUBLIC = '/storage/v1/render/image/public/';

/**
 * Rewrite a stored Supabase public-object URL to the render (transform)
 * endpoint with a width cap + quality. Non-Supabase or already-transformed
 * URLs are returned unchanged, so this is safe to call on any panorama URL.
 */
export function panoramaImageUrl(
  url: string,
  { width = PANORAMA_MAX_WIDTH, quality = PANORAMA_QUALITY }: { width?: number; quality?: number } = {},
): string {
  if (!url || !url.includes(OBJECT_PUBLIC)) return url;
  const base = url.replace(OBJECT_PUBLIC, RENDER_PUBLIC);
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}width=${Math.min(width, PANORAMA_MAX_WIDTH)}&quality=${quality}`;
}
