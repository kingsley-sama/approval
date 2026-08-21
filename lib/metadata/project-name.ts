import { createClient } from '@/lib/supabase/server';

/** Tables that hold a `project_name` and are opened as a workspace. */
type ProjectTable = 'markup_projects' | 'panorama_projects' | 'tour_projects';

/**
 * Fetch a project's name for `generateMetadata`, so the browser tab is titled
 * on first paint instead of after hydration.
 *
 * Returns null on any failure — a missing tab title is never worth failing a
 * page render over, and the caller falls back to the default product title.
 */
export async function getProjectNameForMetadata(
  table: ProjectTable,
  id: string,
): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from(table)
      .select('project_name')
      .eq('id', id)
      .maybeSingle();

    if (error) return null;
    return (data as { project_name?: string | null } | null)?.project_name ?? null;
  } catch {
    return null;
  }
}
