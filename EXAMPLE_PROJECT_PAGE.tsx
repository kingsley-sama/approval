/**
 * Example Project Page
 * Demonstrates integration of all three features
 */

import { notFound } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import EnhancedImageViewer from '@/components/enhanced-image-viewer';
import ProjectDuplicator from '@/components/project-duplicator';
import ShareLinkManager from '@/components/share-link-manager';
import { Button } from '@/components/ui/button';

interface ProjectPageProps {
  params: {
    id: string;
  };
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  // Fetch project data
  const { data: project, error: projectError } = await supabase
    .from('markup_projects')
    .select('*')
    .eq('id', params.id)
    .single();

  if (projectError || !project) {
    notFound();
  }

  // Fetch threads (images)
  const { data: threads, error: threadsError } = await supabase
    .from('markup_threads')
    .select('*')
    .eq('project_id', params.id)
    .order('image_index', { ascending: true });

  if (threadsError) {
    notFound();
  }

  // In a real app, get this from session/auth
  const currentUser = 'admin@company.com';
  const userRole = 'admin'; // or 'pm', 'supplier', 'client'

  // Determine permissions
  const canDuplicate = ['admin', 'pm'].includes(userRole);
  const canShare = ['admin', 'pm'].includes(userRole);
  const canDraw = ['admin', 'pm', 'supplier'].includes(userRole);
  const projectMeta = project as typeof project & {
    is_duplicated?: boolean;
    original_project_id?: string | null;
  };
  const createdDateLabel = project.created_at
    ? new Date(project.created_at).toLocaleDateString()
    : 'Unknown';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Project Header */}
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                {project.project_name}
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                {threads?.length || 0} images • Created {createdDateLabel}
              </p>
              {projectMeta.is_duplicated && (
                <span className="inline-flex items-center px-2 py-1 mt-2 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                  📋 Duplicated Project
                </span>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              {canShare && (
                <ShareLinkManager
                  resourceType="project"
                  resourceId={project.id}
                  createdBy={currentUser}
                  resourceName={project.project_name}
                />
              )}

              {canDuplicate && (
                <ProjectDuplicator
                  projectId={project.id}
                  projectName={project.project_name}
                  createdBy={currentUser}
                  onSuccess={(newProjectId) => {
                    window.location.href = `/project/${newProjectId}`;
                  }}
                />
              )}

              <Button variant="outline" size="sm">
                ⚙️ Settings
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {threads && threads.length > 0 ? (
          <div className="space-y-12">
            {threads.map((thread) => (
              <div key={thread.id} className="bg-white rounded-lg shadow-lg overflow-hidden">
                <EnhancedImageViewer
                  threadId={thread.id}
                  threadName={thread.thread_name}
                  imagePath={thread.image_path || '/placeholder.jpg'}
                  imageWidth={1200}
                  imageHeight={800}
                  projectId={project.id}
                  projectName={project.project_name}
                  currentUser={currentUser}
                  canDraw={canDraw}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg">No images in this project yet</p>
            <Button className="mt-4">Upload Images</Button>
          </div>
        )}
      </main>

      {/* Project Info Sidebar (Optional) */}
      <aside className="fixed right-0 top-20 w-80 h-full bg-white border-l p-6 overflow-y-auto hidden xl:block">
        <h3 className="font-semibold text-lg mb-4">Project Details</h3>
        
        <div className="space-y-4 text-sm">
          <div>
            <label className="text-gray-600">Total Images</label>
            <p className="font-medium">{threads?.length || 0}</p>
          </div>

          <div>
            <label className="text-gray-600">Total Threads</label>
            <p className="font-medium">{project.total_threads || 0}</p>
          </div>

          <div>
            <label className="text-gray-600">Created</label>
            <p className="font-medium">
              {createdDateLabel}
            </p>
          </div>

          {projectMeta.is_duplicated && (
            <div>
              <label className="text-gray-600">Duplicated From</label>
              <p className="font-medium">
                <a 
                  href={`/project/${projectMeta.original_project_id}`}
                  className="text-blue-600 hover:underline"
                >
                  View Original
                </a>
              </p>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="mt-8 space-y-2">
          <h4 className="font-semibold mb-3">Quick Actions</h4>
          
          {canShare && (
            <ShareLinkManager
              resourceType="project"
              resourceId={project.id}
              createdBy={currentUser}
              resourceName={project.project_name}
            />
          )}

          <Button variant="outline" size="sm" className="w-full">
            📊 Export Report
          </Button>

          <Button variant="outline" size="sm" className="w-full">
            📧 Email Summary
          </Button>
        </div>
      </aside>
    </div>
  );
}
