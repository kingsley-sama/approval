import type { ShareResourceType } from '@/app/actions/share-links';

/**
 * Share links that cover a whole markup project. A website review is a
 * markup project with kind='website', so its links grant the same access.
 */
export function isProjectScopedShare(resourceType: ShareResourceType): boolean {
  return resourceType === 'project' || resourceType === 'website_project';
}

/** Whether a share link grants access to a thread of a markup project. */
export function shareCoversThread(
  shareLink: { resourceType: ShareResourceType; resourceId: string },
  threadId: string,
  projectId: string | null | undefined,
): boolean {
  if (shareLink.resourceType === 'thread') return shareLink.resourceId === threadId;
  return isProjectScopedShare(shareLink.resourceType) && shareLink.resourceId === projectId;
}
