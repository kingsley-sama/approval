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
    return { success: true, project: data };
  } catch (error) {
    console.error('Unexpected error creating project:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

function attachThreadStats(data: any[]) {
  return data.map((p: any) => {
    const threads: any[] = p.markup_threads ?? [];
    const sorted = [...threads].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    const firstImage = sorted[0]?.image_path || null;
    const totalImages = threads.length;
    const totalComments = threads.reduce((count, thread) => {
      const comments = Array.isArray(thread.markup_comments) ? thread.markup_comments : [];
      return count + comments.length;
    }, 0);
    const resolvedComments = threads.reduce((count, thread) => {
      const comments = Array.isArray(thread.markup_comments) ? thread.markup_comments : [];
      return count + comments.filter((c: any) => c.status === 'resolved').length;
    }, 0);
    const commentedThreads = threads.filter((thread) => {
      const comments = Array.isArray(thread.markup_comments) ? thread.markup_comments : [];
      return comments.length > 0;
    }).length;

    return {
      ...p,
      first_image: firstImage,
      total_images: totalImages,
      total_comments: totalComments,
      total_resolved_comments: resolvedComments,
      total_commented_threads: commentedThreads,
    };
  });
}

const THREAD_SELECT = `
  id,
  project_name,
  markup_url,
  updated_at,
  created_at,
  markup_threads (
    id,
    image_path,
    created_at,
    markup_comments (
      id,
      status
    )
  )
`;

export async function getProjects() {
  const user = await getUser();

  // Admin users see all projects
  if (user?.role === 'admin') {
    return getAllProjects();
  }

  // Member users (default) only see projects they've been granted access to
  if (user?.email) {
    return getMemberProjects(user.email);
  }

  return [];
}

async function getAllProjects() {
  const supabase = await createClient();
  try {
    const { data, error } = await supabase
      .from('markup_projects')
      .select(THREAD_SELECT)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching projects:', error);
      return [];
    }

    return attachThreadStats(data || []);
  } catch (error) {
    console.error('Unexpected error fetching projects:', error);
    return [];
  }
}

async function getMemberProjects(userEmail: string) {
  try {
    // Get project IDs this user has been granted access to
    const { data: accessRows, error: accessError } = await supabaseAdmin
      .from('project_access')
      .select('project_id')
      .eq('user_email', userEmail);

    if (accessError) {
      console.error('Error fetching project access:', accessError);
      return [];
    }

    if (!accessRows || accessRows.length === 0) return [];

    const projectIds = accessRows.map((r: any) => r.project_id);

    const { data, error } = await supabaseAdmin
      .from('markup_projects')
      .select(THREAD_SELECT)
      .in('id', projectIds)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching member projects:', error);
      return [];
    }

    return attachThreadStats(data || []);
  } catch (error) {
    console.error('Unexpected error fetching member projects:', error);
    return [];
  }
}

export async function getProjectPageData() {
  const user = await getUser();
  const role = user ? ((user.role as 'admin' | 'member') ?? 'member') : null;
  const currentUser = user
    ? { id: user.id, name: user.name || user.email, email: user.email, role: user.role }
    : null;
  const projects = user?.role === 'admin'
    ? await getAllProjects()
    : user?.email
    ? await getMemberProjects(user.email)
    : [];
  return { projects, role, currentUser };
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
    return { success: true };
  } catch (error) {
    console.error('Unexpected error deleting project:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}
