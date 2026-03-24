'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function getProjectThreads(projectId: string) {
  const supabase = await createClient();
  try {
    const { data, error } = await supabase
      .from('markup_threads')
      .select('*')
      .eq('project_id', projectId)
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

    revalidatePath(`/project/${projectId}`);
    return { success: true, thread: data };
  } catch (error) {
    console.error('Unexpected error creating thread:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}
