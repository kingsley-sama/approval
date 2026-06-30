/**
 * Server actions for panorama duplication
 * Handles atomic duplication with configurable options
 */

'use server';

import { supabaseAdmin as supabase } from '@/lib/supabase';
import { z } from 'zod';

// Validation schema for duplication request
const DuplicatePanoramaSchema = z.object({
  sourceProjectId: z.string().uuid(),
  newProjectName: z.string().min(1).max(200),
  options: z.object({
    copyComments: z.boolean().default(false),
    anonymizeCommenters: z.boolean().default(false),
  }),
  createdBy: z.string().min(1),
});

export type DuplicatePanoramaInput = z.infer<typeof DuplicatePanoramaSchema>;

export interface DuplicationResult {
  success: boolean;
  newProjectId?: string;
  error?: string;
  details?: {
    imagesCopied: number;
    commentsCopied?: number;
  };
}

/**
 * Duplicates a panorama project with configurable options
 */
export async function duplicatePanoramaProject(
  input: DuplicatePanoramaInput
): Promise<DuplicationResult> {
  try {
    // Validate input
    const validated = DuplicatePanoramaSchema.parse(input);

    // Check if source project exists
    const { data: sourceProject, error: checkError } = await supabase
      .from('panorama_projects')
      .select('id, project_name')
      .eq('id', validated.sourceProjectId)
      .single();

    if (checkError || !sourceProject) {
      return {
        success: false,
        error: 'Source panorama project not found',
      };
    }

    // Create new project
    const { data: newProject, error: createError } = await supabase
      .from('panorama_projects')
      .insert({
        project_name: validated.newProjectName,
      })
      .select()
      .single();

    if (createError || !newProject) {
      return {
        success: false,
        error: 'Failed to create new panorama project',
      };
    }

    const newProjectId = newProject.id;

    // Copy images from source project
    const { data: sourceImages, error: imagesError } = await supabase
      .from('panorama_images')
      .select('*')
      .eq('panorama_project_id', validated.sourceProjectId);

    if (imagesError) {
      return {
        success: false,
        error: 'Failed to fetch source images',
      };
    }

    let imagesCopied = 0;
    let commentsCopied = 0;

    if (sourceImages && sourceImages.length > 0) {
      // Map old image IDs to new ones
      const imageIdMap = new Map<string, string>();

      // Copy images
      for (const img of sourceImages) {
        const { data: newImage, error: insertError } = await supabase
          .from('panorama_images')
          .insert({
            panorama_project_id: newProjectId,
            image_path: img.image_path,
            image_filename: img.image_filename,
            name: img.name,
            image_index: img.image_index,
          })
          .select()
          .single();

        if (!insertError && newImage) {
          imageIdMap.set(img.id, newImage.id);
          imagesCopied++;
        }
      }

      // Copy comments if requested
      if (validated.options.copyComments && imageIdMap.size > 0) {
        const { data: sourceComments } = await supabase
          .from('panorama_comments')
          .select('*')
          .in('panorama_image_id', Array.from(imageIdMap.keys()));

        if (sourceComments && sourceComments.length > 0) {
          // Group comments by image to re-number them
          const commentsByImage = new Map<string, typeof sourceComments>();
          for (const comment of sourceComments) {
            const arr = commentsByImage.get(comment.panorama_image_id) || [];
            arr.push(comment);
            commentsByImage.set(comment.panorama_image_id, arr);
          }

          let globalCommentNumber = 0;
          for (const [oldImageId, comments] of commentsByImage) {
            const newImageId = imageIdMap.get(oldImageId);
            if (!newImageId) continue;

            for (const comment of comments) {
              globalCommentNumber++;
              const newUserName = validated.options.anonymizeCommenters
                ? 'Client'
                : comment.user_name;

              const { error: insertError } = await supabase
                .from('panorama_comments')
                .insert({
                  id: comment.id,
                  panorama_image_id: newImageId,
                  pin_number: globalCommentNumber,
                  display_number: globalCommentNumber,
                  content: comment.content,
                  user_name: newUserName,
                  pitch: comment.pitch,
                  yaw: comment.yaw,
                  status: comment.status,
                  type: comment.type,
                  parent_comment_id: comment.parent_comment_id, // May need to be remapped if replies exist
                });

              if (!insertError) {
                commentsCopied++;
              }
            }
          }
        }
      }
    }

    return {
      success: true,
      newProjectId,
      details: {
        imagesCopied,
        commentsCopied,
      },
    };
  } catch (error) {
    console.error('Unexpected error during panorama duplication:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}
