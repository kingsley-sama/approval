/**
 * Splits an uploaded PDF into one image per page, in the browser.
 *
 * Why client-side: the upload path already renders and compresses images with
 * a canvas before sending them (lib/image-compression.ts), and every page this
 * produces then travels the exact same route as a dropped JPEG — presigned
 * URL, direct upload, registerUploadedFile. Rasterising on the server would
 * instead mean native Canvas or Ghostscript on Vercel, for no gain.
 *
 * Before this, a PDF became a single thread rendered in an <iframe>: viewable,
 * but impossible to pin a comment to. One thread per page makes a brochure
 * reviewable exactly like a set of renders.
 *
 * pdf.js is ~1 MB, so it is imported dynamically — a user who never uploads a
 * PDF never downloads it.
 *
 * One behaviour worth knowing: pdf.js drives its canvas render loop through
 * requestAnimationFrame, which browsers pause in a hidden tab. If someone
 * starts a large PDF and switches away, conversion stalls until they come
 * back — it resumes on return and does not fail, but the progress row will sit
 * still in the meantime.
 */

import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';

/** Long edge to rasterise to. Kept under the 2560 compression ceiling so the
 *  downstream compressor re-encodes without downscaling a second time. */
const TARGET_WIDTH = 2000;

/** Never upscale a page beyond this, or a small-format PDF blows up. */
const MAX_SCALE = 4;

const JPEG_QUALITY = 0.85;

/**
 * A brochure is tens of pages; a scanned archive can be thousands, and each
 * page here becomes a database row and a stored file. Stop well short of that
 * and say so, rather than quietly locking up the tab.
 */
export const MAX_PDF_PAGES = 100;

export const PDF_MIME_TYPE = 'application/pdf';

export function isPdfFile(file: File): boolean {
  return file.type === PDF_MIME_TYPE || /\.pdf$/i.test(file.name);
}

export interface PdfPageImage {
  /** JPEG of the rendered page, ready for the normal upload path. */
  file: File;
  /** 1-based. */
  pageNumber: number;
  totalPages: number;
  /** Display name for the thread, e.g. "Brochure — Page 3 of 12". */
  displayName: string;
}

export interface PdfSplitOptions {
  onProgress?: (rendered: number, total: number) => void;
  signal?: AbortSignal;
}

export class PdfSplitError extends Error {}

type PdfjsModule = typeof import('pdfjs-dist');

let pdfjsPromise: Promise<PdfjsModule> | null = null;

function loadPdfjs(): Promise<PdfjsModule> {
  if (pdfjsPromise) return pdfjsPromise;

  pdfjsPromise = import('pdfjs-dist').then((lib) => {
    // Resolved through the bundler rather than hardcoded to /public, so the
    // worker can never drift out of step with the installed pdf.js version.
    lib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString();
    return lib;
  });

  return pdfjsPromise;
}

/** Strips ".pdf" so page names read "Brochure — Page 2", not "Brochure.pdf — Page 2". */
function baseName(fileName: string): string {
  return fileName.replace(/\.pdf$/i, '') || 'Document';
}

/** Storage-friendly stem; the server sanitises again, this just keeps it readable. */
function fileStem(fileName: string): string {
  return (
    baseName(fileName)
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'document'
  );
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
}

/**
 * Renders every page of `file` to a JPEG File.
 *
 * Throws PdfSplitError for problems worth showing the user (encrypted file,
 * damaged file, too many pages). The caller decides whether to fall back to
 * uploading the PDF whole.
 */
export async function pdfToPageImages(
  file: File,
  options: PdfSplitOptions = {}
): Promise<PdfPageImage[]> {
  const { onProgress, signal } = options;

  if (typeof document === 'undefined') {
    throw new PdfSplitError('PDFs can only be split in the browser.');
  }

  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());

  // Held so it can be destroyed in `finally` — the loading task owns the
  // worker's copy of the file, not the document proxy.
  const loadingTask: PDFDocumentLoadingTask = pdfjs.getDocument({ data });

  let doc: PDFDocumentProxy;
  try {
    doc = await loadingTask.promise;
  } catch (err) {
    await loadingTask.destroy().catch(() => {});
    const message = err instanceof Error ? err.message : String(err);
    if (/password/i.test(message)) {
      throw new PdfSplitError('This PDF is password-protected, so its pages cannot be read.');
    }
    throw new PdfSplitError(`This PDF could not be read: ${message}`);
  }

  try {
    if (doc.numPages === 0) {
      throw new PdfSplitError('This PDF has no pages.');
    }
    if (doc.numPages > MAX_PDF_PAGES) {
      throw new PdfSplitError(
        `This PDF has ${doc.numPages} pages; up to ${MAX_PDF_PAGES} can be split into a review. Split the file first.`
      );
    }

    const total = doc.numPages;
    const stem = fileStem(file.name);
    const label = baseName(file.name);
    const pad = String(total).length;
    const pages: PdfPageImage[] = [];

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new PdfSplitError('This browser could not provide a canvas to render into.');

    for (let pageNumber = 1; pageNumber <= total; pageNumber++) {
      if (signal?.aborted) throw new PdfSplitError('Cancelled.');

      const page = await doc.getPage(pageNumber);
      const unscaled = page.getViewport({ scale: 1 });
      const scale = Math.min(MAX_SCALE, TARGET_WIDTH / unscaled.width);
      const viewport = page.getViewport({ scale });

      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));

      await page.render({
        canvas,
        viewport,
        // PDF pages are transparent where nothing is drawn; JPEG has no alpha,
        // so without this every page would come out on black.
        background: '#ffffff',
      }).promise;

      const blob = await canvasToBlob(canvas);
      page.cleanup();

      if (!blob) {
        throw new PdfSplitError(`Page ${pageNumber} could not be converted to an image.`);
      }

      const padded = String(pageNumber).padStart(pad, '0');
      pages.push({
        file: new File([blob], `${stem}-p${padded}.jpg`, { type: 'image/jpeg' }),
        pageNumber,
        totalPages: total,
        displayName: `${label} — Page ${pageNumber} of ${total}`,
      });

      onProgress?.(pageNumber, total);
    }

    return pages;
  } finally {
    // Frees the worker's copy of the document; without it a few large PDFs in
    // one session will hold on to a lot of memory.
    await loadingTask.destroy().catch(() => {});
  }
}
