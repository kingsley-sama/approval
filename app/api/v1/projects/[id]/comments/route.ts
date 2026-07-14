import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireApiKey, apiError } from '@/lib/api/auth';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/v1/projects/:id/comments?status=active|resolved
 * Returns every pin/comment across all of the project's images —
 * lets automations pull client feedback back out (e.g. into Slack or a CRM).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = requireApiKey(request);
  if (authError) return authError;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return apiError(422, 'validation_error', 'Project id must be a UUID.');
  }

  const { data: threads, error: threadsError } = await supabaseAdmin
    .from('markup_threads')
    .select('id, thread_name, image_path')
    .eq('project_id', id);
  if (threadsError) return apiError(500, 'query_failed', threadsError.message);
  if (!threads || threads.length === 0) {
    const { data: project } = await supabaseAdmin
      .from('markup_projects')
      .select('id')
      .eq('id', id)
      .maybeSingle();
    if (!project) return apiError(404, 'not_found', `No project with id ${id}.`);
    return NextResponse.json({ success: true, total: 0, comments: [] });
  }

  const threadById = new Map(threads.map((t: any) => [t.id, t]));

  let query = supabaseAdmin
    .from('markup_comments')
    .select(
      'id, thread_id, user_name, content, pin_number, x_position, y_position, status, parent_comment_id, created_at, updated_at'
    )
    .in('thread_id', threads.map((t: any) => t.id))
    .order('created_at', { ascending: true });

  const status = request.nextUrl.searchParams.get('status');
  if (status === 'active' || status === 'resolved') {
    query = query.eq('status', status);
  }

  const { data: comments, error } = await query;
  if (error) return apiError(500, 'query_failed', error.message);

  return NextResponse.json({
    success: true,
    total: comments?.length ?? 0,
    comments: (comments ?? []).map((c: any) => {
      const thread = threadById.get(c.thread_id) as any;
      return {
        id: c.id,
        threadId: c.thread_id,
        imageName: thread?.thread_name ?? null,
        imageUrl: thread?.image_path ?? null,
        author: c.user_name,
        content: c.content,
        pinNumber: c.pin_number,
        x: c.x_position,
        y: c.y_position,
        status: c.status,
        isReply: c.parent_comment_id != null,
        parentCommentId: c.parent_comment_id,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
      };
    }),
  });
}
