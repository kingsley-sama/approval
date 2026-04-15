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

export async function getRepliesForComment(commentId: string): Promise<CommentReply[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('comment_replies')
    .select('*')
    .eq('comment_id', commentId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error loading replies:', error);
    return [];
  }
  return (data as CommentReply[]) || [];
}

export async function createReply(
  commentId: string,
  content: string,
  userName: string,
): Promise<{ success: boolean; reply?: CommentReply; error?: string }> {
  if (!content.trim()) return { success: false, error: 'Reply cannot be empty' };

  const supabase = await createClient();
  const now = new Date().toISOString();
  const newReply = {
    id: nanoid(),
    comment_id: commentId,
    user_name: userName,
    content: content.trim(),
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from('comment_replies')
    .insert(newReply)
    .select()
    .single();

  if (error) {
    console.error('Error creating reply:', error);
    return { success: false, error: error.message };
  }
  return { success: true, reply: data as CommentReply };
}
