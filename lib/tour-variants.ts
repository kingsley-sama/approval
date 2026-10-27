/**
 * Web-optimized tour scene images ("web variants").
 *
 * Tour originals are kept untouched (up to 50 MB PNGs), but streaming those to
 * every visitor makes scene loads and transitions slow — and anything wider
 * than 2× the GPU's max texture size (8192px on most phones) can't render at
 * all. Each scene therefore gets a JPEG copy, capped at TOUR_WEB_MAX_WIDTH,
 * stored at a path derived from the original:
 *
 *   tours/{projectId}/{ts}-name.png  →  tours/{projectId}/web/{ts}-name.png.jpg
 *
 * Deriving the path (instead of storing it in a column) means no migration,
 * and duplicated tours — which share the original's image_path — share its
 * variant too. Pure helpers; safe on client and server.
 */

/** Width of the web variant. 6144×3072 keeps detail when zoomed and stays
 *  well under every device's equirectangular limit, at ~2–3 MB as JPEG. */
export const TOUR_WEB_MAX_WIDTH = 6144;
export const TOUR_WEB_JPEG_QUALITY = 0.85;

const PUBLIC_MARKER = '/storage/v1/object/public/';

/** `https://…/object/public/{bucket}/{path}` → `{ bucket, path }`, else null. */
export function parsePublicStorageUrl(url: string): { bucket: string; path: string } | null {
  const i = url.indexOf(PUBLIC_MARKER);
  if (i === -1) return null;
  const rest = url.slice(i + PUBLIC_MARKER.length).split('?')[0];
  const slash = rest.indexOf('/');
  if (slash <= 0) return null;
  return { bucket: rest.slice(0, slash), path: decodeURIComponent(rest.slice(slash + 1)) };
}

/** Storage path of the web variant for an original's storage path. */
export function webVariantPath(originalPath: string): string {
  const slash = originalPath.lastIndexOf('/');
  const dir = slash === -1 ? '' : originalPath.slice(0, slash + 1);
  const base = originalPath.slice(slash + 1);
  return `${dir}web/${base}.jpg`;
}

/** Public URL of the web variant for an original's public URL (null if the
 *  original isn't a Supabase public storage URL). Existence isn't checked. */
export function webVariantUrl(originalUrl: string): string | null {
  const parsed = parsePublicStorageUrl(originalUrl);
  if (!parsed) return null;
  const prefix = originalUrl.slice(0, originalUrl.indexOf(PUBLIC_MARKER) + PUBLIC_MARKER.length);
  const encoded = webVariantPath(parsed.path).split('/').map(encodeURIComponent).join('/');
  return `${prefix}${parsed.bucket}/${encoded}`;
}
