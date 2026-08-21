import type { Metadata } from 'next';
import { getProjectNameForMetadata } from '@/lib/metadata/project-name';
import { getProjectWorkspaceData } from '@/app/actions/threads';
import ProjectWorkspace from './workspace';

interface ProjectPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ name?: string }>;
}

/** Title the browser tab after the project rather than the product. */
export async function generateMetadata({ params, searchParams }: ProjectPageProps): Promise<Metadata> {
  const [{ id }, { name }] = await Promise.all([params, searchParams]);
  const projectName =
    (await getProjectNameForMetadata('markup_projects', id)) ??
    (name ? decodeURIComponent(name) : null);

  return projectName ? { title: projectName } : {};
}

export default async function ProjectPage({ params, searchParams }: ProjectPageProps) {
  const [{ id }, { name }] = await Promise.all([params, searchParams]);
  const initialData = await getProjectWorkspaceData(id);

  return (
    <ProjectWorkspace
      projectId={id}
      initialData={initialData}
      fallbackName={name ? decodeURIComponent(name) : undefined}
    />
  );
}
