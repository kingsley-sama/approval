import { supabaseAdmin } from '@/lib/supabase';

/** Escape ilike wildcards so a name containing % or _ matches literally. */
function escapeIlike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Case-insensitive lookup of a project by exact name (trimmed), within one
 * kind. Returns the existing project's id, or null when the name is free. Used
 * to gate project creation in both the UI server action and the automation API;
 * for website reviews the `markup_projects_website_name_unique` partial index
 * (migration 019) backs this against races. Image projects have no unique index
 * on this database — 015's was never applied and four names already collide —
 * so for kind='image' this check is advisory only.
 *
 * Names are unique per kind, not globally: an image project and a website
 * review may both be called "example.com" without colliding.
 */
export async function findProjectIdByName(
  name: string,
  kind: 'image' | 'website' = 'image'
): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('markup_projects')
    .select('id')
    .eq('kind', kind)
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
