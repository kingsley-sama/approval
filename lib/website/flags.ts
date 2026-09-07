/**
 * Which viewer a website review opens with.
 *
 * Both implementations stay live while they are compared:
 *
 *   proxy    — /api/websites/proxy fetches and rewrites the site on every
 *              view. Always current, breaks in site-specific ways, and the
 *              thing a comment points at can change underneath it.
 *   snapshot — the page is captured once with a real browser and annotated
 *              from our own copy. Stable and durable; goes stale by design,
 *              which is what re-capture is for.
 *
 * Resolution order is per-project first, then the environment default, so one
 * review can be switched over without moving everybody.
 */

export type ViewerMode = 'proxy' | 'snapshot';

export const DEFAULT_VIEWER_MODE: ViewerMode = 'proxy';

export function isViewerMode(value: unknown): value is ViewerMode {
  return value === 'proxy' || value === 'snapshot';
}

/** The environment-wide default: WEBSITE_VIEWER_MODE=snapshot to flip it. */
export function envViewerMode(): ViewerMode {
  const raw = process.env.WEBSITE_VIEWER_MODE;
  return isViewerMode(raw) ? raw : DEFAULT_VIEWER_MODE;
}

/**
 * `capture_defaults.viewerMode` on the project wins when set, so a single
 * review can be moved to snapshots for comparison without a deploy.
 */
export function resolveViewerMode(projectDefaults: unknown): ViewerMode {
  const fromProject = (projectDefaults as { viewerMode?: unknown } | null)?.viewerMode;
  if (isViewerMode(fromProject)) return fromProject;
  return envViewerMode();
}

/**
 * Capture needs a real browser binary. Vercel's Node runtime has none, so a
 * deployment there must either point at a worker or add @sparticuz/chromium;
 * this lets the UI say so instead of failing with a stack trace.
 */
export function captureAvailable(): boolean {
  return process.env.WEBSITE_CAPTURE_DISABLED !== 'true';
}
