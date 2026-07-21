/**
 * Pure mapping helpers shared by the tour editor, share page, and embed page:
 * turn DB rows (tour_scenes + tour_hotspots) into the TourPlayer's scene shape.
 */

import type { TourPlayerScene } from '@/components/tour/tour-player';

export interface TourSceneRow {
  id: string;
  name: string | null;
  image_path: string;
  image_filename: string | null;
  initial_pitch: number | null;
  initial_yaw: number | null;
  initial_hfov: number | null;
}

export interface TourHotspotRow {
  id: string;
  scene_id: string;
  target_scene_id: string;
  pitch: number;
  yaw: number;
  label: string | null;
  target_pitch: number | null;
  target_yaw: number | null;
}

export function tourSceneName(scene: Pick<TourSceneRow, 'name' | 'image_filename'>): string {
  return scene.name || scene.image_filename || 'Scene';
}

export function mapScenesToPlayer(
  scenes: TourSceneRow[],
  hotspotsByScene: Record<string, TourHotspotRow[]>,
): TourPlayerScene[] {
  const nameById = new Map(scenes.map(s => [s.id, tourSceneName(s)]));
  return scenes.map((scene) => ({
    id: scene.id,
    name: tourSceneName(scene),
    url: scene.image_path,
    initialPitch: scene.initial_pitch ?? 0,
    initialYaw: scene.initial_yaw ?? 0,
    initialHfov: scene.initial_hfov ?? 110,
    hotspots: (hotspotsByScene[scene.id] ?? [])
      // A hotspot whose target scene was deleted can't be walked — hide it.
      .filter(h => nameById.has(h.target_scene_id))
      .map(h => ({
        id: h.id,
        pitch: h.pitch,
        yaw: h.yaw,
        label: h.label || nameById.get(h.target_scene_id) || 'Scene',
        targetSceneId: h.target_scene_id,
        targetPitch: h.target_pitch,
        targetYaw: h.target_yaw,
      })),
  }));
}
