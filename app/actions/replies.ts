'use server';

import { createClient } from '@/lib/supabase/server';
import { nanoid } from 'nanoid';

export interface CommentReply {
  id: string;
  comment_id: string;
  user_name: string;
  content: string;
  created_at: string;
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

  if (!typedResult.error) {
    return (typedResult.data || []).map(mapCommentRowToReply);
  }

  const { data, error } = await supabase
    .from('comment_replies')
    .select('*')
    .eq('comment_id', commentId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error loading replies:', typedResult.error, error);
    return [];
  }
  return (data as CommentReply[]) || [];
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
