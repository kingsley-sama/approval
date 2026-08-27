'use server';

/**
 * Project CRUD for the Websites section.
 *
 * A website review is a markup_projects row with kind='website'. Everything
 * downstream — threads, comments, drawings, attachments, share links — is the
 * ordinary annotation stack, unchanged. Only the list query and the creation
 * path differ, and both differ only by the kind filter and the capture step.
 */

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { getUser } from '@/lib/db/queries';
import { requireUser, requireAdmin } from '@/lib/auth/require-user';
import { CreateWebsiteProjectSchema, RenameProjectSchema } from '@/lib/validation/schemas';
import {
  DEFAULT_CAPTURE_SETTINGS,
  normalizeCaptureSettings,
  type CaptureSettings,
} from '@/lib/website/viewports';
import { deriveProjectName, normalizeUrl, assertSafeUrl, UnsafeUrlError } from '@/lib/website/url';
import { enqueueCaptures, type EnqueueResult } from '@/app/actions/website-captures';

const PROJECTS_PAGE_SIZE = 24;

export type WebsiteSort = 'newest' | 'oldest' | 'name';

export interface WebsiteProjectListItem {
  id: string;
  project_name: string;
  markup_url: string | null;
  kind: string;
  site_url: string | null;
  created_at: string;
  updated_at: string | null;
  first_image: string | null;
  total_images: number;
  total_comments: number;
  total_resolved_comments: number;
  total_commented_threads: number;
  total_pending_captures: number;
}

export interface WebsiteProjectsPageResult {
  projects: WebsiteProjectListItem[];
  total: number;
  page: number;
}

/**
 * Names are unique per kind (migration 019). Two reviews of the same site is a
 * normal thing to want — January's and March's — so disambiguate rather than
 * refusing.
 */
async function uniqueWebsiteName(base: string): Promise<string> {
  const trimmed = base.trim().slice(0, 280) || 'Website';

  const { data } = await supabaseAdmin
    .from('markup_projects')
    .select('project_name')
    .eq('kind', 'website');

  const taken = new Set(
    ((data ?? []) as { project_name: string }[]).map((r) => r.project_name.trim().toLowerCase())
  );

  if (!taken.has(trimmed.toLowerCase())) return trimmed;
  for (let n = 2; n < 500; n++) {
    const candidate = `${trimmed} (${n})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${trimmed} (${Date.now()})`;
}

export interface CreateWebsiteProjectResult {
  success: boolean;
  project?: { id: string; project_name: string; site_url: string | null };
  capture?: EnqueueResult;
  error?: string;
}

export async function createWebsiteProject(input: {
  url: string;
  name?: string;
  settings?: Partial<CaptureSettings>;
}): Promise<CreateWebsiteProjectResult> {
  await requireAdmin();
  const user = await getUser();

  const parsed = CreateWebsiteProjectSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Invalid input: ' + parsed.error.issues[0]?.message };
  }

  let url: URL;
  try {
    url = normalizeUrl(parsed.data.url);
    assertSafeUrl(url);
  } catch (err) {
    return {
      success: false,
      error: err instanceof UnsafeUrlError ? err.message : 'That URL could not be read',
    };
  }

  const settings = normalizeCaptureSettings({ ...DEFAULT_CAPTURE_SETTINGS, ...parsed.data.settings });
  const name = await uniqueWebsiteName(parsed.data.name?.trim() || deriveProjectName(url));

  const { data, error } = await supabaseAdmin
    .from('markup_projects')
    .insert({
      project_name: name,
      kind: 'website',
      site_url: url.toString(),
      capture_defaults: settings,
      markup_url: '/placeholder.svg',
      total_screenshots: 0,
      total_threads: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select('id, project_name, site_url')
    .single();

  if (error || !data) {
    console.error('Error creating website project:', error);
    return { success: false, error: error?.message ?? 'Could not create the review' };
  }

  const project = data as { id: string; project_name: string; site_url: string | null };

  const capture = await enqueueCaptures(
    project.id,
    [url.toString()],
    settings.viewports,
    settings,
    user?.email ?? 'system'
  );

  revalidatePath('/websites');
  return { success: true, project, capture };
}

export async function getWebsiteProjectsPage(opts?: {
  page?: number;
  search?: string;
  sort?: WebsiteSort;
}): Promise<WebsiteProjectsPageResult> {
  const page = Math.max(1, opts?.page ?? 1);
  const empty: WebsiteProjectsPageResult = { projects: [], total: 0, page };

  const user = await getUser();
  if (!user) return empty;

  // Members only see reviews they've been granted; admins see all.
  let projectIds: string[] | null = null;
  if (user.role !== 'admin') {
    if (!user.email) return empty;
    const { data: accessRows, error: accessError } = await supabaseAdmin
      .from('website_project_access')
      .select('project_id')
      .eq('user_email', user.email);

    if (accessError) {
      console.error('Error fetching website access:', accessError);
      return empty;
    }
    if (!accessRows || accessRows.length === 0) return empty;
    projectIds = (accessRows as { project_id: string }[]).map((r) => r.project_id);
  }

  const { data, error } = await supabaseAdmin.rpc('get_projects_with_stats', {
    p_project_ids: projectIds,
    p_search: opts?.search?.trim() || null,
    p_sort: opts?.sort ?? 'newest',
    p_limit: PROJECTS_PAGE_SIZE,
    p_offset: (page - 1) * PROJECTS_PAGE_SIZE,
    p_kind: 'website',
  });

  if (error) {
    console.error('Error fetching website projects page:', error);
    return empty;
  }

  const rows = (data ?? []) as (WebsiteProjectListItem & { total_count: number })[];
  const total = rows[0]?.total_count ?? 0;
  return {
    projects: rows.map(({ total_count, ...item }) => item),
    total,
    page,
  };
}

export interface WebsiteProjectMeta {
  id: string;
  name: string;
  siteUrl: string | null;
  settings: CaptureSettings;
}

/** Site URL + capture settings for the workspace header and the add-pages form. */
export async function getWebsiteProjectMeta(projectId: string): Promise<WebsiteProjectMeta | null> {
  await requireUser();

  const { data } = await supabaseAdmin
    .from('markup_projects')
    .select('id, project_name, site_url, capture_defaults, kind')
    .eq('id', projectId)
    .maybeSingle();

  const row = data as {
    id: string;
    project_name: string;
    site_url: string | null;
    capture_defaults: unknown;
    kind: string | null;
  } | null;

  if (!row || row.kind !== 'website') return null;

  return {
    id: row.id,
    name: row.project_name,
    siteUrl: row.site_url,
    settings: normalizeCaptureSettings(row.capture_defaults),
  };
}

export async function renameWebsiteProject(
  projectId: string,
  name: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin();
  } catch {
    return { success: false, error: 'Unauthorized' };
  }

  const parsed = RenameProjectSchema.safeParse({ projectId, name });
  if (!parsed.success) {
    return { success: false, error: 'Invalid input: ' + parsed.error.issues[0]?.message };
  }

  const { error } = await supabaseAdmin
    .from('markup_projects')
    .update({ project_name: parsed.data.name, updated_at: new Date().toISOString() })
    .eq('id', parsed.data.projectId)
    .eq('kind', 'website');

  if (error) {
    console.error('Error renaming website project:', error);
    return { success: false, error: error.message };
  }

  revalidatePath('/websites');
  revalidatePath(`/websites/${parsed.data.projectId}`);
  return { success: true };
}

export async function deleteWebsiteProject(
  projectId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin();
  } catch {
    return { success: false, error: 'Unauthorized' };
  }

  const { error } = await supabaseAdmin
    .from('markup_projects')
    .delete()
    .eq('id', projectId)
    .eq('kind', 'website');

  if (error) {
    console.error('Error deleting website project:', error);
    return { success: false, error: error.message };
  }

  revalidatePath('/websites');
  return { success: true };
}

export async function grantWebsiteAccess(
  projectId: string,
  userEmail: string
): Promise<{ success: boolean; error?: string }> {
  const currentUser = await getUser();
  if (!currentUser || currentUser.role !== 'admin') {
    return { success: false, error: 'Unauthorized' };
  }

  const { error } = await supabaseAdmin
    .from('website_project_access')
    .upsert(
      { project_id: projectId, user_email: userEmail, granted_by: currentUser.email },
      { onConflict: 'project_id,user_email' }
    );

  if (error) {
    console.error('Error granting website access:', error);
    return { success: false, error: error.message };
  }

  revalidatePath('/websites');
  return { success: true };
}

export async function revokeWebsiteAccess(
  projectId: string,
  userEmail: string
): Promise<{ success: boolean; error?: string }> {
  const currentUser = await getUser();
  if (!currentUser || currentUser.role !== 'admin') {
    return { success: false, error: 'Unauthorized' };
  }

  const { error } = await supabaseAdmin
    .from('website_project_access')
    .delete()
    .eq('project_id', projectId)
    .eq('user_email', userEmail);

  if (error) {
    console.error('Error revoking website access:', error);
    return { success: false, error: error.message };
  }

  revalidatePath('/websites');
  return { success: true };
}
