import type { Metadata } from 'next';
import { getProjectNameForMetadata } from '@/lib/metadata/project-name';
import { getTourWorkspaceData } from '@/app/actions/tour-projects';
import TourEditor from './tour-editor';

interface TourPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ name?: string }>;
}

/** Title the browser tab after the project rather than the product. */
export async function generateMetadata({ params, searchParams }: TourPageProps): Promise<Metadata> {
  const [{ id }, { name }] = await Promise.all([params, searchParams]);
  const projectName =
    (await getProjectNameForMetadata('tour_projects', id)) ??
    (name ? decodeURIComponent(name) : null);

  return projectName ? { title: projectName } : {};
}

export default async function TourProjectPage({ params, searchParams }: TourPageProps) {
  const [{ id }, { name }] = await Promise.all([params, searchParams]);
  const initialData = await getTourWorkspaceData(id);

  return (
    <TourEditor
      projectId={id}
      initialData={initialData}
      fallbackName={name ? decodeURIComponent(name) : undefined}
    />
  );
}
