import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase';
import { getUser } from '@/lib/db/queries';
import { validateShareToken } from '@/app/actions/share-links';
import { normalizeUrl, assertSafeUrl, derivePageName, UnsafeUrlError } from '@/lib/website/url';
import { isSameSite } from '@/lib/website/proxy-html';
import { captureSite } from '@/lib/website/snapshot/capture';
import { storeSnapshot } from '@/lib/website/snapshot/store';
import { captureAvailable } from '@/lib/website/flags';
import { refreshProjectCounts } from '@/lib/website/project-counts';

/**
 * POST /api/websites/snapshot — capture a page into a durable copy.
 *
 * Synchronous on purpose: capture takes seconds to a minute (the WordPress
 * test page renders in ~50s) and a serverless function cannot reliably keep
 * background work alive after responding. The caller shows progress and waits.
 *
 * The same three gates as the proxy apply — this makes outbound requests on the
 * server's behalf, so access, site scope and the SSRF guard are all enforced.
 */

export const runtime = 'nodejs';
export const maxDuration = 300;

const BodySchema = z.object({
  projectId: z.string().uuid(),
  url: z.string().min(1).max(2000),
  threadId: z.string().uuid().optional(),
  token: z.string().optional(),
  viewportWidth: z.coerce.number().int().min(320).max(2560).optional(),
});

function fail(status: number, error: string) {
  return NextResponse.json({ success: false, error }, { status });
}

export async function POST(request: NextRequest) {
  if (!captureAvailable()) {
    return fail(503, 'Capture is disabled on this deployment (no browser available).');
  }

  let body;
  try {
    body = BodySchema.parse(await request.json());
  } catch (err) {
    return fail(422, err instanceof z.ZodError ? err.issues[0]?.message ?? 'Invalid input.' : 'Invalid input.');
  }

  const { data: projectRow } = await supabaseAdmin
    .from('markup_projects')
    .select('id, kind, site_url, capture_defaults')
    .eq('id', body.projectId)
    .maybeSingle();

  const project = projectRow as {
    id: string; kind: string | null; site_url: string | null; capture_defaults: unknown;
  } | null;
  if (!project || project.kind !== 'website') return fail(404, 'No website review found for that id.');
  if (!project.site_url) return fail(400, 'That review has no site address recorded.');

  // ── access ──────────────────────────────────────────────────────────────
  let authorised = false;
  if (body.token) {
    const { success, shareLink } = await validateShareToken(body.token);
    if (success && shareLink && shareLink.resourceId === body.projectId && shareLink.permissions !== 'view') {
      authorised = true;
    }
  }
  if (!authorised) {
    const user = await getUser();
    if (user?.role === 'admin') authorised = true;
    else if (user?.email) {
      const { data: access } = await supabaseAdmin
        .from('website_project_access')
        .select('project_id')
        .eq('project_id', body.projectId)
        .eq('user_email', user.email)
        .maybeSingle();
      if (access) authorised = true;
    }
  }
  if (!authorised) return fail(403, 'You do not have access to this review.');

  // ── target ──────────────────────────────────────────────────────────────
  let target: URL, site: URL;
  try {
    target = normalizeUrl(body.url);
    assertSafeUrl(target);
    site = normalizeUrl(project.site_url);
  } catch (err) {
    return fail(400, err instanceof UnsafeUrlError ? err.message : 'That address could not be read.');
  }
  if (!isSameSite(target, site)) {
    return fail(403, `Only pages on ${site.hostname} can be captured for this review.`);
  }

  // ── the page this snapshot belongs to ───────────────────────────────────
  let threadId = body.threadId ?? null;
  if (!threadId) {
    const { data: existing } = await supabaseAdmin
      .from('markup_threads')
      .select('id')
      .eq('project_id', body.projectId)
      .eq('source_url', target.toString())
      .maybeSingle();
    threadId = (existing as { id: string } | null)?.id ?? null;

    if (!threadId) {
      const { data: last } = await supabaseAdmin
        .from('markup_threads')
        .select('image_index')
        .eq('project_id', body.projectId)
        .order('image_index', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      const nextIndex = ((last as { image_index: number | null } | null)?.image_index ?? -1) + 1;

      const { data: created } = await supabaseAdmin
        .from('markup_threads')
        .insert({
          project_id: body.projectId,
          thread_name: derivePageName(target.toString()),
          image_index: nextIndex,
          source_url: target.toString(),
          capture_status: 'ready',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      threadId = (created as { id: string } | null)?.id ?? null;
    }
  }

  if (!threadId) return fail(500, 'Could not open a page record for that URL.');

  // Version this page's snapshots so a comment can say which copy it was made
  // against, rather than silently resolving against a different one.
  const { count: priorCount } = await supabaseAdmin
    .from('website_snapshots')
    .select('id', { count: 'exact', head: true })
    .eq('thread_id', threadId);

  const { data: snapRow, error: snapError } = await supabaseAdmin
    .from('website_snapshots')
    .insert({
      project_id: body.projectId,
      thread_id: threadId,
      url: target.toString(),
      status: 'capturing',
      viewport_width: body.viewportWidth ?? 1440,
      version: (priorCount ?? 0) + 1,
    })
    .select('id, version')
    .single();

  if (snapError || !snapRow) {
    console.error('[snapshot] could not create row', snapError);
    return fail(500, 'Could not start the capture.');
  }
  const snapshot = snapRow as { id: string; version: number };

  // ── capture ─────────────────────────────────────────────────────────────
  try {
    const defaults = (project.capture_defaults ?? {}) as { hideSelectors?: string[]; waitMs?: number };
    const result = await captureSite({
      url: target.toString(),
      viewportWidth: body.viewportWidth ?? 1440,
      hideSelectors: defaults.hideSelectors,
      waitMs: defaults.waitMs,
    });

    const stored = await storeSnapshot(snapshot.id, result);

    await supabaseAdmin
      .from('website_snapshots')
      .update({
        status: 'ready',
        html_path: stored.htmlPath,
        screenshot_path: stored.screenshotPath,
        asset_count: stored.assetCount,
        bytes_stored: stored.bytesStored,
        doc_width: result.docWidth,
        doc_height: result.docHeight,
        captured_at: new Date().toISOString(),
      })
      .eq('id', snapshot.id);

    // The thread now opens this copy. Earlier snapshots stay for comments that
    // were made against them.
    await supabaseAdmin
      .from('markup_threads')
      .update({
        current_snapshot_id: snapshot.id,
        page_title: result.title || null,
        captured_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', threadId);

    await refreshProjectCounts(body.projectId);

    return NextResponse.json({
      success: true,
      snapshot: {
        id: snapshot.id,
        version: snapshot.version,
        threadId,
        url: target.toString(),
        title: result.title,
        docWidth: result.docWidth,
        docHeight: result.docHeight,
        elementCount: result.elementCount,
        assetCount: stored.assetCount,
        bytesStored: stored.bytesStored,
        viewerUrl: `/api/websites/snapshot/${snapshot.id}`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[snapshot] capture failed', message);
    await supabaseAdmin
      .from('website_snapshots')
      .update({ status: 'failed', error: message.slice(0, 2000) })
      .eq('id', snapshot.id);
    return fail(502, `The page could not be captured: ${message}`);
  }
}
