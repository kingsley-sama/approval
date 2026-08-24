import {
  getAttachmentUploadUrl,
  registerAttachment,
} from '@/app/actions/storage';
import { compressImageFile } from '@/lib/image-compression';
import {
  ATTACHMENT_ALLOWED_TYPES,
  maxBytesForAttachment,
  formatMaxSize,
} from '@/lib/attachment-types';

export {
  ATTACHMENT_ALLOWED_TYPES,
  ATTACHMENT_ACCEPT,
  maxBytesForAttachment,
} from '@/lib/attachment-types';

export interface AttachmentValidationResult {
  valid: File[];
  errors: string[];
}

export function validateAttachments(files: File[]): AttachmentValidationResult {
  const errors: string[] = [];
  const valid: File[] = [];
  for (const file of files) {
    if (!ATTACHMENT_ALLOWED_TYPES.has(file.type)) {
      errors.push(`${file.name}: unsupported type`);
      continue;
    }
    if (file.size > maxBytesForAttachment(file.type)) {
      errors.push(`${file.name}: exceeds ${formatMaxSize(file.type)}`);
      continue;
    }
    valid.push(file);
  }
  return { valid, errors };
}

export interface UploadCommentAttachmentsResult {
  uploaded: number;
  failed: string[];
}

/**
 * Uploads files as attachments on a comment row (works for primary comments
 * and replies — both are rows in `markup_comments`).
 */
export async function uploadCommentAttachments(
  commentId: string,
  projectId: string,
  files: File[],
  // When the caller already compressed the images (e.g. to show the user the
  // savings before sending), skip re-encoding so the uploaded file matches.
  skipCompression = false,
): Promise<UploadCommentAttachmentsResult> {
  const failed: string[] = [];
  let uploaded = 0;

  for (const rawFile of files) {
    try {
      // Shrink images in the browser before uploading (PDFs/other pass through).
      const file = skipCompression ? rawFile : await compressImageFile(rawFile);
      const urlResult = await getAttachmentUploadUrl(
        projectId,
        file.name,
        file.type,
        file.size,
      );
      if (!urlResult.success || !urlResult.signedUrl || !urlResult.storagePath) {
        failed.push(file.name);
        continue;
      }

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', urlResult.signedUrl!);
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
        xhr.onload = () => (xhr.status < 300 ? resolve() : reject());
        xhr.onerror = () => reject();
        xhr.send(file);
      });

      const registerResult = await registerAttachment(
        commentId,
        projectId,
        urlResult.storagePath,
        file.name,
        file.type,
        file.size,
      );
      if (!registerResult.success) {
        failed.push(file.name);
        continue;
      }
      uploaded += 1;
    } catch {
      failed.push(rawFile.name);
    }
  }

  return { uploaded, failed };
}
