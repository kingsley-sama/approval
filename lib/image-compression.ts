/**
 * Client-side image compression, applied just before files are uploaded to
 * Supabase Storage. Goals:
 *   - shrink stored originals and speed up uploads, and
 *   - keep a universally downloadable format, since clients download the stored
 *     file straight from the UI.
 *
 * Images are downscaled to a max dimension and re-encoded as JPEG. JPEG has no
 * alpha channel, so any transparency is flattened onto a white background. EXIF
 * orientation (phone photos) is respected during decode.
 *
 * Annotation precision is unaffected: markers/shapes are stored as percentages,
 * so downscaling never misplaces them. We keep a high max dimension + quality so
 * reviewers don't lose detail they need to mark.
 *
 * Best-effort: any failure (or a result that isn't actually smaller) falls back
 * to the original file, so an upload is never blocked by compression.
 *
 * Tunable via env (all optional):
 *   NEXT_PUBLIC_IMAGE_COMPRESSION=false        → disable entirely
 *   NEXT_PUBLIC_IMAGE_COMPRESSION_MAX_DIM=2560 → max width/height in px
 *   NEXT_PUBLIC_IMAGE_COMPRESSION_QUALITY=0.85 → 0..1 JPEG quality
 */

// Raster formats we can safely re-encode. Animated GIFs (frames would be lost)
// and vector SVGs are intentionally excluded, as are PDFs and non-images.
const COMPRESSIBLE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function isImageCompressionEnabled(): boolean {
  return process.env.NEXT_PUBLIC_IMAGE_COMPRESSION !== 'false';
}

function maxDimension(): number {
  const v = Number(process.env.NEXT_PUBLIC_IMAGE_COMPRESSION_MAX_DIM);
  return Number.isFinite(v) && v > 0 ? v : 2560;
}

function quality(): number {
  const v = Number(process.env.NEXT_PUBLIC_IMAGE_COMPRESSION_QUALITY);
  return Number.isFinite(v) && v > 0 && v <= 1 ? v : 0.85;
}

/** Swap a filename's extension for `.jpg` (keeps the base name). */
function toJpegName(fileName: string): string {
  return `${fileName.replace(/\.[^./\\]+$/, '')}.jpg`;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, q: number): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(resolve, type, q));
}

/**
 * Compress a single image file to JPEG. Returns a new `.jpg` File when
 * compression helps, otherwise returns the original file unchanged (non-images,
 * disabled, no DOM/canvas, errors, or results that aren't smaller).
 */
export async function compressImageFile(file: File): Promise<File> {
  const kb = (n: number) => `${Math.round(n / 1024)}kb`;
  if (!isImageCompressionEnabled()) {
    console.log('[compress] disabled via env → keeping original', file.name);
    return file;
  }
  if (!COMPRESSIBLE_TYPES.has(file.type)) {
    console.log(`[compress] skipped: type "${file.type}" not compressible →`, file.name);
    return file;
  }
  if (typeof document === 'undefined' || typeof createImageBitmap === 'undefined') {
    console.log('[compress] skipped: no DOM/createImageBitmap');
    return file;
  }

  try {
    // Respect EXIF orientation so rotated phone photos aren't baked in sideways.
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });

    const max = maxDimension();
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close?.();
      console.log('[compress] skipped: no 2d context');
      return file;
    }

    // JPEG has no alpha — flatten any transparency onto white before drawing.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await canvasToBlob(canvas, 'image/jpeg', quality());

    console.log(
      `[compress] ${file.name} (${file.type}) ${bitmap.width}x${bitmap.height} ${kb(file.size)}` +
      ` → ${width}x${height} jpeg q${quality()} ${blob ? kb(blob.size) : 'null'}`,
    );

    // Keep the original if re-encoding didn't actually save anything (e.g. an
    // already-small, already-optimized JPEG).
    if (!blob || blob.size >= file.size) {
      console.log('[compress] result not smaller → keeping original', file.name);
      return file;
    }

    return new File([blob], toJpegName(file.name), {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } catch (err) {
    console.log('[compress] error → keeping original', file.name, err);
    return file;
  }
}

/** Compress an array of files in place-order (non-images pass through). */
export async function compressImageFiles(files: File[]): Promise<File[]> {
  return Promise.all(files.map(compressImageFile));
}
