import { LinkIcon } from 'lucide-react';

/**
 * Shown for a share link that does not lead anywhere any more: the link was
 * revoked or expired, or what it pointed at — a review, a page, a tour — was
 * deleted. Guests land here from an email, so it says what happened in plain
 * words instead of a bare 404.
 */
export default function ShareNotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-muted flex items-center justify-center">
          <LinkIcon className="h-5 w-5 text-muted-foreground" />
        </div>
        <h1 className="text-base font-semibold text-foreground mb-1">This review is no longer available</h1>
        <p className="text-sm text-muted-foreground">
          The link may have been revoked, or the review it pointed to has been removed. Ask whoever sent it for a new link.
        </p>
      </div>
    </main>
  );
}
