/**
 * API Route: Share Comment Submission
 * Allows clients to submit comments via share links
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateShareToken } from '@/app/actions/share-links';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { checkRateLimit } from '@/lib/rate-limit';
import { z } from 'zod';
import { nanoid } from 'nanoid';

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.max(0, Math.min(100, value));
}

function normalizeDrawingPayload(drawingData: unknown): unknown {
  if (drawingData == null) return undefined;
  try {
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

const CommentSchema = z.object({
  token: z.string().min(1),
  threadId: z.string().uuid(),
  userName: z.string().min(1).max(150),
  content: z.string().min(1).max(5000),
  xPosition: z.coerce.number().optional().default(50).transform(clampPercent),
  yPosition: z.coerce.number().optional().default(50).transform(clampPercent),
  drawingData: z.any().optional().transform(normalizeDrawingPayload),
});

export async function POST(request: NextRequest) {
  try {
    // Rate limiting: 10 requests per minute per IP
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (!checkRateLimit(`share-comment:${ip}`, 60_000, 10)) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const validated = CommentSchema.parse(body);

    // Validate share token
    const { success, shareLink, error } = await validateShareToken(validated.token);

    if (!success || !shareLink) {
      return NextResponse.json(
        { success: false, error: error || 'Invalid share link' },
        { status: 403 }
      );
    }

    // Check permissions
    if (shareLink.permissions === 'view') {
      return NextResponse.json(
        { success: false, error: 'You do not have permission to comment' },
        { status: 403 }
      );
    }

    // Verify thread exists and belongs to shared resource
    const { data: thread, error: threadError } = await supabase
      .from('markup_threads')
      .select('id, project_id')
      .eq('id', validated.threadId)
      .single();

    if (threadError || !thread) {
      return NextResponse.json(
        { success: false, error: 'Thread not found' },
        { status: 404 }
      );
    }

    // Verify access
    const hasAccess =
      (shareLink.resourceType === 'thread' && shareLink.resourceId === validated.threadId) ||
      (shareLink.resourceType === 'project' && shareLink.resourceId === thread.project_id);

    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: 'Access denied to this resource' },
        { status: 403 }
      );
    }

    // Get next comment index (excluding replies in typed schema)
    const typedCount = await supabase
      .from('markup_comments')
      .select('*', { count: 'exact', head: true })
      .eq('thread_id', validated.threadId)
      .neq('type' as any, 'reply');

    const legacyCount = await supabase
      .from('markup_comments')
      .select('*', { count: 'exact', head: true })
      .eq('thread_id', validated.threadId);

    const nextIndex = ((typedCount.error ? legacyCount.count : typedCount.count) || 0) + 1;

    // Create drawing row first when this comment includes drawing data
    let drawingId: string | null = null;
    if (validated.drawingData != null) {
      const drawingInsertPayload: any = {
        thread_id: validated.threadId,
        drawing_data: validated.drawingData,
        created_by: validated.userName,
        metadata: { source: 'share_comment' },
      };

      const { data: drawingRow, error: drawingError } = await supabase
        .from('markup_drawings')
        .insert(drawingInsertPayload)
        .select('id')
        .single();

      if (drawingError) {
        console.error('Error inserting drawing for share comment:', JSON.stringify(drawingError));
        return NextResponse.json(
          { success: false, error: drawingError.message || 'Failed to save drawing' },
          { status: 500 }
        );
      }

      drawingId = drawingRow.id;
    }

    const basePayload: any = {
      id: nanoid(),
      thread_id: validated.threadId,
      user_name: validated.userName,
      content: validated.content,
      pin_number: nextIndex,
      comment_index: nextIndex,
      display_number: nextIndex,
      x_position: validated.xPosition,
      y_position: validated.yPosition,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const typedPayload = {
      ...basePayload,
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
      const saved = typedInsert.data as any;
      if (validated.drawingData != null && saved.drawing_data == null) {
        saved.drawing_data = validated.drawingData;
      }
      return NextResponse.json({ success: true, comment: saved });
    }

    const canFallbackToLegacy = isMissingColumnError(typedInsert.error, [
      'type',
      'drawing_id',
      'parent_comment_id',
    ]);

    if (!canFallbackToLegacy) {
      console.error('Error inserting typed share comment:', JSON.stringify(typedInsert.error));
      return NextResponse.json(
        { success: false, error: typedInsert.error.message || 'Failed to save comment' },
        { status: 500 }
      );
    }

    const legacyPayload: any = {
      ...basePayload,
      ...(validated.drawingData != null ? { drawing_data: validated.drawingData } : {}),
    };

    const { data, error: insertError } = await supabase
      .from('markup_comments')
      .insert(legacyPayload)
      .select()
      .single();

    if (drawingId) {
      await supabase.from('markup_drawings').delete().eq('id', drawingId);
    }

    if (insertError) {
      console.error('Error inserting comment:', JSON.stringify(insertError));
      return NextResponse.json(
        { success: false, error: insertError.message || 'Failed to save comment' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, comment: data });
  } catch (error) {
    console.error('Share comment error:', error);
    
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
