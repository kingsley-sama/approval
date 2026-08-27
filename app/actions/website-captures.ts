'use server';

/**
 * Capture lifecycle for the Websites section.
 *
 * A capture is a markup_threads row. It is created immediately in
 * capture_status='pending' so the workspace has a stable place for the image
 * to land and the UI has a tile to show while the worker runs. The worker
 * POSTs the finished screenshot to /api/websites/capture, which flips the row
 * to 'ready'.
 *
 * Nothing here throws on a capture failure: a failed job leaves a visible,
 * retryable tile rather than an empty project with no explanation.
 */

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { requireUser } from '@/lib/auth/require-user';
import { dispatchCapture, isCaptureConfigured } from '@/lib/website/capture';
import {
  VIEWPORTS,
  normalizeCaptureSettings,
  type CaptureSettings,
  type ViewportLabel,
} from '@/lib/website/viewports';
import { refreshProjectCounts } from '@/lib/website/project-counts';
import { derivePageName, safeUrlString, UnsafeUrlError } from '@/lib/website/url';
import { AddWebsitePagesSchema, RecaptureThreadSchema } from '@/lib/validation/schemas';

async function requestOrigin(): Promise<string> {
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

export interface QueuedCapture {
  threadId: string;
  jobId: string;
  url: string;
  viewport: ViewportLabel;
  dispatched: boolean;
  error?: string;
}

export interface EnqueueResult {
  success: boolean;
  queued: QueuedCapture[];
  /** URLs rejected before anything was written (bad or unsafe). */
  rejected: { url: string; reason: string }[];
  /** True when no capture worker is configured — rows are queued, not running. */
  awaitingWorker: boolean;
  error?: string;
}

/** Highest image_index in a project, so new captures append rather than collide. */
async function nextImageIndex(projectId: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from('markup_threads')
    .select('image_index')
    .eq('project_id', projectId)
    .order('image_index', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  const current = (data as { image_index: number | null } | null)?.image_index;
  return typeof current === 'number' ? current + 1 : 0;
}

/**
 * Creates one pending capture per (url × viewport) and hands each to the
 * worker. Used both when a project is created and when pages are added later.
 */
export async function enqueueCaptures(
  projectId: string,
  urls: string[],
  viewports: ViewportLabel[],
  settings: CaptureSettings,
  requestedBy: string
): Promise<EnqueueResult> {
  const rejected: { url: string; reason: string }[] = [];
  const safeUrls: string[] = [];

  for (const raw of urls) {
    try {
      safeUrls.push(safeUrlString(raw));
    } catch (err) {
      rejected.push({
        url: raw,
        reason: err instanceof UnsafeUrlError ? err.message : 'Could not be read as a URL',
      });
    }
  }

  if (safeUrls.length === 0) {
    return { success: false, queued: [], rejected, awaitingWorker: !isCaptureConfigured(), error: 'No usable URLs' };
  }

  const origin = await requestOrigin();
  const queued: QueuedCapture[] = [];
  let index = await nextImageIndex(projectId);

  for (const url of safeUrls) {
    for (const label of viewports) {
      const viewport = VIEWPORTS[label];
      const pageName = derivePageName(url);
      const threadName = viewports.length > 1 ? `${pageName} · ${label}` : pageName;

      const { data: thread, error: threadError } = await supabaseAdmin
        .from('markup_threads')
        .insert({
          project_id: projectId,
          thread_name: threadName,
          image_index: index++,
          source_url: url,
          viewport_label: label,
          viewport_width: viewport.width,
          capture_status: 'pending',
          capture_version: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (threadError || !thread) {
        rejected.push({ url, reason: threadError?.message ?? 'Could not create the capture row' });
        continue;
      }

      const threadId = (thread as { id: string }).id;

      const { data: job, error: jobError } = await supabaseAdmin
        .from('website_capture_jobs')
        .insert({
          project_id: projectId,
          thread_id: threadId,
          url,
          viewport: label,
          status: 'queued',
          requested_by: requestedBy,
        })
        .select('id')
        .single();

      if (jobError || !job) {
        rejected.push({ url, reason: jobError?.message ?? 'Could not queue the capture' });
        continue;
      }

      const jobId = (job as { id: string }).id;
      const result = await dispatchCapture(
        { jobId, projectId, threadId, url, viewport, settings },
        origin
      );

      if (result.error) {
        // Record why, but leave the thread pending so a retry can pick it up.
        await supabaseAdmin
          .from('website_capture_jobs')
          .update({ status: 'failed', error: result.error, finished_at: new Date().toISOString() })
          .eq('id', jobId);
      } else if (result.dispatched) {
        await supabaseAdmin
          .from('website_capture_jobs')
          .update({ status: 'running' })
          .eq('id', jobId);
      }

      queued.push({ threadId, jobId, url, viewport: label, dispatched: result.dispatched, error: result.error });
    }
  }

  await refreshProjectCounts(projectId);
  revalidatePath('/websites');
  revalidatePath(`/websites/${projectId}`);

  return { success: queued.length > 0, queued, rejected, awaitingWorker: !isCaptureConfigured() };
}

/** Adds more pages to an existing website project. */
export async function addWebsitePages(input: {
  projectId: string;
  urls: string[];
  viewports?: ViewportLabel[];
}): Promise<EnqueueResult> {
  const user = await requireUser();

  const parsed = AddWebsitePagesSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      queued: [],
      rejected: [],
      awaitingWorker: !isCaptureConfigured(),
      error: 'Invalid input: ' + parsed.error.issues[0]?.message,
    };
  }

  const { data: project } = await supabaseAdmin
    .from('markup_projects')
    .select('id, kind, capture_defaults')
    .eq('id', parsed.data.projectId)
    .maybeSingle();

  const row = project as { kind: string | null; capture_defaults: unknown } | null;
  if (!row || row.kind !== 'website') {
    return {
      success: false,
      queued: [],
      rejected: [],
      awaitingWorker: !isCaptureConfigured(),
      error: 'That project is not a website review',
    };
  }

  const settings = normalizeCaptureSettings(row.capture_defaults);
  const viewports = parsed.data.viewports ?? settings.viewports;

  return enqueueCaptures(
    parsed.data.projectId,
    parsed.data.urls,
    viewports,
    settings,
    user.email ?? 'system'
  );
}

/**
 * Re-shoots one page. The existing capture is kept and the new row points at
 * it through supersedes_thread_id, so comments already resolved against the
 * old screenshot keep their evidence.
 */
export async function recaptureThread(threadId: string): Promise<EnqueueResult> {
  const user = await requireUser();

  const parsed = RecaptureThreadSchema.safeParse({ threadId });
  if (!parsed.success) {
    return {
      success: false,
      queued: [],
      rejected: [],
      awaitingWorker: !isCaptureConfigured(),
      error: 'Invalid input',
    };
  }

  const { data: thread } = await supabaseAdmin
    .from('markup_threads')
    .select('id, project_id, source_url, viewport_label, capture_version, thread_name, image_index')
    .eq('id', threadId)
    .maybeSingle();

  const row = thread as {
    id: string;
    project_id: string;
    source_url: string | null;
    viewport_label: string | null;
    capture_version: number | null;
    thread_name: string;
    image_index: number | null;
  } | null;

  if (!row?.source_url) {
    return {
      success: false,
      queued: [],
      rejected: [],
      awaitingWorker: !isCaptureConfigured(),
      error: 'That capture has no source URL to re-shoot',
    };
  }

  const { data: project } = await supabaseAdmin
    .from('markup_projects')
    .select('capture_defaults')
    .eq('id', row.project_id)
    .maybeSingle();

  const settings = normalizeCaptureSettings(
    (project as { capture_defaults: unknown } | null)?.capture_defaults
  );
  const label = (row.viewport_label ?? 'desktop') as ViewportLabel;
  const viewport = VIEWPORTS[label] ?? VIEWPORTS.desktop;
  const origin = await requestOrigin();

  const { data: newThread, error: threadError } = await supabaseAdmin
    .from('markup_threads')
    .insert({
      project_id: row.project_id,
      thread_name: row.thread_name,
      image_index: row.image_index,
      source_url: row.source_url,
      viewport_label: label,
      viewport_width: viewport.width,
      capture_status: 'pending',
      capture_version: (row.capture_version ?? 1) + 1,
      supersedes_thread_id: row.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (threadError || !newThread) {
    return {
      success: false,
      queued: [],
      rejected: [{ url: row.source_url, reason: threadError?.message ?? 'Could not create the capture row' }],
      awaitingWorker: !isCaptureConfigured(),
    };
  }

  const newThreadId = (newThread as { id: string }).id;

  const { data: job } = await supabaseAdmin
    .from('website_capture_jobs')
    .insert({
      project_id: row.project_id,
      thread_id: newThreadId,
      url: row.source_url,
      viewport: label,
      status: 'queued',
      requested_by: user.email ?? 'system',
    })
    .select('id')
    .single();

  const jobId = (job as { id: string } | null)?.id ?? '';
  const result = await dispatchCapture(
    { jobId, projectId: row.project_id, threadId: newThreadId, url: row.source_url, viewport, settings },
    origin
  );

  if (jobId) {
    await supabaseAdmin
      .from('website_capture_jobs')
      .update(
        result.error
          ? { status: 'failed', error: result.error, finished_at: new Date().toISOString() }
          : { status: result.dispatched ? 'running' : 'queued' }
      )
      .eq('id', jobId);
  }

  await refreshProjectCounts(row.project_id);
  revalidatePath(`/websites/${row.project_id}`);

  return {
    success: true,
    queued: [
      {
        threadId: newThreadId,
        jobId,
        url: row.source_url,
        viewport: label,
        dispatched: result.dispatched,
        error: result.error,
      },
    ],
    rejected: [],
    awaitingWorker: !isCaptureConfigured(),
  };
}
