import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { normalizeUrl, assertSafeUrl } from '@/lib/website/url';
import { captureAvailable } from '@/lib/website/flags';
import { canOpenWebsiteProject } from '@/lib/website/proxy-session';
import { ensureThumbnail, hasStoredThumbnail, readThumbnail } from '@/lib/website/thumbnail';
import { projectStorage } from '@/lib/storage/backends';

/**
 * GET /api/websites/thumbnail/project/:projectId[?token=…] — the picture on a
 * website review's dashboard card: its landing page.
 *
 * A website review has no uploaded image, so its card used to be a coloured
 * placeholder and every review looked alike. This renders the review's first
 * page once and serves it from Storage after that, sharing the cached file
 * with that page's sidebar tile.
 *
 * The bytes are returned rather than a redirect: the card renders through
 * next/image, whose optimizer fetches this URL itself.
 */

export const runtime = 'nodejs';
export const maxDuration = 60;

function fail(status: number, error: string) {
  return NextResponse.json({ success: false, error }, { status });
}

export async function GET(request: NextRequest, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params;
  const token = request.nextUrl.searchParams.get('token');
  if (!(await canOpenWebsiteProject(projectId, token))) {
    return fail(403, 'You do not have access to this review.');
  }

  const { data: projectRow } = await supabaseAdmin
    .from('markup_projects')
    .select('id, kind, site_url, capture_defaults')
    .eq('id', projectId)
    .maybeSingle();
  const project = projectRow as {
    id: string; kind: string | null; site_url: string | null; capture_defaults: unknown;
  } | null;
  if (!project || project.kind !== 'website' || !project.site_url) {
    return fail(404, 'No website review found for that id.');
  }

  // The landing page is the review's first page; a review with no pages yet
  // still has the site itself.
  const { data: threadRow } = await (supabaseAdmin as any)
    .from('markup_threads')
    .select('id, source_url, current_snapshot_id')
    .eq('project_id', projectId)
    .not('source_url', 'is', null)
    .order('image_index', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  const thread = threadRow as { id: string; source_url: string | null; current_snapshot_id: string | null } | null;

  // Shares the page tile's cached file when there is a page to share it with.
  const key = thread?.id ?? `project-${projectId}`;
  const source = thread?.source_url ?? project.site_url;

  const backend = await projectStorage('markup_projects', projectId);
  const serve = async () => {
    const body = await readThumbnail(backend, key);
    if (!body) return fail(502, 'The thumbnail could not be read.');
    return new NextResponse(new Uint8Array(body), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  };

  if (await hasStoredThumbnail(backend, key)) return serve();

  let target: URL;
  try {
    target = normalizeUrl(source);
    assertSafeUrl(target);
  } catch {
    return fail(400, 'That review has no usable site address.');
  }

  let snapshotScreenshotPath: string | null = null;
  if (thread?.current_snapshot_id) {
    const { data: snap } = await (supabaseAdmin as any)
      .from('website_snapshots')
      .select('screenshot_path, status')
      .eq('id', thread.current_snapshot_id)
      .maybeSingle();
    if (snap?.status === 'ready') snapshotScreenshotPath = snap.screenshot_path ?? null;
  }
  if (!snapshotScreenshotPath && !captureAvailable()) {
    return fail(503, 'Thumbnails need a browser, which this deployment does not have.');
  }

  const ok = await ensureThumbnail({
    backend,
    threadId: key,
    url: target.toString(),
    snapshotScreenshotPath,
    hideSelectors: (project.capture_defaults as { hideSelectors?: string[] } | null)?.hideSelectors,
  });
  if (!ok) return fail(502, 'The page could not be rendered.');
  return serve();
}
