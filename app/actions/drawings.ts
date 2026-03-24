/**
 * Server actions for drawing/markup management
 * Handles saving, loading, and managing drawings
 */

'use server';

import { supabaseAdmin as supabase } from '@/lib/supabase';
import { z } from 'zod';
import type { DrawingData, Drawing } from '@/types/drawing';

// Validation schemas
const SaveDrawingSchema = z.object({
  threadId: z.string().uuid(),
  drawingData: z.object({
    version: z.string(),
    shapes: z.array(z.any()),
    metadata: z.record(z.any()).optional(),
  }),
  createdBy: z.string().min(1),
});

const UpdateDrawingSchema = z.object({
  drawingId: z.string().uuid(),
  drawingData: z.object({
    version: z.string(),
    shapes: z.array(z.any()),
    metadata: z.record(z.any()).optional(),
  }),
});

export type SaveDrawingInput = z.infer<typeof SaveDrawingSchema>;
export type UpdateDrawingInput = z.infer<typeof UpdateDrawingSchema>;

export interface DrawingResult {
  success: boolean;
  drawing?: Drawing;
  error?: string;
}

/**
 * Saves a new drawing for a thread
 */
export async function saveDrawing(
  input: SaveDrawingInput
): Promise<DrawingResult> {
  try {
    const validated = SaveDrawingSchema.parse(input);

    // Check if thread exists
    const { data: thread, error: threadError } = await supabase
      .from('markup_threads')
      .select('id')
      .eq('id', validated.threadId)
      .single();

    if (threadError || !thread) {
      return {
        success: false,
        error: 'Thread not found',
      };
    }

    // Insert new drawing
    const { data, error } = await supabase
      .from('markup_drawings')
      .insert({
        thread_id: validated.threadId,
        drawing_data: validated.drawingData as any,
        created_by: validated.createdBy,
      })
      .select()
      .single();

    if (error) {
      console.error('Error saving drawing:', error);
      return {
        success: false,
        error: `Failed to save drawing: ${error.message}`,
      };
    }

    return {
      success: true,
      drawing: {
        id: data.id,
        threadId: data.thread_id,
        drawingData: data.drawing_data as DrawingData,
        createdBy: data.created_by,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        isDuplicated: data.is_duplicated,
        originalDrawingId: data.original_drawing_id,
      },
    };
  } catch (error) {
    console.error('Unexpected error saving drawing:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Updates an existing drawing
 */
export async function updateDrawing(
  input: UpdateDrawingInput
): Promise<DrawingResult> {
  try {
    const validated = UpdateDrawingSchema.parse(input);

    const { data, error } = await supabase
      .from('markup_drawings')
      .update({
        drawing_data: validated.drawingData as any,
        updated_at: new Date().toISOString(),
      })
      .eq('id', validated.drawingId)
      .select()
      .single();

    if (error) {
      console.error('Error updating drawing:', error);
      return {
        success: false,
        error: `Failed to update drawing: ${error.message}`,
      };
    }

    return {
      success: true,
      drawing: {
        id: data.id,
        threadId: data.thread_id,
        drawingData: data.drawing_data as DrawingData,
        createdBy: data.created_by,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        isDuplicated: data.is_duplicated,
        originalDrawingId: data.original_drawing_id,
      },
    };
  } catch (error) {
    console.error('Unexpected error updating drawing:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Loads drawings for a specific thread
 */
export async function getDrawingsByThread(
  threadId: string
): Promise<{ success: boolean; drawings?: Drawing[]; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('markup_drawings')
      .select('*')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error loading drawings:', error);
      return {
        success: false,
        error: `Failed to load drawings: ${error.message}`,
      };
    }

    const drawings: Drawing[] = data.map(d => ({
      id: d.id,
      threadId: d.thread_id,
      drawingData: d.drawing_data as DrawingData,
      createdBy: d.created_by,
      createdAt: d.created_at,
      updatedAt: d.updated_at,
      isDuplicated: d.is_duplicated,
      originalDrawingId: d.original_drawing_id,
    }));

    return {
      success: true,
      drawings,
    };
  } catch (error) {
    console.error('Unexpected error loading drawings:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Deletes a drawing
 */
export async function deleteDrawing(
  drawingId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('markup_drawings')
      .delete()
      .eq('id', drawingId);

    if (error) {
      console.error('Error deleting drawing:', error);
      return {
        success: false,
        error: `Failed to delete drawing: ${error.message}`,
      };
    }

    return { success: true };
  } catch (error) {
    console.error('Unexpected error deleting drawing:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}
