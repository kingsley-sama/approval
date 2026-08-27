/**
 * Viewport presets and capture settings for the Websites section.
 *
 * Split out from `capture.ts` on purpose: this half is plain data with no env
 * access, so the create/add-pages dialogs can import it without pulling the
 * webhook dispatch code — and its `process.env` reads — into the client
 * bundle. Anything here must stay safe to ship to the browser.
 */

export type ViewportLabel = 'desktop' | 'tablet' | 'mobile';

export interface ViewportSpec {
  label: ViewportLabel;
  width: number;
  height: number;
  /** Sent to the worker so mobile captures get a touch-capable UA. */
  isMobile: boolean;
}

export const VIEWPORTS: Record<ViewportLabel, ViewportSpec> = {
  desktop: { label: 'desktop', width: 1440, height: 900, isMobile: false },
  tablet: { label: 'tablet', width: 834, height: 1112, isMobile: false },
  mobile: { label: 'mobile', width: 390, height: 844, isMobile: true },
};

export const VIEWPORT_LABELS = Object.keys(VIEWPORTS) as ViewportLabel[];

export function isViewportLabel(v: string): v is ViewportLabel {
  return v in VIEWPORTS;
}

/**
 * Per-project capture settings, stored on markup_projects.capture_defaults so
 * a re-capture months later reproduces the same conditions. Comparing two
 * versions is only meaningful if nothing but the site changed.
 */
/**
 * Declared as a type alias rather than an interface on purpose: this is stored
 * in the `capture_defaults` jsonb column, and TypeScript only grants implicit
 * index signatures to type aliases. As an interface it would not be assignable
 * to Supabase's `Json` without a cast that hides real mismatches.
 */
export type CaptureSettings = {
  fullPage: boolean;
  viewports: ViewportLabel[];
  /** CSS selectors removed before the shot — the cookie-banner escape hatch. */
  hideSelectors: string[];
  /** Settle time after networkidle, for lazy-loaded imagery and webfonts. */
  waitMs: number;
};

export const DEFAULT_CAPTURE_SETTINGS: CaptureSettings = {
  fullPage: true,
  viewports: ['desktop'],
  // Covers the common German consent vendors (Cookiebot, Usercentrics,
  // Borlabs, CookieYes) plus generic ARIA dialogs. Without something like
  // this every screenshot of a German site is a picture of a consent banner.
  hideSelectors: [
    '#CybotCookiebotDialog',
    '#usercentrics-root',
    '#BorlabsCookieBox',
    '#cookie-law-info-bar',
    '[aria-label*="cookie" i]',
    '[class*="cookie-banner" i]',
    '[id*="cookie-consent" i]',
  ],
  waitMs: 1200,
};

export function normalizeCaptureSettings(raw: unknown): CaptureSettings {
  const src = (raw ?? {}) as Partial<CaptureSettings>;
  const viewports = Array.isArray(src.viewports)
    ? src.viewports.filter((v): v is ViewportLabel => typeof v === 'string' && isViewportLabel(v))
    : [];

  return {
    fullPage: typeof src.fullPage === 'boolean' ? src.fullPage : DEFAULT_CAPTURE_SETTINGS.fullPage,
    viewports: viewports.length ? viewports : DEFAULT_CAPTURE_SETTINGS.viewports,
    hideSelectors: Array.isArray(src.hideSelectors)
      ? src.hideSelectors.filter((s): s is string => typeof s === 'string')
      : DEFAULT_CAPTURE_SETTINGS.hideSelectors,
    waitMs:
      typeof src.waitMs === 'number' && src.waitMs >= 0 && src.waitMs <= 30000
        ? src.waitMs
        : DEFAULT_CAPTURE_SETTINGS.waitMs,
  };
}
