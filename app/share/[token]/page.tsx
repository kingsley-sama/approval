/**
 * Share Page - Public access via token
 * Allows clients to view, comment, and draw on shared images without authentication
 */

import { notFound, redirect } from 'next/navigation';
import { validateShareToken } from '@/app/actions/share-links';
import { supabase } from '@/lib/supabase';
import ShareViewer from '@/components/share-viewer';

interface SharePageProps {
  params: {
    token: string;
  };
}

export default async function SharePage({ params }: SharePageProps) {
  const { token } = params;

  // Validate share token
  const { success, shareLink, error } = await validateShareToken(token);

  if (!success || !shareLink) {
    notFound();
  }

  // Fetch resource data based on type
  let resourceData;

  if (shareLink.resourceType === 'thread') {
    // Single image/thread
    const { data, error: fetchError } = await supabase
      .from('markup_threads')
      .select('*, markup_projects(project_name)')
      .eq('id', shareLink.resourceId)
      .single();

    if (fetchError || !data) {
      notFound();
    }

    // Fetch comments if permission allows
    let comments = [];
    if (shareLink.permissions !== 'view') {
      const { data: commentsData } = await supabase
        .from('markup_comments')
        .select('*')
        .eq('thread_id', shareLink.resourceId)
        .order('created_at', { ascending: true });
      
      comments = commentsData || [];
    }

    // Fetch drawings if permission allows
    let drawings = [];
    if (shareLink.permissions === 'draw_and_comment') {
      const { data: drawingsData } = await supabase
        .from('markup_drawings')
        .select('*')
        .eq('thread_id', shareLink.resourceId)
        .order('created_at', { ascending: true });
      
      drawings = drawingsData || [];
    }

    resourceData = {
      type: 'thread',
      thread: data,
      comments,
      drawings,
    };
  } else {
    // Entire project
    const { data: project, error: projectError } = await supabase
      .from('markup_projects')
      .select('*')
      .eq('id', shareLink.resourceId)
      .single();

    if (projectError || !project) {
      notFound();
    }

    const { data: threads, error: threadsError } = await supabase
      .from('markup_threads')
      .select('*')
      .eq('project_id', shareLink.resourceId)
      .order('image_index', { ascending: true });

    if (threadsError) {
      notFound();
    }

    resourceData = {
      type: 'project',
      project,
      threads: threads || [],
    };
  }

  return (
    <ShareViewer
      shareLink={shareLink}
      resourceData={resourceData}
      token={token}
    />
  );
}
