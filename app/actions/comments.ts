'use server';

import { createClient } from '@/lib/supabase/server';
import { getUser } from '@/lib/db/queries';
import { requireUser } from '@/lib/auth/require-user';
import {
  CreateCommentSchema,
  ResolveCommentSchema,
  DeleteCommentSchema,
  UpdateCommentPositionSchema,
} from '@/lib/validation/schemas';
import { revalidatePath } from 'next/cache';
import { nanoid } from 'nanoid';
import type { AttachmentRecord } from './storage';
import { db } from '@/lib/db/drizzle';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { sendNewCommentEmail } from '@/lib/email';

export interface DbComment {
  id: string;
  thread_id: string;
  user_name: string;
  content: string;
  pin_number: number;
  comment_index: number;
  display_number: number | null;
  x_position: number;
  y_position: number;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
  drawing_data?: any; // null = plain pin; non-null = drawing annotation
  attachments?: (AttachmentRecord & { signedUrl: string })[];
}

export interface CreateCommentResult {
  success: boolean;
  comment?: DbComment;
  error?: string;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.max(0, Math.min(100, value));
}

function normalizeDrawingPayload(drawingData: any): any {
  if (drawingData == null) return undefined;
  try {
    // Ensure the payload is JSON-serializable before inserting into JSONB.
    return JSON.parse(JSON.stringify(drawingData));
  } catch {
    return undefined;
  }
}

/** Get the currently logged-in user from the JWT session */
export async function getCurrentUser() {
  const user = await getUser();
  if (!user) return null;
  return { id: user.id, name: user.name || user.email, email: user.email, role: user.role };
}

/** Load all comments (pins) for a thread, ordered by creation time */
export async function getThreadComments(threadId: string): Promise<DbComment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('markup_comments')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error loading comments:', error);
    return [];
  }
  return (data as DbComment[]) || [];
}

/**
 * Create a new pin + comment on an image.
 * x and y are percentages (0–100) of the image dimensions.
 */
export async function createComment(
  threadId: string,
  content: string,
  userName: string,
  x: number,
  y: number,
  drawingData?: any,
): Promise<CreateCommentResult> {
  await requireUser();

  const safeX = clampPercent(x);
  const safeY = clampPercent(y);
  const safeDrawingData = normalizeDrawingPayload(drawingData);

  const parsed = CreateCommentSchema.safeParse({
    threadId,
    content,
    userName,
    x: safeX,
    y: safeY,
    drawingData: safeDrawingData,
  });
  if (!parsed.success) {
    return { success: false, error: 'Invalid input: ' + parsed.error.issues[0]?.message };
  }

  const supabase = await createClient();

  // Count existing comments in this thread to derive sequential numbers
  const { count } = await supabase
    .from('markup_comments')
    .select('*', { count: 'exact', head: true })
    .eq('thread_id', threadId);

  const nextNumber = (count ?? 0) + 1;

  // id is TEXT PRIMARY KEY with no DB default — must be supplied by app layer
  const newComment = {
    id: nanoid(),
    thread_id: threadId,
    user_name: userName,
    content,
    pin_number: nextNumber,
    comment_index: nextNumber,
    display_number: nextNumber,
    x_position: safeX,
    y_position: safeY,
    status: 'active',
    ...(safeDrawingData != null ? { drawing_data: safeDrawingData } : {}),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('markup_comments')
    .insert(newComment)
    .select()
    .single();

  if (error) {
    console.error('Error creating comment:', error);
    return { success: false, error: error.message };
  }

  // Fire-and-forget — never awaited, never blocks the response
  notifyAdminsOfNewComment(data.thread_id, data.content, data.user_name).catch(() => {});
  return { success: true, comment: data as DbComment };
}

async function notifyAdminsOfNewComment(threadId: string, content: string, userName: string) {
  const supabase = await createClient();
  const { data: thread } = await supabase
    .from('markup_threads')
    .select('project_id, markup_projects(project_name)')
    .eq('id', threadId)
    .single();
  if (!thread) return;

  const adminUsers = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.role, 'admin'));

  const emails = adminUsers.map(u => u.email);
  await sendNewCommentEmail({
    to: emails,
    commenterName: userName,
    commentPreview: content,
    projectName: (thread as any).markup_projects?.project_name ?? 'Unknown Project',
    projectId: thread.project_id,
  });
}

/** Toggle resolved / active status for a pin */
export async function resolveComment(
  commentId: string,
  projectId?: string
): Promise<{ success: boolean; error?: string }> {
  await requireUser();

  const parsed = ResolveCommentSchema.safeParse({ commentId });
  if (!parsed.success) {
    return { success: false, error: 'Invalid comment ID' };
  }

  const supabase = await createClient();

  // Fetch current status first
  const { data: existing, error: fetchErr } = await supabase
    .from('markup_comments')
    .select('status')
    .eq('id', commentId)
    .single();

  if (fetchErr || !existing) {
    return { success: false, error: 'Comment not found' };
  }

  const newStatus = existing.status === 'resolved' ? 'active' : 'resolved';

  const { error } = await supabase
    .from('markup_comments')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', commentId);

  if (error) {
    console.error('Error resolving comment:', error);
    return { success: false, error: error.message };
  }

  if (projectId) revalidatePath(`/projects/${projectId}`);
  return { success: true };
}

/** Update pin coordinates after user drags a comment marker. */
export async function updateCommentPosition(
  commentId: string,
  x: number,
  y: number,
  projectId?: string,
): Promise<{ success: boolean; error?: string }> {
  await requireUser();

  const parsed = UpdateCommentPositionSchema.safeParse({
    commentId,
    x: clampPercent(x),
    y: clampPercent(y),
  });

  if (!parsed.success) {
    return { success: false, error: 'Invalid pin coordinates' };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from('markup_comments')
    .update({
      x_position: parsed.data.x,
      y_position: parsed.data.y,
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.commentId);

  if (error) {
    console.error('Error updating comment position:', error);
    return { success: false, error: error.message };
  }

  if (projectId) revalidatePath(`/projects/${projectId}`);
  return { success: true };
}

/** Delete a comment */
export async function deleteComment(
  commentId: string
): Promise<{ success: boolean; error?: string }> {
  await requireUser();

  const parsed = DeleteCommentSchema.safeParse({ commentId });
  if (!parsed.success) {
    return { success: false, error: 'Invalid comment ID' };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from('markup_comments')
    .delete()
    .eq('id', commentId);

  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true };
}
