'use server';

import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getUser } from '@/lib/db/queries';
import { requireAdmin } from '@/lib/auth/require-user';
import { CreateProjectSchema, RenameProjectSchema } from '@/lib/validation/schemas';
import { revalidatePath } from 'next/cache';

export interface CreatePanoramaProjectInput {
  name: string;
  description?: string;
}

export interface CreatePanoramaProjectResult {
  success: boolean;
  project?: any;
  error?: string;
}

export async function createPanoramaProject(
  input: CreatePanoramaProjectInput
): Promise<CreatePanoramaProjectResult> {
  await requireAdmin();

  const parsed = CreateProjectSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Invalid input: ' + parsed.error.issues[0]?.message };
  }

  const supabase = await createClient();
  try {
    const { data, error } = await supabase
      .from('panorama_projects')
      .insert({
        project_name: input.name,
        raw_payload: input.description ? { description: input.description } : null,
        total_images: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating panorama project:', error);
      return { success: false, error: error.message };
    }

    revalidatePath('/panoramas');
    return { success: true, project: data };
  } catch (error) {
    console.error('Unexpected error creating panorama project:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

const PROJECTS_PAGE_SIZE = 24;

export type PanoramaSort = 'newest' | 'oldest' | 'name';

export interface PanoramaProjectListItem {
  id: string;
  project_name: string;
  preview_url: string | null;
  created_at: string;
  updated_at: string | null;
  first_image: string | null;
  total_images: number;
  total_comments: number;
  total_resolved_comments: number;
  total_commented_images: number;
}

export interface PanoramaProjectsPageResult {
  projects: PanoramaProjectListItem[];
  total: number;
  page: number;
}

export async function getPanoramaProjectsPage(opts?: {
  page?: number;
  search?: string;
  sort?: PanoramaSort;
}): Promise<PanoramaProjectsPageResult> {
  const page = Math.max(1, opts?.page ?? 1);
  const empty: PanoramaProjectsPageResult = { projects: [], total: 0, page };

  const user = await getUser();
  if (!user) return empty;

  // Members only see panoramas they've been granted access to; admins see all.
  let projectIds: string[] | null = null;
  if (user.role !== 'admin') {
    if (!user.email) return empty;
    const { data: accessRows, error: accessError } = await supabaseAdmin
      .from('panorama_project_access')
      .select('panorama_project_id')
      .eq('user_email', user.email);

    if (accessError) {
      console.error('Error fetching panorama access:', accessError);
      return empty;
    }
    if (!accessRows || accessRows.length === 0) return empty;
    projectIds = accessRows.map((r: any) => r.panorama_project_id);
  }

  const { data, error } = await supabaseAdmin.rpc('get_panorama_projects_with_stats', {
    p_project_ids: projectIds,
    p_search: opts?.search?.trim() || null,
    p_sort: opts?.sort ?? 'newest',
    p_limit: PROJECTS_PAGE_SIZE,
    p_offset: (page - 1) * PROJECTS_PAGE_SIZE,
  });

  if (error) {
    console.error('Error fetching panorama projects page:', error);
    return empty;
  }

  const rows = (data ?? []) as (PanoramaProjectListItem & { total_count: number })[];
  const total = rows[0]?.total_count ?? 0;
  return {
    projects: rows.map(({ total_count, ...item }) => item),
    total,
    page,
  };
}

export async function getPanoramaProjectName(projectId: string): Promise<string | null> {
  const supabase = await createClient();
  try {
    const { data, error } = await supabase
      .from('panorama_projects')
      .select('project_name')
      .eq('id', projectId)
      .maybeSingle();

    if (error || !data) return null;
    return (data as { project_name: string | null }).project_name;
  } catch (error) {
    console.error('Error fetching panorama project name:', error);
    return null;
  }
}

export async function renamePanoramaProject(
  projectId: string,
  name: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin();
  } catch {
    return { success: false, error: 'Unauthorized' };
  }

  const parsed = RenameProjectSchema.safeParse({ projectId, name });
  if (!parsed.success) {
    return { success: false, error: 'Invalid input: ' + parsed.error.issues[0]?.message };
  }

  const { error } = await supabaseAdmin
    .from('panorama_projects')
    .update({ project_name: parsed.data.name, updated_at: new Date().toISOString() })
    .eq('id', parsed.data.projectId);

  if (error) {
    console.error('Error renaming panorama project:', error);
    return { success: false, error: error.message };
  }

  revalidatePath('/panoramas');
  revalidatePath(`/panoramas/${parsed.data.projectId}`);
  return { success: true };
}

export async function deletePanoramaProject(projectId: string) {
  await requireAdmin();
  const supabase = await createClient();
  try {
    const { error } = await supabase
      .from('panorama_projects')
      .delete()
      .eq('id', projectId);

    if (error) {
      console.error('Error deleting panorama project:', error);
      return { success: false, error: error.message };
    }

    revalidatePath('/panoramas');
    return { success: true };
  } catch (error) {
    console.error('Unexpected error deleting panorama project:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

export async function grantPanoramaAccess(
  projectId: string,
  userEmail: string
): Promise<{ success: boolean; error?: string }> {
  const currentUser = await getUser();
  if (!currentUser || currentUser.role !== 'admin') {
    return { success: false, error: 'Unauthorized' };
  }

  const { error } = await supabaseAdmin
    .from('panorama_project_access')
    .upsert(
      { panorama_project_id: projectId, user_email: userEmail, granted_by: currentUser.email },
      { onConflict: 'panorama_project_id,user_email' }
    );

  if (error) {
    console.error('Error granting panorama access:', error);
    return { success: false, error: error.message };
  }

  revalidatePath('/panoramas');
  return { success: true };
}

export async function revokePanoramaAccess(
  projectId: string,
  userEmail: string
): Promise<{ success: boolean; error?: string }> {
  const currentUser = await getUser();
  if (!currentUser || currentUser.role !== 'admin') {
    return { success: false, error: 'Unauthorized' };
  }

  const { error } = await supabaseAdmin
    .from('panorama_project_access')
    .delete()
    .eq('panorama_project_id', projectId)
    .eq('user_email', userEmail);

  if (error) {
    console.error('Error revoking panorama access:', error);
    return { success: false, error: error.message };
  }

  revalidatePath('/panoramas');
  return { success: true };
}
