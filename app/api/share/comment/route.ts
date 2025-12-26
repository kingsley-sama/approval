/**
 * API Route: Share Comment Submission
 * Allows clients to submit comments via share links
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateShareToken } from '@/app/actions/share-links';
import { supabase } from '@/lib/supabase';
import { z } from 'zod';

const CommentSchema = z.object({
  token: z.string().min(1),
  threadId: z.string().uuid(),
  userName: z.string().min(1).max(150),
  content: z.string().min(1).max(5000),
});

export async function POST(request: NextRequest) {
  try {
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

    // Get next comment index
    const { count } = await supabase
      .from('markup_comments')
      .select('*', { count: 'exact', head: true })
      .eq('thread_id', validated.threadId);

    const nextIndex = (count || 0) + 1;

    // Insert comment
    const { data, error: insertError } = await supabase
      .from('markup_comments')
      .insert({
        thread_id: validated.threadId,
        user_name: validated.userName,
        content: validated.content,
        pin_number: nextIndex,
        comment_index: nextIndex,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error inserting comment:', insertError);
      return NextResponse.json(
        { success: false, error: 'Failed to save comment' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      comment: data,
    });
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
