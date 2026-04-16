/**
 * Server actions for shareable link management
 * Handles creation, validation, and access tracking
 */

'use server';

import { supabaseAdmin as supabase } from '@/lib/supabase';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { headers } from 'next/headers';

async function getRequestOrigin(): Promise<string> {
  try {
    const h = await headers();
    const host = h.get('x-forwarded-host') ?? h.get('host');
    if (host) {
      const proto =
        h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
      return `${proto}://${host}`;
    }
  } catch {}
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

// Types
export type SharePermission = 'view' | 'comment' | 'draw_and_comment';
export type ShareResourceType = 'thread' | 'project';

export interface ShareLink {
  id: string;
  token: string;
  resourceType: ShareResourceType;
  resourceId: string;
  permissions: SharePermission;
  createdBy: string;
  createdAt: string;
  expiresAt: string | null;
  isActive: boolean;
  accessCount: number;
  lastAccessedAt: string | null;
}

// Validation schemas
const CreateShareLinkSchema = z.object({
  resourceType: z.enum(['thread', 'project']),
  resourceId: z.string().uuid(),
  permissions: z.enum(['view', 'comment', 'draw_and_comment']),
  createdBy: z.string().min(1),
  expiresInDays: z.number().min(1).max(365).optional(),
});

export type CreateShareLinkInput = z.infer<typeof CreateShareLinkSchema>;

export interface ShareLinkResult {
  success: boolean;
  shareLink?: ShareLink;
  url?: string;
  error?: string;
}

/**
 * Generates a secure random token for sharing
 */
function generateShareToken(): string {
  // Using nanoid for URL-safe, unguessable tokens
  return nanoid(32);
}

/**
 * Creates a new shareable link
 */
export async function createShareLink(
  input: CreateShareLinkInput
): Promise<ShareLinkResult> {
  try {
    const validated = CreateShareLinkSchema.parse(input);

    // Verify resource exists
    const tableName =
      validated.resourceType === 'thread' ? 'markup_threads' : 'markup_projects';
    
    const { data: resource, error: checkError } = await supabase
      .from(tableName)
      .select('id')
      .eq('id', validated.resourceId)
      .single();

    if (checkError || !resource) {
      return {
        success: false,
        error: `${validated.resourceType} not found`,
      };
    }

    // Calculate expiration if specified
    const expiresAt = validated.expiresInDays
      ? new Date(Date.now() + validated.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

    // Generate unique token
    const token = generateShareToken();

    // Create share link
    const { data, error } = await supabase
      .from('share_links')
      .insert({
        token,
        resource_type: validated.resourceType,
        resource_id: validated.resourceId,
        permissions: validated.permissions,
        created_by: validated.createdBy,
        expires_at: expiresAt,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating share link:', error);
      return {
        success: false,
        error: `Failed to create share link: ${error.message}`,
      };
    }

    const shareLink: ShareLink = {
      id: data.id,
      token: data.token,
      resourceType: data.resource_type,
      resourceId: data.resource_id,
      permissions: data.permissions,
      createdBy: data.created_by,
      createdAt: data.created_at,
      expiresAt: data.expires_at,
      isActive: data.is_active,
      accessCount: data.access_count,
      lastAccessedAt: data.last_accessed_at,
    };

    // Generate full URL — derive origin from the actual incoming request so the
    // link is correct regardless of deployment hostname (NEXT_PUBLIC_* vars are
    // baked at build time and won't pick up env changes after deploy).
    const baseUrl = await getRequestOrigin();
    const url = `${baseUrl}/share/${token}`;

    return {
      success: true,
      shareLink,
      url,
    };
  } catch (error) {
    console.error('Unexpected error creating share link:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Validates a share token and returns link details.
 * Performs all checks with direct queries — no database RPCs required.
 */
export async function validateShareToken(
  token: string
): Promise<{ success: boolean; shareLink?: ShareLink; error?: string }> {
  try {
    const { data: row, error } = await supabase
      .from('share_links')
      .select('*')
      .eq('token', token)
      .single();

    if (error || !row) {
      return { success: false, error: 'Share link not found' };
    }

    // Check active status
    if (!row.is_active) {
      return { success: false, error: 'This share link has been revoked' };
    }

    // Check expiry
    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      return { success: false, error: 'This share link has expired' };
    }

    // Increment access count (fire-and-forget — don't block on failure)
    void supabase
      .from('share_links')
      .update({
        access_count: (row.access_count ?? 0) + 1,
        last_accessed_at: new Date().toISOString(),
      })
      .eq('token', token);

    const shareLink: ShareLink = {
      id: String(row.id),
      token: row.token,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      permissions: row.permissions,
      createdBy: row.created_by,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      isActive: row.is_active,
      accessCount: row.access_count ?? 0,
      lastAccessedAt: row.last_accessed_at,
    };

    return { success: true, shareLink };
  } catch (error) {
    console.error('Unexpected error validating token:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Revokes a share link (marks as inactive)
 */
export async function revokeShareLink(
  shareId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('share_links')
      .update({ is_active: false })
      .eq('id', shareId);

    if (error) {
      console.error('Error revoking share link:', error);
      return {
        success: false,
        error: `Failed to revoke share link: ${error.message}`,
      };
    }

    return { success: true };
  } catch (error) {
    console.error('Unexpected error revoking share link:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

// ─── Guest Dashboard ─────────────────────────────────────────────────────────

export interface SharedProjectSummary {
  token: string;
  projectName: string;
  thumbnailUrl: string | null;
  permissions: SharePermission;
  resourceType: ShareResourceType;
  resourceId: string;
}

/**
 * Given a list of tokens (from localStorage), returns project summaries for
 * each valid, active, non-expired share link — used by the guest dashboard.
 */
export async function getSharedProjectSummaries(
  tokens: string[]
): Promise<SharedProjectSummary[]> {
  if (!tokens.length) return [];

  const results = await Promise.all(
    tokens.map(async (token): Promise<SharedProjectSummary | null> => {
      try {
        const { data: row, error } = await supabase
          .from('share_links')
          .select('*')
          .eq('token', token)
          .eq('is_active', true)
          .single();

        if (error || !row) return null;
        if (row.expires_at && new Date(row.expires_at) < new Date()) return null;

        let projectName = 'Shared Project';
        let thumbnailUrl: string | null = null;

        if (row.resource_type === 'project') {
          const { data: project } = await supabase
            .from('markup_projects')
            .select('project_name, markup_url, markup_threads(image_path, created_at)')
            .eq('id', row.resource_id)
            .single();

          if (project) {
            projectName = (project as any).project_name;
            const threads: any[] = ((project as any).markup_threads || []).sort(
              (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );
            thumbnailUrl = threads[0]?.image_path || (project as any).markup_url || null;
          }
        } else {
          const { data: thread } = await supabase
            .from('markup_threads')
            .select('*, markup_projects(project_name)')
            .eq('id', row.resource_id)
            .single();

          if (thread) {
            projectName =
              (thread as any).markup_projects?.project_name ||
              (thread as any).thread_name ||
              'Shared Image';
            thumbnailUrl = (thread as any).image_path || null;
          }
        }

        return {
          token,
          projectName,
          thumbnailUrl,
          permissions: row.permissions as SharePermission,
          resourceType: row.resource_type as ShareResourceType,
          resourceId: row.resource_id,
        };
      } catch {
        return null;
      }
    })
  );

  return results.filter((r): r is SharedProjectSummary => r !== null);
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lists all share links for a resource
 */
export async function getShareLinksForResource(
  resourceType: ShareResourceType,
  resourceId: string
): Promise<{ success: boolean; shareLinks?: ShareLink[]; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('share_links')
      .select('*')
      .eq('resource_type', resourceType)
      .eq('resource_id', resourceId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching share links:', error);
      return {
        success: false,
        error: `Failed to fetch share links: ${error.message}`,
      };
    }

    const shareLinks: ShareLink[] = data.map(d => ({
      id: d.id,
      token: d.token,
      resourceType: d.resource_type,
      resourceId: d.resource_id,
      permissions: d.permissions,
      createdBy: d.created_by,
      createdAt: d.created_at,
      expiresAt: d.expires_at,
      isActive: d.is_active,
      accessCount: d.access_count,
      lastAccessedAt: d.last_accessed_at,
    }));

    return {
      success: true,
      shareLinks,
    };
  } catch (error) {
    console.error('Unexpected error fetching share links:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}
