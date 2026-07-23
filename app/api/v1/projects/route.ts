import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase';
import { requireApiKey, apiError, getRequestOrigin } from '@/lib/api/auth';
import { ingestImages, type ImageInput } from '@/lib/api/ingest-images';
import { createShareLink } from '@/app/actions/share-links';
import { findProjectIdByName } from '@/lib/project-name';

export const runtime = 'nodejs';
export const maxDuration = 120; // downloading + uploading batches of images takes time

const ImageInputSchema = z
  .object({
    url: z.string().url().optional(),
    base64: z.string().min(1).optional(),
    contentType: z.string().optional(),
    name: z.string().max(300).optional(),
  })
  .refine((img) => img.url || img.base64, {
    message: 'Each image needs either "url" or "base64"',
  });

const CreateProjectApiSchema = z.object({
  name: z.string().trim().min(1).max(300),
  comment: z.string().max(5000).optional(),
  images: z.array(ImageInputSchema).max(50).optional(),
  share: z
    .object({
      permissions: z.enum(['view', 'comment', 'draw_and_comment']).default('comment'),
    })
    .optional(),
});

interface ParsedBody {
  name: string;
  comment?: string;
  images: ImageInput[];
  files: File[];
  share?: { permissions: 'view' | 'comment' | 'draw_and_comment' };
}

async function parseBody(request: NextRequest): Promise<ParsedBody | NextResponse> {
  const contentType = request.headers.get('content-type') || '';

  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    const name = String(form.get('name') || '').trim();
    if (!name) return apiError(422, 'validation_error', 'The "name" field is required.');
    const comment = form.get('comment') ? String(form.get('comment')) : undefined;
    // Accept files under any field name — n8n and other tools name binary
    // fields differently ("images", "files", "data", "file0"…).
    const files: File[] = [];
    for (const [, value] of form.entries()) {
      if (value instanceof File && value.size > 0) files.push(value);
    }
    const sharePermissions = form.get('share_permissions')
      ? String(form.get('share_permissions'))
      : null;
    if (
      sharePermissions &&
      !['view', 'comment', 'draw_and_comment'].includes(sharePermissions)
    ) {
      return apiError(
        422,
        'validation_error',
        'share_permissions must be one of: view, comment, draw_and_comment'
      );
    }
    return {
      name,
      comment,
      images: [],
      files,
      share: sharePermissions ? { permissions: sharePermissions as any } : undefined,
    };
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return apiError(
      400,
      'invalid_body',
      'Request body must be JSON (or multipart/form-data for file uploads).'
    );
  }
  const parsed = CreateProjectApiSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return apiError(
      422,
      'validation_error',
      `${issue?.path.join('.') || 'body'}: ${issue?.message || 'invalid input'}`
    );
  }
  return {
    name: parsed.data.name,
    comment: parsed.data.comment,
    images: parsed.data.images ?? [],
    files: [],
    share: parsed.data.share,
  };
}

/**
 * POST /api/v1/projects
 * Creates a project, optionally uploads its images and creates a share link,
 * all in one call. See docs/API.md.
 */
export async function POST(request: NextRequest) {
  const authError = requireApiKey(request);
  if (authError) return authError;

  const body = await parseBody(request);
  if (body instanceof NextResponse) return body;

  const existingId = await findProjectIdByName(body.name);
  if (existingId) {
    const origin = getRequestOrigin(request);
    return apiError(409, 'duplicate_name', `A project named "${body.name}" already exists.`, {
      existingProject: { id: existingId, url: `${origin}/projects/${existingId}` },
    });
  }

  const now = new Date().toISOString();
  const { data: project, error } = await supabaseAdmin
    .from('markup_projects')
    .insert({
      project_name: body.name,
      markup_url: '/placeholder.svg',
      raw_payload: {
        source: 'api',
        ...(body.comment ? { description: body.comment } : {}),
      },
      total_screenshots: 0,
      total_threads: 0,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (error || !project) {
    return apiError(500, 'project_create_failed', error?.message || 'Could not create project');
  }

  const projectId = (project as any).id as string;
  const { images, failed } = await ingestImages(projectId, body.images, body.files, 0);

  // Images were requested but none could be ingested: roll the project back so
  // a failed run doesn't leave an empty shell behind. Failed images never reach
  // Storage (ingestImages cleans up per-image), so deleting the row suffices.
  const imagesRequested = body.images.length + body.files.length > 0;
  if (imagesRequested && images.length === 0) {
    const { error: rollbackError } = await supabaseAdmin
      .from('markup_projects')
      .delete()
      .eq('id', projectId);
    if (rollbackError) {
      console.error('Failed to roll back empty project', projectId, rollbackError);
    }
    return apiError(422, 'all_images_failed', 'None of the images could be ingested; the project was not created.', {
      failedImages: failed,
    });
  }

  let shareLink: { url: string; token: string; permissions: string } | null = null;
  if (body.share) {
    const result = await createShareLink({
      resourceType: 'project',
      resourceId: projectId,
      permissions: body.share.permissions,
      createdBy: 'api',
    });
    if (result.success && result.shareLink && result.url) {
      shareLink = {
        url: result.url,
        token: result.shareLink.token,
        permissions: result.shareLink.permissions,
      };
    }
  }

  const origin = getRequestOrigin(request);
  return NextResponse.json(
    {
      success: true,
      project: {
        id: projectId,
        name: body.name,
        comment: body.comment ?? null,
        url: `${origin}/projects/${projectId}`,
        createdAt: now,
        totalImages: images.length,
      },
      images,
      failedImages: failed,
      shareLink,
    },
    { status: 201 }
  );
}

/**
 * GET /api/v1/projects?page=1&search=foo
 * Lists projects, newest first, 24 per page.
 */
export async function GET(request: NextRequest) {
  const authError = requireApiKey(request);
  if (authError) return authError;

  const params = request.nextUrl.searchParams;
  const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
  const search = params.get('search')?.trim();
  const pageSize = 24;

  let query = supabaseAdmin
    .from('markup_projects')
    .select('id, project_name, markup_url, total_threads, created_at, updated_at', {
      count: 'exact',
    })
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (search) query = query.ilike('project_name', `%${search}%`);

  const { data, error, count } = await query;
  if (error) return apiError(500, 'query_failed', error.message);

  const origin = getRequestOrigin(request);
  return NextResponse.json({
    success: true,
    page,
    pageSize,
    total: count ?? 0,
    projects: (data ?? []).map((p: any) => ({
      id: p.id,
      name: p.project_name,
      coverImage: p.markup_url,
      totalImages: p.total_threads ?? 0,
      url: `${origin}/projects/${p.id}`,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    })),
  });
}
