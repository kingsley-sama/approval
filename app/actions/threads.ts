'use server';

import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireUser } from '@/lib/auth/require-user';
import { CreateThreadSchema } from '@/lib/validation/schemas';
import { revalidatePath, unstable_noStore as noStore } from 'next/cache';
import { getCommentsForThreads, type DbComment } from './comments';
import { getAttachmentsForComments } from './storage';

export interface WorkspaceData {
  projectName: string | null;
  threads: any[];
  commentsByThread: Record<string, DbComment[]>;
  currentUser: { name: string; role: string };
}

/**
 * Everything the annotation workspace needs to render, in one server call:
 * threads, all pin comments (attachments attached), project name, and the
 * current user. Replaces the threads → comments-per-thread → attachments
 * round-trip chain the client used to make after hydration.
 */
export async function getProjectWorkspaceData(projectId: string): Promise<WorkspaceData> {
  // Never serve this from Next's data cache: it's re-fetched right after an
  // upload to show the new image, and a cached read makes the freshly added
  // thread silently missing until something else busts the cache.
  noStore();
  const user = await requireUser();
  const supabase = await createClient();

  const [threadsRes, projectRes] = await Promise.all([
    supabase
      .from('markup_threads')
      .select('*')
      .eq('project_id', projectId)
      .order('image_index', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }),
    supabase
      .from('markup_projects')
      .select('project_name')
      .eq('id', projectId)
      .maybeSingle(),
  ]);

  if (threadsRes.error) {
    console.error('Error fetching workspace threads:', threadsRes.error);
  }
  const threads = threadsRes.data ?? [];

  const commentsByThread = await getCommentsForThreads(threads.map((t: any) => t.id));
  const allCommentIds = Object.values(commentsByThread).flat().map((c) => c.id);
  const attachmentsByComment = await getAttachmentsForComments(allCommentIds);
  for (const comments of Object.values(commentsByThread)) {
    for (const comment of comments) {
      comment.attachments = attachmentsByComment[comment.id] ?? [];
    }
  }

  return {
    projectName: (projectRes.data as { project_name: string | null } | null)?.project_name ?? null,
    threads,
    commentsByThread,
    currentUser: { name: user.name || user.email, role: user.role ?? 'member' },
  };
}

export async function getProjectThreads(projectId: string) {
  noStore();
  await requireUser();
  const supabase = await createClient();
  try {
    const { data, error } = await supabase
      .from('markup_threads')
      .select('*')
      .eq('project_id', projectId)
      .order('image_index', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching threads:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Unexpected error fetching threads:', error);
    return [];
  }
}

export async function createThread(projectId: string, fileData: { path: string; name: string; filename: string }) {
  await requireUser();

  const parsed = CreateThreadSchema.safeParse({ projectId, fileData });
  if (!parsed.success) {
    return { success: false, error: 'Invalid input: ' + parsed.error.issues[0]?.message };
  }

  const supabase = await createClient();
  try {
    const { data, error } = await supabase
      .from('markup_threads')
      .insert({
        project_id: projectId,
        image_path: fileData.path,
        thread_name: fileData.name,
        image_filename: fileData.filename,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating thread:', error);
      return { success: false, error: error.message };
    }

    // Update project total_threads count
    const { count } = await supabase
      .from('markup_threads')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId);

    await supabase
      .from('markup_projects')
      .update({ total_threads: count })
      .eq('id', projectId);

    revalidatePath(`/projects/${projectId}`);
    return { success: true, thread: data };
  } catch (error) {
    console.error('Unexpected error creating thread:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Convert a Supabase public storage URL back into a bucket-relative object path.
 * `markup_threads.image_path` stores the full public URL, but the storage API
 * deletes by path. Returns null for anything that isn't a public URL for the
 * given bucket (external URLs, placeholders), so callers skip the file delete
 * rather than guessing.
 */
function storagePathFromPublicUrl(url: string, bucket: string): string | null {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  const raw = url.slice(idx + marker.length).split('?')[0].split('#')[0];
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * Delete a single image (thread) from a project, leaving the rest of the
 * revision intact.
 *
 * Cleanup performed:
 *   - the thread's comments and drawings go via FK `ON DELETE CASCADE`, and each
 *     comment's attachment rows cascade from those
 *   - attachment files in Storage are removed explicitly (their rows cascade
 *     away, so their paths are collected BEFORE the delete or they'd be lost)
 *   - the image file itself is removed only when no other thread still points at
 *     the same URL. Duplicated projects copy the thread row verbatim, so the
 *     same object can back several threads; deleting it unconditionally would
 *     blank the image in the other project.
 *
 * Comment numbering is untouched: numbers are allocated from a per-project
 * counter that only moves forward, so removing an image retires its comments'
 * numbers rather than freeing them for reuse.
 */
export async function deleteThread(threadId: string, projectId: string) {
  await requireUser();

  if (!threadId || !projectId) {
    return { success: false, error: 'Invalid delete request' };
  }

  const supabase = await createClient();

  try {
    // Confirm the thread belongs to the stated project before touching anything.
    const { data: thread, error: threadErr } = await supabase
      .from('markup_threads')
      .select('id, project_id, image_path')
      .eq('id', threadId)
      .eq('project_id', projectId)
      .maybeSingle();

    if (threadErr || !thread) {
      return { success: false, error: 'Image not found in this project' };
    }

    // Collect attachment paths now — the rows cascade away with the comments.
    const { data: comments } = await supabase
      .from('markup_comments')
      .select('id')
      .eq('thread_id', threadId);

    const commentIds = (comments ?? []).map((c: { id: string }) => c.id);
    let attachmentPaths: string[] = [];
    if (commentIds.length > 0) {
      const { data: attachments } = await supabase
        .from('comment_attachments')
        .select('storage_path')
        .in('comment_id', commentIds);
      attachmentPaths = (attachments ?? [])
        .map((a: { storage_path: string }) => a.storage_path)
        .filter(Boolean);
    }

    // Is this image still referenced by another thread (e.g. a duplicated project)?
    const imagePath = (thread as { image_path: string | null }).image_path;
    let imageIsShared = false;
    if (imagePath) {
      const { count } = await supabase
        .from('markup_threads')
        .select('*', { count: 'exact', head: true })
        .eq('image_path', imagePath)
        .neq('id', threadId);
      imageIsShared = (count ?? 0) > 0;
    }

    const { error: deleteErr } = await supabase
      .from('markup_threads')
      .delete()
      .eq('id', threadId)
      .eq('project_id', projectId);

    if (deleteErr) {
      console.error('Error deleting thread:', deleteErr);
      return { success: false, error: deleteErr.message };
    }

    // Storage cleanup is best-effort: the row is already gone, and a failed file
    // delete leaves an unreferenced object rather than a broken revision.
    const bucket = process.env.NEXT_PUBLIC_SUPABASE_BUCKET_NAME || 'screenshots';
    const filesToRemove = [...attachmentPaths];
    if (imagePath && !imageIsShared) {
      const objectPath = storagePathFromPublicUrl(imagePath, bucket);
      if (objectPath) filesToRemove.push(objectPath);
    }
    if (filesToRemove.length > 0) {
      const { error: storageErr } = await supabaseAdmin.storage
        .from(bucket)
        .remove(filesToRemove);
      if (storageErr) {
        console.error('Thread deleted but storage cleanup failed:', storageErr);
      }
    }

    // Keep the project's cached image count consistent with reality.
    const { count: remaining } = await supabase
      .from('markup_threads')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId);

    await supabase
      .from('markup_projects')
      .update({ total_threads: remaining ?? 0 })
      .eq('id', projectId);

    revalidatePath(`/projects/${projectId}`);
    return { success: true };
  } catch (error) {
    console.error('Unexpected error deleting thread:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Persist a new image (thread) ordering for a project. `orderedThreadIds` is the
 * full list of the project's thread ids in their desired display order; each
 * thread's `image_index` is set to its position so subsequent loads (which order
 * by `image_index`) reflect the new arrangement.
 */
export async function reorderThreads(projectId: string, orderedThreadIds: string[]) {
  await requireUser();

  if (!projectId || !Array.isArray(orderedThreadIds) || orderedThreadIds.length === 0) {
    return { success: false, error: 'Invalid reorder request' };
  }

  const supabase = await createClient();
  try {
    const now = new Date().toISOString();
    const results = await Promise.all(
      orderedThreadIds.map((id, index) =>
        supabase
          .from('markup_threads')
          .update({ image_index: index, updated_at: now })
          .eq('id', id)
          .eq('project_id', projectId)
      )
    );

    const failed = results.find(r => r.error);
    if (failed?.error) {
      console.error('Error reordering threads:', failed.error);
      return { success: false, error: failed.error.message };
    }

    revalidatePath(`/projects/${projectId}`);
    return { success: true };
  } catch (error) {
    console.error('Unexpected error reordering threads:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}
