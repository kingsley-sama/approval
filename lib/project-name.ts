import { supabaseAdmin } from '@/lib/supabase';

/** Escape ilike wildcards so a name containing % or _ matches literally. */
function escapeIlike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Case-insensitive lookup of a project by exact name (trimmed). Returns the
 * existing project's id, or null when the name is free. Used to gate project
 * creation in both the UI server action and the automation API; the
 * `markup_projects_name_unique` index (migration 015) backs this against races.
 */
export async function findProjectIdByName(name: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('markup_projects')
    .select('id')
    .ilike('project_name', escapeIlike(name.trim()))
    .limit(1)
    .maybeSingle();

  if (error) {
    // Fail open: the unique index still blocks true duplicates at the DB level.
    console.error('Error checking for duplicate project name:', error);
    return null;
  }
  return (data as { id: string } | null)?.id ?? null;
}
