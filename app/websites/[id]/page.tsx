import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getProjectNameForMetadata } from '@/lib/metadata/project-name';
import { getProjectWorkspaceData } from '@/app/actions/threads';
import { getWebsiteProjectMeta } from '@/app/actions/website-projects';
import { hasWebsiteProjectAccess } from '@/lib/auth/require-user';
import { Lock } from 'lucide-react';
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

  // Say so here rather than letting the workspace render and the framed site
  // fail with "You do not have access to this review" inside it. A member who
  // has not been given the review should be told, not handed broken chrome.
  if (!(await hasWebsiteProjectAccess(id))) {
    return (
      <div className="flex h-screen items-center justify-center bg-background p-6">
        <div className="max-w-sm text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Lock className="h-5 w-5 text-muted-foreground" />
          </div>
          <h1 className="mb-2 text-lg font-semibold">You don&apos;t have access to this review</h1>
          <p className="text-sm text-muted-foreground">
            Ask an admin to give you access to{' '}
            <span className="font-medium text-foreground">{meta.name}</span>, or open the
            share link they sent you.
          </p>
        </div>
      </div>
    );
  }

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
