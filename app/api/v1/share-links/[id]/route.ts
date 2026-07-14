import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireApiKey, apiError } from '@/lib/api/auth';

export const runtime = 'nodejs';

/**
 * DELETE /api/v1/share-links/:id
 * Revokes a share link (marks it inactive — clients with the URL lose access).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = requireApiKey(request);
  if (authError) return authError;

  const { id } = await params;

  const { data: existing } = await supabaseAdmin
    .from('share_links')
    .select('id, is_active')
    .eq('id', id)
    .maybeSingle();
  if (!existing) return apiError(404, 'not_found', `No share link with id ${id}.`);

  const { error } = await supabaseAdmin
    .from('share_links')
    .update({ is_active: false })
    .eq('id', id);
  if (error) return apiError(500, 'revoke_failed', error.message);

  return NextResponse.json({ success: true, revoked: id });
}
