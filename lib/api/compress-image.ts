/**
 * Server-side image compression for API-ingested images, mirroring the
 * client-side pipeline in lib/image-compression.ts so files land in Storage
 * the same way regardless of how they arrived:
 *   - downscale to a max dimension (default 2560px) — see `fit` for how that
 *     bound is applied,
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

// sharp is a native module, and a deployment where its platform binary is
// missing throws on *import*. A top-level import therefore takes the whole
// route module down (every request 500s before the handler ever runs) rather
// than just disabling compression. Load it lazily inside the try/catch below
// so an unloadable sharp degrades to "upload the original bytes", which is
// exactly what the rest of this function already does on failure.
type Sharp = (typeof import('sharp'))['default'];
let sharpModule: Sharp | null | undefined;

async function loadSharp(): Promise<Sharp | null> {
  if (sharpModule !== undefined) return sharpModule;
  try {
    sharpModule = (await import('sharp')).default;
  } catch (err) {
    console.error('[compress] sharp unavailable, skipping compression:', err);
    sharpModule = null;
  }
  return sharpModule;
}

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

export interface ServerCompressionOptions {
  /**
   * How the max dimension is applied.
   *
   *   'inside' (default) — fit within a max x max box. Right for photographs
   *     and uploaded renders, where neither side should run away.
   *
   *   'width' — constrain the width and let the height run free. Required for
   *     full-page website captures: a 1440x12000 screenshot fitted 'inside' a
   *     2560 box is scaled by its *height*, landing at roughly 307x2560, which
   *     renders the page text unreadable. Those images are tall by nature, not
   *     by accident.
   */
  fit?: 'inside' | 'width';
}

/**
 * Compress one image buffer to JPEG. Returns the compressed buffer with a
 * `.jpg` filename when compression helps, otherwise the input unchanged.
 */
export async function compressImageBuffer(
  buffer: Buffer,
  contentType: string,
  fileName: string,
  options?: ServerCompressionOptions
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
    const sharp = await loadSharp();
    if (!sharp) return original;

    const pipeline = sharp(buffer)
      .rotate() // bake in EXIF orientation, like the client's from-image decode
      .flatten({ background: '#ffffff' });

    const resized =
      options?.fit === 'width'
        ? pipeline.resize({ width: max, withoutEnlargement: true })
        : pipeline.resize(max, max, { fit: 'inside', withoutEnlargement: true });

    const compressed = await resized.jpeg({ quality: jpegQuality() }).toBuffer();

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
