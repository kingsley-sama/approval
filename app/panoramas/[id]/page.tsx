import { getPanoramaWorkspaceData } from '@/app/actions/panorama-images';
import PanoramaWorkspace from './workspace';

interface PanoramaPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ name?: string }>;
}

export default async function PanoramaProjectPage({ params, searchParams }: PanoramaPageProps) {
  const [{ id }, { name }] = await Promise.all([params, searchParams]);
  const initialData = await getPanoramaWorkspaceData(id);

  return (
    <PanoramaWorkspace
      projectId={id}
      initialData={initialData}
      fallbackName={name ? decodeURIComponent(name) : undefined}
    />
  );
}
