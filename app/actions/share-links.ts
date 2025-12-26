/**
 * Server actions for shareable link management
 * Handles creation, validation, and access tracking
 */

'use server';

import { supabase } from '@/lib/supabase';
import { z } from 'zod';
import { nanoid } from 'nanoid';

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

    // Generate full URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
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
 * Validates a share token and returns link details
 */
export async function validateShareToken(
  token: string
): Promise<{ success: boolean; shareLink?: ShareLink; error?: string }> {
  try {
    // Use database function to check validity
    const { data: isValid, error: validError } = await supabase
      .rpc('is_share_link_valid', { p_token: token });

    if (validError || !isValid) {
      return {
        success: false,
        error: 'Invalid or expired share link',
      };
    }

    // Get full share link details
    const { data, error } = await supabase
      .from('share_links')
      .select('*')
      .eq('token', token)
      .single();

    if (error || !data) {
      return {
        success: false,
        error: 'Share link not found',
      };
    }

    // Increment access count
    await supabase.rpc('increment_share_link_access', { p_token: token });

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

    return {
      success: true,
      shareLink,
    };
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
