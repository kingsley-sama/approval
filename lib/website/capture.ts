/**
 * Capture provider adapter. Server-only — reads env and talks to the worker.
 *
 * Whatever actually drives a browser lives outside this app — an n8n workflow,
 * a hosted screenshot API, or a Playwright container. All of them look the
 * same from here: we hand over a job and a callback, and something POSTs the
 * image back to /api/websites/capture.
 *
 * Keeping this behind one interface is deliberate. Starting on n8n (which is
 * already running at n8n.exposeprofi.de) and moving to a dedicated worker later
 * should be an env-var change, not a refactor.
 *
 * Configuration:
 *   WEBSITE_CAPTURE_WEBHOOK_URL     endpoint that receives capture jobs
 *   WEBSITE_CAPTURE_WEBHOOK_TOKEN   optional bearer token sent to it
 *   WEBSITE_CAPTURE_CALLBACK_SECRET shared secret the worker echoes back
 *
 * With no webhook configured, captures are queued and left 'pending'. The UI
 * says so plainly, and images can still be attached by any other route
 * (including the existing /api/v1 images endpoint).
 */

import type { CaptureSettings, ViewportSpec } from '@/lib/website/viewports';

export interface CaptureJob {
  jobId: string;
  projectId: string;
  threadId: string;
  url: string;
  viewport: ViewportSpec;
  settings: CaptureSettings;
}

export interface DispatchResult {
  dispatched: boolean;
  /** Present when dispatch was attempted and failed. */
  error?: string;
}

export function isCaptureConfigured(): boolean {
  return Boolean(process.env.WEBSITE_CAPTURE_WEBHOOK_URL);
}

export function captureCallbackSecret(): string | null {
  return process.env.WEBSITE_CAPTURE_CALLBACK_SECRET || null;
}

/**
 * Hands one job to the configured worker. Never throws — a dispatch failure
 * leaves the thread 'pending' with an error recorded on the job, which the
 * dashboard surfaces and the user can retry.
 */
export async function dispatchCapture(job: CaptureJob, origin: string): Promise<DispatchResult> {
  const endpoint = process.env.WEBSITE_CAPTURE_WEBHOOK_URL;
  if (!endpoint) return { dispatched: false };

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = process.env.WEBSITE_CAPTURE_WEBHOOK_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  const payload = {
    jobId: job.jobId,
    projectId: job.projectId,
    threadId: job.threadId,
    url: job.url,
    viewport: job.viewport,
    fullPage: job.settings.fullPage,
    hideSelectors: job.settings.hideSelectors,
    waitMs: job.settings.waitMs,
    callbackUrl: `${origin}/api/websites/capture`,
    callbackSecret: captureCallbackSecret(),
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { dispatched: false, error: `Capture worker responded ${res.status}: ${body.slice(0, 300)}` };
    }
    return { dispatched: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { dispatched: false, error: `Could not reach the capture worker: ${message}` };
  }
}
