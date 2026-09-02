import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getProjectNameForMetadata } from '@/lib/metadata/project-name';
import { getProjectWorkspaceData } from '@/app/actions/threads';
import { getWebsiteProjectMeta } from '@/app/actions/website-projects';
import ProjectWorkspace from '@/app/projects/[id]/workspace';

interface WebsitePageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ name?: string }>;
}

export async function generateMetadata({ params, searchParams }: WebsitePageProps): Promise<Metadata> {
  const [{ id }, { name }] = await Promise.all([params, searchParams]);
  const projectName =
    (await getProjectNameForMetadata('markup_projects', id)) ??
    (name ? decodeURIComponent(name) : null);

  return projectName ? { title: projectName } : {};
}

/**
 * The website workspace is the annotation workspace. A capture is a
 * markup_thread holding a screenshot, so the same component serves both
 * sections — `variant="website"` only swaps the chrome (address bar,
 * re-capture, add pages) around an otherwise identical surface.
 */
export default async function WebsiteProjectPage({ params, searchParams }: WebsitePageProps) {
  const [{ id }, { name }] = await Promise.all([params, searchParams]);

  const meta = await getWebsiteProjectMeta(id);
  // Guard the route rather than silently rendering an image project here:
  // the address bar and re-capture controls would have nothing to act on.
  if (!meta) notFound();

  const initialData = await getProjectWorkspaceData(id);

  return (
    <ProjectWorkspace
      projectId={id}
      initialData={initialData}
      fallbackName={name ? decodeURIComponent(name) : meta.name}
      variant="website"
    />
  );
}
