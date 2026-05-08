import { Resend } from 'resend';
import NewCommentEmail from '@/emails/new-comment';
import ReviewCompleteEmail from '@/emails/review-complete';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

function isDev(): boolean {
  const env = (process.env.ENVIRONMENT ?? '').toLowerCase();
  return env === 'dev' || env === 'development' || env === 'test';
}

function normalizeFrom(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (trimmed.includes('<')) return trimmed;
  const localOrAddr = trimmed.includes('@')
    ? trimmed
    : `projektmanagement@${trimmed}`;
  return `Projektmanagement Exposeprofi <${localOrAddr}>`;
}

function buildFromAddress(): string {
  if (process.env.EMAIL_FROM) return process.env.EMAIL_FROM;
  const fromForEnv = isDev()
    ? process.env.TEST_RESEND_FROM_EMAIL ?? process.env.RESEND_FROM_EMAIL
    : process.env.RESEND_FROM_EMAIL;
  const normalized = normalizeFrom(fromForEnv);
  if (normalized) return normalized;
  const domain = process.env.RESEND_DOMAIN;
  if (domain) return `Projektmanagement Exposeprofi <projektmanagement@${domain}>`;
  return 'Projektmanagement Exposeprofi <projektmanagement@exposeprofi.de>';
}

function getReviewRecipients(): string[] {
  const target = isDev()
    ? process.env.TEST_RESEND_TO_EMAIL ??
      process.env.REVIEW_NOTIFICATION_EMAIL ??
      process.env.RESEND_TO_EMAIL
    : process.env.RESEND_TO_EMAIL ??
      process.env.REVIEW_NOTIFICATION_EMAIL;
  if (target) return [target.trim()];
  return ['kngsley2018@gmail.com'];
}

const FROM_ADDRESS = buildFromAddress();
const REPLY_TO =
  process.env.EMAIL_REPLY_TO ??
  process.env.RESEND_FROM_EMAIL ??
  'projektmanagement@exposeprofi.de';

function normalizeUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

const APP_URL =
  normalizeUrl(process.env.NEXT_PUBLIC_APP_URL) ??
  normalizeUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL) ??
  normalizeUrl(process.env.VERCEL_URL) ??
  'http://localhost:3000';

export interface NewCommentEmailOptions {
  to: string[];
  commenterName: string;
  commentPreview: string;
  projectName: string;
  projectId: string;
}

export async function sendNewCommentEmail(opts: NewCommentEmailOptions): Promise<void> {
  if (!resend || !opts.to.length) return;

  const preview = opts.commentPreview
    .replace(/@\[[^\]]+\]\([^)]+\)/g, '@mention')
    .slice(0, 240);

  const projectUrl = `${APP_URL}/projects/${opts.projectId}`;

  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: opts.to,
    replyTo: REPLY_TO,
    subject: `New comment on "${opts.projectName}"`,
    react: NewCommentEmail({
      commenterName: opts.commenterName,
      commentPreview: preview,
      projectName: opts.projectName,
      projectUrl,
    }),
  });

  if (error) {
    console.error('[email] sendNewCommentEmail failed', error);
  }
}

export interface ReviewCompleteEmailOptions {
  to?: string[];
  reviewerName: string;
  projectName: string;
  projectId: string;
  commentCount: number;
}

export async function sendReviewCompleteEmail(
  opts: ReviewCompleteEmailOptions,
): Promise<{ ok: boolean; error?: string }> {
  if (!resend) return { ok: false, error: 'Resend not configured' };

  const recipients =
    opts.to && opts.to.length > 0 ? opts.to : getReviewRecipients();

  const projectUrl = `${APP_URL}/projects/${opts.projectId}`;

  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: recipients,
    replyTo: REPLY_TO,
    subject: `${opts.reviewerName} finished reviewing "${opts.projectName}"`,
    react: ReviewCompleteEmail({
      reviewerName: opts.reviewerName,
      projectName: opts.projectName,
      projectUrl,
      commentCount: opts.commentCount,
    }),
  });

  if (error) {
    console.error('[email] sendReviewCompleteEmail failed', error);
    return { ok: false, error: error.message ?? 'Email send failed' };
  }

  return { ok: true };
}
