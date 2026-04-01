'use server';

import { supabaseAdmin } from '@/lib/supabase';
import { requireUser } from '@/lib/auth/require-user';
import { SignedUploadUrlSchema, RegisterUploadSchema } from '@/lib/validation/schemas';
import { createThread } from './threads';
import { nanoid } from 'nanoid';

// ─── constants ────────────────────────────────────────────────────────────────

const BUCKET = process.env.NEXT_PUBLIC_SUPABASE_BUCKET_NAME || 'screenshots';

const ALLOWED_ATTACHMENT_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf',
]);
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // 20 MB

// ─── path helpers ─────────────────────────────────────────────────────────────

/**
 * Render images are scoped to the project they were uploaded to.
 * Duplicated projects copy the thread row (same image_path URL), so duplicates
 * automatically reference the original project's render folder — no file
 * copying needed.
 */
function renderStoragePath(projectId: string, fileName: string): string {
  const timestamp = Date.now();
  const sanitized = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `renders/${projectId}/${timestamp}-${sanitized}`;
}

/**
 * Attachments are scoped to the project they belong to.
 * A UUID prefix guarantees uniqueness even for same-named files.
 */
function attachmentStoragePath(projectId: string, fileName: string): string {
  const uid = nanoid(10);
  const sanitized = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `attachments/${projectId}/${uid}-${sanitized}`;
}

// ─── types ────────────────────────────────────────────────────────────────────

export interface SignedUploadUrlResult {
  success: boolean;
  signedUrl?: string;
  storagePath?: string;
  error?: string;
}

export interface RegisterThreadResult {
  success: boolean;
  publicUrl?: string;
  error?: string;
}

export interface AttachmentUploadUrlResult {
  success: boolean;
  signedUrl?: string;
  storagePath?: string;
  error?: string;
}

export interface RegisterAttachmentResult {
  success: boolean;
  attachmentId?: string;
  error?: string;
}

export interface AttachmentRecord {
  id: string;
  comment_id: string;
  project_id: string;
  storage_path: string;
  original_filename: string;
  mime_type: string;
  file_size_bytes: number;
  created_at: string;
}

// ─── render image upload (two-step presigned flow) ────────────────────────────

/**
 * Step 1 — server issues a presigned upload URL for a render image.
 * The file is uploaded directly from the browser to Supabase Storage;
 * no file data passes through Next.js.
 */
export async function getSignedUploadUrl(
  projectId: string,
  fileName: string,
): Promise<SignedUploadUrlResult> {
  try {
    await requireUser();

    const parsed = SignedUploadUrlSchema.safeParse({ fileName });
    if (!parsed.success) {
      return { success: false, error: 'Invalid file name' };
    }

    const storagePath = renderStoragePath(projectId, fileName);

    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUploadUrl(storagePath);

    if (error || !data?.signedUrl) {
      return { success: false, error: error?.message || 'Could not create signed URL' };
    }

    return { success: true, signedUrl: data.signedUrl, storagePath };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to generate upload URL' };
  }
}

/**
 * Step 2 — after the client uploads the render, register it as a thread.
 */
export async function registerUploadedFile(
  projectId: string,
  fileName: string,
  storagePath: string,
): Promise<RegisterThreadResult> {
  try {
    await requireUser();

    const parsed = RegisterUploadSchema.safeParse({ projectId, fileName, storagePath });
    if (!parsed.success) {
      return { success: false, error: 'Invalid input: ' + parsed.error.issues[0]?.message };
    }

    const publicUrl = supabaseAdmin.storage
      .from(BUCKET)
      .getPublicUrl(storagePath).data.publicUrl;

    const result = await createThread(projectId, {
      path: publicUrl,
      name: fileName,
      filename: storagePath,
    });

    if (!result.success) {
      return { success: false, error: result.error || 'Thread creation failed' };
    }

    return { success: true, publicUrl };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to register file' };
  }
}

// ─── comment attachment upload (two-step presigned flow) ──────────────────────

/**
 * Step 1 — server validates the file metadata and issues a presigned upload URL
 * for a comment attachment.
 */
export async function getAttachmentUploadUrl(
  projectId: string,
  fileName: string,
  mimeType: string,
  fileSizeBytes: number,
): Promise<AttachmentUploadUrlResult> {
  try {
    await requireUser();

    if (!projectId || !fileName) {
      return { success: false, error: 'Missing projectId or fileName' };
    }
    if (!ALLOWED_ATTACHMENT_TYPES.has(mimeType)) {
      return { success: false, error: `File type not allowed: ${mimeType}` };
    }
    if (fileSizeBytes > MAX_ATTACHMENT_BYTES) {
      return { success: false, error: 'File exceeds the 20 MB limit' };
    }

    const storagePath = attachmentStoragePath(projectId, fileName);

    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUploadUrl(storagePath);

    if (error || !data?.signedUrl) {
      return { success: false, error: error?.message || 'Could not create signed URL' };
    }

    return { success: true, signedUrl: data.signedUrl, storagePath };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to generate attachment upload URL' };
  }
}

/**
 * Step 2 — after the client uploads the file, register it in comment_attachments.
 */
export async function registerAttachment(
  commentId: string,
  projectId: string,
  storagePath: string,
  originalFilename: string,
  mimeType: string,
  fileSizeBytes: number,
): Promise<RegisterAttachmentResult> {
  try {
    await requireUser();

    if (!commentId || !projectId || !storagePath) {
      return { success: false, error: 'Missing required fields' };
    }

    const { data, error } = await (supabaseAdmin as any)
      .from('comment_attachments')
      .insert({
        comment_id: commentId,
        project_id: projectId,
        storage_path: storagePath,
        original_filename: originalFilename,
        mime_type: mimeType,
        file_size_bytes: fileSizeBytes,
      })
      .select('id')
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, attachmentId: data.id };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to register attachment' };
  }
}

/**
 * Returns a short-lived signed URL for viewing a private attachment.
 * Expires in 1 hour. Never expose raw storage paths to the client.
 */
export async function getAttachmentSignedUrl(
  storagePath: string,
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    await requireUser();

    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 60 * 60); // 1 hour

    if (error || !data?.signedUrl) {
      return { success: false, error: error?.message || 'Could not create signed URL' };
    }

    return { success: true, url: data.signedUrl };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to create signed URL' };
  }
}

/**
 * Fetches all attachments for a comment, each with a fresh signed URL.
 */
export async function getCommentAttachments(
  commentId: string,
): Promise<{ success: boolean; attachments?: (AttachmentRecord & { signedUrl: string })[]; error?: string }> {
  try {
    await requireUser();

    const { data, error } = await (supabaseAdmin as any)
      .from('comment_attachments')
      .select('*')
      .eq('comment_id', commentId)
      .order('created_at', { ascending: true });

    if (error) return { success: false, error: error.message };

    const attachments = await Promise.all(
      (data as AttachmentRecord[]).map(async (a) => {
        const { url } = await getAttachmentSignedUrl(a.storage_path);
        return { ...a, signedUrl: url || '' };
      }),
    );

    return { success: true, attachments };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Deletes an attachment from storage and the database.
 */
export async function deleteAttachment(
  attachmentId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireUser();

    const { data: existing, error: fetchErr } = await (supabaseAdmin as any)
      .from('comment_attachments')
      .select('storage_path')
      .eq('id', attachmentId)
      .single();

    if (fetchErr || !existing) {
      return { success: false, error: 'Attachment not found' };
    }

    // Delete from storage
    await supabaseAdmin.storage.from(BUCKET).remove([existing.storage_path]);

    // Delete DB row
    const { error } = await (supabaseAdmin as any)
      .from('comment_attachments')
      .delete()
      .eq('id', attachmentId);

    if (error) return { success: false, error: error.message };

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
