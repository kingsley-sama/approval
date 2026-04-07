import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export interface NewCommentEmailOptions {
  to: string[];
  commenterName: string;
  commentPreview: string;
  projectName: string;
  projectId: string;
}

export async function sendNewCommentEmail(opts: NewCommentEmailOptions): Promise<void> {
  if (!resend || !opts.to.length) return;

  // Strip @mention tokens to plain text for the email preview
  const preview = opts.commentPreview
    .replace(/@\[[^\]]+\]\([^)]+\)/g, '@mention')
    .slice(0, 200);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const domain = new URL(appUrl).hostname;
  const fromAddress = `Annotations <no-reply@${domain}>`;
  const projectUrl = `${appUrl}/projects/${opts.projectId}`;

  await resend.emails.send({
    from: fromAddress,
    to: opts.to,
    subject: `New comment on "${opts.projectName}"`,
    html: `
      <p><strong>${opts.commenterName}</strong> left a comment on <strong>${opts.projectName}</strong>:</p>
      <blockquote style="border-left:3px solid #ff6137;padding-left:12px;color:#555;margin:12px 0;">
        ${preview}
      </blockquote>
      <p><a href="${projectUrl}" style="color:#ff6137;font-weight:600;">View comment →</a></p>
    `,
  });
}
