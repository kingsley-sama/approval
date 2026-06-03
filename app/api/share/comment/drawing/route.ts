/**
 * API Route: Share Comment Drawing Update
 * Lets reviewers (guests using a share link) peel shapes off / clear the
 * drawing on their own saved comment. Backs the "Undo last drawing" control
 * in the share viewer once unsaved strokes are exhausted.
 * Author identity is established by matching the supplied `userName` against
 * the comment's stored `user_name` (case-insensitive, trimmed).
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateShareToken } from '@/app/actions/share-links';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { checkRateLimit } from '@/lib/rate-limit';
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

const UpdateSchema = z.object({
  token: z.string().min(1),
  commentId: z.string().min(1),
  userName: z.string().min(1).max(150),
  // Trimmed shape set to persist; null/empty strips the drawing.
  drawingData: z.array(z.any()).nullable().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (!checkRateLimit(`share-comment-drawing:${ip}`, 60_000, 20)) {
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

    // Editing a drawing requires draw permission.
    if (shareLink.permissions !== 'draw_and_comment') {
      return NextResponse.json(
        { success: false, error: 'You do not have permission to edit drawings' },
        { status: 403 }
      );
    }

    const { data: existing, error: fetchErr } = await supabase
      .from('markup_comments')
      .select('id, user_name, thread_id, drawing_id')
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
        { success: false, error: 'You can only edit your own drawings' },
        { status: 403 }
      );
    }

    const drawingId = (existing as any).drawing_id as string | null | undefined;
    const nextShapes =
      Array.isArray(validated.drawingData) && validated.drawingData.length > 0
        ? validated.drawingData
        : null;

    if (nextShapes) {
      if (drawingId) {
        const { error: updErr } = await supabase
          .from('markup_drawings')
          .update({ drawing_data: nextShapes, updated_at: new Date().toISOString() })
          .eq('id', drawingId);
        if (updErr) {
          return NextResponse.json(
            { success: false, error: updErr.message || 'Failed to update drawing' },
            { status: 500 }
          );
        }
      } else {
        const { error: updErr } = await supabase
          .from('markup_comments')
          .update({ drawing_data: nextShapes, updated_at: new Date().toISOString() } as any)
          .eq('id', validated.commentId);
        if (updErr && !isMissingColumnError(updErr, ['drawing_data'])) {
          return NextResponse.json(
            { success: false, error: updErr.message || 'Failed to update drawing' },
            { status: 500 }
          );
        }
      }
    } else {
      // No shapes left — remove the whole annotation (pin + comment + drawing).
      const { error: delErr } = await supabase
        .from('markup_comments')
        .delete()
        .eq('id', validated.commentId);
      if (delErr) {
        return NextResponse.json(
          { success: false, error: delErr.message || 'Failed to remove drawing' },
          { status: 500 }
        );
      }
      if (drawingId) {
        await supabase.from('markup_drawings').delete().eq('id', drawingId);
      }
      return NextResponse.json({ success: true, deleted: true });
    }

    return NextResponse.json({ success: true, drawingData: nextShapes });
  } catch (error) {
    console.error('Share comment drawing update error:', error);
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
