/**
 * Share Page - Public access via token
 * Allows clients to view, comment, and draw on shared images without authentication
 */

import { notFound, redirect } from 'next/navigation';
import { validateShareToken } from '@/app/actions/share-links';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import ShareViewer from '@/components/share-viewer';
import { getAttachmentsForComments } from '@/app/actions/storage';
import { getUser } from '@/lib/db/queries';

interface SharePageProps {
  params: Promise<{ token: string }>;
}

export default async function SharePage({ params }: SharePageProps) {
  const { token } = await params;

  // Detect logged-in session (non-blocking — null if not authenticated)
  const sessionUser = await getUser();

  // Validate share token
  const { success, shareLink } = await validateShareToken(token);

  if (!success || !shareLink) {
    notFound();
  }

  let resourceData: any;

  const hydrateDrawingData = async (comments: any[]) => {
    const visible = comments.filter((c: any) => c.type !== 'reply' && !c.parent_comment_id);
    const drawingIds = Array.from(new Set(
      visible
        .map((c: any) => c.drawing_id)
        .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0),
    ));

    if (drawingIds.length === 0) return visible;

    const { data: drawings } = await supabase
      .from('markup_drawings')
      .select('id, drawing_data')
      .in('id', drawingIds);

    const byId = new Map<string, any>((drawings || []).map((d: any) => [d.id, d.drawing_data]));

    return visible.map((comment: any) => {
      if (comment.drawing_data != null) return comment;
      if (!comment.drawing_id) return comment;
      const drawingData = byId.get(comment.drawing_id);
      if (drawingData == null) return comment;
      return { ...comment, drawing_data: drawingData };
    });
  };

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

    const allComments = await hydrateDrawingData(comments || []);
    const attachmentsByComment = await getAttachmentsForComments(allComments.map((c: any) => c.id));

    resourceData = {
      type: 'thread',
      thread,
      comments: allComments,
      attachmentsByComment,
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
          .then(async ({ data }) => ({
            threadId: t.id,
            comments: await hydrateDrawingData(data || []),
          }))
      )
    );

    const commentsByThread: Record<string, any[]> = {};
    for (const r of commentResults) {
      commentsByThread[r.threadId] = r.comments;
    }

    const allCommentIds = Object.values(commentsByThread).flat().map((c: any) => c.id);
    const attachmentsByComment = await getAttachmentsForComments(allCommentIds);

    resourceData = {
      type: 'project',
      project,
      threads: threadList,
      commentsByThread,
      attachmentsByComment,
    };
  }

  // Resolve the project ID and name regardless of resource type
  const projectId =
    shareLink!.resourceType === 'project'
      ? shareLink!.resourceId
      : (resourceData.thread as any)?.project_id ?? null;

  const projectName =
    shareLink!.resourceType === 'project'
      ? (resourceData.project as any)?.project_name ?? 'Project'
      : (resourceData.thread as any)?.markup_projects?.project_name ?? 'Project';

  // Logged-in users: auto-save project access then redirect to the real project page.
  // They get the full app UI (with role-based feature gating) instead of a guest viewer.
  if (sessionUser && projectId) {
    if (sessionUser.role !== 'admin') {
      await supabase
        .from('project_access')
        .upsert(
          { project_id: projectId, user_email: sessionUser.email, granted_by: 'share_link' },
          { onConflict: 'project_id,user_email' }
        );
    }
    redirect(`/projects/${projectId}?name=${encodeURIComponent(projectName)}`);
  }

  return (
    <ShareViewer
      shareLink={shareLink!}
      resourceData={resourceData}
      token={token}
    />
  );
}
