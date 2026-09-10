import { getUser } from '@/lib/db/queries';
import { supabaseAdmin } from '@/lib/supabase';

export async function requireUser() {
  const user = await getUser();
  if (!user) throw new Error('Unauthorized');
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== 'admin') throw new Error('Forbidden');
  return user;
}

export async function requireProjectAccess(projectId: string) {
  const user = await requireUser();
  if (user.role === 'admin') return user;

  const { data } = await (supabaseAdmin as any)
    .from('project_access')
    .select('project_id')
    .eq('project_id', projectId)
    .eq('user_email', user.email)
    .single();

  if (!data) throw new Error('Forbidden');
  return user;
}

/**
 * Whether the signed-in user may open a website review.
 *
 * Admins see every review; a member sees one only once an admin has given it
 * to them (or they opened a share link for it while signed in). This mirrors
 * the check in /api/websites/proxy so the page and the frame inside it agree —
 * they used to disagree, which produced a workspace that rendered fully and
 * then refused to load the site inside it.
 */
export async function hasWebsiteProjectAccess(projectId: string): Promise<boolean> {
  const user = await getUser();
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (!user.email) return false;

  const { data } = await (supabaseAdmin as any)
    .from('website_project_access')
    .select('project_id')
    .eq('project_id', projectId)
    .eq('user_email', user.email)
    .maybeSingle();

  return Boolean(data);
}
