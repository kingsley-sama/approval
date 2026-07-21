'use server';

import { supabaseAdmin } from '@/lib/supabase';
import { getUser } from '@/lib/db/queries';
import { requireAdmin, requireUser } from '@/lib/auth/require-user';
import { CreateProjectSchema, RenameProjectSchema } from '@/lib/validation/schemas';
import { revalidatePath, unstable_noStore as noStore } from 'next/cache';

export interface CreateTourProjectInput {
  name: string;
  description?: string;
}

export interface CreateTourProjectResult {
  success: boolean;
  project?: { id: string; project_name: string };
  error?: string;
}

export async function createTourProject(
  input: CreateTourProjectInput
): Promise<CreateTourProjectResult> {
  await requireAdmin();

  const parsed = CreateProjectSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Invalid input: ' + parsed.error.issues[0]?.message };
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('tour_projects')
      .insert({
        project_name: parsed.data.name,
        description: parsed.data.description ?? null,
        total_scenes: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('id, project_name')
      .single();

    if (error) {
      console.error('Error creating tour:', error);
      return { success: false, error: error.message };
    }

    revalidatePath('/tours');
    return { success: true, project: data };
  } catch (error) {
    console.error('Unexpected error creating tour:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

const PROJECTS_PAGE_SIZE = 24;

export type TourSort = 'newest' | 'oldest' | 'name';

export interface TourProjectListItem {
  id: string;
  project_name: string;
  preview_url: string | null;
  created_at: string;
  updated_at: string | null;
  first_image: string | null;
  total_scenes: number;
  total_hotspots: number;
  total_linked_scenes: number;
}

export interface TourProjectsPageResult {
  projects: TourProjectListItem[];
  total: number;
  page: number;
}

export async function getTourProjectsPage(opts?: {
  page?: number;
  search?: string;
  sort?: TourSort;
}): Promise<TourProjectsPageResult> {
  const page = Math.max(1, opts?.page ?? 1);
  const empty: TourProjectsPageResult = { projects: [], total: 0, page };

  const user = await getUser();
  if (!user) return empty;

  // Members only see tours they've been granted access to; admins see all.
  let projectIds: string[] | null = null;
  if (user.role !== 'admin') {
    if (!user.email) return empty;
    const { data: accessRows, error: accessError } = await supabaseAdmin
      .from('tour_project_access')
      .select('tour_project_id')
      .eq('user_email', user.email);

    if (accessError) {
      console.error('Error fetching tour access:', accessError);
      return empty;
    }
    if (!accessRows || accessRows.length === 0) return empty;
    projectIds = accessRows.map((r) => r.tour_project_id);
  }

  const { data, error } = await supabaseAdmin.rpc('get_tour_projects_with_stats', {
    p_project_ids: projectIds,
    p_search: opts?.search?.trim() || null,
    p_sort: opts?.sort ?? 'newest',
    p_limit: PROJECTS_PAGE_SIZE,
    p_offset: (page - 1) * PROJECTS_PAGE_SIZE,
  });

  if (error) {
    console.error('Error fetching tour projects page:', error);
    return empty;
  }

  const rows = (data ?? []) as (TourProjectListItem & { total_count: number })[];
  const total = rows[0]?.total_count ?? 0;
  return {
    projects: rows.map(({ total_count, ...item }) => item),
    total,
    page,
  };
}

export async function renameTourProject(
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
    .from('tour_projects')
    .update({ project_name: parsed.data.name, updated_at: new Date().toISOString() })
    .eq('id', parsed.data.projectId);

  if (error) {
    console.error('Error renaming tour:', error);
    return { success: false, error: error.message };
  }

  revalidatePath('/tours');
  revalidatePath(`/tours/${parsed.data.projectId}`);
  return { success: true };
}

export async function deleteTourProject(projectId: string) {
  await requireAdmin();
  try {
    const { error } = await supabaseAdmin
      .from('tour_projects')
      .delete()
      .eq('id', projectId);

    if (error) {
      console.error('Error deleting tour:', error);
      return { success: false, error: error.message };
    }

    revalidatePath('/tours');
    return { success: true };
  } catch (error) {
    console.error('Unexpected error deleting tour:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/** Deep-copy a tour: project + scenes + hotspots (remapped), reusing the same
 *  storage URLs — deleting a tour never removes storage files, so shared
 *  images stay valid. */
export async function duplicateTourProject(
  projectId: string,
  newName?: string,
): Promise<{ success: boolean; newProjectId?: string; error?: string }> {
  await requireAdmin();

  const [projectRes, scenesRes] = await Promise.all([
    supabaseAdmin
      .from('tour_projects')
      .select('project_name, description, preview_url, start_scene_id')
      .eq('id', projectId)
      .maybeSingle(),
    supabaseAdmin
      .from('tour_scenes')
      .select('*')
      .eq('tour_project_id', projectId)
      .order('scene_index', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }),
  ]);

  const source = projectRes.data;
  if (!source) return { success: false, error: 'Tour not found' };
  const scenes = scenesRes.data ?? [];

  const { data: newProject, error: createError } = await supabaseAdmin
    .from('tour_projects')
    .insert({
      project_name: newName?.trim() || `${source.project_name} (Copy)`,
      description: source.description,
      preview_url: source.preview_url,
      total_scenes: scenes.length,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (createError || !newProject) {
    console.error('Error duplicating tour project:', createError);
    return { success: false, error: createError?.message ?? 'Failed to duplicate tour' };
  }

  if (scenes.length > 0) {
    const idMap = new Map<string, string>();
    for (const scene of scenes) {
      const { data: newScene, error: sceneError } = await supabaseAdmin
        .from('tour_scenes')
        .insert({
          tour_project_id: newProject.id,
          name: scene.name,
          image_path: scene.image_path,
          image_filename: scene.image_filename,
          scene_index: scene.scene_index,
          initial_pitch: scene.initial_pitch,
          initial_yaw: scene.initial_yaw,
          initial_hfov: scene.initial_hfov,
        })
        .select('id')
        .single();

      if (sceneError || !newScene) {
        console.error('Error duplicating tour scene:', sceneError);
        await supabaseAdmin.from('tour_projects').delete().eq('id', newProject.id);
        return { success: false, error: sceneError?.message ?? 'Failed to copy scenes' };
      }
      idMap.set(scene.id, newScene.id);
    }

    const { data: hotspots } = await supabaseAdmin
      .from('tour_hotspots')
      .select('*')
      .in('scene_id', scenes.map((s) => s.id));

    const remapped = (hotspots ?? [])
      .filter(h => idMap.has(h.scene_id) && idMap.has(h.target_scene_id))
      .map(h => ({
        scene_id: idMap.get(h.scene_id)!,
        target_scene_id: idMap.get(h.target_scene_id)!,
        pitch: h.pitch,
        yaw: h.yaw,
        label: h.label,
        target_pitch: h.target_pitch,
        target_yaw: h.target_yaw,
      }));

    if (remapped.length > 0) {
      const { error: hotspotError } = await supabaseAdmin.from('tour_hotspots').insert(remapped);
      if (hotspotError) console.error('Error duplicating tour hotspots:', hotspotError);
    }

    const newStart = source.start_scene_id ? idMap.get(source.start_scene_id) : null;
    await supabaseAdmin
      .from('tour_projects')
      .update({ start_scene_id: newStart ?? idMap.get(scenes[0].id) ?? null })
      .eq('id', newProject.id);
  }

  revalidatePath('/tours');
  return { success: true, newProjectId: newProject.id };
}

export async function grantTourAccess(
  projectId: string,
  userEmail: string
): Promise<{ success: boolean; error?: string }> {
  const currentUser = await getUser();
  if (!currentUser || currentUser.role !== 'admin') {
    return { success: false, error: 'Unauthorized' };
  }

  const { error } = await supabaseAdmin
    .from('tour_project_access')
    .upsert(
      { tour_project_id: projectId, user_email: userEmail, granted_by: currentUser.email },
      { onConflict: 'tour_project_id,user_email' }
    );

  if (error) {
    console.error('Error granting tour access:', error);
    return { success: false, error: error.message };
  }

  revalidatePath('/tours');
  return { success: true };
}

export async function revokeTourAccess(
  projectId: string,
  userEmail: string
): Promise<{ success: boolean; error?: string }> {
  const currentUser = await getUser();
  if (!currentUser || currentUser.role !== 'admin') {
    return { success: false, error: 'Unauthorized' };
  }

  const { error } = await supabaseAdmin
    .from('tour_project_access')
    .delete()
    .eq('tour_project_id', projectId)
    .eq('user_email', userEmail);

  if (error) {
    console.error('Error revoking tour access:', error);
    return { success: false, error: error.message };
  }

  revalidatePath('/tours');
  return { success: true };
}

// ─── workspace data ──────────────────────────────────────────────────────────

export interface TourSceneRecord {
  id: string;
  name: string | null;
  image_path: string;
  image_filename: string | null;
  scene_index: number | null;
  initial_pitch: number | null;
  initial_yaw: number | null;
  initial_hfov: number | null;
}

export interface TourHotspotRecord {
  id: string;
  scene_id: string;
  target_scene_id: string;
  pitch: number;
  yaw: number;
  label: string | null;
  target_pitch: number | null;
  target_yaw: number | null;
}

export interface TourWorkspaceData {
  projectName: string | null;
  description: string | null;
  startSceneId: string | null;
  scenes: TourSceneRecord[];
  hotspotsByScene: Record<string, TourHotspotRecord[]>;
  currentUser: { name: string; role: string };
}

/** Everything the tour editor needs in one server call. */
export async function getTourWorkspaceData(projectId: string): Promise<TourWorkspaceData> {
  noStore();
  const user = await requireUser();

  const [scenesRes, projectRes] = await Promise.all([
    supabaseAdmin
      .from('tour_scenes')
      .select('id, name, image_path, image_filename, scene_index, initial_pitch, initial_yaw, initial_hfov')
      .eq('tour_project_id', projectId)
      .order('scene_index', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }),
    supabaseAdmin
      .from('tour_projects')
      .select('project_name, description, start_scene_id')
      .eq('id', projectId)
      .maybeSingle(),
  ]);

  if (scenesRes.error) {
    console.error('Error fetching tour scenes:', scenesRes.error);
  }
  const scenes = scenesRes.data ?? [];

  let hotspotsByScene: Record<string, TourHotspotRecord[]> = {};
  if (scenes.length > 0) {
    const { data: hotspotRows, error: hotspotsError } = await supabaseAdmin
      .from('tour_hotspots')
      .select('id, scene_id, target_scene_id, pitch, yaw, label, target_pitch, target_yaw')
      .in('scene_id', scenes.map((s) => s.id))
      .order('created_at', { ascending: true });

    if (hotspotsError) {
      console.error('Error fetching tour hotspots:', hotspotsError);
    }
    for (const h of hotspotRows ?? []) {
      (hotspotsByScene[h.scene_id] ??= []).push(h);
    }
  }

  return {
    projectName: projectRes.data?.project_name ?? null,
    description: projectRes.data?.description ?? null,
    startSceneId: projectRes.data?.start_scene_id ?? null,
    scenes,
    hotspotsByScene,
    currentUser: { name: user.name || user.email, role: user.role ?? 'member' },
  };
}
