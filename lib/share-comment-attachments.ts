import { compressImageFile } from '@/lib/image-compression';
import { validateAttachments } from '@/lib/comment-attachments';
import type { AttachmentRecord } from '@/app/actions/storage';

export { validateAttachments };

type UploadedAttachment = AttachmentRecord & { signedUrl: string };

export interface ShareUploadResult {
  uploaded: UploadedAttachment[];
  failed: string[];
}

/**
 * Uploads files as attachments on a comment/reply through the share-link API
 * (`/api/share/attachment`). Mirrors `uploadCommentAttachments` but is gated by
 * the share token + guest name instead of a session — the server derives the
 * project from the comment, so no projectId is needed here.
 */
export async function uploadShareCommentAttachments(
  token: string,
  commentId: string,
  userName: string,
  files: File[],
  // When the caller already compressed the images, skip re-encoding so the
  // uploaded file matches what the user was shown.
  skipCompression = false,
): Promise<ShareUploadResult> {
  const failed: string[] = [];
  const uploaded: UploadedAttachment[] = [];

  for (const rawFile of files) {
    try {
      // Shrink images in the browser before uploading (PDFs/other pass through).
      const file = skipCompression ? rawFile : await compressImageFile(rawFile);

      const signRes = await fetch('/api/share/attachment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: 'sign',
          token,
          commentId,
          userName,
          fileName: file.name,
          mimeType: file.type,
          fileSizeBytes: file.size,
        }),
      });
      const signResult = await signRes.json();
      if (!signResult.success || !signResult.signedUrl || !signResult.storagePath) {
        failed.push(file.name);
        continue;
      }

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', signResult.signedUrl);
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
        xhr.onload = () => (xhr.status < 300 ? resolve() : reject());
        xhr.onerror = () => reject();
        xhr.send(file);
      });

      const registerRes = await fetch('/api/share/attachment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: 'register',
          token,
          commentId,
          userName,
          storagePath: signResult.storagePath,
          originalFilename: file.name,
          mimeType: file.type,
          fileSizeBytes: file.size,
        }),
      });
      const registerResult = await registerRes.json();
      if (!registerResult.success || !registerResult.attachment) {
        failed.push(file.name);
        continue;
      }
      uploaded.push(registerResult.attachment as UploadedAttachment);
    } catch {
      failed.push(rawFile.name);
    }
  }

  return { uploaded, failed };
}

/** Removes an attachment the guest authored, via the share-link API. */
export async function deleteShareCommentAttachment(
  token: string,
  attachmentId: string,
  userName: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch('/api/share/attachment', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, attachmentId, userName }),
    });
    const result = await res.json();
    return result.success
      ? { success: true }
      : { success: false, error: result.error || 'Failed to remove attachment' };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Failed to remove attachment' };
  }
}
