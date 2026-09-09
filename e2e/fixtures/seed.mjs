/**
 * Seeds the data the logged-in end-to-end suites expect.
 *
 * The role tests need a project that reliably exists and holds at least one
 * image, otherwise they assert against an empty workspace and fail for reasons
 * that have nothing to do with the code under test.
 *
 * Everything here is create-or-update, addressed by fixed ids. Re-running is
 * safe and nothing is ever removed: the fixtures are meant to be cleared by
 * hand, not by a script that could run against the wrong database.
 *
 *   node e2e/fixtures/seed.mjs
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');

// Read .env directly: this runs outside Next, so nothing has loaded it for us.
function readEnv() {
  const out = {};
  for (const file of ['.env', '.env.local']) {
    const p = path.join(root, file);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const i = trimmed.indexOf('=');
      const value = trimmed.slice(i + 1).trim().replace(/^["']|["']$/g, '');
      if (value) out[trimmed.slice(0, i).trim()] = value;
    }
  }
  return out;
}

const env = readEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
const bucket = env.NEXT_PUBLIC_SUPABASE_BUCKET_NAME || 'screenshots';
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(url, key);

/** Fixed so tests can hard-code it and so re-seeding updates rather than adds. */
export const FIXTURE_PROJECT_ID = '6bb4acd7-6437-490e-b260-1b1d9c2ca0b7';
export const FIXTURE_PROJECT_NAME = 'Playwright Test Project';
const FIXTURE_THREAD_ID = 'c1a7f0de-8e2b-4a15-9b7c-2f6e30d4a911';
const STORAGE_PATH = `e2e-fixtures/${FIXTURE_PROJECT_ID}/annotation-fixture.jpg`;

/**
 * A generated image rather than a remote placeholder. picsum.photos was the
 * previous source and made a role test depend on a third party being up.
 */
async function buildImage() {
  const { default: sharp } = await import('sharp');
  const w = 1200;
  const h = 800;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="${w}" height="${h}" fill="#eef2f7"/>
    <rect x="80" y="80" width="460" height="300" fill="#c7d6e8"/>
    <rect x="620" y="80" width="500" height="300" fill="#d9c7e8"/>
    <rect x="80" y="440" width="1040" height="280" fill="#c7e8d3"/>
    <text x="60" y="60" font-family="sans-serif" font-size="34" fill="#334155">Playwright annotation fixture</text>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer();
}

async function main() {
  const buffer = await buildImage();

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(STORAGE_PATH, new Blob([new Uint8Array(buffer)], { type: 'image/jpeg' }), {
      contentType: 'image/jpeg',
      cacheControl: '3600',
      // Replaces the fixture image in place on a re-run; never removes anything.
      upsert: true,
    });
  if (uploadError) throw uploadError;

  const { data: pub } = supabase.storage.from(bucket).getPublicUrl(STORAGE_PATH);
  const imageUrl = pub.publicUrl;
  console.log('image  ', imageUrl);

  const now = new Date().toISOString();

  const { error: projectError } = await supabase.from('markup_projects').upsert(
    {
      id: FIXTURE_PROJECT_ID,
      project_name: FIXTURE_PROJECT_NAME,
      markup_url: imageUrl,
      kind: 'image',
      total_threads: 1,
      total_screenshots: 1,
      updated_at: now,
    },
    { onConflict: 'id' }
  );
  if (projectError) throw projectError;
  console.log('project', FIXTURE_PROJECT_ID, FIXTURE_PROJECT_NAME);

  const { error: threadError } = await supabase.from('markup_threads').upsert(
    {
      id: FIXTURE_THREAD_ID,
      project_id: FIXTURE_PROJECT_ID,
      thread_name: 'annotation-fixture.jpg',
      image_path: imageUrl,
      image_filename: STORAGE_PATH,
      image_index: 0,
      capture_status: 'ready',
      capture_version: 1,
      updated_at: now,
    },
    { onConflict: 'id' }
  );
  if (threadError) throw threadError;
  console.log('thread ', FIXTURE_THREAD_ID, 'annotation-fixture.jpg');

  // Two share links so the permission gating can actually be tested: the
  // comment one drives the guest-annotation path, the view-only one is the
  // only way to reach the read-only branch of the share viewer.
  for (const link of [
    { token: 'playwright-test-share-token-abc123', permissions: 'comment' },
    { token: 'playwright-test-share-token-viewonly', permissions: 'view' },
  ]) {
    const { data: existing } = await supabase
      .from('share_links')
      .select('id')
      .eq('token', link.token)
      .maybeSingle();

    const row = {
      token: link.token,
      resource_type: 'project',
      resource_id: FIXTURE_PROJECT_ID,
      permissions: link.permissions,
      created_by: 'testadmin@revision.test',
      is_active: true,
      expires_at: null,
    };

    const { error } = existing
      ? await supabase.from('share_links').update(row).eq('id', existing.id)
      : await supabase.from('share_links').insert(row);
    if (error) throw error;
    console.log('share  ', link.token, `(${link.permissions})`);
  }

  // Retire the pins earlier runs left behind.
  //
  // Nothing here deletes: the workspace only draws comments whose status is
  // active (app/projects/[id]/workspace.tsx filters by the selected tab), so
  // marking the old ones resolved clears the canvas while keeping every row.
  // Without this the image saturates after a few runs and new comments have
  // nowhere to land that is not already covered by a pin.
  const { data: retired } = await supabase
    .from('markup_comments')
    .update({ status: 'resolved', updated_at: now })
    .eq('thread_id', FIXTURE_THREAD_ID)
    .eq('status', 'active')
    .select('id');
  console.log('retired', (retired ?? []).length, 'pin(s) from earlier runs (resolved, not deleted)');

  const { count } = await supabase
    .from('markup_threads')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', FIXTURE_PROJECT_ID);
  console.log(`\nready — project holds ${count} image(s)`);
}

main().catch((err) => {
  console.error('seed failed:', err.message || err);
  process.exit(1);
});
