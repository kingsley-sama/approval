import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { validateShareToken } from '@/app/actions/share-links';
import { hasWebsiteProjectAccess } from '@/lib/auth/require-user';
import { normalizeUrl, assertSafeUrl } from '@/lib/website/url';
import { isSameSite } from '@/lib/website/proxy-html';
import { captureAvailable } from '@/lib/website/flags';
import { ensureThumbnail, hasStoredThumbnail, thumbnailPublicUrl } from '@/lib/website/thumbnail';
import { projectStorage } from '@/lib/storage/backends';

/**
 * GET /api/websites/thumbnail/:threadId[?token=…] — a website page's sidebar
 * thumbnail.
 *
 * Redirects to the stored image, rendering it first if this page has never
 * had one. Rendering makes outbound requests on the server's behalf, so the
 * same gates as the proxy apply: access to the review, the review's own site
 * only, and the SSRF guard.
 */

export const runtime = 'nodejs';
export const maxDuration = 60;

function fail(status: number, error: string) {
  return NextResponse.json({ success: false, error }, { status });
}

export async function GET(request: NextRequest, context: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await context.params;
  const token = request.nextUrl.searchParams.get('token');

  const { data: threadRow } = await (supabaseAdmin as any)
    .from('markup_threads')
    .select('id, project_id, source_url, current_snapshot_id')
    .eq('id', threadId)
    .maybeSingle();
  const thread = threadRow as {
    id: string; project_id: string; source_url: string | null; current_snapshot_id: string | null;
  } | null;
  if (!thread?.source_url) return fail(404, 'No website page found for that id.');

  const { data: projectRow } = await supabaseAdmin
    .from('markup_projects')
    .select('id, kind, site_url, capture_defaults')
    .eq('id', thread.project_id)
    .maybeSingle();
  const project = projectRow as {
    id: string; kind: string | null; site_url: string | null; capture_defaults: unknown;
  } | null;
  if (!project || project.kind !== 'website' || !project.site_url) {
    return fail(404, 'No website review found for that page.');
  }

  // ── access ──────────────────────────────────────────────────────────────
  let authorised = false;
  if (token) {
    const { success, shareLink } = await validateShareToken(token);
    if (success && shareLink && shareLink.resourceId === project.id) authorised = true;
  }
  if (!authorised) authorised = await hasWebsiteProjectAccess(project.id);
  if (!authorised) return fail(403, 'You do not have access to this review.');

  const backend = await projectStorage('markup_projects', project.id);
  const stored = () =>
    NextResponse.redirect(thumbnailPublicUrl(backend, thread.id), {
      status: 307,
      headers: { 'Cache-Control': 'private, max-age=3600' },
    });

  if (await hasStoredThumbnail(backend, thread.id)) return stored();

  // ── target ──────────────────────────────────────────────────────────────
  let target: URL;
  try {
    target = normalizeUrl(thread.source_url);
    assertSafeUrl(target);
    if (!isSameSite(target, normalizeUrl(project.site_url))) return fail(403, 'That page is outside this review.');
  } catch {
    return fail(400, 'That address could not be read.');
  }

  let snapshotScreenshotPath: string | null = null;
  if (thread.current_snapshot_id) {
    const { data: snap } = await (supabaseAdmin as any)
      .from('website_snapshots')
      .select('screenshot_path, status')
      .eq('id', thread.current_snapshot_id)
      .maybeSingle();
    if (snap?.status === 'ready') snapshotScreenshotPath = snap.screenshot_path ?? null;
  }

  // Without a snapshot the only way to a picture is a browser.
  if (!snapshotScreenshotPath && !captureAvailable()) return fail(503, 'Thumbnails need a browser, which this deployment does not have.');

  const hideSelectors = (project.capture_defaults as { hideSelectors?: string[] } | null)?.hideSelectors;
  const ok = await ensureThumbnail({
    backend,
    threadId: thread.id,
    url: target.toString(),
    snapshotScreenshotPath,
    hideSelectors,
  });
  if (!ok) return fail(502, 'The page could not be rendered.');
  return stored();
}
