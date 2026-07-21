import { notFound } from 'next/navigation';
import { validateShareToken } from '@/app/actions/share-links';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import TourShareViewer from '@/components/tour/tour-share-viewer';
import { mapScenesToPlayer } from '@/lib/tours';

interface TourEmbedPageProps {
  params: Promise<{ token: string }>;
}

export default async function TourEmbedPage({ params }: TourEmbedPageProps) {
  const { token } = await params;
  const { success, shareLink } = await validateShareToken(token);

  if (!success || !shareLink || shareLink.resourceType !== 'tour_project') {
    notFound();
  }

  const { data: project, error: projectError } = await supabase
    .from('tour_projects')
    .select('id, project_name, start_scene_id')
    .eq('id', shareLink.resourceId)
    .single();

  if (projectError || !project) notFound();

  const { data: sceneRows } = await supabase
    .from('tour_scenes')
    .select('*')
    .eq('tour_project_id', shareLink.resourceId)
    .order('scene_index', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  const scenes = sceneRows || [];
  const { data: hotspotRows } = scenes.length
    ? await supabase
        .from('tour_hotspots')
        .select('*')
        .in('scene_id', scenes.map((s) => s.id))
    : { data: [] };

  const hotspotsByScene: Record<string, any[]> = {};
  for (const h of hotspotRows || []) {
    (hotspotsByScene[h.scene_id] ??= []).push(h);
  }

  return (
    <TourShareViewer
      tourName={project.project_name ?? 'Virtual tour'}
      scenes={mapScenesToPlayer(scenes, hotspotsByScene)}
      startSceneId={project.start_scene_id}
      showHeader={false}
    />
  );
}
