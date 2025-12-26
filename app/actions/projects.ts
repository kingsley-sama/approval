'use server';

import { supabase } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';

export interface CreateProjectInput {
  name: string;
  imageUrl?: string;
}

export interface CreateProjectResult {
  success: boolean;
  project?: any;
  error?: string;
}

export async function createProject(input: CreateProjectInput): Promise<CreateProjectResult> {
  try {
    const { data, error } = await supabase
      .from('markup_projects')
      .insert({
        project_name: input.name,
        markup_url: input.imageUrl || '/placeholder.svg', // Default image if none provided
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
  try {
    const { data, error } = await supabase
      .from('markup_projects')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching projects:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Unexpected error fetching projects:', error);
    return [];
  }
}

export async function deleteProject(projectId: string) {
  try {
    const { error } = await supabase
      .from('markup_projects')
      .delete()
      .eq('id', projectId);

    if (error) {
      console.error('Error deleting project:', error);
      return { success: false, error: error.message };
    }

    revalidatePath('/');
    return { success: true };
  } catch (error) {
    console.error('Unexpected error deleting project:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}
