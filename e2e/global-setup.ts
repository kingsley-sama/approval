/**
 * Prepares the fixture data before any project runs.
 *
 * The suite writes comments and never removes them, so the fixture image fills
 * up with pins and eventually a new comment has nowhere to land. Seeding first
 * retires the previous run's pins (by resolving them, which takes them off the
 * canvas without deleting anything) and guarantees the project, image and share
 * links exist.
 */
export default async function globalSetup() {
  await import('./fixtures/seed.mjs');
}
