/**
 * API Route: Panorama Share Comment Submission
 * Lets share-link guests add hotspot comments on a shared panorama (pitch/yaw),
 * gated by the link's permission. Mirrors /api/share/comment for annotations.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateShareToken } from '@/app/actions/share-links';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { checkRateLimit } from '@/lib/rate-limit';
import { z } from 'zod';
import { nanoid } from 'nanoid';

function clampPitch(v: number) { return Math.max(-90, Math.min(90, Number.isFinite(v) ? v : 0)); }
function clampYaw(v: number) { return Math.max(-180, Math.min(180, Number.isFinite(v) ? v : 0)); }

const CommentSchema = z.object({
  token: z.string().min(1),
  imageId: z.string().uuid(),
  userName: z.string().min(1).max(150),
  content: z.string().min(1).max(5000),
  pitch: z.coerce.number().transform(clampPitch),
  yaw: z.coerce.number().transform(clampYaw),
});

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (!checkRateLimit(`share-panorama-comment:${ip}`, 60_000, 10)) {
      return NextResponse.json({ success: false, error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const body = await request.json();
    const validated = CommentSchema.parse(body);

    const { success, shareLink, error } = await validateShareToken(validated.token);
    if (!success || !shareLink) {
      return NextResponse.json({ success: false, error: error || 'Invalid share link' }, { status: 403 });
    }
    if (shareLink.resourceType !== 'panorama_project') {
      return NextResponse.json({ success: false, error: 'Not a panorama share link' }, { status: 403 });
    }
    if (shareLink.permissions === 'view') {
      return NextResponse.json({ success: false, error: 'You do not have permission to comment' }, { status: 403 });
    }

    // Verify the image belongs to the shared panorama project.
    const { data: image, error: imageError } = await supabase
      .from('panorama_images')
      .select('id, panorama_project_id')
      .eq('id', validated.imageId)
      .single();

    if (imageError || !image) {
      return NextResponse.json({ success: false, error: 'Panorama image not found' }, { status: 404 });
    }
    if (image.panorama_project_id !== shareLink.resourceId) {
      return NextResponse.json({ success: false, error: 'Access denied to this resource' }, { status: 403 });
    }

    const { count } = await supabase
      .from('panorama_comments')
      .select('*', { count: 'exact', head: true })
      .eq('panorama_image_id', validated.imageId)
      .neq('type', 'reply');
    const nextNumber = (count ?? 0) + 1;

    const { data, error: insertError } = await supabase
      .from('panorama_comments')
      .insert({
        id: nanoid(),
        panorama_image_id: validated.imageId,
        user_name: validated.userName,
        content: validated.content,
        pin_number: nextNumber,
        display_number: nextNumber,
        pitch: validated.pitch,
        yaw: validated.yaw,
        status: 'active',
        type: 'comment',
        parent_comment_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error inserting panorama share comment:', JSON.stringify(insertError));
      return NextResponse.json({ success: false, error: insertError.message || 'Failed to save comment' }, { status: 500 });
    }

    return NextResponse.json({ success: true, comment: data });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'Invalid input data' }, { status: 400 });
    }
    console.error('Panorama share comment error:', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
