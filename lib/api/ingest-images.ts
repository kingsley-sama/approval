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

function storagePath(projectId: string, fileName: string): string {
  // Mirrors renderStoragePath in app/actions/storage.ts so API uploads live
  // alongside in-app uploads.
  return `renders/${projectId}/${Date.now()}-${sanitizeFileName(fileName)}`;
}

async function fetchRemoteImage(
  url: string
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

  const contentType = (res.headers.get('content-type') || '').split(';')[0].trim();
  if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
    throw new Error(
      `Unsupported content type "${contentType || 'unknown'}" — allowed: ${[...ALLOWED_IMAGE_TYPES].join(', ')}`
    );
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length === 0) throw new Error('Downloaded file is empty');
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error('Image exceeds the 60 MB limit');
  }

  const urlName = decodeURIComponent(parsed.pathname.split('/').pop() || '');
  const fileName = urlName.includes('.')
    ? urlName
    : `${urlName || 'image'}.${EXTENSION_BY_TYPE[contentType]}`;

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
  let path = storagePath(projectId, fileName);
  let uploadError = (
    await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType, cacheControl: '31536000', upsert: true })
  ).error;
  if (uploadError) {
    path = storagePath(projectId, fileName);
    uploadError = (
      await supabaseAdmin.storage
        .from(BUCKET)
        .upload(path, buffer, { contentType, cacheControl: '31536000', upsert: true })
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
        ({ buffer, contentType, fileName } = await fetchRemoteImage(input.url));
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
