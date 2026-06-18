/**
 * Classifies a project item (thread) as an image, PDF, or video so the viewer
 * and thumbnails can render it appropriately. Threads only store a URL/filename,
 * so the kind is derived from the file extension.
 */

export type MediaKind = 'image' | 'pdf' | 'video';

// Video container extensions we render with a <video> player. Kept in sync with
// the MIME types accepted in lib/upload.ts.
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'm4v', 'ogv', 'ogg']);

/** Extract a lowercased file extension from a URL or filename, ignoring query strings. */
function extensionOf(value: string | null | undefined): string {
  if (!value) return '';
  const basename = value.split('?')[0].split('#')[0].split('/').pop() ?? '';
  let decoded = basename;
  try {
    decoded = decodeURIComponent(basename);
  } catch {
    /* malformed escape — fall back to the raw basename */
  }
  return (/\.([a-zA-Z0-9]{1,5})$/.exec(decoded)?.[1] ?? '').toLowerCase();
}

/**
 * Returns the media kind for a thread, preferring the URL's extension and
 * falling back to the display name. Defaults to `image` when unknown so existing
 * image-only projects keep their behaviour.
 */
export function getMediaKind(url: string | null | undefined, name?: string | null): MediaKind {
  const ext = extensionOf(url) || extensionOf(name);
  if (ext === 'pdf') return 'pdf';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  return 'image';
}
