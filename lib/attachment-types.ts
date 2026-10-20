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

/** Brochure copy sent as text: plain text and Word documents. */
export const ATTACHMENT_DOCUMENT_TYPES = [
  'text/plain',
  'application/msword', // .doc
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
] as const;

export const ATTACHMENT_ALLOWED_TYPES: ReadonlySet<string> = new Set<string>([
  ...ATTACHMENT_IMAGE_TYPES,
  ATTACHMENT_PDF_TYPE,
  ...ATTACHMENT_VIDEO_TYPES,
  ...ATTACHMENT_DOCUMENT_TYPES,
]);

/**
 * Browsers fill File.type from the OS, which often has no entry for Word
 * formats (Windows without Office, most Linux desktops) and reports '' or
 * 'application/octet-stream'. The extension is the fallback.
 */
const MIME_BY_EXTENSION: Record<string, string> = {
  txt: 'text/plain',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

/**
 * Value for an <input type="file"> accept attribute. Extensions are listed too
 * so the picker still offers Word files the OS has no MIME type for.
 */
export const ATTACHMENT_ACCEPT = [
  ...ATTACHMENT_ALLOWED_TYPES,
  ...Object.keys(MIME_BY_EXTENSION).map(ext => `.${ext}`),
].join(',');

/** The MIME type to validate and store a file under. */
export function resolveAttachmentMimeType(fileName: string, reportedType: string): string {
  if (ATTACHMENT_ALLOWED_TYPES.has(reportedType)) return reportedType;
  const ext = /\.([a-z0-9]+)$/i.exec(fileName)?.[1]?.toLowerCase();
  return (ext && MIME_BY_EXTENSION[ext]) || reportedType;
}

/**
 * Returns the file re-typed with its resolved MIME type, so every later step
 * (validation, the upload's Content-Type, the stored mime_type) agrees.
 */
export function normalizeAttachmentFile(file: File): File {
  const type = resolveAttachmentMimeType(file.name, file.type);
  if (type === file.type) return file;
  return new File([file], file.name, { type, lastModified: file.lastModified });
}

export type AttachmentCategory = 'image' | 'pdf' | 'video' | 'document';

export function attachmentCategory(mimeType: string): AttachmentCategory | null {
  if ((ATTACHMENT_IMAGE_TYPES as readonly string[]).includes(mimeType)) return 'image';
  if (mimeType === ATTACHMENT_PDF_TYPE) return 'pdf';
  if ((ATTACHMENT_VIDEO_TYPES as readonly string[]).includes(mimeType)) return 'video';
  if ((ATTACHMENT_DOCUMENT_TYPES as readonly string[]).includes(mimeType)) return 'document';
  return null;
}

/** Per-category ceilings. Video is an order of magnitude larger than an image. */
export const ATTACHMENT_MAX_BYTES_BY_CATEGORY: Record<AttachmentCategory, number> = {
  image: 20 * MB,
  pdf: 50 * MB,
  video: 200 * MB,
  document: 50 * MB,
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

/**
 * Attachments shown as a named file link rather than a preview: PDFs and
 * text/Word documents.
 */
export function isFileAttachment(mimeType: string): boolean {
  const category = attachmentCategory(mimeType);
  return category === 'pdf' || category === 'document';
}
