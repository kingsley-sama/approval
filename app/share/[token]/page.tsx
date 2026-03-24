/**
 * Share Page - Public access via token
 * Allows clients to view, comment, and draw on shared images without authentication
 */

import { notFound } from 'next/navigation';
import { validateShareToken } from '@/app/actions/share-links';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import ShareViewer from '@/components/share-viewer';

interface SharePageProps {
  params: Promise<{ token: string }>;
}

export default async function SharePage({ params }: SharePageProps) {
  const { token } = await params;

  // Validate share token
  const { success, shareLink } = await validateShareToken(token);

  if (!success || !shareLink) {
    notFound();
  }

  let resourceData: any;

  if (shareLink!.resourceType === 'thread') {
    // Single image/thread share
    const { data: thread, error } = await supabase
      .from('markup_threads')
      .select('*, markup_projects(project_name)')
      .eq('id', shareLink!.resourceId)
      .single();

    if (error || !thread) notFound();

    const { data: comments } = await supabase
      .from('markup_comments')
      .select('*')
      .eq('thread_id', shareLink!.resourceId)
      .order('created_at', { ascending: true });

    resourceData = {
      type: 'thread',
      thread,
      comments: comments || [],
    };
  } else {
    // Full project share
    const { data: project, error: projectError } = await supabase
      .from('markup_projects')
      .select('*')
      .eq('id', shareLink!.resourceId)
      .single();

    if (projectError || !project) notFound();

    const { data: threads, error: threadsError } = await supabase
      .from('markup_threads')
      .select('*')
      .eq('project_id', shareLink!.resourceId)
      .order('created_at', { ascending: true });

    if (threadsError) notFound();

    // Fetch comments for all threads in parallel
    const threadList = threads || [];
    const commentResults = await Promise.all(
      threadList.map((t: any) =>
        supabase
          .from('markup_comments')
          .select('*')
          .eq('thread_id', t.id)
          .order('created_at', { ascending: true })
          .then(({ data }) => ({ threadId: t.id, comments: data || [] }))
      )
    );

    const commentsByThread: Record<string, any[]> = {};
    for (const r of commentResults) {
      commentsByThread[r.threadId] = r.comments;
    }

    resourceData = {
      type: 'project',
      project,
      threads: threadList,
      commentsByThread,
    };
  }

  return (
    <ShareViewer
      shareLink={shareLink!}
      resourceData={resourceData}
      token={token}
    />
  );
}
