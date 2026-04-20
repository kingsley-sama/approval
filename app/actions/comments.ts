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
  type?: 'comment' | 'reply' | 'drawing' | string | null;
  parent_comment_id?: string | null;
  drawing_id?: string | null;
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

function isMissingColumnError(error: any, expectedColumns: string[]): boolean {
  const message = `${error?.message ?? ''} ${error?.details ?? ''} ${error?.hint ?? ''}`.toLowerCase();
  if (!message) return false;

  const hasColumnHint =
    message.includes('column') ||
    message.includes('schema cache') ||
    message.includes('could not find');

  if (!hasColumnHint) return false;
  return expectedColumns.some((column) => message.includes(column.toLowerCase()));
}

async function hydrateDrawingDataForComments(
  comments: DbComment[],
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<DbComment[]> {
  const drawingIds = Array.from(new Set(
    comments
      .map((c) => c.drawing_id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0),
  ));

  if (drawingIds.length === 0) return comments;

  const { data: drawings, error } = await supabase
    .from('markup_drawings')
    .select('id, drawing_data')
    .in('id', drawingIds);

  if (error || !drawings) {
    console.error('Error hydrating drawing data for comments:', error);
    return comments;
  }

  const drawingById = new Map<string, any>(
    drawings.map((row: any) => [row.id, row.drawing_data]),
  );

  return comments.map((comment) => {
    if (comment.drawing_data != null) return comment;
    if (!comment.drawing_id) return comment;
    const drawingData = drawingById.get(comment.drawing_id);
    if (drawingData == null) return comment;
    return { ...comment, drawing_data: drawingData };
  });
}

async function getNextPinNumber(
  supabase: Awaited<ReturnType<typeof createClient>>,
  threadId: string,
): Promise<number> {
  const typedCount = await supabase
    .from('markup_comments')
    .select('*', { count: 'exact', head: true })
    .eq('thread_id', threadId)
    .neq('type' as any, 'reply');

  if (!typedCount.error) {
    return (typedCount.count ?? 0) + 1;
  }

  const legacyCount = await supabase
    .from('markup_comments')
    .select('*', { count: 'exact', head: true })
    .eq('thread_id', threadId);

  return (legacyCount.count ?? 0) + 1;
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

  const rows = ((data as DbComment[]) || []).filter((comment) => {
    // Replies are now stored in markup_comments when `type='reply'`.
    // Exclude them from pin lists to avoid rendering them as annotation markers.
    if (comment.type === 'reply') return false;
    if (comment.parent_comment_id) return false;
    return true;
  });

  return hydrateDrawingDataForComments(rows, supabase);
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
    content: content.trim(),
    userName,
    x: safeX,
    y: safeY,
    drawingData: safeDrawingData,
  });
  if (!parsed.success) {
    return { success: false, error: 'Invalid input: ' + parsed.error.issues[0]?.message };
  }

  const supabase = await createClient();

  const nextNumber = await getNextPinNumber(supabase, threadId);

  let drawingId: string | null = null;
  if (safeDrawingData != null) {
    const { data: drawingRow, error: drawingError } = await supabase
      .from('markup_drawings')
      .insert({
        thread_id: threadId,
        drawing_data: safeDrawingData,
        created_by: userName,
        metadata: { source: 'comment' },
      })
      .select('id')
      .single();

    if (drawingError) {
      console.error('Error creating drawing row for comment:', drawingError);
      return { success: false, error: drawingError.message };
    }

    drawingId = drawingRow.id;
  }

  // id is TEXT PRIMARY KEY with no DB default — must be supplied by app layer
  const baseComment = {
    id: nanoid(),
    thread_id: threadId,
    user_name: userName,
    content: content.trim(),
    pin_number: nextNumber,
    comment_index: nextNumber,
    display_number: nextNumber,
    x_position: safeX,
    y_position: safeY,
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Preferred schema: comments reference markup_drawings via drawing_id and use type.
  const typedPayload = {
    ...baseComment,
    type: drawingId ? 'drawing' : 'comment',
    drawing_id: drawingId,
    parent_comment_id: null,
  };

  const typedInsert = await supabase
    .from('markup_comments')
    .insert(typedPayload as any)
    .select()
    .single();

  if (!typedInsert.error) {
    const saved = typedInsert.data as DbComment;
    if (safeDrawingData != null && saved.drawing_data == null) {
      saved.drawing_data = safeDrawingData;
    }

    // Fire-and-forget — never awaited, never blocks the response
    notifyAdminsOfNewComment(saved.thread_id, saved.content, saved.user_name).catch(() => {});
    return { success: true, comment: saved };
  }

  // Legacy fallback: older schemas still persist drawing JSON directly on comments.
  const canFallbackToLegacy = isMissingColumnError(typedInsert.error, [
    'type',
    'drawing_id',
    'parent_comment_id',
  ]);

  if (!canFallbackToLegacy) {
    console.error('Error creating typed comment:', typedInsert.error);
    return { success: false, error: typedInsert.error.message };
  }

  const legacyPayload = {
    ...baseComment,
    ...(safeDrawingData != null ? { drawing_data: safeDrawingData } : {}),
  };

  const legacyInsert = await supabase
    .from('markup_comments')
    .insert(legacyPayload as any)
    .select()
    .single();

  if (drawingId) {
    // Cleanup orphan drawing row in legacy mode where comments cannot store drawing_id.
    await supabase.from('markup_drawings').delete().eq('id', drawingId);
  }

  if (legacyInsert.error) {
    console.error('Error creating legacy comment:', legacyInsert.error);
    return { success: false, error: legacyInsert.error.message };
  }

  const data = legacyInsert.data as DbComment;
  // Fire-and-forget — never awaited, never blocks the response
  notifyAdminsOfNewComment(data.thread_id, data.content, data.user_name).catch(() => {});
  return { success: true, comment: data };
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
