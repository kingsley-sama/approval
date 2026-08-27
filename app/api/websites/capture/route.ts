import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase';
import { compressImageBuffer } from '@/lib/api/compress-image';
import { captureCallbackSecret } from '@/lib/website/capture';
import { normalizeUrl, assertSafeUrl, urlToSlug } from '@/lib/website/url';
import { refreshProjectCounts } from '@/lib/website/project-counts';

/**
 * Callback the capture worker POSTs to when a screenshot is done (or failed).
 *
 * This is not part of /api/v1 and does not use MARKUP_API_KEYS: the worker
 * authenticates with WEBSITE_CAPTURE_CALLBACK_SECRET, which is handed to it
 * per-job by lib/website/capture.ts.
 *
 * Accepts the image either as `image.url` (preferred — full-page screenshots
 * are large, and base64 inflates them by a third) or `image.base64`.
 */

export const runtime = 'nodejs';
export const maxDuration = 120;

const BUCKET = process.env.NEXT_PUBLIC_SUPABASE_BUCKET_NAME || 'screenshots';
const MAX_CAPTURE_BYTES = 60 * 1024 * 1024;

const BodySchema = z.object({
  jobId: z.string().uuid().optional(),
  threadId: z.string().uuid(),
  callbackSecret: z.string().optional(),
  pageTitle: z.string().max(500).optional(),
  error: z.string().max(2000).optional(),
  image: z
    .object({
      url: z.string().url().optional(),
      base64: z.string().min(1).optional(),
      contentType: z.string().max(100).optional(),
    })
    .optional(),
});

function secretMatches(provided: string | undefined, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function fail(status: number, message: string) {
  return NextResponse.json({ success: false, error: message }, { status });
}

/** Marks the capture failed so the workspace shows a retryable tile, not a blank. */
async function markFailed(threadId: string, jobId: string | undefined, message: string) {
  await supabaseAdmin
    .from('markup_threads')
    .update({ capture_status: 'failed', updated_at: new Date().toISOString() })
    .eq('id', threadId);

  if (jobId) {
    await supabaseAdmin
      .from('website_capture_jobs')
      .update({ status: 'failed', error: message.slice(0, 2000), finished_at: new Date().toISOString() })
      .eq('id', jobId);
  }
}

export async function POST(request: NextRequest) {
  const expected = captureCallbackSecret();
  if (!expected) {
    return fail(503, 'Capture callbacks are not enabled: WEBSITE_CAPTURE_CALLBACK_SECRET is not set.');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, 'Body must be JSON.');
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return fail(422, 'Invalid body: ' + parsed.error.issues[0]?.message);
  }

  const { jobId, threadId, pageTitle, error: workerError, image } = parsed.data;

  // Accept the secret from the header or the body — n8n and hosted screenshot
  // services differ in which they can set on a callback.
  const headerSecret = request.headers.get('x-capture-secret') ?? undefined;
  if (!secretMatches(parsed.data.callbackSecret ?? headerSecret, expected)) {
    return fail(401, 'Invalid capture callback secret.');
  }

  const { data: threadRow } = await supabaseAdmin
    .from('markup_threads')
    .select('id, project_id, source_url, viewport_label')
    .eq('id', threadId)
    .maybeSingle();

  const thread = threadRow as {
    id: string;
    project_id: string;
    source_url: string | null;
    viewport_label: string | null;
  } | null;

  if (!thread) return fail(404, 'No capture is waiting for that threadId.');

  // ── the worker reporting a failure ────────────────────────────────────────
  if (workerError) {
    await markFailed(threadId, jobId, workerError);
    return NextResponse.json({ success: true, status: 'failed' });
  }

  if (!image?.url && !image?.base64) {
    await markFailed(threadId, jobId, 'Capture callback carried neither an image nor an error.');
    return fail(422, 'Provide image.url, image.base64, or error.');
  }

  // ── fetch the bytes ───────────────────────────────────────────────────────
  let buffer: Buffer;
  let contentType = image.contentType || 'image/png';

  try {
    if (image.url) {
      // Guarded even though the caller holds the secret: a leaked secret should
      // not turn this endpoint into a way to read internal addresses.
      const src = normalizeUrl(image.url);
      assertSafeUrl(src);

      const res = await fetch(src.toString());
      if (!res.ok) throw new Error(`Fetching the capture returned ${res.status}`);

      const headerType = res.headers.get('content-type');
      if (headerType) contentType = headerType.split(';')[0].trim();

      const bytes = await res.arrayBuffer();
      if (bytes.byteLength > MAX_CAPTURE_BYTES) {
        throw new Error(`Capture is ${bytes.byteLength} bytes, over the ${MAX_CAPTURE_BYTES} limit`);
      }
      buffer = Buffer.from(bytes);
    } else {
      const cleaned = image.base64!.replace(/^data:[^;]+;base64,/, '');
      buffer = Buffer.from(cleaned, 'base64');
      if (buffer.length === 0) throw new Error('base64 payload decoded to zero bytes');
      if (buffer.length > MAX_CAPTURE_BYTES) {
        throw new Error(`Capture is ${buffer.length} bytes, over the ${MAX_CAPTURE_BYTES} limit`);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markFailed(threadId, jobId, message);
    return fail(400, message);
  }

  // ── compress, keeping the page readable ───────────────────────────────────
  // fit:'width' is essential here. A full-page capture is routinely 1440x12000;
  // the default 'inside' fit would scale it by height to ~307x2560 and the text
  // would be unreadable.
  const slug = thread.source_url ? urlToSlug(thread.source_url) : 'capture';
  const viewport = thread.viewport_label ?? 'desktop';
  const baseName = `${slug}-${viewport}-${Date.now()}.png`;

  const compressed = await compressImageBuffer(buffer, contentType, baseName, { fit: 'width' });
  const path = `${thread.project_id}/${compressed.fileName}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, new Blob([new Uint8Array(compressed.buffer)], { type: compressed.contentType }), {
      contentType: compressed.contentType,
      cacheControl: '31536000',
      upsert: true,
    });

  if (uploadError) {
    const message = `Storage upload failed: ${JSON.stringify(uploadError)}`;
    await markFailed(threadId, jobId, message);
    return fail(502, message);
  }

  const publicUrl = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

  const update: Record<string, unknown> = {
    image_path: publicUrl,
    image_filename: path,
    capture_status: 'ready',
    captured_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (pageTitle) update.page_title = pageTitle;

  const { error: threadError } = await supabaseAdmin
    .from('markup_threads')
    .update(update)
    .eq('id', threadId);

  if (threadError) {
    await supabaseAdmin.storage.from(BUCKET).remove([path]).catch(() => {});
    const message = `Could not attach the capture: ${threadError.message}`;
    await markFailed(threadId, jobId, message);
    return fail(500, message);
  }

  if (jobId) {
    await supabaseAdmin
      .from('website_capture_jobs')
      .update({ status: 'done', error: null, finished_at: new Date().toISOString() })
      .eq('id', jobId);
  }

  await refreshProjectCounts(thread.project_id);

  return NextResponse.json({
    success: true,
    status: 'ready',
    threadId,
    imageUrl: publicUrl,
    compressed: compressed.didCompress,
  });
}
