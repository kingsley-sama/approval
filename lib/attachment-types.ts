/**
 * What may be attached to a comment or reply, and how large it may be.
 *
 * Single source of truth for three call sites that previously each kept their
 * own copy of the list and drifted apart:
 *   - lib/comment-attachments.ts        (browser-side validation)
 *   - app/actions/storage.ts            (authenticated upload)
 *   - app/api/share/attachment/route.ts (guest upload via share link)
 *
 * Limits mirror lib/upload.ts, which governs revision media, so a file that is
 * acceptable as a project item is also acceptable as an attachment.
 */

const MB = 1024 * 1024;

export const ATTACHMENT_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

/** Exposés and brochures. */
export const ATTACHMENT_PDF_TYPE = 'application/pdf';

export const ATTACHMENT_VIDEO_TYPES = [
  'video/mp4',
  'video/webm',
  'video/quicktime', // .mov, what iPhones record
  'video/ogg',
] as const;

export const ATTACHMENT_ALLOWED_TYPES: ReadonlySet<string> = new Set<string>([
  ...ATTACHMENT_IMAGE_TYPES,
  ATTACHMENT_PDF_TYPE,
  ...ATTACHMENT_VIDEO_TYPES,
]);

/** Value for an <input type="file"> accept attribute. */
export const ATTACHMENT_ACCEPT = [...ATTACHMENT_ALLOWED_TYPES].join(',');

export type AttachmentCategory = 'image' | 'pdf' | 'video';

export function attachmentCategory(mimeType: string): AttachmentCategory | null {
  if ((ATTACHMENT_IMAGE_TYPES as readonly string[]).includes(mimeType)) return 'image';
  if (mimeType === ATTACHMENT_PDF_TYPE) return 'pdf';
  if ((ATTACHMENT_VIDEO_TYPES as readonly string[]).includes(mimeType)) return 'video';
  return null;
}

/** Per-category ceilings. Video is an order of magnitude larger than an image. */
export const ATTACHMENT_MAX_BYTES_BY_CATEGORY: Record<AttachmentCategory, number> = {
  image: 20 * MB,
  pdf: 50 * MB,
  video: 200 * MB,
};

/** Largest permitted size for a given MIME type; unknown types get the image cap. */
export function maxBytesForAttachment(mimeType: string): number {
  const category = attachmentCategory(mimeType);
  return category
    ? ATTACHMENT_MAX_BYTES_BY_CATEGORY[category]
    : ATTACHMENT_MAX_BYTES_BY_CATEGORY.image;
}

export function formatMaxSize(mimeType: string): string {
  return `${Math.round(maxBytesForAttachment(mimeType) / MB)} MB`;
}

export function isVideoAttachment(mimeType: string): boolean {
  return attachmentCategory(mimeType) === 'video';
}
