import { notFound } from 'next/navigation';
import { validateShareToken } from '@/app/actions/share-links';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import PanoramaShareViewer from '@/components/panorama/panorama-share-viewer';

interface PanoramaEmbedPageProps {
  params: Promise<{ token: string }>;
}

export default async function PanoramaEmbedPage({ params }: PanoramaEmbedPageProps) {
  const { token } = await params;
  const { success, shareLink } = await validateShareToken(token);

  if (!success || !shareLink || shareLink.resourceType !== 'panorama_project') {
    notFound();
  }

  const { data: project, error: projectError } = await supabase
    .from('panorama_projects')
    .select('id, project_name')
    .eq('id', shareLink.resourceId)
    .single();

  if (projectError || !project) notFound();

  const { data: imageRows } = await supabase
    .from('panorama_images')
    .select('*')
    .eq('panorama_project_id', shareLink.resourceId)
    .order('image_index', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  const images = imageRows || [];
  const { data: commentRows } = await supabase
    .from('panorama_comments')
    .select('*')
    .in('panorama_image_id', images.map((i: any) => i.id).length ? images.map((i: any) => i.id) : ['__none__'])
    .neq('type', 'reply')
    .order('created_at', { ascending: true });

  const commentsByImage: Record<string, any[]> = {};
  for (const c of commentRows || []) {
    (commentsByImage[c.panorama_image_id] ??= []).push(c);
  }

  let counter = 0;
  const shareImages = images.map((img: any) => ({
    id: img.id,
    name: img.name || img.image_filename || 'Panorama',
    url: img.image_path,
    comments: (commentsByImage[img.id] ?? []).map((c: any) => ({
      id: c.id,
      number: ++counter,
      pitch: c.pitch,
      yaw: c.yaw,
      content: c.content,
      author: c.user_name,
      status: c.status === 'resolved' ? 'resolved' as const : 'active' as const,
    })),
  }));

  return (
    <div className="min-h-screen bg-gray-950">
      <PanoramaShareViewer
        projectName={(project as any).project_name ?? 'Panorama'}
        images={shareImages}
        token={token}
        canComment={shareLink.permissions !== 'view'}
        showHeader={false}
        showImageStrip={false}
      />
    </div>
  );
}
