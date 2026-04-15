export type FileStatus = 'pending' | 'uploading' | 'registering' | 'done' | 'error';

export interface FileUploadState {
  id: string;
  name: string;
  status: FileStatus;
  progress: number; // 0-100
  error?: string;
}

// ─── validation ──────────────────────────────────────────────────────────────

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
]);

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

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
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      rejected.push({ file, reason: `Unsupported file type: ${file.type || 'unknown'}. Use JPEG, PNG, WebP, GIF, or SVG.` });
    } else if (file.size > MAX_FILE_SIZE) {
      rejected.push({ file, reason: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 20 MB.` });
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
