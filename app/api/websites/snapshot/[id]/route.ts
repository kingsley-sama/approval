import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getUser } from '@/lib/db/queries';
import { validateShareToken } from '@/app/actions/share-links';
import { readStored } from '@/lib/website/snapshot/store';

/**
 * GET /api/websites/snapshot/[id] — serve a captured page for annotation.
 *
 * Served from our origin so the viewer can read the document and place pins.
 * Unlike the proxy there is no upstream fetch, no URL rewriting and no runtime
 * shim: the stored HTML already points at our own copies of every asset, and
 * its scripts were removed at capture time. It is a static document, which is
 * exactly what makes it a stable thing to annotate.
 */

export const runtime = 'nodejs';

function fail(status: number, message: string) {
  const body = `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;display:flex;align-items:center;justify-content:center;height:100vh;
      font:14px/1.6 system-ui,sans-serif;background:#f7f4ed;color:#0c3133;padding:24px}
    div{max-width:34rem;text-align:center}h1{font-size:15px;margin:0 0 8px}p{margin:0;color:#4a5a5b}
  </style><div><h1>This snapshot could not be opened</h1><p>${message
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')}</p></div>`;
  return new NextResponse(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const token = request.nextUrl.searchParams.get('token');

  const { data: snapRow } = await supabaseAdmin
    .from('website_snapshots')
    .select('id, project_id, status, html_path, error')
    .eq('id', id)
    .maybeSingle();

  const snapshot = snapRow as {
    id: string; project_id: string; status: string; html_path: string | null; error: string | null;
  } | null;

  if (!snapshot) return fail(404, 'No snapshot with that id.');
  if (snapshot.status === 'failed') {
    return fail(502, snapshot.error || 'The capture failed.');
  }
  if (snapshot.status !== 'ready' || !snapshot.html_path) {
    return fail(409, 'This page is still being captured. Try again in a moment.');
  }

  // ── access, matching the proxy ──────────────────────────────────────────
  let authorised = false;
  if (token) {
    const { success, shareLink } = await validateShareToken(token);
    if (success && shareLink && shareLink.resourceId === snapshot.project_id) authorised = true;
  }
  if (!authorised) {
    const user = await getUser();
    if (user?.role === 'admin') authorised = true;
    else if (user?.email) {
      const { data: access } = await supabaseAdmin
        .from('website_project_access')
        .select('project_id')
        .eq('project_id', snapshot.project_id)
        .eq('user_email', user.email)
        .maybeSingle();
      if (access) authorised = true;
    }
  }
  if (!authorised) return fail(403, 'You do not have access to this review.');

  const html = await readStored(snapshot.html_path);
  if (!html) return fail(500, 'The stored page could not be read back.');

  return new NextResponse(html.toString('utf8'), {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // A snapshot never changes once captured, but the access check must run
      // on every request, so this is private rather than public.
      'Cache-Control': 'private, max-age=300',
      'X-Robots-Tag': 'noindex, nofollow',
      'X-Snapshot-Id': snapshot.id,
    },
  });
}
