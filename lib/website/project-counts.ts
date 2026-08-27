import { supabaseAdmin } from '@/lib/supabase';

/**
 * Keeps a website review's thread counts and cover image in step, the way
 * lib/api/ingest-images.ts does for uploaded images.
 *
 * Deliberately a plain module rather than a server action: the capture
 * callback route calls it after authenticating with the worker secret, not a
 * user session. Exporting it from a 'use server' file would also publish it as
 * a client-callable endpoint taking an arbitrary project id, which it has no
 * business being.
 */
export async function refreshProjectCounts(projectId: string): Promise<void> {
  const { count } = await supabaseAdmin
    .from('markup_threads')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId);

  const { data: cover } = await supabaseAdmin
    .from('markup_threads')
    .select('image_path')
    .eq('project_id', projectId)
    .not('image_path', 'is', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  const update: Record<string, unknown> = {
    total_threads: count ?? 0,
    total_screenshots: count ?? 0,
    updated_at: new Date().toISOString(),
  };
  const coverUrl = (cover as { image_path: string | null } | null)?.image_path;
  if (coverUrl) update.markup_url = coverUrl;

  await supabaseAdmin.from('markup_projects').update(update).eq('id', projectId);
}
