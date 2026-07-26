import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase';
import { requireApiKey, apiError } from '@/lib/api/auth';
import { ingestImages, type ImageInput } from '@/lib/api/ingest-images';

export const runtime = 'nodejs';
export const maxDuration = 120;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const AddImagesSchema = z.object({
  images: z
    .array(
      z
        .object({
          url: z.string().url().optional(),
          base64: z.string().min(1).optional(),
          contentType: z.string().optional(),
          name: z.string().max(300).optional(),
        })
        .refine((img) => img.url || img.base64, {
          message: 'Each image needs either "url" or "base64"',
        })
    )
    .min(1)
    .max(50),
});

/**
 * POST /api/v1/projects/:id/images
 * Adds images to an existing project. Accepts JSON ({ images: [...] }) or
 * multipart/form-data with files under the "images" field.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = requireApiKey(request);
  if (authError) return authError;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return apiError(422, 'validation_error', 'Project id must be a UUID.');
  }

  const { data: project } = await supabaseAdmin
    .from('markup_projects')
    .select('id')
    .eq('id', id)
    .maybeSingle();
  if (!project) return apiError(404, 'not_found', `No project with id ${id}.`);

  let inputs: ImageInput[] = [];
  let files: File[] = [];

  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    // Accept files under any field name — n8n and other tools name binary
    // fields differently ("images", "files", "data", "file0"…).
    for (const [, value] of form.entries()) {
      if (value instanceof File && value.size > 0) files.push(value);
    }
    if (files.length === 0) {
      return apiError(
        422,
        'validation_error',
        'Attach at least one non-empty image file to the form data. Note that Vercel rejects request bodies over 4.5 MB before they reach this handler — send large images as { "images": [{ "url": ... }] } instead.'
      );
    }
  } else {
    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return apiError(400, 'invalid_body', 'Request body must be JSON or multipart/form-data.');
    }
    const parsed = AddImagesSchema.safeParse(json);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return apiError(
        422,
        'validation_error',
        `${issue?.path.join('.') || 'body'}: ${issue?.message || 'invalid input'}`
      );
    }
    inputs = parsed.data.images;
  }

  // Continue numbering after the project's existing images
  const { count } = await supabaseAdmin
    .from('markup_threads')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', id);

  const { images, failed } = await ingestImages(id, inputs, files, count ?? 0);

  if (images.length === 0) {
    return apiError(422, 'all_images_failed', 'None of the images could be ingested.', {
      failedImages: failed,
    });
  }

  return NextResponse.json(
    { success: true, images, failedImages: failed },
    { status: 201 }
  );
}
