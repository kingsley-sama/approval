'use server';

import { supabaseAdmin } from '@/lib/supabase';
import { requireUser } from '@/lib/auth/require-user';
import {
  SignedUploadUrlSchema,
  RegisterTourSceneSchema,
  RenameTourSceneSchema,
  UpdateTourSceneViewSchema,
} from '@/lib/validation/schemas';
import { revalidatePath } from 'next/cache';
import type { TourSceneRecord } from './tour-projects';

const BUCKET = process.env.NEXT_PUBLIC_SUPABASE_BUCKET_NAME || 'screenshots';

function tourStoragePath(projectId: string, fileName: string): string {
  const timestamp = Date.now();
  const sanitized = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `tours/${projectId}/${timestamp}-${sanitized}`;
}

export interface SignedUploadUrlResult {
  success: boolean;
  signedUrl?: string;
  storagePath?: string;
  error?: string;
}

/** Step 1 — presigned upload URL for a tour scene (direct browser → Supabase). */
export async function getTourSceneUploadUrl(
  projectId: string,
  fileName: string,
): Promise<SignedUploadUrlResult> {
  try {
    await requireUser();

    const parsed = SignedUploadUrlSchema.safeParse({ fileName });
    if (!parsed.success) return { success: false, error: 'Invalid file name' };

    const storagePath = tourStoragePath(projectId, fileName);
    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUploadUrl(storagePath);

    if (error || !data?.signedUrl) {
      return { success: false, error: error?.message || 'Could not create signed URL' };
    }
    return { success: true, signedUrl: data.signedUrl, storagePath };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to generate upload URL' };
  }
}

export interface RegisterTourSceneResult {
  success: boolean;
  scene?: TourSceneRecord;
  error?: string;
}

/** Step 2 — after upload, register the scene row + bump project counts.
 *  The first scene of a tour also becomes its preview and starting scene. */
export async function registerTourScene(
  projectId: string,
  fileName: string,
  storagePath: string,
): Promise<RegisterTourSceneResult> {
  await requireUser();

  const parsed = RegisterTourSceneSchema.safeParse({ projectId, fileName, storagePath });
  if (!parsed.success) {
    return { success: false, error: 'Invalid input: ' + parsed.error.issues[0]?.message };
  }

  const { data: pub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(storagePath);
  const publicUrl = pub?.publicUrl;
  if (!publicUrl) return { success: false, error: 'Could not resolve public URL' };

  // Scene name defaults to the file name without extension ("Wohnzimmer.jpg" → "Wohnzimmer").
  const defaultName = fileName.replace(/\.[^.]+$/, '');

  const { data, error } = await supabaseAdmin
    .from('tour_scenes')
    .insert({
      tour_project_id: projectId,
      image_path: publicUrl,
      name: defaultName,
      image_filename: fileName,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select('id, name, image_path, image_filename, scene_index, initial_pitch, initial_yaw, initial_hfov')
    .single();

  if (error) {
    console.error('Error registering tour scene:', error);
    return { success: false, error: error.message };
  }

  await syncTourProjectMeta(projectId, { newSceneUrl: publicUrl, newSceneId: data.id });

  revalidatePath(`/tours/${projectId}`);
  return { success: true, scene: data };
}

/** Recompute total_scenes and backfill preview/start scene after add/remove. */
async function syncTourProjectMeta(
  projectId: string,
  opts?: { newSceneUrl?: string; newSceneId?: string },
) {
  const [{ count }, projectRes, firstSceneRes] = await Promise.all([
    supabaseAdmin
      .from('tour_scenes')
      .select('*', { count: 'exact', head: true })
      .eq('tour_project_id', projectId),
    supabaseAdmin
      .from('tour_projects')
      .select('start_scene_id, preview_url')
      .eq('id', projectId)
      .maybeSingle(),
    supabaseAdmin
      .from('tour_scenes')
      .select('id, image_path')
      .eq('tour_project_id', projectId)
      .order('scene_index', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const update: Record<string, unknown> = {
    total_scenes: count ?? 0,
    updated_at: new Date().toISOString(),
  };

  const first = firstSceneRes.data;
  if ((count ?? 0) === 0) {
    update.preview_url = null;
    update.start_scene_id = null;
  } else {
    if (!projectRes.data?.preview_url) {
      update.preview_url = opts?.newSceneUrl ?? first?.image_path ?? null;
    }
    if (!projectRes.data?.start_scene_id) {
      update.start_scene_id = opts?.newSceneId ?? first?.id ?? null;
    }
  }

  await supabaseAdmin.from('tour_projects').update(update).eq('id', projectId);
}

export async function renameTourScene(
  sceneId: string,
  name: string,
  projectId: string,
): Promise<{ success: boolean; error?: string }> {
  await requireUser();

  const parsed = RenameTourSceneSchema.safeParse({ sceneId, name });
  if (!parsed.success) {
    return { success: false, error: 'Invalid input: ' + parsed.error.issues[0]?.message };
  }

  const { error } = await supabaseAdmin
    .from('tour_scenes')
    .update({ name: parsed.data.name, updated_at: new Date().toISOString() })
    .eq('id', parsed.data.sceneId);

  if (error) {
    console.error('Error renaming tour scene:', error);
    return { success: false, error: error.message };
  }

  revalidatePath(`/tours/${projectId}`);
  return { success: true };
}

/** Deleting a scene cascades its hotspots (in + out) via FK; the project's
 *  start scene falls back to the first remaining scene. */
export async function deleteTourScene(
  sceneId: string,
  projectId: string,
): Promise<{ success: boolean; error?: string }> {
  await requireUser();

  // If this scene is the current preview, clear it so syncTourProjectMeta refills it.
  const { data: scene } = await supabaseAdmin
    .from('tour_scenes')
    .select('image_path')
    .eq('id', sceneId)
    .maybeSingle();

  const { error } = await supabaseAdmin
    .from('tour_scenes')
    .delete()
    .eq('id', sceneId)
    .eq('tour_project_id', projectId);

  if (error) {
    console.error('Error deleting tour scene:', error);
    return { success: false, error: error.message };
  }

  if (scene?.image_path) {
    await supabaseAdmin
      .from('tour_projects')
      .update({ preview_url: null })
      .eq('id', projectId)
      .eq('preview_url', scene.image_path);
  }
  await syncTourProjectMeta(projectId);

  revalidatePath(`/tours/${projectId}`);
  return { success: true };
}

/** Persist a drag-reordered scene list. */
export async function reorderTourScenes(projectId: string, orderedSceneIds: string[]) {
  await requireUser();

  if (!projectId || !Array.isArray(orderedSceneIds) || orderedSceneIds.length === 0) {
    return { success: false, error: 'Invalid reorder request' };
  }

  const now = new Date().toISOString();
  const results = await Promise.all(
    orderedSceneIds.map((id, index) =>
      supabaseAdmin
        .from('tour_scenes')
        .update({ scene_index: index, updated_at: now })
        .eq('id', id)
        .eq('tour_project_id', projectId)
    )
  );

  const failed = results.find(r => r.error);
  if (failed?.error) {
    console.error('Error reordering tour scenes:', failed.error);
    return { success: false, error: failed.error.message };
  }

  revalidatePath(`/tours/${projectId}`);
  return { success: true };
}

/** Save the camera's current orientation as the scene's entry view. */
export async function updateTourSceneView(
  sceneId: string,
  view: { pitch: number; yaw: number; hfov: number },
  projectId: string,
): Promise<{ success: boolean; error?: string }> {
  await requireUser();

  const parsed = UpdateTourSceneViewSchema.safeParse({ sceneId, ...view });
  if (!parsed.success) {
    return { success: false, error: 'Invalid input: ' + parsed.error.issues[0]?.message };
  }

  const { error } = await supabaseAdmin
    .from('tour_scenes')
    .update({
      initial_pitch: parsed.data.pitch,
      initial_yaw: parsed.data.yaw,
      initial_hfov: parsed.data.hfov,
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.sceneId);

  if (error) {
    console.error('Error updating tour scene view:', error);
    return { success: false, error: error.message };
  }

  revalidatePath(`/tours/${projectId}`);
  return { success: true };
}

/** Choose which scene the tour opens with. */
export async function setTourStartScene(
  projectId: string,
  sceneId: string,
): Promise<{ success: boolean; error?: string }> {
  await requireUser();

  // The start scene must belong to this tour.
  const { data: scene } = await supabaseAdmin
    .from('tour_scenes')
    .select('id')
    .eq('id', sceneId)
    .eq('tour_project_id', projectId)
    .maybeSingle();

  if (!scene) return { success: false, error: 'Scene not found in this tour' };

  const { error } = await supabaseAdmin
    .from('tour_projects')
    .update({ start_scene_id: sceneId, updated_at: new Date().toISOString() })
    .eq('id', projectId);

  if (error) {
    console.error('Error setting tour start scene:', error);
    return { success: false, error: error.message };
  }

  revalidatePath(`/tours/${projectId}`);
  return { success: true };
}
