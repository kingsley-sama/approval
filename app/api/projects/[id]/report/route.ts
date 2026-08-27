import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getUser } from '@/lib/db/queries';
import { validateShareToken } from '@/app/actions/share-links';
import { renderAnnotatedImage, type ReportPin } from '@/lib/report/annotate-image';
import { buildFeedbackPdf, type ReportComment, type ReportPageInput } from '@/lib/report/feedback-pdf';
import { getMediaKind } from '@/lib/media-type';
import type { Shape } from '@/types/drawing';

/**
 * GET /api/projects/[id]/report — the feedback report as a downloadable PDF.
 *
 * Works for both sections: a website review is a markup project, so the same
 * report covers captured pages and uploaded renders alike.
 *
 * Access is either a signed-in user with access to the project, or a valid
 * share token (`?token=…`) — clients reviewing through a share link are the
 * people most likely to want the file.
 *
 * Query:
 *   token=<share token>  authorise without a session
 *   all=1                include images that have no comments
 */

export const runtime = 'nodejs';
export const maxDuration = 300;

/** Rendering is the slow part; keep a lid on it so the request can finish. */
const MAX_IMAGES = 50;
const RENDER_CONCURRENCY = 3;

function fail(status: number, message: string) {
  return NextResponse.json({ success: false, error: message }, { status });
}

/** Filesystem-safe download name. */
function fileName(projectName: string): string {
  const base =
    projectName
      .normalize('NFKD')
      .replace(/[^\w\s.-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 60) || 'project';
  return `${base}-feedback.pdf`;
}

function toShapes(value: unknown): Shape[] {
  if (!value) return [];
  if (Array.isArray(value)) return value as Shape[];
  // Older rows store the envelope { version, shapes } rather than a bare shape.
  if (typeof value === 'object' && Array.isArray((value as { shapes?: unknown }).shapes)) {
    return (value as { shapes: Shape[] }).shapes;
  }
  return [value as Shape];
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    })
  );
  return out;
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await context.params;
  const token = request.nextUrl.searchParams.get('token');
  const includeAll = request.nextUrl.searchParams.get('all') === '1';

  // ── project ───────────────────────────────────────────────────────────────
  const { data: projectRow } = await supabaseAdmin
    .from('markup_projects')
    .select('id, project_name, kind, site_url')
    .eq('id', projectId)
    .maybeSingle();

  const project = projectRow as {
    id: string;
    project_name: string;
    kind: string | null;
    site_url: string | null;
  } | null;

  if (!project) return fail(404, 'Project not found.');

  // ── access ────────────────────────────────────────────────────────────────
  let authorised = false;

  if (token) {
    const { success, shareLink } = await validateShareToken(token);
    if (success && shareLink) {
      if (shareLink.resourceId === projectId) authorised = true;
      else if (shareLink.resourceType === 'thread') {
        // A single-image share still belongs to a project; allow the report for
        // that project only if the shared thread is one of its images.
        const { data: thread } = await supabaseAdmin
          .from('markup_threads')
          .select('project_id')
          .eq('id', shareLink.resourceId)
          .maybeSingle();
        if ((thread as { project_id: string } | null)?.project_id === projectId) authorised = true;
      }
    }
  }

  if (!authorised) {
    const user = await getUser();
    if (user) {
      if (user.role === 'admin') authorised = true;
      else if (user.email) {
        const table = project.kind === 'website' ? 'website_project_access' : 'project_access';
        const { data: access } = await supabaseAdmin
          .from(table)
          .select('project_id')
          .eq('project_id', projectId)
          .eq('user_email', user.email)
          .maybeSingle();
        if (access) authorised = true;
      }
    }
  }

  if (!authorised) return fail(403, 'You do not have access to this project.');

  // ── threads ───────────────────────────────────────────────────────────────
  const { data: threadRows } = await supabaseAdmin
    .from('markup_threads')
    .select('id, thread_name, image_path, image_filename, source_url, viewport_label')
    .eq('project_id', projectId)
    .order('image_index', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  const threads = (threadRows ?? []) as {
    id: string;
    thread_name: string;
    image_path: string | null;
    image_filename: string | null;
    source_url: string | null;
    viewport_label: string | null;
  }[];

  if (threads.length === 0) return fail(404, 'This project has no images yet.');

  // ── comments, replies, drawings ───────────────────────────────────────────
  const threadIds = threads.map((t) => t.id);
  const { data: commentRows } = await supabaseAdmin
    .from('markup_comments')
    .select('*')
    .in('thread_id', threadIds)
    .neq('status', 'deleted')
    .order('created_at', { ascending: true })
    .order('display_number', { ascending: true, nullsFirst: false });

  const allComments = (commentRows ?? []) as any[];
  const pinRows = allComments.filter((c) => c.type !== 'reply' && !c.parent_comment_id);

  // Replies live in markup_comments (migration 011); older ones are still in
  // comment_replies, and the app reads both — so the report must too.
  const repliesByParent = new Map<string, { author: string; content: string; createdAt: string | null }[]>();
  for (const row of allComments) {
    if (row.type !== 'reply' || !row.parent_comment_id) continue;
    const list = repliesByParent.get(row.parent_comment_id) ?? [];
    list.push({ author: row.user_name, content: row.content, createdAt: row.created_at });
    repliesByParent.set(row.parent_comment_id, list);
  }
  if (pinRows.length > 0) {
    const { data: legacy } = await supabaseAdmin
      .from('comment_replies')
      .select('comment_id, user_name, content, created_at')
      .in('comment_id', pinRows.map((c) => c.id));
    for (const row of (legacy ?? []) as any[]) {
      const list = repliesByParent.get(row.comment_id) ?? [];
      list.push({ author: row.user_name, content: row.content, createdAt: row.created_at });
      repliesByParent.set(row.comment_id, list);
    }
  }

  // Heavy shape JSON lives in markup_drawings, referenced by drawing_id.
  const drawingIds = Array.from(
    new Set(pinRows.map((c) => c.drawing_id).filter((v): v is string => typeof v === 'string' && !!v))
  );
  const drawingById = new Map<string, unknown>();
  if (drawingIds.length > 0) {
    const { data: drawings } = await supabaseAdmin
      .from('markup_drawings')
      .select('id, drawing_data')
      .in('id', drawingIds);
    for (const d of (drawings ?? []) as any[]) drawingById.set(d.id, d.drawing_data);
  }

  const pinsByThread = new Map<string, any[]>();
  for (const c of pinRows) {
    const list = pinsByThread.get(c.thread_id) ?? [];
    list.push(c);
    pinsByThread.set(c.thread_id, list);
  }

  // ── assemble ──────────────────────────────────────────────────────────────
  const candidates = threads.filter((t) => {
    if (!t.image_path) return false;
    // PDFs and videos have no raster to annotate; their pages are the split
    // images, which appear as their own threads.
    if (getMediaKind(t.image_path, t.thread_name) !== 'image') return false;
    return includeAll || (pinsByThread.get(t.id)?.length ?? 0) > 0;
  });

  const selected = candidates.slice(0, MAX_IMAGES);
  const skipped =
    threads.filter((t) => t.image_path).length - selected.length;

  const rendered = await mapLimit(selected, RENDER_CONCURRENCY, async (thread) => {
    const pins = (pinsByThread.get(thread.id) ?? []).slice().sort(
      (a, b) => (a.display_number ?? a.pin_number ?? 0) - (b.display_number ?? b.pin_number ?? 0)
    );

    const reportPins: ReportPin[] = pins.map((c) => ({
      number: c.display_number ?? c.pin_number ?? 0,
      x: typeof c.x_position === 'number' ? c.x_position : 0,
      y: typeof c.y_position === 'number' ? c.y_position : 0,
      resolved: c.status === 'resolved',
      shapes: toShapes(c.drawing_data ?? (c.drawing_id ? drawingById.get(c.drawing_id) : null)),
    }));

    const comments: ReportComment[] = pins.map((c) => ({
      number: c.display_number ?? c.pin_number ?? 0,
      author: c.user_name ?? 'Unknown',
      createdAt: c.created_at ?? null,
      resolved: c.status === 'resolved',
      content: c.content ?? '',
      replies: repliesByParent.get(c.id) ?? [],
    }));

    const image = await renderAnnotatedImage(thread.image_path!, reportPins);

    const page: ReportPageInput = {
      title: thread.thread_name || thread.image_filename || 'Untitled',
      sourceUrl: thread.source_url,
      image,
      comments,
    };
    return page;
  });

  try {
    const bytes = await buildFeedbackPdf({
      projectName: project.project_name,
      siteUrl: project.site_url,
      generatedAt: new Date(),
      pages: rendered,
      skippedCount: Math.max(0, skipped),
    });

    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName(project.project_name)}"`,
        'Content-Length': String(bytes.length),
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[report] failed to build PDF', err);
    return fail(500, 'The report could not be generated.');
  }
}
