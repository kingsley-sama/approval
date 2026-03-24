'use server';

import { supabaseAdmin as supabase } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';

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
