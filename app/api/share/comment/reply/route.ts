/**
 * API Route: Share Comment Reply
 * Lets reviewers (guests using a share link) reply to a comment thread, mirroring
 * the authenticated `createReply` server action but backed by `supabaseAdmin`
 * (to bypass RLS) and gated by the share token instead of a session.
 *
 * Attachments on a reply are uploaded separately via /api/share/attachment using
 * the returned reply id.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateShareToken } from '@/app/actions/share-links';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { checkRateLimit } from '@/lib/rate-limit';
import { nanoid } from 'nanoid';
import { z } from 'zod';

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

const ReplySchema = z.object({
  token: z.string().min(1),
  commentId: z.string().min(1),
  userName: z.string().min(1).max(150),
  content: z.string().min(1).max(5000),
});

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (!checkRateLimit(`share-reply:${ip}`, 60_000, 20)) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please try again later.' },
        { status: 429 },
      );
    }

    const body = await request.json();
    const validated = ReplySchema.parse(body);

    const { success, shareLink, error } = await validateShareToken(validated.token);
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

    const { data: parent, error: parentError } = await supabase
      .from('markup_comments')
      .select('thread_id, pin_number, comment_index, display_number, x_position, y_position')
      .eq('id', validated.commentId)
      .single();

    if (parentError || !parent) {
      return NextResponse.json(
        { success: false, error: 'Parent comment not found' },
        { status: 404 },
      );
    }

    const { data: thread, error: threadErr } = await supabase
      .from('markup_threads')
      .select('id, project_id')
      .eq('id', (parent as any).thread_id)
      .single();

    if (threadErr || !thread) {
      return NextResponse.json({ success: false, error: 'Thread not found' }, { status: 404 });
    }

    const hasAccess =
      (shareLink.resourceType === 'thread' && shareLink.resourceId === thread.id) ||
      (shareLink.resourceType === 'project' && shareLink.resourceId === (thread as any).project_id);

    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: 'Access denied to this resource' },
        { status: 403 },
      );
    }

    const now = new Date().toISOString();
    const typedReplyPayload = {
      id: nanoid(),
      thread_id: (parent as any).thread_id,
      user_name: validated.userName,
      content: validated.content.trim(),
      pin_number: (parent as any).pin_number,
      comment_index: (parent as any).comment_index,
      display_number: (parent as any).display_number,
      x_position: (parent as any).x_position,
      y_position: (parent as any).y_position,
      status: 'active',
      type: 'reply',
      parent_comment_id: validated.commentId,
      created_at: now,
      updated_at: now,
    };

    const typedInsert = await supabase
      .from('markup_comments')
      .insert(typedReplyPayload as any)
      .select('id, parent_comment_id, user_name, content, created_at, type')
      .single();

    if (!typedInsert.error && typedInsert.data) {
      const row = typedInsert.data as any;
      return NextResponse.json({
        success: true,
        reply: {
          id: row.id,
          comment_id: row.parent_comment_id,
          user_name: row.user_name,
          content: row.content,
          created_at: row.created_at ?? now,
        },
      });
    }

    const canFallbackToLegacy = isMissingColumnError(typedInsert.error, ['type', 'parent_comment_id']);
    if (!canFallbackToLegacy) {
      console.error('Error creating typed share reply:', typedInsert.error);
      return NextResponse.json(
        { success: false, error: typedInsert.error?.message || 'Failed to save reply' },
        { status: 500 },
      );
    }

    const legacyReplyPayload = {
      id: nanoid(),
      comment_id: validated.commentId,
      user_name: validated.userName,
      content: validated.content.trim(),
      created_at: now,
      updated_at: now,
    };

    const { data, error: legacyErr } = await supabase
      .from('comment_replies')
      .insert(legacyReplyPayload)
      .select()
      .single();

    if (legacyErr || !data) {
      console.error('Error creating legacy share reply:', legacyErr);
      return NextResponse.json(
        { success: false, error: legacyErr?.message || 'Failed to save reply' },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, reply: data });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'Invalid input data' }, { status: 400 });
    }
    console.error('Share reply error:', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
