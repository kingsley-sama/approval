import { supabaseAdmin } from '@/lib/supabase';
import { readStored } from '@/lib/website/snapshot/store';

/**
 * The immutable record attached to a comment.
 *
 * Anchors are a convenience: they put a pin back where it belongs on a later
 * visit, and they are allowed to fail. The screenshot is the evidence, and it
 * is never regenerated — if six months later the anchor no longer resolves,
 * the reviewer can still see exactly what was in front of the person who wrote
 * the comment.
 *
 * The crop is taken from the snapshot's own full-page screenshot rather than
 * re-rendering. The snapshot is frozen, so that image is by definition what the
 * commenter was looking at, and cropping it costs one image operation instead
 * of a browser launch.
 */

const BUCKET = process.env.NEXT_PUBLIC_SUPABASE_BUCKET_NAME || 'screenshots';

/** Context around the pin, so the comment is readable without the whole page. */
const PADDING = 160;
const MIN_SIZE = 320;

export interface CommentShotRect {
  /** Position of the anchored element in snapshot document coordinates. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CommentShotResult {
  path: string;
  width: number;
  height: number;
}

/**
 * Crops the region around a comment out of the snapshot screenshot and stores
 * it under the comment's own id, so nothing else can overwrite it.
 */
export async function captureCommentShot(
  commentId: string,
  snapshotScreenshotPath: string,
  rect: CommentShotRect,
  docWidth: number
): Promise<CommentShotResult | null> {
  let sharp: typeof import('sharp').default;
  try {
    sharp = (await import('sharp')).default;
  } catch (err) {
    console.error('[comment-shot] sharp unavailable:', err);
    return null;
  }

  const source = await readStored(snapshotScreenshotPath);
  if (!source) return null;

  try {
    const image = sharp(source);
    const meta = await image.metadata();
    if (!meta.width || !meta.height) return null;

    // The screenshot may have been taken at a different scale than the document
    // the client measured, so map through the width ratio rather than assuming.
    const scale = docWidth > 0 ? meta.width / docWidth : 1;

    const left = Math.round((rect.x - PADDING) * scale);
    const top = Math.round((rect.y - PADDING) * scale);
    const width = Math.round((rect.width + PADDING * 2) * scale);
    const height = Math.round((rect.height + PADDING * 2) * scale);

    // Clamp into the image; a pin near an edge must still produce a valid crop.
    const l = Math.max(0, Math.min(left, meta.width - 1));
    const t = Math.max(0, Math.min(top, meta.height - 1));
    const w = Math.max(MIN_SIZE, Math.min(width, meta.width - l));
    const h = Math.max(MIN_SIZE, Math.min(height, meta.height - t));

    const buffer = await image
      .extract({ left: l, top: t, width: Math.min(w, meta.width - l), height: Math.min(h, meta.height - t) })
      .jpeg({ quality: 82 })
      .toBuffer();

    const path = `comment-shots/${commentId}.jpg`;
    const { error } = await supabaseAdmin.storage.from(BUCKET).upload(
      path,
      new Blob([new Uint8Array(buffer)], { type: 'image/jpeg' }),
      {
        contentType: 'image/jpeg',
        cacheControl: '31536000',
        // Never overwrite: this image is the record of one comment.
        upsert: false,
      }
    );

    if (error) {
      console.error('[comment-shot] upload failed', path, error);
      return null;
    }

    return { path, width: Math.min(w, meta.width - l), height: Math.min(h, meta.height - t) };
  } catch (err) {
    console.error('[comment-shot] crop failed', err);
    return null;
  }
}

// ── anchor resolution ──────────────────────────────────────────────────────

export interface StoredAnchor {
  /** data-rv index stamped at capture — exact within a snapshot version. */
  rv?: number;
  selector?: string;
  xPct?: number;
  yPct?: number;
  elementText?: string;
  snapshotVersion?: number;
}

/**
 * How much to trust a re-located anchor.
 *
 *   1.00  same snapshot version, matched on its data-rv stamp — exact.
 *   0.80  selector matched and the element's text still agrees.
 *   0.50  selector matched but the text has changed underneath it.
 *   0.00  nothing matched.
 *
 * The client places a pin only above `ANCHOR_MIN_CONFIDENCE`. Below it the
 * comment is listed against its stored screenshot instead, because a pin on
 * the wrong element is worse than no pin: it silently reassigns feedback to
 * something the reviewer never commented on.
 */
export const ANCHOR_MIN_CONFIDENCE = 0.75;

export function describeConfidence(score: number): string {
  if (score >= 1) return 'exact';
  if (score >= ANCHOR_MIN_CONFIDENCE) return 'matched';
  if (score > 0) return 'uncertain';
  return 'lost';
}
