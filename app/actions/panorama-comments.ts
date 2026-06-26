'use server';

import { createClient } from '@/lib/supabase/server';
import { getUser } from '@/lib/db/queries';
import { requireUser } from '@/lib/auth/require-user';
import {
  CreatePanoramaCommentSchema,
  CreatePanoramaReplySchema,
  ResolveCommentSchema,
  DeleteCommentSchema,
  UpdateCommentContentSchema,
  UpdatePanoramaCommentPositionSchema,
} from '@/lib/validation/schemas';
import { revalidatePath } from 'next/cache';
import { nanoid } from 'nanoid';

export interface PanoramaComment {
  id: string;
  panorama_image_id: string;
  user_name: string;
  content: string;
  pin_number: number;
  display_number: number | null;
  pitch: number;
  yaw: number;
  status: string | null;
  type?: string | null;
  parent_comment_id?: string | null;
  created_at: string | null;
  updated_at: string | null;
  reply_count?: number;
}

export interface CreatePanoramaCommentResult {
  success: boolean;
  comment?: PanoramaComment;
  error?: string;
}

function clampPitch(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(-90, Math.min(90, v));
}

function clampYaw(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(-180, Math.min(180, v));
}

async function getNextPinNumber(
  supabase: Awaited<ReturnType<typeof createClient>>,
  imageId: string,
): Promise<number> {
  const { count } = await supabase
    .from('panorama_comments')
    .select('*', { count: 'exact', head: true })
    .eq('panorama_image_id', imageId)
    .neq('type', 'reply');
  return (count ?? 0) + 1;
}

/** Load all pin comments for a set of panorama images, keyed by image id.
 *  Replies (type='reply') are excluded from the pin list but counted. */
export async function getPanoramaCommentsForImages(
  imageIds: string[],
): Promise<Record<string, PanoramaComment[]>> {
  const byImage: Record<string, PanoramaComment[]> = {};
  for (const id of imageIds) byImage[id] = [];
  if (!imageIds.length) return byImage;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('panorama_comments')
    .select('*')
    .in('panorama_image_id', imageIds)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error loading panorama comments:', error);
    return byImage;
  }

  const allRows = (data as PanoramaComment[]) || [];
  const replyCountByParent = new Map<string, number>();
  for (const row of allRows) {
    if (row.type !== 'reply' || !row.parent_comment_id) continue;
    replyCountByParent.set(row.parent_comment_id, (replyCountByParent.get(row.parent_comment_id) ?? 0) + 1);
  }

  for (const row of allRows) {
    if (row.type === 'reply' || row.parent_comment_id) continue;
    (byImage[row.panorama_image_id] ??= []).push({
      ...row,
      reply_count: replyCountByParent.get(row.id) ?? 0,
    });
  }
  return byImage;
}

/** Replies for a single panorama comment, oldest first. */
export async function getPanoramaReplies(commentId: string): Promise<PanoramaComment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('panorama_comments')
    .select('*')
    .eq('parent_comment_id', commentId)
    .eq('type', 'reply')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error loading panorama replies:', error);
    return [];
  }
  return (data as PanoramaComment[]) || [];
}

/** Create a hotspot comment on a panorama image at the given pitch/yaw. */
export async function createPanoramaComment(
  imageId: string,
  content: string,
  userName: string,
  pitch: number,
  yaw: number,
  projectId?: string,
): Promise<CreatePanoramaCommentResult> {
  await requireUser();

  const safePitch = clampPitch(pitch);
  const safeYaw = clampYaw(yaw);

  const parsed = CreatePanoramaCommentSchema.safeParse({
    imageId,
    content: content.trim(),
    userName,
    pitch: safePitch,
    yaw: safeYaw,
  });
  if (!parsed.success) {
    return { success: false, error: 'Invalid input: ' + parsed.error.issues[0]?.message };
  }

  const supabase = await createClient();
  const nextNumber = await getNextPinNumber(supabase, imageId);

  const { data, error } = await supabase
    .from('panorama_comments')
    .insert({
      id: nanoid(),
      panorama_image_id: imageId,
      user_name: userName,
      content: content.trim(),
      pin_number: nextNumber,
      display_number: nextNumber,
      pitch: safePitch,
      yaw: safeYaw,
      status: 'active',
      type: 'comment',
      parent_comment_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating panorama comment:', error);
    return { success: false, error: error.message };
  }

  if (projectId) revalidatePath(`/panoramas/${projectId}`);
  return { success: true, comment: data as PanoramaComment };
}

/** Add a reply to a panorama comment. */
export async function createPanoramaReply(
  parentCommentId: string,
  content: string,
  userName: string,
  projectId?: string,
): Promise<CreatePanoramaCommentResult> {
  await requireUser();

  const parsed = CreatePanoramaReplySchema.safeParse({
    parentCommentId,
    content: content.trim(),
    userName,
  });
  if (!parsed.success) {
    return { success: false, error: 'Invalid input: ' + parsed.error.issues[0]?.message };
  }

  const supabase = await createClient();

  // Replies live on the same image as their parent.
  const { data: parent, error: parentErr } = await supabase
    .from('panorama_comments')
    .select('panorama_image_id')
    .eq('id', parentCommentId)
    .single();
  if (parentErr || !parent) {
    return { success: false, error: 'Parent comment not found' };
  }

  const { data, error } = await supabase
    .from('panorama_comments')
    .insert({
      id: nanoid(),
      panorama_image_id: (parent as any).panorama_image_id,
      user_name: userName,
      content: content.trim(),
      pin_number: 0,
      display_number: null,
      pitch: 0,
      yaw: 0,
      status: 'active',
      type: 'reply',
      parent_comment_id: parentCommentId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating panorama reply:', error);
    return { success: false, error: error.message };
  }

  if (projectId) revalidatePath(`/panoramas/${projectId}`);
  return { success: true, comment: data as PanoramaComment };
}

/** Toggle resolved / active status for a panorama hotspot. */
export async function resolvePanoramaComment(
  commentId: string,
  projectId?: string,
): Promise<{ success: boolean; error?: string }> {
  await requireUser();

  const parsed = ResolveCommentSchema.safeParse({ commentId });
  if (!parsed.success) return { success: false, error: 'Invalid comment ID' };

  const supabase = await createClient();
  const { data: existing, error: fetchErr } = await supabase
    .from('panorama_comments')
    .select('status')
    .eq('id', commentId)
    .single();

  if (fetchErr || !existing) return { success: false, error: 'Comment not found' };

  const newStatus = existing.status === 'resolved' ? 'active' : 'resolved';
  const { error } = await supabase
    .from('panorama_comments')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', commentId);

  if (error) {
    console.error('Error resolving panorama comment:', error);
    return { success: false, error: error.message };
  }

  if (projectId) revalidatePath(`/panoramas/${projectId}`);
  return { success: true };
}

/** Move a hotspot to a new pitch/yaw. */
export async function updatePanoramaCommentPosition(
  commentId: string,
  pitch: number,
  yaw: number,
  projectId?: string,
): Promise<{ success: boolean; error?: string }> {
  await requireUser();

  const parsed = UpdatePanoramaCommentPositionSchema.safeParse({
    commentId,
    pitch: clampPitch(pitch),
    yaw: clampYaw(yaw),
  });
  if (!parsed.success) return { success: false, error: 'Invalid hotspot coordinates' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('panorama_comments')
    .update({ pitch: parsed.data.pitch, yaw: parsed.data.yaw, updated_at: new Date().toISOString() })
    .eq('id', parsed.data.commentId);

  if (error) {
    console.error('Error updating panorama comment position:', error);
    return { success: false, error: error.message };
  }

  if (projectId) revalidatePath(`/panoramas/${projectId}`);
  return { success: true };
}

/** Edit a panorama comment's text. Author or admin only. */
export async function updatePanoramaComment(
  commentId: string,
  content: string,
  projectId?: string,
): Promise<{ success: boolean; comment?: PanoramaComment; error?: string }> {
  const user = await requireUser();

  const parsed = UpdateCommentContentSchema.safeParse({ commentId, content: content.trim() });
  if (!parsed.success) {
    return { success: false, error: 'Invalid input: ' + parsed.error.issues[0]?.message };
  }

  const supabase = await createClient();
  const { data: existing, error: fetchErr } = await supabase
    .from('panorama_comments')
    .select('user_name')
    .eq('id', parsed.data.commentId)
    .single();

  if (fetchErr || !existing) return { success: false, error: 'Comment not found' };

  const authorName = existing.user_name?.trim().toLowerCase() ?? '';
  const currentName = (user.name || user.email || '').trim().toLowerCase();
  if (user.role !== 'admin' && authorName !== currentName) {
    return { success: false, error: 'You can only edit your own comments' };
  }

  const { data, error } = await supabase
    .from('panorama_comments')
    .update({ content: parsed.data.content, updated_at: new Date().toISOString() })
    .eq('id', parsed.data.commentId)
    .select()
    .single();

  if (error) {
    console.error('Error updating panorama comment:', error);
    return { success: false, error: error.message };
  }

  if (projectId) revalidatePath(`/panoramas/${projectId}`);
  return { success: true, comment: data as PanoramaComment };
}

/** Delete a panorama comment (and its replies via FK cascade). Author/admin/pm only. */
export async function deletePanoramaComment(
  commentId: string,
  projectId?: string,
): Promise<{ success: boolean; error?: string }> {
  const user = await requireUser();

  const parsed = DeleteCommentSchema.safeParse({ commentId });
  if (!parsed.success) return { success: false, error: 'Invalid comment ID' };

  const supabase = await createClient();
  const { data: existing, error: fetchErr } = await supabase
    .from('panorama_comments')
    .select('user_name')
    .eq('id', parsed.data.commentId)
    .single();

  if (fetchErr || !existing) return { success: false, error: 'Comment not found' };

  const authorName = existing.user_name?.trim().toLowerCase() ?? '';
  const currentName = (user.name || user.email || '').trim().toLowerCase();
  const elevated = user.role === 'admin' || user.role === 'pm';
  if (!elevated && authorName !== currentName) {
    return { success: false, error: 'You can only delete your own comments' };
  }

  const { error } = await supabase
    .from('panorama_comments')
    .delete()
    .eq('id', parsed.data.commentId);

  if (error) return { success: false, error: error.message };

  if (projectId) revalidatePath(`/panoramas/${projectId}`);
  return { success: true };
}
