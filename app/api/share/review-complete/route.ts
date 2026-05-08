/**
 * API Route: Reviewer marks their review as complete.
 * Triggered when a guest answers "Yes, I'm done" in the leave-page modal.
 * Sends a notification email to the project administrators.
 */

import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { z } from 'zod';
import { validateShareToken } from '@/app/actions/share-links';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { checkRateLimit } from '@/lib/rate-limit';
import { sendReviewCompleteEmail } from '@/lib/email';

const ReviewCompleteSchema = z.object({
  token: z.string().min(1),
  reviewerName: z.string().min(1).max(150),
  commentCount: z.coerce.number().int().min(0).default(0),
});

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (!checkRateLimit(`share-review-complete:${ip}`, 60_000, 5)) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please try again later.' },
        { status: 429 },
      );
    }

    const body = await request.json();
    const validated = ReviewCompleteSchema.parse(body);

    const { success, shareLink, error } = await validateShareToken(validated.token);
    if (!success || !shareLink) {
      return NextResponse.json(
        { success: false, error: error || 'Invalid share link' },
        { status: 403 },
      );
    }

    let projectId: string | null = null;
    let projectName = 'Project';

    if (shareLink.resourceType === 'project') {
      projectId = shareLink.resourceId;
      const { data: project } = await supabase
        .from('markup_projects')
        .select('project_name')
        .eq('id', shareLink.resourceId)
        .single();
      if (project) projectName = (project as any).project_name ?? projectName;
    } else {
      const { data: thread } = await supabase
        .from('markup_threads')
        .select('project_id, markup_projects(project_name)')
        .eq('id', shareLink.resourceId)
        .single();
      if (thread) {
        projectId = (thread as any).project_id ?? null;
        projectName = (thread as any).markup_projects?.project_name ?? projectName;
      }
    }

    if (!projectId) {
      return NextResponse.json(
        { success: false, error: 'Project not found for this share link' },
        { status: 404 },
      );
    }

    // Fire-and-forget: defer the email send until after the response is flushed.
    // The client gets an immediate 202 and shows the thank-you state without
    // waiting on Resend.
    const finalProjectName = projectName;
    const finalProjectId = projectId;
    after(async () => {
      const result = await sendReviewCompleteEmail({
        reviewerName: validated.reviewerName,
        projectName: finalProjectName,
        projectId: finalProjectId,
        commentCount: validated.commentCount,
      });
      if (!result.ok) {
        console.error('[review-complete] background email send failed:', result.error);
      }
    });

    return NextResponse.json({ success: true }, { status: 202 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid input data' },
        { status: 400 },
      );
    }
    console.error('Review complete error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
