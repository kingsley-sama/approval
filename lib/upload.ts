export type FileStatus = 'pending' | 'uploading' | 'registering' | 'done' | 'error';

export interface FileUploadState {
  id: string;
  name: string;
  status: FileStatus;
  progress: number; // 0-100
  error?: string;
  // Compression accounting, populated once the file has been processed.
  originalSize?: number;
  compressedSize?: number;
  didCompress?: boolean;
}

// ─── validation ──────────────────────────────────────────────────────────────

const IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
]);

// PDFs (exposés/brochures) and videos are uploaded as view-only project items.
const PDF_MIME_TYPE = 'application/pdf';
const VIDEO_MIME_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime', // .mov
  'video/ogg',
]);

const MB = 1024 * 1024;
// Videos are far larger than images/PDFs, so they get their own ceiling.
const MAX_IMAGE_SIZE = 20 * MB;
const MAX_PDF_SIZE = 50 * MB;
const MAX_VIDEO_SIZE = 200 * MB;

type UploadCategory = 'image' | 'pdf' | 'video';

function categorize(file: File): UploadCategory | null {
  if (IMAGE_MIME_TYPES.has(file.type)) return 'image';
  if (file.type === PDF_MIME_TYPE) return 'pdf';
  if (VIDEO_MIME_TYPES.has(file.type)) return 'video';
  return null;
}

const MAX_SIZE_BY_CATEGORY: Record<UploadCategory, number> = {
  image: MAX_IMAGE_SIZE,
  pdf: MAX_PDF_SIZE,
  video: MAX_VIDEO_SIZE,
};

export interface FileValidationError {
  file: File;
  reason: string;
}

/** Validate files before starting uploads. Returns accepted files and rejected entries. */
export function validateFiles(files: File[]): {
  accepted: File[];
  rejected: FileValidationError[];
} {
  const accepted: File[] = [];
  const rejected: FileValidationError[] = [];

  for (const file of files) {
    const category = categorize(file);
    if (!category) {
      rejected.push({ file, reason: `Unsupported file type: ${file.type || 'unknown'}. Use an image, PDF, or video.` });
      continue;
    }
    const maxSize = MAX_SIZE_BY_CATEGORY[category];
    if (file.size > maxSize) {
      rejected.push({ file, reason: `File too large (${(file.size / MB).toFixed(1)} MB). Max ${Math.round(maxSize / MB)} MB.` });
    } else if (file.size === 0) {
      rejected.push({ file, reason: 'File is empty.' });
    } else {
      accepted.push(file);
    }
  }

  return { accepted, rejected };
}

// ─── upload with retry ───────────────────────────────────────────────────────

const UPLOAD_TIMEOUT_MS = 120_000; // 2 minutes
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1_500;

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Upload a file directly to a Supabase presigned URL via XHR with progress, timeout, and retry. */
export function xhrUpload(
  file: File,
  signedUrl: string,
  onProgress: (pct: number) => void,
): Promise<void> {
  return xhrUploadWithRetry(file, signedUrl, onProgress, MAX_RETRIES);
}

async function xhrUploadWithRetry(
  file: File,
  signedUrl: string,
  onProgress: (pct: number) => void,
  retriesLeft: number,
): Promise<void> {
  try {
    await xhrUploadOnce(file, signedUrl, onProgress);
  } catch (err: any) {
    if (retriesLeft > 0 && isRetryable(err)) {
      onProgress(0);
      await wait(RETRY_DELAY_MS);
      return xhrUploadWithRetry(file, signedUrl, onProgress, retriesLeft - 1);
    }
    throw err;
  }
}

function isRetryable(err: any): boolean {
  const msg = String(err?.message ?? '');
  return msg.includes('Network error') || msg.includes('timed out');
}

function xhrUploadOnce(
  file: File,
  signedUrl: string,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.timeout = UPLOAD_TIMEOUT_MS;
    xhr.open('PUT', signedUrl);
    // Only set Content-Type — no custom headers (avoids CORS preflight rejection)
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    });
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (${xhr.status}): ${xhr.responseText?.slice(0, 200)}`));
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.ontimeout = () => reject(new Error('Upload timed out'));
    xhr.send(file);
  });
}
