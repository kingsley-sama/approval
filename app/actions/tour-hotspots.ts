'use server';

import { supabaseAdmin } from '@/lib/supabase';
import { requireUser } from '@/lib/auth/require-user';
import { CreateTourHotspotSchema, UpdateTourHotspotSchema } from '@/lib/validation/schemas';
import { revalidatePath } from 'next/cache';
import type { TourHotspotRecord } from './tour-projects';

export interface TourHotspotResult {
  success: boolean;
  hotspot?: TourHotspotRecord;
  error?: string;
}

/** Both scenes must exist and belong to the same tour project. */
async function validateScenePair(sceneId: string, targetSceneId: string): Promise<string | null> {
  if (sceneId === targetSceneId) return 'A scene cannot link to itself';

  const { data: scenes, error } = await supabaseAdmin
    .from('tour_scenes')
    .select('id, tour_project_id')
    .in('id', [sceneId, targetSceneId]);

  if (error) return error.message;
  if (!scenes || scenes.length !== 2) return 'Scene not found';
  if (scenes[0].tour_project_id !== scenes[1].tour_project_id) {
    return 'Scenes belong to different tours';
  }
  return null;
}

/** Place a navigation link inside a scene: clicking it walks to the target scene. */
export async function createTourHotspot(
  input: {
    sceneId: string;
    targetSceneId: string;
    pitch: number;
    yaw: number;
    label?: string;
  },
  projectId: string,
): Promise<TourHotspotResult> {
  await requireUser();

  const parsed = CreateTourHotspotSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Invalid input: ' + parsed.error.issues[0]?.message };
  }

  const pairError = await validateScenePair(parsed.data.sceneId, parsed.data.targetSceneId);
  if (pairError) return { success: false, error: pairError };

  const { data, error } = await supabaseAdmin
    .from('tour_hotspots')
    .insert({
      scene_id: parsed.data.sceneId,
      target_scene_id: parsed.data.targetSceneId,
      pitch: parsed.data.pitch,
      yaw: parsed.data.yaw,
      label: parsed.data.label || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select('id, scene_id, target_scene_id, pitch, yaw, label, target_pitch, target_yaw')
    .single();

  if (error) {
    console.error('Error creating tour hotspot:', error);
    return { success: false, error: error.message };
  }

  revalidatePath(`/tours/${projectId}`);
  return { success: true, hotspot: data };
}

/** Retarget, relabel, or move an existing navigation link. */
export async function updateTourHotspot(
  input: {
    hotspotId: string;
    targetSceneId?: string;
    pitch?: number;
    yaw?: number;
    label?: string | null;
  },
  projectId: string,
): Promise<TourHotspotResult> {
  await requireUser();

  const parsed = UpdateTourHotspotSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Invalid input: ' + parsed.error.issues[0]?.message };
  }

  if (parsed.data.targetSceneId) {
    const { data: existing } = await supabaseAdmin
      .from('tour_hotspots')
      .select('scene_id')
      .eq('id', parsed.data.hotspotId)
      .maybeSingle();

    if (!existing) return { success: false, error: 'Hotspot not found' };
    const pairError = await validateScenePair(existing.scene_id, parsed.data.targetSceneId);
    if (pairError) return { success: false, error: pairError };
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.targetSceneId !== undefined) update.target_scene_id = parsed.data.targetSceneId;
  if (parsed.data.pitch !== undefined) update.pitch = parsed.data.pitch;
  if (parsed.data.yaw !== undefined) update.yaw = parsed.data.yaw;
  if (parsed.data.label !== undefined) update.label = parsed.data.label || null;

  const { data, error } = await supabaseAdmin
    .from('tour_hotspots')
    .update(update)
    .eq('id', parsed.data.hotspotId)
    .select('id, scene_id, target_scene_id, pitch, yaw, label, target_pitch, target_yaw')
    .single();

  if (error) {
    console.error('Error updating tour hotspot:', error);
    return { success: false, error: error.message };
  }

  revalidatePath(`/tours/${projectId}`);
  return { success: true, hotspot: data };
}

export async function deleteTourHotspot(
  hotspotId: string,
  projectId: string,
): Promise<{ success: boolean; error?: string }> {
  await requireUser();

  const { error } = await supabaseAdmin
    .from('tour_hotspots')
    .delete()
    .eq('id', hotspotId);

  if (error) {
    console.error('Error deleting tour hotspot:', error);
    return { success: false, error: error.message };
  }

  revalidatePath(`/tours/${projectId}`);
  return { success: true };
}
