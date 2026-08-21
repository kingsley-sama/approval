/**
 * Browser tab titles.
 *
 * The default title names the product; once a project is open the tab shows
 * the project instead, so a user with several projects open can tell the tabs
 * apart. Kept in one module because two paths set it: Next metadata on the
 * server (via the `%s · Revision` template in app/layout.tsx) and a client
 * effect for names that arrive or change after hydration.
 */

export const APP_NAME = 'Revision';

export const APP_TITLE =
  'Revision - Annotation & Approval Tool for feedback on renders';

/** `"<name> · Revision"`, falling back to the product title for a blank name. */
export function documentTitle(name?: string | null): string {
  const trimmed = name?.trim();
  return trimmed ? `${trimmed} · ${APP_NAME}` : APP_TITLE;
}
