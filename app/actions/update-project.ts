'use server';

import { supabaseAdmin as supabase } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/require-user';
import { RenameProjectSchema } from '@/lib/validation/schemas';

export async function updateProjectImage(projectId: string, imageUrl: string) {
  try {
    const { error } = await supabase
      .from('markup_projects')
      .update({ markup_url: imageUrl })
      .eq('id', projectId);

    if (error) {
      console.error('Error updating project image:', error);
      return { success: false, error: error.message };
    }

    revalidatePath('/');
    revalidatePath(`/project/${projectId}`);
    return { success: true };
  } catch (error) {
    console.error('Unexpected error updating project image:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

export async function renameProject(
  projectId: string,
  name: string
): Promise<{ success: boolean; error?: string; project?: { id: string; project_name: string } }> {
  try {
    await requireAdmin();
  } catch {
    return { success: false, error: 'Unauthorized' };
  }

  const parsed = RenameProjectSchema.safeParse({ projectId, name });
  if (!parsed.success) {
    return { success: false, error: 'Invalid input: ' + parsed.error.issues[0]?.message };
  }

  try {
    const { data, error } = await supabase
      .from('markup_projects')
      .update({
        project_name: parsed.data.name,
        updated_at: new Date().toISOString(),
      })
      .eq('id', parsed.data.projectId)
      .select('id, project_name')
      .single();

    if (error) {
      console.error('Error renaming project:', error);
      return { success: false, error: error.message };
    }

    revalidatePath('/');
    revalidatePath('/projects');
    revalidatePath(`/project/${parsed.data.projectId}`);
    revalidatePath(`/projects/${parsed.data.projectId}`);
    return { success: true, project: data as any };
  } catch (error) {
    console.error('Unexpected error renaming project:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}
