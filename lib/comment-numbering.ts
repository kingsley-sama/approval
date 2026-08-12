/**
 * Project-wide comment numbering.
 *
 * Every comment in a project carries a number that is allocated ONCE, when the
 * comment is created, and stored on the row as `display_number`. The contract:
 *
 *   - numbers run continuously across all images in a project
 *     (image 1 → 1..n, image 2 → n+1, …)
 *   - a number is never reused, recomputed, or shifted: deleting a comment
 *     retires its number, adding a comment to an earlier image leaves every
 *     existing number untouched, and reordering images changes nothing
 *   - clients render the stored value; they must not derive numbers from array
 *     position
 *
 * Numbers are quoted in revision correspondence ("please redo comment 7"), so a
 * number that shifts after the fact corrupts the conversation. Both the
 * authenticated server action and the guest share-link route allocate through
 * here so the two views can never diverge.
 */

/**
 * Minimal structural type covering both Supabase clients used in this codebase
 * (the SSR server client and the service-role admin client).
 */
type SupabaseLike = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
  from: (table: string) => any;
};

/**
 * Allocate the next number for a project.
 *
 * Prefers the `next_comment_display_number` Postgres function (migration 016),
 * which increments a per-project counter under a row lock — two comments
 * created at the same moment are serialized and cannot receive the same number.
 *
 * Falls back to a max-based computation when that function is absent (database
 * not yet migrated). The fallback is correct for sequential use but can race
 * under genuine concurrency, so it is a compatibility path, not the design.
 */
export async function allocateProjectCommentNumber(
  supabase: SupabaseLike,
  projectId: string | null | undefined,
): Promise<number> {
  if (projectId) {
    const rpc = await supabase.rpc('next_comment_display_number', {
      p_project_id: projectId,
    });
    if (!rpc.error && typeof rpc.data === 'number' && rpc.data > 0) {
      return rpc.data;
    }
  }

  return computeNextNumberFallback(supabase, projectId);
}

/** Allocate the next number for the project that owns `threadId`. */
export async function allocateCommentNumberForThread(
  supabase: SupabaseLike,
  threadId: string,
): Promise<number> {
  const rpc = await supabase.rpc('next_comment_display_number_for_thread', {
    p_thread_id: threadId,
  });
  if (!rpc.error && typeof rpc.data === 'number' && rpc.data > 0) {
    return rpc.data;
  }

  const { data: thread } = await supabase
    .from('markup_threads')
    .select('project_id')
    .eq('id', threadId)
    .maybeSingle();

  const projectId = (thread as { project_id?: string } | null)?.project_id ?? null;
  if (!projectId) {
    // Orphan thread — number within the thread rather than failing the create.
    const { count } = await supabase
      .from('markup_comments')
      .select('*', { count: 'exact', head: true })
      .eq('thread_id', threadId);
    return (count ?? 0) + 1;
  }

  return computeNextNumberFallback(supabase, projectId);
}

/**
 * Highest number ever used in the project, + 1. Considers `pin_number` as well
 * as `display_number` so projects predating the `display_number` column don't
 * restart from 1 and collide with existing comments.
 */
async function computeNextNumberFallback(
  supabase: SupabaseLike,
  projectId: string | null | undefined,
): Promise<number> {
  if (!projectId) return 1;

  const { data: threads } = await supabase
    .from('markup_threads')
    .select('id')
    .eq('project_id', projectId);

  const threadIds = (threads ?? []).map((t: { id: string }) => t.id);
  if (threadIds.length === 0) return 1;

  const { data: rows } = await supabase
    .from('markup_comments')
    .select('display_number, pin_number')
    .in('thread_id', threadIds);

  const highest = (rows ?? []).reduce(
    (max: number, row: any) => Math.max(max, row.display_number ?? 0, row.pin_number ?? 0),
    0,
  );

  return highest + 1;
}
