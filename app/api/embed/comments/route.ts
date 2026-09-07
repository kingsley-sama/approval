import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { validateShareToken } from '@/app/actions/share-links';
import { checkRateLimit } from '@/lib/rate-limit';
import { allocateProjectCommentNumber } from '@/lib/comment-numbering';
import { normalizeUrl, derivePageName, UnsafeUrlError } from '@/lib/website/url';
import { captureCommentShot } from '@/lib/website/snapshot/comment-shot';

/**
 * The endpoint the embed script talks to.
 *
 * This is called from the reviewed site's own domain, so every response
 * carries CORS headers — unlike /api/share/comment, which is only ever called
 * from our own pages.
 *
 * Auth is a share-link token, reused deliberately rather than invented: it
 * already carries permissions (view / comment / draw_and_comment), expiry and
 * revocation, and an agency can hand a client a link or a snippet from the
 * same control without learning two systems.
 *
 *   GET  ?key=<token>&url=<page>   existing comments for that page
 *   POST { key, url, content, … }  leave a comment
 */

export const runtime = 'nodejs';

function cors(origin: string | null): Record<string, string> {
  return {
    // The token is the credential and travels in the payload; no cookies are
    // involved, so echoing the caller's origin is safe and keeps the browser
    // happy without maintaining an allowlist of client domains.
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(body: unknown, status: number, origin: string | null) {
  return NextResponse.json(body, {
    status,
    headers: { ...cors(origin), 'Cache-Control': 'no-store' },
  });
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cors(request.headers.get('origin')) });
}

/** Resolves the share token to a website project the caller may comment on. */
async function resolveProject(token: string) {
  const { success, shareLink } = await validateShareToken(token);
  if (!success || !shareLink) return { error: 'This feedback link is not valid or has expired.' };
  if (shareLink.resourceType !== 'website_project') {
    return { error: 'That key does not belong to a website review.' };
  }

  const { data } = await supabase
    .from('markup_projects')
    .select('id, project_name, site_url, kind')
    .eq('id', shareLink.resourceId)
    .maybeSingle();

  const project = data as { id: string; project_name: string; site_url: string | null; kind: string | null } | null;
  if (!project || project.kind !== 'website') return { error: 'That review no longer exists.' };

  return { project, permissions: shareLink.permissions };
}

/**
 * Finds the thread for a page, creating one the first time somebody comments
 * there. A reviewer should never have to register a page before they can talk
 * about it.
 */
async function threadForPage(projectId: string, pageUrl: string): Promise<string | null> {
  const { data: existing } = await supabase
    .from('markup_threads')
    .select('id')
    .eq('project_id', projectId)
    .eq('source_url', pageUrl)
    .maybeSingle();

  const found = (existing as { id: string } | null)?.id;
  if (found) return found;

  const { data: last } = await supabase
    .from('markup_threads')
    .select('image_index')
    .eq('project_id', projectId)
    .order('image_index', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  const nextIndex = ((last as { image_index: number | null } | null)?.image_index ?? -1) + 1;

  const { data: created } = await supabase
    .from('markup_threads')
    .insert({
      project_id: projectId,
      thread_name: derivePageName(pageUrl),
      image_index: nextIndex,
      source_url: pageUrl,
      capture_status: 'ready',
      capture_version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  return (created as { id: string } | null)?.id ?? null;
}

// ── GET: existing comments for a page ─────────────────────────────────────
export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin');
  const key = request.nextUrl.searchParams.get('key');
  const rawUrl = request.nextUrl.searchParams.get('url');

  if (!key || !rawUrl) return json({ success: false, error: 'Missing key or url.' }, 400, origin);

  let pageUrl: string;
  try {
    pageUrl = normalizeUrl(rawUrl).toString();
  } catch (err) {
    return json(
      { success: false, error: err instanceof UnsafeUrlError ? err.message : 'Bad url.' },
      400,
      origin
    );
  }

  const resolved = await resolveProject(key);
  if ('error' in resolved) return json({ success: false, error: resolved.error }, 403, origin);

  const { data: thread } = await supabase
    .from('markup_threads')
    .select('id')
    .eq('project_id', resolved.project!.id)
    .eq('source_url', pageUrl)
    .maybeSingle();

  const threadId = (thread as { id: string } | null)?.id;
  if (!threadId) {
    return json({ success: true, canComment: resolved.permissions !== 'view', comments: [] }, 200, origin);
  }

  const { data: rows } = await supabase
    .from('markup_comments')
    .select('id, content, user_name, created_at, status, display_number, pin_number, x_position, y_position, anchor')
    .eq('thread_id', threadId)
    .neq('status', 'deleted')
    .is('parent_comment_id', null)
    .order('created_at', { ascending: true });

  const comments = ((rows ?? []) as any[])
    .filter((c) => c.type !== 'reply')
    .map((c) => ({
      id: c.id,
      number: c.display_number ?? c.pin_number ?? 0,
      content: c.content,
      author: c.user_name,
      createdAt: c.created_at,
      resolved: c.status === 'resolved',
      x: c.x_position,
      y: c.y_position,
      anchor: c.anchor ?? null,
    }));

  return json(
    { success: true, canComment: resolved.permissions !== 'view', comments },
    200,
    origin
  );
}

// ── POST: leave a comment ─────────────────────────────────────────────────
const AnchorSchema = z.object({
  // Stamped by the capture serializer; exact within a snapshot version and the
  // reason a snapshot anchor is stronger than a bare CSS path.
  rv: z.coerce.number().int().optional(),
  selector: z.string().max(2000).optional(),
  xPct: z.coerce.number().optional(),
  yPct: z.coerce.number().optional(),
  elementText: z.string().max(300).optional(),
  viewportWidth: z.coerce.number().optional(),
  snapshotVersion: z.coerce.number().int().optional(),
});

/** Where the anchored element sits in the snapshot, for cropping the record. */
const RectSchema = z.object({
  x: z.coerce.number(),
  y: z.coerce.number(),
  width: z.coerce.number(),
  height: z.coerce.number(),
  docWidth: z.coerce.number(),
});

const BodySchema = z.object({
  key: z.string().min(1),
  url: z.string().min(1).max(2000),
  content: z.string().trim().min(1).max(5000),
  userName: z.string().trim().min(1).max(150),
  // Document-percentage fallback, so the comment still renders if the anchor
  // element is later removed.
  xPosition: z.coerce.number().optional().default(50),
  yPosition: z.coerce.number().optional().default(50),
  anchor: AnchorSchema.optional(),
  // Present when the comment was made on a captured snapshot rather than the
  // live proxy; drives the immutable screenshot.
  snapshotId: z.string().uuid().optional(),
  rect: RectSchema.optional(),
});

const clamp = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 50);

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!checkRateLimit(`embed-comment:${ip}`, 60_000, 15)) {
    return json({ success: false, error: 'Too many comments too quickly. Try again shortly.' }, 429, origin);
  }

  let parsed;
  try {
    parsed = BodySchema.parse(await request.json());
  } catch (err) {
    const message = err instanceof z.ZodError ? err.issues[0]?.message ?? 'Invalid input.' : 'Invalid input.';
    return json({ success: false, error: message }, 400, origin);
  }

  let pageUrl: string;
  try {
    pageUrl = normalizeUrl(parsed.url).toString();
  } catch (err) {
    return json(
      { success: false, error: err instanceof UnsafeUrlError ? err.message : 'Bad url.' },
      400,
      origin
    );
  }

  const resolved = await resolveProject(parsed.key);
  if ('error' in resolved) return json({ success: false, error: resolved.error }, 403, origin);
  if (resolved.permissions === 'view') {
    return json({ success: false, error: 'This link is read-only.' }, 403, origin);
  }

  const threadId = await threadForPage(resolved.project!.id, pageUrl);
  if (!threadId) return json({ success: false, error: 'Could not open a thread for this page.' }, 500, origin);

  // Numbers are quoted between agency and client, so they must come from the
  // same project-wide counter the workspace uses — never a per-page count.
  const number = await allocateProjectCommentNumber(supabase as any, resolved.project!.id);

  const { data, error } = await supabase
    .from('markup_comments')
    .insert({
      id: nanoid(),
      thread_id: threadId,
      user_name: parsed.userName,
      content: parsed.content,
      pin_number: number,
      comment_index: number,
      display_number: number,
      x_position: clamp(parsed.xPosition),
      y_position: clamp(parsed.yPosition),
      status: 'active',
      type: 'comment',
      parent_comment_id: null,
      anchor: parsed.anchor ? { ...parsed.anchor, pageUrl } : null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any)
    .select('id, display_number, content, user_name, created_at, status, x_position, y_position, anchor')
    .single();

  if (error) {
    console.error('[embed] could not save comment:', error);
    return json({ success: false, error: 'Could not save that comment.' }, 500, origin);
  }

  const saved = data as any;

  // The immutable record. Cropped from the snapshot's own full-page image, so
  // it is by definition what the commenter was looking at. Best-effort: a
  // comment must never be lost because its screenshot could not be made.
  let screenshotPath: string | null = null;
  if (parsed.snapshotId && parsed.rect) {
    const { data: snapRow } = await supabase
      .from('website_snapshots')
      .select('screenshot_path, doc_width')
      .eq('id', parsed.snapshotId)
      .maybeSingle();
    const snap = snapRow as { screenshot_path: string | null; doc_width: number | null } | null;

    if (snap?.screenshot_path) {
      const shot = await captureCommentShot(
        saved.id,
        snap.screenshot_path,
        parsed.rect,
        parsed.rect.docWidth || snap.doc_width || 1440
      );
      screenshotPath = shot?.path ?? null;
    }

    await supabase
      .from('markup_comments')
      .update({
        snapshot_id: parsed.snapshotId,
        comment_screenshot_path: screenshotPath,
        anchor_confidence: 1,
      })
      .eq('id', saved.id);
  }

  return json(
    {
      success: true,
      comment: {
        id: saved.id,
        snapshotId: parsed.snapshotId ?? null,
        screenshotPath,
        number: saved.display_number,
        content: saved.content,
        author: saved.user_name,
        createdAt: saved.created_at,
        resolved: false,
        x: saved.x_position,
        y: saved.y_position,
        anchor: saved.anchor,
      },
    },
    200,
    origin
  );
}
