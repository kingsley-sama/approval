import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * File storage can live in two Supabase accounts:
 *
 *   default    — the account that also holds the database
 *                (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).
 *   secondary  — a separate account used only for files
 *                (STORAGE_SECONDARY_SUPABASE_URL / STORAGE_SECONDARY_SERVICE_ROLE_KEY).
 *
 * Which account receives a project's *new* uploads is the project's
 * `storage_backend` column (migration 023: existing projects stay on 'default',
 * new ones get 'secondary').
 *
 * Reading or deleting a file never goes through the project, though, because
 * duplication copies file references between projects: a new project can hold
 * threads and attachments whose files still live in the old account. Each
 * stored reference therefore identifies its own account:
 *
 *   - public URLs (image_path, preview_url, …) by their host;
 *   - bare storage paths (attachments, snapshots, comment shots) by a
 *     `secondary:` prefix. Unprefixed paths are the default account, which
 *     is what every row written before this change holds.
 */

export type StorageBackendId = 'default' | 'secondary';

export interface StorageBackend {
  id: StorageBackendId;
  client: SupabaseClient;
  bucket: string;
  /** Origin the backend's public URLs are served from. */
  origin: string;
}

const SECONDARY_PREFIX = 'secondary:';

const defaultBackend: StorageBackend = {
  id: 'default',
  client: supabaseAdmin,
  bucket: process.env.NEXT_PUBLIC_SUPABASE_BUCKET_NAME || 'screenshots',
  origin: new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin,
};

const secondaryBackend: StorageBackend | null = (() => {
  const url = process.env.STORAGE_SECONDARY_SUPABASE_URL;
  const key = process.env.STORAGE_SECONDARY_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return {
    id: 'secondary',
    client: createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    }),
    bucket: process.env.STORAGE_SECONDARY_BUCKET_NAME || 'screenshots',
    origin: new URL(url).origin,
  };
})();

/**
 * The backend for an id. A project marked 'secondary' before the secondary
 * account is configured writes to the default account instead; the refs it
 * produces say so, so those files stay readable once secondary is switched on.
 */
export function storageBackend(id: StorageBackendId | string | null | undefined): StorageBackend {
  if (id === 'secondary' && secondaryBackend) return secondaryBackend;
  return defaultBackend;
}

/** Storage API scoped to the backend's bucket. */
export function bucketOf(backend: StorageBackend) {
  return backend.client.storage.from(backend.bucket);
}

// ── refs (bare paths that remember their account) ─────────────────────────

export interface ResolvedRef {
  backend: StorageBackend;
  path: string;
}

/** Turns a path written to `backend` into the string to store in the database. */
export function toStorageRef(backend: StorageBackend, path: string): string {
  return backend.id === 'secondary' ? `${SECONDARY_PREFIX}${path}` : path;
}

export function resolveStorageRef(ref: string): ResolvedRef {
  if (ref.startsWith(SECONDARY_PREFIX)) {
    return { backend: storageBackend('secondary'), path: ref.slice(SECONDARY_PREFIX.length) };
  }
  return { backend: defaultBackend, path: ref };
}

export function publicUrlForRef(ref: string): string {
  const { backend, path } = resolveStorageRef(ref);
  return bucketOf(backend).getPublicUrl(path).data.publicUrl;
}

export async function signedUrlForRef(ref: string, expiresIn: number): Promise<string | null> {
  const { backend, path } = resolveStorageRef(ref);
  const { data } = await bucketOf(backend).createSignedUrl(path, expiresIn);
  return data?.signedUrl ?? null;
}

export async function downloadRef(ref: string): Promise<Buffer | null> {
  const { backend, path } = resolveStorageRef(ref);
  const { data, error } = await bucketOf(backend).download(path);
  if (error || !data) {
    console.error('[storage] download failed', ref, error);
    return null;
  }
  return Buffer.from(await data.arrayBuffer());
}

/**
 * Deletes a mix of refs and public URLs, one `remove` per account. Entries
 * that are neither (external URLs, placeholders) are skipped rather than
 * guessed at.
 */
export async function removeStored(refsOrUrls: string[]): Promise<{ error: unknown | null }> {
  const byBackend = new Map<StorageBackend, string[]>();
  for (const entry of refsOrUrls) {
    const resolved = /^https?:\/\//.test(entry) ? resolvePublicUrl(entry) : resolveStorageRef(entry);
    if (!resolved) continue;
    const list = byBackend.get(resolved.backend) ?? [];
    list.push(resolved.path);
    byBackend.set(resolved.backend, list);
  }

  let firstError: unknown | null = null;
  for (const [backend, paths] of byBackend) {
    const { error } = await bucketOf(backend).remove(paths);
    if (error && !firstError) firstError = error;
  }
  return { error: firstError };
}

// ── public URLs ───────────────────────────────────────────────────────────

/**
 * Maps a public storage URL back to its account and bucket-relative path.
 * Returns null for anything that isn't a public URL of a configured bucket.
 */
export function resolvePublicUrl(url: string): ResolvedRef | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const backend = [defaultBackend, secondaryBackend].find(b => b && b.origin === parsed.origin);
  if (!backend) return null;

  const marker = `/storage/v1/object/public/${backend.bucket}/`;
  if (!parsed.pathname.startsWith(marker)) return null;
  const raw = parsed.pathname.slice(marker.length);
  if (!raw) return null;
  try {
    return { backend, path: decodeURIComponent(raw) };
  } catch {
    return { backend, path: raw };
  }
}

// ── which account a project writes to ─────────────────────────────────────

export type ProjectTable = 'markup_projects' | 'panorama_projects' | 'tour_projects';

export async function projectStorage(table: ProjectTable, projectId: string): Promise<StorageBackend> {
  const { data } = await (supabaseAdmin as any)
    .from(table)
    .select('storage_backend')
    .eq('id', projectId)
    .maybeSingle();
  return storageBackend((data as { storage_backend?: string } | null)?.storage_backend);
}
