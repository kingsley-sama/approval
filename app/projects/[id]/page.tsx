import { getProjectWorkspaceData } from '@/app/actions/threads';
import ProjectWorkspace from './workspace';

interface ProjectPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ name?: string }>;
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
