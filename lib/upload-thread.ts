'use client';

/**
 * One implementation of "put a selected file into a project as thread(s)".
 *
 * The project workspace uploader and the create-project dialog both used to
 * carry their own near-identical copy of this. PDF page-splitting needs to
 * happen in both, so the logic lives here once.
 *
 * A PDF becomes one thread per page rather than a single un-annotatable
 * document: pins and drawings only work on images, so a brochure uploaded
 * whole could be looked at but never marked up.
 */

import { getSignedUploadUrl, registerUploadedFile } from '@/app/actions/storage';
import { xhrUpload, type FileUploadState } from '@/lib/upload';
import { compressImageWithStats } from '@/lib/image-compression';
import { isPdfFile, pdfToPageImages, PdfSplitError } from '@/lib/pdf-to-images';

export type UploadPatch = (update: Partial<FileUploadState>) => void;

export interface UploadOutcome {
  ok: boolean;
  /** Public URL of the first stored item — the create dialog uses it as the cover. */
  firstPublicUrl?: string;
  /**
   * Set when a PDF's pages could not be rendered and it was stored whole
   * instead. The document is still viewable; it just cannot be annotated.
   */
  pdfFallbackReason?: string;
}

/**
 * `createThread` leaves `image_index` null, so threads are ordered by
 * `created_at`. Registering pages one at a time is what keeps page 2 after
 * page 1 — parallel registration would make the order arbitrary.
 *
 * The same reasoning applies across files: two PDFs uploaded at once would
 * interleave their pages. So a batch containing any PDF is processed one file
 * at a time; batches of plain images keep the old concurrency.
 */
export const DEFAULT_UPLOAD_CONCURRENCY = 3;

export function uploadConcurrencyFor(files: File[]): number {
  return files.some(isPdfFile) ? 1 : DEFAULT_UPLOAD_CONCURRENCY;
}

/** Upload one already-prepared image and register it as a thread. */
async function storeImage(
  projectId: string,
  file: File,
  displayName: string,
  onProgress: (pct: number) => void
): Promise<{ ok: true; publicUrl?: string } | { ok: false; error: string }> {
  const urlResult = await getSignedUploadUrl(projectId, file.name);
  if (!urlResult.success || !urlResult.signedUrl || !urlResult.storagePath) {
    return { ok: false, error: urlResult.error || 'Could not get upload URL' };
  }

  try {
    await xhrUpload(file, urlResult.signedUrl, onProgress);
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Upload failed' };
  }

  const regResult = await registerUploadedFile(projectId, displayName, urlResult.storagePath);
  if (!regResult.success) {
    return { ok: false, error: regResult.error || 'Failed to save file' };
  }

  return { ok: true, publicUrl: regResult.publicUrl };
}

/** A PDF: render every page, then store each as its own thread, in order. */
async function uploadPdfPages(
  projectId: string,
  rawFile: File,
  patch: UploadPatch
): Promise<UploadOutcome> {
  patch({ status: 'converting', progress: 0, pageProgress: { done: 0, total: 0 } });

  let pages;
  try {
    pages = await pdfToPageImages(rawFile, {
      onProgress: (done, total) =>
        patch({
          pageProgress: { done, total },
          // Rendering is the first half of the work, uploading the second.
          progress: Math.round((done / total) * 50),
        }),
    });
  } catch (err) {
    const reason =
      err instanceof PdfSplitError
        ? err.message
        : `This PDF could not be split into pages: ${err instanceof Error ? err.message : String(err)}`;

    // Fall back to the previous behaviour — store the document whole. It stays
    // viewable, which is better than losing the upload entirely; the caller
    // tells the user it cannot be annotated.
    const fallback = await storeImage(projectId, rawFile, rawFile.name, (pct) =>
      patch({ status: 'uploading', progress: pct })
    );

    if (!fallback.ok) {
      patch({ status: 'error', error: fallback.error });
      return { ok: false, pdfFallbackReason: reason };
    }

    patch({ status: 'done', progress: 100, pageProgress: undefined });
    return { ok: true, firstPublicUrl: fallback.publicUrl, pdfFallbackReason: reason };
  }

  const total = pages.length;
  let firstPublicUrl: string | undefined;

  for (const page of pages) {
    patch({
      status: 'uploading',
      pageProgress: { done: page.pageNumber, total },
    });

    const result = await storeImage(projectId, page.file, page.displayName, (pct) =>
      patch({ progress: 50 + Math.round(((page.pageNumber - 1 + pct / 100) / total) * 50) })
    );

    if (!result.ok) {
      patch({
        status: 'error',
        error: `Page ${page.pageNumber} of ${total}: ${result.error}`,
      });
      return { ok: false, firstPublicUrl };
    }

    if (!firstPublicUrl) firstPublicUrl = result.publicUrl;
  }

  patch({ status: 'done', progress: 100, pageProgress: { done: total, total } });
  return { ok: true, firstPublicUrl };
}

/**
 * Stores one selected file in a project. Images (and videos) become a single
 * thread; PDFs become one thread per page.
 */
export async function uploadProjectFile(
  projectId: string,
  rawFile: File,
  patch: UploadPatch
): Promise<UploadOutcome> {
  if (isPdfFile(rawFile)) {
    return uploadPdfPages(projectId, rawFile, patch);
  }

  // Compress in the browser first (best-effort; returns the original on
  // failure, for non-images, or when re-encoding doesn't actually help).
  const { file, originalSize, compressedSize, didCompress } = await compressImageWithStats(rawFile);
  patch({ status: 'uploading', progress: 0, originalSize, compressedSize, didCompress });

  const result = await storeImage(projectId, file, file.name, (pct) => patch({ progress: pct }));
  if (!result.ok) {
    patch({ status: 'error', error: result.error });
    return { ok: false };
  }

  patch({ status: 'done', progress: 100 });
  return { ok: true, firstPublicUrl: result.publicUrl };
}
