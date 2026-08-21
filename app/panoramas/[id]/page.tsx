import type { Metadata } from 'next';
import { getProjectNameForMetadata } from '@/lib/metadata/project-name';
import { getPanoramaWorkspaceData } from '@/app/actions/panorama-images';
import PanoramaWorkspace from './workspace';

interface PanoramaPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ name?: string }>;
}

/** Title the browser tab after the project rather than the product. */
export async function generateMetadata({ params, searchParams }: PanoramaPageProps): Promise<Metadata> {
  const [{ id }, { name }] = await Promise.all([params, searchParams]);
  const projectName =
    (await getProjectNameForMetadata('panorama_projects', id)) ??
    (name ? decodeURIComponent(name) : null);

  return projectName ? { title: projectName } : {};
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
