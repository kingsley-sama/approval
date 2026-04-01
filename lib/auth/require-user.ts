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
