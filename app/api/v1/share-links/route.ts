import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiKey, apiError, getRequestOrigin } from '@/lib/api/auth';
import {
  createShareLink,
  getShareLinksForResource,
  type ShareResourceType,
} from '@/app/actions/share-links';

export const runtime = 'nodejs';

const CreateShareLinkApiSchema = z.object({
  projectId: z.string().uuid().optional(),
  threadId: z.string().uuid().optional(),
  permissions: z.enum(['view', 'comment', 'draw_and_comment']).default('comment'),
  createdBy: z.string().max(200).optional(),
});

/**
 * POST /api/v1/share-links
 * Creates a shareable client link for a project (or a single image via threadId).
 */
export async function POST(request: NextRequest) {
  const authError = requireApiKey(request);
  if (authError) return authError;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return apiError(400, 'invalid_body', 'Request body must be JSON.');
  }

  const parsed = CreateShareLinkApiSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return apiError(
      422,
      'validation_error',
      `${issue?.path.join('.') || 'body'}: ${issue?.message || 'invalid input'}`
    );
  }

  const { projectId, threadId, permissions, createdBy } = parsed.data;
  if (!projectId && !threadId) {
    return apiError(422, 'validation_error', 'Provide either "projectId" or "threadId".');
  }
  if (projectId && threadId) {
    return apiError(422, 'validation_error', 'Provide only one of "projectId" or "threadId".');
  }

  const result = await createShareLink({
    resourceType: projectId ? 'project' : 'thread',
    resourceId: (projectId ?? threadId)!,
    permissions,
    createdBy: createdBy || 'api',
  });

  if (!result.success || !result.shareLink) {
    const notFound = result.error?.includes('not found');
    return apiError(
      notFound ? 404 : 500,
      notFound ? 'not_found' : 'share_link_failed',
      result.error || 'Could not create share link'
    );
  }

  return NextResponse.json(
    {
      success: true,
      shareLink: {
        id: result.shareLink.id,
        url: result.url,
        token: result.shareLink.token,
        permissions: result.shareLink.permissions,
        resourceType: result.shareLink.resourceType,
        resourceId: result.shareLink.resourceId,
        createdAt: result.shareLink.createdAt,
      },
    },
    { status: 201 }
  );
}

/**
 * GET /api/v1/share-links?projectId=... (or ?threadId=...)
 * Lists all share links for a resource.
 */
export async function GET(request: NextRequest) {
  const authError = requireApiKey(request);
  if (authError) return authError;

  const params = request.nextUrl.searchParams;
  const projectId = params.get('projectId');
  const threadId = params.get('threadId');
  if (!projectId && !threadId) {
    return apiError(422, 'validation_error', 'Pass a "projectId" or "threadId" query parameter.');
  }

  const resourceType: ShareResourceType = projectId ? 'project' : 'thread';
  const result = await getShareLinksForResource(resourceType, (projectId ?? threadId)!);
  if (!result.success) {
    return apiError(500, 'query_failed', result.error || 'Could not fetch share links');
  }

  const origin = getRequestOrigin(request);
  return NextResponse.json({
    success: true,
    shareLinks: (result.shareLinks ?? []).map((s) => ({
      id: s.id,
      url: `${origin}/share/${s.token}`,
      token: s.token,
      permissions: s.permissions,
      isActive: s.isActive,
      accessCount: s.accessCount,
      lastAccessedAt: s.lastAccessedAt,
      createdAt: s.createdAt,
    })),
  });
}
