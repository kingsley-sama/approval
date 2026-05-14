/**
 * API Route: Share Comment Update
 * Allows reviewers (guests using a share link) to edit their own comments.
 * Author identity is established by matching the supplied `userName` against
 * the comment's stored `user_name` (case-insensitive, trimmed).
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateShareToken } from '@/app/actions/share-links';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { checkRateLimit } from '@/lib/rate-limit';
import { z } from 'zod';

const UpdateSchema = z.object({
  token: z.string().min(1),
  commentId: z.string().min(1),
  userName: z.string().min(1).max(150),
  content: z.string().min(1).max(5000),
});

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (!checkRateLimit(`share-comment-update:${ip}`, 60_000, 20)) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const validated = UpdateSchema.parse(body);

    const { success, shareLink, error } = await validateShareToken(validated.token);
    if (!success || !shareLink) {
      return NextResponse.json(
        { success: false, error: error || 'Invalid share link' },
        { status: 403 }
      );
    }

    if (shareLink.permissions === 'view') {
      return NextResponse.json(
        { success: false, error: 'You do not have permission to edit comments' },
        { status: 403 }
      );
    }

    const { data: existing, error: fetchErr } = await supabase
      .from('markup_comments')
      .select('id, user_name, thread_id')
      .eq('id', validated.commentId)
      .single();

    if (fetchErr || !existing) {
      return NextResponse.json(
        { success: false, error: 'Comment not found' },
        { status: 404 }
      );
    }

    const { data: thread, error: threadErr } = await supabase
      .from('markup_threads')
      .select('id, project_id')
      .eq('id', existing.thread_id)
      .single();

    if (threadErr || !thread) {
      return NextResponse.json(
        { success: false, error: 'Thread not found' },
        { status: 404 }
      );
    }

    const hasAccess =
      (shareLink.resourceType === 'thread' && shareLink.resourceId === thread.id) ||
      (shareLink.resourceType === 'project' && shareLink.resourceId === thread.project_id);

    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: 'Access denied to this resource' },
        { status: 403 }
      );
    }

    const author = (existing.user_name ?? '').trim().toLowerCase();
    const requester = validated.userName.trim().toLowerCase();
    if (!author || author !== requester) {
      return NextResponse.json(
        { success: false, error: 'You can only edit your own comments' },
        { status: 403 }
      );
    }

    const { data, error: updateErr } = await supabase
      .from('markup_comments')
      .update({
        content: validated.content,
        updated_at: new Date().toISOString(),
      })
      .eq('id', validated.commentId)
      .select()
      .single();

    if (updateErr) {
      console.error('Error updating share comment:', JSON.stringify(updateErr));
      return NextResponse.json(
        { success: false, error: updateErr.message || 'Failed to update comment' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, comment: data });
  } catch (error) {
    console.error('Share comment update error:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid input data' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
