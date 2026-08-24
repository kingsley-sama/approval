/**
 * Deletion rules for comment attachments.
 *
 * Files uploaded by a customer through a share link are part of the revision
 * record — a photo of a defect, a marked-up brochure — and deleting one
 * silently destroys evidence of what was asked for. Migration 018 records the
 * uploader on every row and enforces the rule with a database trigger; this
 * module holds the shared client/server view of it.
 *
 * Lives outside app/actions/ on purpose: that directory is 'use server', where
 * every export must be an async function, so a plain constant cannot live there.
 */

export type AttachmentUploaderRole = 'team' | 'customer';

export const CUSTOMER_ATTACHMENT_DELETE_ERROR =
  'This file was uploaded by the customer and cannot be deleted.';

/**
 * Whether the UI should offer a delete control for an attachment. Rows written
 * before migration 018 have no `uploader_role`; those are treated as team
 * uploads so existing staff attachments stay manageable.
 */
export function canDeleteAttachment(
  attachment: { uploader_role?: string | null } | null | undefined,
): boolean {
  return attachment?.uploader_role !== 'customer';
}
