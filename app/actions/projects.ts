'use server';

import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getUser } from '@/lib/db/queries';
import { requireUser, requireAdmin } from '@/lib/auth/require-user';
import { CreateProjectSchema } from '@/lib/validation/schemas';
import { revalidatePath } from 'next/cache';

export interface CreateProjectInput {
  name: string;
  description?: string;
}

export interface CreateProjectResult {
  success: boolean;
  project?: any;
  error?: string;
}

export async function createProject(input: CreateProjectInput): Promise<CreateProjectResult> {
  await requireAdmin();

  const parsed = CreateProjectSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Invalid input: ' + parsed.error.issues[0]?.message };
  }

  const supabase = await createClient()
  try {
    const { data, error } = await supabase
      .from('markup_projects')
      .insert({
        project_name: input.name,
        markup_url: '/placeholder.svg',
        raw_payload: input.description ? { description: input.description } : null,
        total_screenshots: 0,
        total_threads: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating project:', error);
      return { success: false, error: error.message };
    }

    revalidatePath('/');
    revalidatePath('/projects');
    return { success: true, project: data };
  } catch (error) {
    console.error('Unexpected error creating project:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

const PROJECTS_PAGE_SIZE = 24;

export type ProjectSort = 'newest' | 'oldest' | 'name';

export interface ProjectListItem {
  id: string;
  project_name: string;
  markup_url: string | null;
  created_at: string;
  updated_at: string | null;
  first_image: string | null;
  total_images: number;
  total_comments: number;
  total_resolved_comments: number;
  total_commented_threads: number;
}

export interface ProjectsPageResult {
  projects: ProjectListItem[];
  total: number;
  page: number;
}

export async function getProjectsPage(opts?: {
  page?: number;
  search?: string;
  sort?: ProjectSort;
}): Promise<ProjectsPageResult> {
  const page = Math.max(1, opts?.page ?? 1);
  const empty: ProjectsPageResult = { projects: [], total: 0, page };

  const user = await getUser();
  if (!user) return empty;

  // Members only see projects they've been granted access to; admins see all.
  let projectIds: string[] | null = null;
  if (user.role !== 'admin') {
    if (!user.email) return empty;
    const { data: accessRows, error: accessError } = await supabaseAdmin
      .from('project_access')
      .select('project_id')
      .eq('user_email', user.email);

    if (accessError) {
      console.error('Error fetching project access:', accessError);
      return empty;
    }
    if (!accessRows || accessRows.length === 0) return empty;
    projectIds = accessRows.map((r: any) => r.project_id);
  }

  const { data, error } = await supabaseAdmin.rpc('get_projects_with_stats', {
    p_project_ids: projectIds,
    p_search: opts?.search?.trim() || null,
    p_sort: opts?.sort ?? 'newest',
    p_limit: PROJECTS_PAGE_SIZE,
    p_offset: (page - 1) * PROJECTS_PAGE_SIZE,
  });

  if (error) {
    console.error('Error fetching projects page:', error);
    return empty;
  }

  const rows = (data ?? []) as (ProjectListItem & { total_count: number })[];
  const total = rows[0]?.total_count ?? 0;
  return {
    projects: rows.map(({ total_count, ...item }) => item),
    total,
    page,
  };
}

/**
 * Grants a member user access to a specific project.
 * Only admin users can call this.
 */
export async function grantProjectAccess(
  projectId: string,
  userEmail: string
): Promise<{ success: boolean; error?: string }> {
  const currentUser = await getUser();

  if (!currentUser || currentUser.role !== 'admin') {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const { error } = await supabaseAdmin
      .from('project_access')
      .upsert(
        {
          project_id: projectId,
          user_email: userEmail,
          granted_by: currentUser.email,
        },
        { onConflict: 'project_id,user_email' }
      );

    if (error) {
      console.error('Error granting project access:', error);
      return { success: false, error: error.message };
    }

    revalidatePath('/projects');
    return { success: true };
  } catch (error) {
    console.error('Unexpected error granting project access:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Revokes a member user's access to a specific project.
 * Only admin users can call this.
 */
export async function revokeProjectAccess(
  projectId: string,
  userEmail: string
): Promise<{ success: boolean; error?: string }> {
  const currentUser = await getUser();

  if (!currentUser || currentUser.role !== 'admin') {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const { error } = await supabaseAdmin
      .from('project_access')
      .delete()
      .eq('project_id', projectId)
      .eq('user_email', userEmail);

    if (error) {
      console.error('Error revoking project access:', error);
      return { success: false, error: error.message };
    }

    revalidatePath('/projects');
    return { success: true };
  } catch (error) {
    console.error('Unexpected error revoking project access:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/** Lightweight project list for mention/link picker — returns only id + name */
export async function getProjectsForMention(): Promise<{ id: string; name: string }[]> {
  const user = await getUser();
  if (!user) return [];

  const supabase = await createClient();

  if (user.role === 'admin' || user.role === 'pm') {
    const { data, error } = await supabase
      .from('markup_projects')
      .select('id, project_name')
      .order('project_name', { ascending: true });
    if (error || !data) return [];
    return data.map((p: any) => ({ id: p.id, name: p.project_name }));
  }

  // member: only projects they have access to
  const { data: accessRows } = await supabaseAdmin
    .from('project_access')
    .select('project_id')
    .eq('user_email', user.email);

  if (!accessRows || accessRows.length === 0) return [];
  const projectIds = accessRows.map((r: any) => r.project_id);

  const { data, error } = await supabaseAdmin
    .from('markup_projects')
    .select('id, project_name')
    .in('id', projectIds)
    .order('project_name', { ascending: true });

  if (error || !data) return [];
  return (data as any[]).map(p => ({ id: p.id, name: p.project_name }));
}

export async function getProjectName(projectId: string): Promise<string | null> {
  const supabase = await createClient();
  try {
    const { data, error } = await supabase
      .from('markup_projects')
      .select('project_name')
      .eq('id', projectId)
      .maybeSingle();

    if (error || !data) return null;
    return (data as { project_name: string | null }).project_name;
  } catch (error) {
    console.error('Error fetching project name:', error);
    return null;
  }
}

export async function deleteProject(projectId: string) {
  await requireAdmin();
  const supabase = await createClient()
  try {
    const { error } = await supabase
      .from('markup_projects')
      .delete()
      .eq('id', projectId);

    if (error) {
      console.error('Error deleting project:', error);
      return { success: false, error: error.message };
    }

    revalidatePath('/');
    revalidatePath('/projects');
    return { success: true };
  } catch (error) {
    console.error('Unexpected error deleting project:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}
