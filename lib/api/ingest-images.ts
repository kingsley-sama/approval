import { supabaseAdmin } from '@/lib/supabase';
import { compressImageBuffer } from '@/lib/api/compress-image';

const BUCKET = process.env.NEXT_PUBLIC_SUPABASE_BUCKET_NAME || 'screenshots';

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);
// Ceiling on the *source* file we accept before compression. Full-resolution
// architectural renders routinely run 20–40 MB; sharp downscales them to
// ~2 MB in uploadAndCreateThread, so gating on the raw size would wrongly
// reject images that compress down fine. Keep a memory-safe upper bound so a
// pathological file can't OOM the serverless function.
const MAX_IMAGE_BYTES = 60 * 1024 * 1024; // 60 MB source ceiling

const EXTENSION_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const TYPE_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};

/**
 * Identifies an image from its magic bytes. Needed because pre-authenticated
 * download URLs (SharePoint/Graph `@microsoft.graph.downloadUrl`, S3 presigned
 * links, …) frequently serve real images as `application/octet-stream`, and
 * some CDNs send `binary/octet-stream` or a bare `image/jpg`. The bytes are
 * authoritative; the header is only a hint.
 */
function sniffImageType(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return 'image/png';
  const ascii = buffer.subarray(0, 12).toString('latin1');
  if (ascii.startsWith('GIF87a') || ascii.startsWith('GIF89a')) return 'image/gif';
  if (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/** Last-resort type guess from a filename's extension. */
function typeFromExtension(fileName: string): string | null {
  const ext = fileName.split('.').pop()?.toLowerCase();
  return (ext && TYPE_BY_EXTENSION[ext]) || null;
}

/** One image supplied in a JSON request body. */
export interface ImageInput {
  /** Publicly reachable URL the server should download the image from. */
  url?: string;
  /** Raw base64 image data (no data: prefix needed, but tolerated). */
  base64?: string;
  /** Content type for base64 payloads, e.g. "image/png". */
  contentType?: string;
  /** Optional display name; falls back to the URL filename or a generated one. */
  name?: string;
}

export interface IngestedImage {
  threadId: string;
  name: string;
  imageUrl: string;
  imageIndex: number;
}

export interface IngestFailure {
  input: string;
  error: string;
}

export interface IngestResult {
  images: IngestedImage[];
  failed: IngestFailure[];
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200) || 'image';
}

/**
 * Wraps image bytes for Supabase Storage.
 *
 * storage-js hands anything that isn't a Blob/FormData straight to `fetch` as
 * the request body (StorageFileApi.uploadOrUpdate → `body = fileBody`). On
 * Vercel the Buffer sharp returns from its native binding is not recognised as
 * a BodyInit by the runtime's fetch, which then falls back to stringifying it:
 * every byte above 0x7F becomes U+FFFD and the stored file is a corrupt image
 * with a valid content-type. Locally the same code is fine, which is why this
 * only ever showed up in production.
 *
 * Copying into a realm-local Uint8Array and wrapping it in a Blob routes the
 * upload through storage-js's FormData branch, which never stringifies.
 */
function toUploadBody(buffer: Buffer, contentType: string): Blob {
  const bytes = new Uint8Array(buffer.byteLength);
  bytes.set(buffer);
  return new Blob([bytes], { type: contentType });
}

function storagePath(projectId: string, fileName: string): string {
  // Mirrors renderStoragePath in app/actions/storage.ts so API uploads live
  // alongside in-app uploads.
  return `renders/${projectId}/${Date.now()}-${sanitizeFileName(fileName)}`;
}

async function fetchRemoteImage(
  url: string,
  hintName?: string
): Promise<{ buffer: Buffer; contentType: string; fileName: string }> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Invalid URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http(s) URLs are supported');
  }

  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) {
    throw new Error(`Download failed with status ${res.status}`);
  }

  const headerType = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();

  // Bail out before buffering when the server already tells us it's oversized.
  const declaredLength = Number(res.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BYTES) {
    throw new Error('Image exceeds the 60 MB limit');
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length === 0) throw new Error('Downloaded file is empty');
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error('Image exceeds the 60 MB limit');
  }

  // Trust the header only when it names an allowed type; otherwise fall back to
  // the file's own magic bytes, then to the supplied name's extension.
  const contentType = ALLOWED_IMAGE_TYPES.has(headerType)
    ? headerType
    : sniffImageType(buffer) || typeFromExtension(hintName || parsed.pathname) || '';

  if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
    throw new Error(
      `Unsupported content type "${headerType || 'unknown'}" and the downloaded bytes are not a recognised image — allowed: ${[...ALLOWED_IMAGE_TYPES].join(', ')}`
    );
  }

  const urlName = decodeURIComponent(parsed.pathname.split('/').pop() || '');
  // Pre-authenticated URLs (Graph, presigned S3) carry no usable filename, so
  // prefer the caller-supplied name when the path doesn't provide one.
  const baseName = urlName.includes('.') ? urlName : hintName?.trim() || '';
  const fileName = baseName.includes('.')
    ? baseName
    : `${baseName || urlName || 'image'}.${EXTENSION_BY_TYPE[contentType]}`;

  return { buffer, contentType, fileName };
}

function decodeBase64Image(input: ImageInput): {
  buffer: Buffer;
  contentType: string;
  fileName: string;
} {
  let data = input.base64!;
  let contentType = input.contentType || '';

  // Tolerate data URIs: data:image/png;base64,....
  const dataUriMatch = data.match(/^data:([^;]+);base64,([\s\S]*)$/);
  if (dataUriMatch) {
    contentType = contentType || dataUriMatch[1];
    data = dataUriMatch[2];
  }

  if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
    throw new Error(
      `base64 images need a valid contentType — allowed: ${[...ALLOWED_IMAGE_TYPES].join(', ')}`
    );
  }

  const buffer = Buffer.from(data, 'base64');
  if (buffer.length === 0) throw new Error('base64 data is empty or invalid');
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error('Image exceeds the 60 MB limit');
  }

  const fileName = input.name
    ? sanitizeFileName(input.name)
    : `image.${EXTENSION_BY_TYPE[contentType]}`;

  return { buffer, contentType, fileName };
}

async function uploadAndCreateThread(
  projectId: string,
  buffer: Buffer,
  fileName: string,
  contentType: string,
  displayName: string,
  imageIndex: number
): Promise<IngestedImage> {
  // Same downscale/re-encode the in-app uploader applies client-side, so
  // API-ingested files land in Storage at comparable sizes.
  const compressed = await compressImageBuffer(buffer, contentType, fileName);
  buffer = compressed.buffer;
  contentType = compressed.contentType;
  fileName = compressed.fileName;

  // Upload to Storage, retrying once with a fresh path. Supabase occasionally
  // returns a bare "Bad Request" (e.g. a transient 400 or a key collision);
  // a second attempt with a new timestamped key clears those.
  const body = toUploadBody(buffer, contentType);
  let path = storagePath(projectId, fileName);
  let uploadError = (
    await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, body, { contentType, cacheControl: '31536000', upsert: true })
  ).error;
  if (uploadError) {
    path = storagePath(projectId, fileName);
    uploadError = (
      await supabaseAdmin.storage
        .from(BUCKET)
        .upload(path, body, { contentType, cacheControl: '31536000', upsert: true })
    ).error;
  }
  if (uploadError) {
    // Surface the full error, not just the generic ".message" ("Bad Request").
    throw new Error(
      `Storage upload failed for "${fileName}" (${contentType}, ${buffer.length} bytes): ${JSON.stringify(uploadError)}`
    );
  }

  const publicUrl = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

  const { data: thread, error: threadError } = await supabaseAdmin
    .from('markup_threads')
    .insert({
      project_id: projectId,
      image_path: publicUrl,
      thread_name: displayName,
      image_filename: path,
      image_index: imageIndex,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (threadError) {
    // Don't leave an orphaned file behind
    await supabaseAdmin.storage.from(BUCKET).remove([path]).catch(() => {});
    throw new Error(`Thread creation failed: ${threadError.message}`);
  }

  return {
    threadId: (thread as any).id,
    name: displayName,
    imageUrl: publicUrl,
    imageIndex,
  };
}

/**
 * Ingests a batch of images (remote URLs, base64 payloads, or multipart Files)
 * into a project: uploads each to Supabase Storage and creates one
 * markup_thread per image. Then refreshes the project's thread counts and
 * cover image. Failures are collected per-image, not thrown.
 */
export async function ingestImages(
  projectId: string,
  inputs: ImageInput[],
  files: File[],
  startIndex: number
): Promise<IngestResult> {
  const images: IngestedImage[] = [];
  const failed: IngestFailure[] = [];
  let index = startIndex;

  for (const input of inputs) {
    const label = input.url || input.name || 'base64 image';
    try {
      let buffer: Buffer, contentType: string, fileName: string;
      if (input.url) {
        ({ buffer, contentType, fileName } = await fetchRemoteImage(input.url, input.name));
      } else if (input.base64) {
        ({ buffer, contentType, fileName } = decodeBase64Image(input));
      } else {
        throw new Error('Each image needs either "url" or "base64"');
      }
      const displayName = input.name?.trim() || fileName;
      images.push(
        await uploadAndCreateThread(projectId, buffer, fileName, contentType, displayName, index)
      );
      index++;
    } catch (err: any) {
      failed.push({ input: label, error: err?.message || 'Unknown error' });
    }
  }

  for (const file of files) {
    try {
      const contentType = file.type || 'application/octet-stream';
      if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
        throw new Error(
          `Unsupported content type "${contentType}" — allowed: ${[...ALLOWED_IMAGE_TYPES].join(', ')}`
        );
      }
      if (file.size > MAX_IMAGE_BYTES) throw new Error('Image exceeds the 60 MB limit');
      const buffer = Buffer.from(await file.arrayBuffer());
      const fileName = sanitizeFileName(file.name || `image.${EXTENSION_BY_TYPE[contentType]}`);
      images.push(
        await uploadAndCreateThread(projectId, buffer, fileName, contentType, fileName, index)
      );
      index++;
    } catch (err: any) {
      failed.push({ input: file.name || 'uploaded file', error: err?.message || 'Unknown error' });
    }
  }

  if (images.length > 0) {
    await refreshProjectImageStats(projectId, images[0].imageUrl);
  }

  return { images, failed };
}

/** Recounts threads and updates the project's totals + cover image. */
async function refreshProjectImageStats(projectId: string, firstImageUrl: string) {
  const { count } = await supabaseAdmin
    .from('markup_threads')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', projectId);

  const update: Record<string, unknown> = {
    total_threads: count ?? 0,
    total_screenshots: count ?? 0,
    updated_at: new Date().toISOString(),
  };

  // Only set the cover if the project still has the placeholder
  const { data: project } = await supabaseAdmin
    .from('markup_projects')
    .select('markup_url')
    .eq('id', projectId)
    .maybeSingle();
  const currentCover = (project as any)?.markup_url;
  if (!currentCover || currentCover === '/placeholder.svg') {
    update.markup_url = firstImageUrl;
  }

  await supabaseAdmin.from('markup_projects').update(update).eq('id', projectId);
}
