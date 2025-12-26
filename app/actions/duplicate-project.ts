/**
 * Server actions for project/folder duplication
 * Handles atomic duplication with configurable options
 */

'use server';

import { supabase } from '@/lib/supabase';
import { z } from 'zod';

// Validation schema for duplication request
const DuplicateProjectSchema = z.object({
  sourceProjectId: z.string().uuid(),
  newProjectName: z.string().min(1).max(200),
  options: z.object({
    copyComments: z.boolean().default(false),
    copyDrawings: z.boolean().default(false),
  }),
  createdBy: z.string().min(1),
});

export type DuplicateProjectInput = z.infer<typeof DuplicateProjectSchema>;

export interface DuplicationResult {
  success: boolean;
  newProjectId?: string;
  error?: string;
  details?: {
    threadsCopied: number;
    commentsCopied?: number;
    drawingsCopied?: number;
  };
}

/**
 * Duplicates a markup project with configurable options
 * Uses database function for atomic transaction
 */
export async function duplicateProject(
  input: DuplicateProjectInput
): Promise<DuplicationResult> {
  try {
    // Validate input
    const validated = DuplicateProjectSchema.parse(input);
    
    // Check if source project exists
    const { data: sourceProject, error: checkError } = await supabase
      .from('markup_projects')
      .select('id, project_name')
      .eq('id', validated.sourceProjectId)
      .single();

    if (checkError || !sourceProject) {
      return {
        success: false,
        error: 'Source project not found',
      };
    }

    // Call database function to duplicate project atomically
    const { data, error } = await supabase.rpc('duplicate_project', {
      p_source_project_id: validated.sourceProjectId,
      p_new_project_name: validated.newProjectName,
      p_copy_comments: validated.options.copyComments,
      p_copy_drawings: validated.options.copyDrawings,
      p_created_by: validated.createdBy,
    });

    if (error) {
      console.error('Duplication error:', error);
      return {
        success: false,
        error: `Failed to duplicate project: ${error.message}`,
      };
    }

    // Get details about what was copied
    const newProjectId = data as string;
    const details = await getDuplicationDetails(
      newProjectId,
      validated.options.copyComments,
      validated.options.copyDrawings
    );

    return {
      success: true,
      newProjectId,
      details,
    };
  } catch (error) {
    console.error('Unexpected error during duplication:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Gets statistics about duplicated content
 */
async function getDuplicationDetails(
  projectId: string,
  copiedComments: boolean,
  copiedDrawings: boolean
) {
  // Count threads
  const { count: threadCount } = await supabase
    .from('markup_threads')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', projectId);

  const details: DuplicationResult['details'] = {
    threadsCopied: threadCount || 0,
  };

  // Count comments if copied
  if (copiedComments) {
    const { data: threads } = await supabase
      .from('markup_threads')
      .select('id')
      .eq('project_id', projectId);

    if (threads && threads.length > 0) {
      const threadIds = threads.map(t => t.id);
      const { count: commentCount } = await supabase
        .from('markup_comments')
        .select('*', { count: 'exact', head: true })
        .in('thread_id', threadIds);

      details.commentsCopied = commentCount || 0;
    }
  }

  // Count drawings if copied
  if (copiedDrawings) {
    const { data: threads } = await supabase
      .from('markup_threads')
      .select('id')
      .eq('project_id', projectId);

    if (threads && threads.length > 0) {
      const threadIds = threads.map(t => t.id);
      const { count: drawingCount } = await supabase
        .from('markup_drawings')
        .select('*', { count: 'exact', head: true })
        .in('thread_id', threadIds);

      details.drawingsCopied = drawingCount || 0;
    }
  }

  return details;
}

/**
 * Lists all available projects for duplication destination
 */
export async function getAvailableProjects() {
  const { data, error } = await supabase
    .from('markup_projects')
    .select('id, project_name, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching projects:', error);
    return { success: false, error: error.message, projects: [] };
  }

  return { success: true, projects: data };
}
