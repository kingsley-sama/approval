/**
 * API Route: Share Comment Attachments
 * Lets reviewers (guests using a share link) attach files to — and remove files
 * from — their own comments and replies, mirroring the authenticated attachment
 * flow in `app/actions/storage.ts` but gated by the share token instead of a
 * session.
 *
 * Author identity is established by matching the supplied `userName` against the
 * comment's stored `user_name` (case-insensitive, trimmed) — a guest may only
 * touch attachments on comments they authored. The project a file is scoped to
 * is always derived server-side from the comment → thread → project chain, so
 * the client never dictates the storage location.
 *
 * POST  { step: 'sign' }     → validate + issue a presigned upload URL
 * POST  { step: 'register' } → record the uploaded file in comment_attachments
 * DELETE                     → remove an attachment (storage + DB row)
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateShareToken, type ShareLink } from '@/app/actions/share-links';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { checkRateLimit } from '@/lib/rate-limit';
import { nanoid } from 'nanoid';
import { z } from 'zod';

const BUCKET = process.env.NEXT_PUBLIC_SUPABASE_BUCKET_NAME || 'screenshots';

const ALLOWED_ATTACHMENT_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf',
]);
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // 20 MB

function attachmentStoragePath(projectId: string, fileName: string): string {
  const uid = nanoid(10);
  const sanitized = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `attachments/${projectId}/${uid}-${sanitized}`;
}

/**
 * Resolves the comment (or reply) the guest is acting on and the project it
 * belongs to. Handles both the typed schema (replies live in markup_comments)
 * and the legacy `comment_replies` table.
 */
async function resolveCommentContext(commentId: string): Promise<
  | { ok: true; userName: string; threadId: string; projectId: string }
  | { ok: false; status: number; error: string }
> {
  // Primary lookup: markup_comments (covers top-level comments and typed replies)
  const { data: comment } = await supabase
    .from('markup_comments')
    .select('user_name, thread_id')
    .eq('id', commentId)
    .single();

  let userName: string | null = null;
  let threadId: string | null = null;

  if (comment) {
    userName = (comment as any).user_name ?? null;
    threadId = (comment as any).thread_id ?? null;
  } else {
    // Legacy fallback: comment_replies → parent comment → thread
    const { data: legacyReply } = await supabase
      .from('comment_replies')
      .select('user_name, comment_id')
      .eq('id', commentId)
      .single();

    if (!legacyReply) {
      return { ok: false, status: 404, error: 'Comment not found' };
    }

    const { data: parent } = await supabase
      .from('markup_comments')
      .select('thread_id')
      .eq('id', (legacyReply as any).comment_id)
      .single();

    userName = (legacyReply as any).user_name ?? null;
    threadId = (parent as any)?.thread_id ?? null;
  }

  if (!threadId) {
    return { ok: false, status: 404, error: 'Comment not found' };
  }

  const { data: thread } = await supabase
    .from('markup_threads')
    .select('id, project_id')
    .eq('id', threadId)
    .single();

  if (!thread) {
    return { ok: false, status: 404, error: 'Thread not found' };
  }

  return {
    ok: true,
    userName: userName ?? '',
    threadId,
    projectId: (thread as any).project_id,
  };
}

/** Checks that the share token grants comment access to the comment's resource. */
function hasResourceAccess(shareLink: ShareLink, threadId: string, projectId: string): boolean {
  return (
    (shareLink.resourceType === 'thread' && shareLink.resourceId === threadId) ||
    (shareLink.resourceType === 'project' && shareLink.resourceId === projectId)
  );
}

const SignSchema = z.object({
  step: z.literal('sign'),
  token: z.string().min(1),
  commentId: z.string().min(1),
  userName: z.string().min(1).max(150),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  fileSizeBytes: z.coerce.number().nonnegative(),
});

const RegisterSchema = z.object({
  step: z.literal('register'),
  token: z.string().min(1),
  commentId: z.string().min(1),
  userName: z.string().min(1).max(150),
  storagePath: z.string().min(1),
  originalFilename: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  fileSizeBytes: z.coerce.number().nonnegative(),
});

const PostSchema = z.discriminatedUnion('step', [SignSchema, RegisterSchema]);

const DeleteSchema = z.object({
  token: z.string().min(1),
  attachmentId: z.string().min(1),
  userName: z.string().min(1).max(150),
});

function ownsComment(commentUserName: string, requesterUserName: string): boolean {
  const author = commentUserName.trim().toLowerCase();
  const requester = requesterUserName.trim().toLowerCase();
  return author.length > 0 && author === requester;
}

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (!checkRateLimit(`share-attachment:${ip}`, 60_000, 30)) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please try again later.' },
        { status: 429 },
      );
    }

    const body = await request.json();
    const parsed = PostSchema.parse(body);

    const { success, shareLink, error } = await validateShareToken(parsed.token);
    if (!success || !shareLink) {
      return NextResponse.json(
        { success: false, error: error || 'Invalid share link' },
        { status: 403 },
      );
    }
    if (shareLink.permissions === 'view') {
      return NextResponse.json(
        { success: false, error: 'You do not have permission to comment' },
        { status: 403 },
      );
    }

    if (!ALLOWED_ATTACHMENT_TYPES.has(parsed.mimeType)) {
      return NextResponse.json(
        { success: false, error: `File type not allowed: ${parsed.mimeType}` },
        { status: 400 },
      );
    }
    if (parsed.fileSizeBytes > MAX_ATTACHMENT_BYTES) {
      return NextResponse.json(
        { success: false, error: 'File exceeds the 20 MB limit' },
        { status: 400 },
      );
    }

    const ctx = await resolveCommentContext(parsed.commentId);
    if (!ctx.ok) {
      return NextResponse.json({ success: false, error: ctx.error }, { status: ctx.status });
    }
    if (!hasResourceAccess(shareLink, ctx.threadId, ctx.projectId)) {
      return NextResponse.json(
        { success: false, error: 'Access denied to this resource' },
        { status: 403 },
      );
    }
    if (!ownsComment(ctx.userName, parsed.userName)) {
      return NextResponse.json(
        { success: false, error: 'You can only attach files to your own comments' },
        { status: 403 },
      );
    }

    if (parsed.step === 'sign') {
      const storagePath = attachmentStoragePath(ctx.projectId, parsed.fileName);
      const { data, error: signErr } = await supabase.storage
        .from(BUCKET)
        .createSignedUploadUrl(storagePath);

      if (signErr || !data?.signedUrl) {
        return NextResponse.json(
          { success: false, error: signErr?.message || 'Could not create signed URL' },
          { status: 500 },
        );
      }
      return NextResponse.json({ success: true, signedUrl: data.signedUrl, storagePath });
    }

    // step === 'register'
    const { data: inserted, error: insertErr } = await supabase
      .from('comment_attachments')
      .insert({
        comment_id: parsed.commentId,
        project_id: ctx.projectId,
        storage_path: parsed.storagePath,
        original_filename: parsed.originalFilename,
        mime_type: parsed.mimeType,
        file_size_bytes: parsed.fileSizeBytes,
      })
      .select('*')
      .single();

    if (insertErr || !inserted) {
      return NextResponse.json(
        { success: false, error: insertErr?.message || 'Failed to register attachment' },
        { status: 500 },
      );
    }

    const { data: urlData } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(parsed.storagePath, 3600);

    return NextResponse.json({
      success: true,
      attachment: { ...inserted, signedUrl: urlData?.signedUrl ?? '' },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'Invalid input data' }, { status: 400 });
    }
    console.error('Share attachment error:', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (!checkRateLimit(`share-attachment-del:${ip}`, 60_000, 30)) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please try again later.' },
        { status: 429 },
      );
    }

    const body = await request.json();
    const parsed = DeleteSchema.parse(body);

    const { success, shareLink, error } = await validateShareToken(parsed.token);
    if (!success || !shareLink) {
      return NextResponse.json(
        { success: false, error: error || 'Invalid share link' },
        { status: 403 },
      );
    }
    if (shareLink.permissions === 'view') {
      return NextResponse.json(
        { success: false, error: 'You do not have permission to comment' },
        { status: 403 },
      );
    }

    const { data: attachment } = await supabase
      .from('comment_attachments')
      .select('storage_path, comment_id')
      .eq('id', parsed.attachmentId)
      .single();

    if (!attachment) {
      return NextResponse.json({ success: false, error: 'Attachment not found' }, { status: 404 });
    }

    const ctx = await resolveCommentContext((attachment as any).comment_id);
    if (!ctx.ok) {
      return NextResponse.json({ success: false, error: ctx.error }, { status: ctx.status });
    }
    if (!hasResourceAccess(shareLink, ctx.threadId, ctx.projectId)) {
      return NextResponse.json(
        { success: false, error: 'Access denied to this resource' },
        { status: 403 },
      );
    }
    if (!ownsComment(ctx.userName, parsed.userName)) {
      return NextResponse.json(
        { success: false, error: 'You can only remove attachments from your own comments' },
        { status: 403 },
      );
    }

    await supabase.storage.from(BUCKET).remove([(attachment as any).storage_path]);

    const { error: delErr } = await supabase
      .from('comment_attachments')
      .delete()
      .eq('id', parsed.attachmentId);

    if (delErr) {
      return NextResponse.json({ success: false, error: delErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'Invalid input data' }, { status: 400 });
    }
    console.error('Share attachment delete error:', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
