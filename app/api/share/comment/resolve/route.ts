/**
 * API Route: Share Comment Resolve
 * Allows reviewers (guests using a share link with comment access) to toggle a
 * comment's resolved / active status — e.g. suppliers, 3D artists, or guests
 * confirming a revision is done. Unlike editing, resolving is NOT restricted to
 * the comment's own author: any reviewer with comment permission may resolve.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateShareToken } from '@/app/actions/share-links';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { checkRateLimit } from '@/lib/rate-limit';
import { z } from 'zod';

const ResolveSchema = z.object({
  token: z.string().min(1),
  commentId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (!checkRateLimit(`share-comment-resolve:${ip}`, 60_000, 30)) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const validated = ResolveSchema.parse(body);

    const { success, shareLink, error } = await validateShareToken(validated.token);
    if (!success || !shareLink) {
      return NextResponse.json(
        { success: false, error: error || 'Invalid share link' },
        { status: 403 }
      );
    }

    if (shareLink.permissions === 'view') {
      return NextResponse.json(
        { success: false, error: 'You do not have permission to resolve comments' },
        { status: 403 }
      );
    }

    const { data: existing, error: fetchErr } = await supabase
      .from('markup_comments')
      .select('id, status, thread_id')
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

    const newStatus = existing.status === 'resolved' ? 'active' : 'resolved';

    const { data, error: updateErr } = await supabase
      .from('markup_comments')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', validated.commentId)
      .select()
      .single();

    if (updateErr) {
      console.error('Error resolving share comment:', JSON.stringify(updateErr));
      return NextResponse.json(
        { success: false, error: updateErr.message || 'Failed to resolve comment' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, status: newStatus, comment: data });
  } catch (error) {
    console.error('Share comment resolve error:', error);
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
