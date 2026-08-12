'use server';

import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/require-user';
import { nanoid } from 'nanoid';
import { getAttachmentsForComments, type AttachmentRecord } from './storage';

export interface CommentReply {
  id: string;
  comment_id: string;
  user_name: string;
  content: string;
  created_at: string;
  attachments?: (AttachmentRecord & { signedUrl: string })[];
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

function mapCommentRowToReply(row: any): CommentReply {
  return {
    id: row.id,
    comment_id: row.parent_comment_id,
    user_name: row.user_name,
    content: row.content,
    created_at: row.created_at ?? new Date().toISOString(),
  };
}

export async function getRepliesForComment(commentId: string): Promise<CommentReply[]> {
  const supabase = await createClient();

  const typedResult = await supabase
    .from('markup_comments')
    .select('id, parent_comment_id, user_name, content, created_at, type')
    .eq('parent_comment_id', commentId)
    .eq('type', 'reply')
    .order('created_at', { ascending: true });

  let replies: CommentReply[];
  if (!typedResult.error) {
    replies = (typedResult.data || []).map(mapCommentRowToReply);
  } else {
    const { data, error } = await supabase
      .from('comment_replies')
      .select('*')
      .eq('comment_id', commentId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error loading replies:', typedResult.error, error);
      return [];
    }
    replies = (data as CommentReply[]) || [];
  }

  if (replies.length === 0) return replies;

  const attachmentsByReply = await getAttachmentsForComments(replies.map(r => r.id));
  return replies.map(r => ({ ...r, attachments: attachmentsByReply[r.id] ?? [] }));
}

/**
 * Locate a reply in whichever table it lives in.
 * Replies are stored in `markup_comments` with `type='reply'`; the legacy
 * `comment_replies` table is still read for rows that predate that migration.
 */
async function findReply(
  supabase: Awaited<ReturnType<typeof createClient>>,
  replyId: string,
): Promise<{ table: 'markup_comments' | 'comment_replies'; userName: string } | null> {
  const typed = await supabase
    .from('markup_comments')
    .select('id, user_name, type, parent_comment_id')
    .eq('id', replyId)
    .maybeSingle();

  if (!typed.error && typed.data) {
    const row = typed.data as any;
    // Guard against a comment id being passed where a reply id is expected —
    // editing/deleting must never fall through to the parent comment.
    if (row.type === 'reply' || row.parent_comment_id) {
      return { table: 'markup_comments', userName: row.user_name ?? '' };
    }
    return null;
  }

  const legacy = await supabase
    .from('comment_replies')
    .select('id, user_name')
    .eq('id', replyId)
    .maybeSingle();

  if (!legacy.error && legacy.data) {
    return { table: 'comment_replies', userName: (legacy.data as any).user_name ?? '' };
  }

  return null;
}

/**
 * Edit a reply's text. Author or admin only — the same rule `updateComment`
 * applies to top-level comments.
 */
export async function updateReply(
  replyId: string,
  content: string,
): Promise<{ success: boolean; error?: string }> {
  const user = await requireUser();

  const trimmed = content.trim();
  if (!trimmed) return { success: false, error: 'Reply cannot be empty' };
  if (trimmed.length > 5000) return { success: false, error: 'Reply is too long' };

  const supabase = await createClient();
  const existing = await findReply(supabase, replyId);
  if (!existing) return { success: false, error: 'Reply not found' };

  const authorName = existing.userName.trim().toLowerCase();
  const currentName = (user.name || user.email || '').trim().toLowerCase();
  if (user.role !== 'admin' && authorName !== currentName) {
    return { success: false, error: 'You can only edit your own replies' };
  }

  const { error } = await supabase
    .from(existing.table)
    .update({ content: trimmed, updated_at: new Date().toISOString() } as any)
    .eq('id', replyId);

  if (error) {
    console.error('Error updating reply:', error);
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Delete a reply. Author, admin, or pm — matching `deleteComment`.
 * Only the reply row is removed; the parent comment and its other replies,
 * drawing, and attachments are untouched. The reply's own attachments cascade
 * via `comment_attachments.comment_id`.
 */
export async function deleteReply(
  replyId: string,
): Promise<{ success: boolean; error?: string }> {
  const user = await requireUser();

  const supabase = await createClient();
  const existing = await findReply(supabase, replyId);
  if (!existing) return { success: false, error: 'Reply not found' };

  const authorName = existing.userName.trim().toLowerCase();
  const currentName = (user.name || user.email || '').trim().toLowerCase();
  const elevated = user.role === 'admin' || user.role === 'pm';
  if (!elevated && authorName !== currentName) {
    return { success: false, error: 'You can only delete your own replies' };
  }

  const { error } = await supabase
    .from(existing.table)
    .delete()
    .eq('id', replyId);

  if (error) {
    console.error('Error deleting reply:', error);
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function createReply(
  commentId: string,
  content: string,
  userName: string,
): Promise<{ success: boolean; reply?: CommentReply; error?: string }> {
  const trimmed = content.trim();
  if (!trimmed) return { success: false, error: 'Reply cannot be empty' };

  const supabase = await createClient();
  const now = new Date().toISOString();

  const { data: parent, error: parentError } = await supabase
    .from('markup_comments')
    .select('thread_id, pin_number, comment_index, display_number, x_position, y_position')
    .eq('id', commentId)
    .single();

  if (parentError || !parent) {
    console.error('Parent comment not found for reply:', parentError);
    return { success: false, error: 'Parent comment not found' };
  }

  const typedReplyPayload = {
    id: nanoid(),
    thread_id: parent.thread_id,
    user_name: userName,
    content: trimmed,
    pin_number: parent.pin_number,
    comment_index: parent.comment_index,
    display_number: parent.display_number,
    x_position: parent.x_position,
    y_position: parent.y_position,
    status: 'active',
    type: 'reply',
    parent_comment_id: commentId,
    created_at: now,
    updated_at: now,
  };

  const typedInsert = await supabase
    .from('markup_comments')
    .insert(typedReplyPayload as any)
    .select('id, parent_comment_id, user_name, content, created_at, type')
    .single();

  if (!typedInsert.error && typedInsert.data) {
    return { success: true, reply: mapCommentRowToReply(typedInsert.data) };
  }

  const canFallbackToLegacy = isMissingColumnError(typedInsert.error, ['type', 'parent_comment_id']);
  if (!canFallbackToLegacy) {
    console.error('Error creating typed reply:', typedInsert.error);
    return { success: false, error: typedInsert.error?.message || 'Failed to save reply' };
  }

  const legacyReplyPayload = {
    id: nanoid(),
    comment_id: commentId,
    user_name: userName,
    content: trimmed,
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from('comment_replies')
    .insert(legacyReplyPayload)
    .select()
    .single();

  if (error) {
    console.error('Error creating legacy reply:', error);
    return { success: false, error: error.message };
  }
  return { success: true, reply: data as CommentReply };
}
