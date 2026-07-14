import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireApiKey, apiError, getRequestOrigin } from '@/lib/api/auth';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/v1/projects/:id
 * Returns full project details: images (threads) and share links.
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

  const [projectRes, threadsRes, shareRes] = await Promise.all([
    supabaseAdmin.from('markup_projects').select('*').eq('id', id).maybeSingle(),
    supabaseAdmin
      .from('markup_threads')
      .select('id, thread_name, image_path, image_index, created_at')
      .eq('project_id', id)
      .order('image_index', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }),
    supabaseAdmin
      .from('share_links')
      .select('id, token, permissions, is_active, access_count, created_at')
      .eq('resource_type', 'project')
      .eq('resource_id', id)
      .order('created_at', { ascending: false }),
  ]);

  if (projectRes.error) return apiError(500, 'query_failed', projectRes.error.message);
  const project = projectRes.data as any;
  if (!project) return apiError(404, 'not_found', `No project with id ${id}.`);

  const threads = (threadsRes.data ?? []) as any[];
  const origin = getRequestOrigin(request);

  return NextResponse.json({
    success: true,
    project: {
      id: project.id,
      name: project.project_name,
      comment: project.raw_payload?.description ?? null,
      coverImage: project.markup_url,
      url: `${origin}/projects/${project.id}`,
      totalImages: threads.length,
      createdAt: project.created_at,
      updatedAt: project.updated_at,
    },
    images: threads.map((t) => ({
      threadId: t.id,
      name: t.thread_name,
      imageUrl: t.image_path,
      imageIndex: t.image_index,
      createdAt: t.created_at,
    })),
    shareLinks: ((shareRes.data ?? []) as any[]).map((s) => ({
      id: s.id,
      url: `${origin}/share/${s.token}`,
      permissions: s.permissions,
      isActive: s.is_active,
      accessCount: s.access_count ?? 0,
      createdAt: s.created_at,
    })),
  });
}

/**
 * DELETE /api/v1/projects/:id
 * Permanently deletes a project (threads and comments cascade in the DB).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = requireApiKey(request);
  if (authError) return authError;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return apiError(422, 'validation_error', 'Project id must be a UUID.');
  }

  const { data: existing } = await supabaseAdmin
    .from('markup_projects')
    .select('id')
    .eq('id', id)
    .maybeSingle();
  if (!existing) return apiError(404, 'not_found', `No project with id ${id}.`);

  const { error } = await supabaseAdmin.from('markup_projects').delete().eq('id', id);
  if (error) return apiError(500, 'delete_failed', error.message);

  return NextResponse.json({ success: true, deleted: id });
}
