/**
 * Server-side image compression for API-ingested images, mirroring the
 * client-side pipeline in lib/image-compression.ts so files land in Storage
 * the same way regardless of how they arrived:
 *   - downscale to a max dimension (default 2560px),
 *   - re-encode as JPEG (default quality 85), flattening transparency onto
 *     white since JPEG has no alpha channel,
 *   - respect EXIF orientation.
 *
 * Animated GIFs are skipped (re-encoding would drop frames), matching the
 * client. Best-effort: any failure — or a result that isn't smaller — falls
 * back to the original buffer so ingestion is never blocked by compression.
 *
 * Tunable via the same env vars the client uses (all optional):
 *   NEXT_PUBLIC_IMAGE_COMPRESSION=false        → disable entirely
 *   NEXT_PUBLIC_IMAGE_COMPRESSION_MAX_DIM=2560 → max width/height in px
 *   NEXT_PUBLIC_IMAGE_COMPRESSION_QUALITY=0.85 → 0..1 JPEG quality
 */

import sharp from 'sharp';

const COMPRESSIBLE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function isCompressionEnabled(): boolean {
  return process.env.NEXT_PUBLIC_IMAGE_COMPRESSION !== 'false';
}

function maxDimension(): number {
  const v = Number(process.env.NEXT_PUBLIC_IMAGE_COMPRESSION_MAX_DIM);
  return Number.isFinite(v) && v > 0 ? v : 2560;
}

/** JPEG quality on sharp's 1–100 scale, from the client's 0–1 env convention. */
function jpegQuality(): number {
  const v = Number(process.env.NEXT_PUBLIC_IMAGE_COMPRESSION_QUALITY);
  const q = Number.isFinite(v) && v > 0 && v <= 1 ? v : 0.85;
  return Math.round(q * 100);
}

/** Swap a filename's extension for `.jpg` (keeps the base name). */
function toJpegName(fileName: string): string {
  return `${fileName.replace(/\.[^./\\]+$/, '')}.jpg`;
}

export interface ServerCompressionResult {
  buffer: Buffer;
  contentType: string;
  fileName: string;
  didCompress: boolean;
}

/**
 * Compress one image buffer to JPEG. Returns the compressed buffer with a
 * `.jpg` filename when compression helps, otherwise the input unchanged.
 */
export async function compressImageBuffer(
  buffer: Buffer,
  contentType: string,
  fileName: string
): Promise<ServerCompressionResult> {
  const original: ServerCompressionResult = {
    buffer,
    contentType,
    fileName,
    didCompress: false,
  };

  if (!isCompressionEnabled()) return original;
  if (!COMPRESSIBLE_TYPES.has(contentType)) return original;

  try {
    const max = maxDimension();
    const compressed = await sharp(buffer)
      .rotate() // bake in EXIF orientation, like the client's from-image decode
      .flatten({ background: '#ffffff' })
      .resize(max, max, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: jpegQuality() })
      .toBuffer();

    // Keep the original if re-encoding didn't actually save anything.
    if (compressed.length >= buffer.length) return original;

    return {
      buffer: compressed,
      contentType: 'image/jpeg',
      fileName: toJpegName(fileName),
      didCompress: true,
    };
  } catch (err) {
    console.error('[compress] server-side compression failed, keeping original:', fileName, err);
    return original;
  }
}
