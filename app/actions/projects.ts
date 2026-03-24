'use server';

import { createClient } from '@/lib/supabase/server';
import { storageServiceAdmin } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';

export interface CreateProjectInput {
  name: string;
  imageUrl?: string;
  description?: string;
}

export interface CreateProjectResult {
  success: boolean;
  project?: any;
  error?: string;
}

export async function createProject(input: CreateProjectInput): Promise<CreateProjectResult> {
  const supabase = await createClient()
  try {
    const { data, error } = await supabase
      .from('markup_projects')
      .insert({
        project_name: input.name,
        markup_url: input.imageUrl || '/placeholder.svg',
        raw_payload: input.description ? { description: input.description } : null,
        total_screenshots: 0,
        total_threads: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating project:', error);
      return { success: false, error: error.message };
    }

    revalidatePath('/');
    return { success: true, project: data };
  } catch (error) {
    console.error('Unexpected error creating project:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

export async function getProjects() {
  const supabase = await createClient()
  try {
    const { data, error } = await supabase
      .from('markup_projects')
      .select(`
        *,
        markup_threads (
          image_path,
          image_filename,
          created_at
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching projects:', error);
      return [];
    }

    // Attach the first thread's image as thumbnail
    return (data || []).map((p: any) => {
      const threads: any[] = p.markup_threads ?? [];
      const sorted = [...threads].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      const firstImage = sorted[0]?.image_path || null;
      return { ...p, first_image: firstImage };
    });
  } catch (error) {
    console.error('Unexpected error fetching projects:', error);
    return [];
  }
}

export async function deleteProject(projectId: string) {
  const supabase = await createClient()
  try {
    // First, get all threads for this project to know which files to check
    const { data: threads } = await supabase
      .from('markup_threads')
      .select('image_filename')
      .eq('project_id', projectId);

    // Delete the project from database (this will cascade delete threads and comments)
    const { error } = await supabase
      .from('markup_projects')
      .delete()
      .eq('id', projectId);

    if (error) {
      console.error('Error deleting project:', error);
      return { success: false, error: error.message };
    }

    // Clean up storage files only if they're not used by other projects
    if (threads && threads.length > 0) {
      try {
        const filePaths = threads
          .filter(t => t.image_filename)
          .map(t => t.image_filename!)
          .filter((path): path is string => path !== null);
        
        if (filePaths.length > 0) {
          // Check each file to see if it's used by other projects before deleting
          for (const filePath of filePaths) {
            const { count } = await supabase
              .from('markup_threads')
              .select('*', { count: 'exact', head: true })
              .eq('image_filename', filePath);
            
            // Only delete if no other threads reference this file
            if (count === 0) {
              try {
                await storageServiceAdmin.deleteFile(filePath);
              } catch (deleteError) {
                console.warn(`Failed to delete file ${filePath}:`, deleteError);
              }
            }
          }
        }
      } catch (storageError) {
        // Log storage errors but don't fail the operation
        console.warn('Failed to clean up some storage files:', storageError);
      }
    }

    revalidatePath('/');
    return { success: true };
  } catch (error) {
    console.error('Unexpected error deleting project:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}
