'use client';

import { useState } from 'react';
import { addWebsitePages, type CreatedPage } from '@/app/actions/website-captures';
import { discoverWebsitePages, type DiscoveredPageStatus } from '@/app/actions/website-discovery';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Plus, Loader2, AlertCircle, Search, Check } from 'lucide-react';
import { parseUrlList } from '@/lib/website/url';

interface AddPagesModalProps {
  projectId: string;
  onAdded: (created?: CreatedPage[]) => void | Promise<void>;
  trigger?: React.ReactNode;
}

/**
 * Adds URLs to a website review. No screenshots are taken — a page is just an
 * address the workspace can open live and hang comments off.
 *
 * Discovery is the front door: most reviewers want "all of it", and typing a
 * sitemap by hand is nobody's idea of a good time. The textarea stays for the
 * cases discovery cannot reach — a staging path, a page behind a query string,
 * anything not linked from the entry page.
 */
export default function AddPagesModal({ projectId, onAdded, trigger }: AddPagesModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [raw, setRaw] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [rejected, setRejected] = useState<{ url: string; reason: string }[]>([]);

  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discovered, setDiscovered] = useState<DiscoveredPageStatus[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [truncated, setTruncated] = useState(false);

  const typed = parseUrlList(raw);
  const totalToAdd = selected.size + typed.length;

  const reset = () => {
    setError('');
    setRejected([]);
    setDiscovered(null);
    setSelected(new Set());
    setTruncated(false);
    setRaw('');
  };

  const handleDiscover = async () => {
    setIsDiscovering(true);
    setError('');
    const result = await discoverWebsitePages(projectId);
    setIsDiscovering(false);

    if (!result.success) {
      setError(result.error ?? 'The site could not be read.');
      return;
    }
    setDiscovered(result.pages);
    setTruncated(result.truncated);
    // Pre-tick everything not already in the review — "add the whole site" is
    // the common case, and un-ticking a few is less work than ticking thirty.
    setSelected(new Set(result.pages.filter((p) => !p.alreadyAdded).map((p) => p.url)));

    if (result.pages.every((p) => p.alreadyAdded)) {
      setError('Every page we could find is already in this review.');
    }
  };

  const toggle = (url: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  const selectable = (discovered ?? []).filter((p) => !p.alreadyAdded);
  const allSelected = selectable.length > 0 && selectable.every((p) => selected.has(p.url));

  const handleSubmit = async () => {
    const urls = [...selected, ...typed];
    if (urls.length === 0) {
      setError('Choose at least one page, or paste an address');
      return;
    }
    setIsLoading(true);
    setError('');
    setRejected([]);

    const result = await addWebsitePages({ projectId, urls });

    if (!result.success && result.error) {
      setIsLoading(false);
      setError(result.error);
      return;
    }

    // Refresh before closing: the dialog vanishing while the workspace still
    // shows the old page list is what made this look like it had not worked.
    await onAdded(result.pages);
    setIsLoading(false);

    if (result.rejected.length > 0) {
      setRejected(result.rejected);
      // Keep the dialog open so the reviewer can see what was refused and why.
      setRaw('');
      setSelected(new Set());
      return;
    }

    reset();
    setIsOpen(false);
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (isLoading) return;
        setIsOpen(open);
        if (!open) reset();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline" className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Add pages
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <Plus className="h-5 w-5 text-primary" />
            </div>
            <DialogTitle>Add pages</DialogTitle>
          </div>
          <DialogDescription className="pl-[52px]">
            Find the pages on this site automatically, or paste addresses yourself.
            Each becomes a page of the review you can open live and comment on.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pl-[52px] pr-1">
          {/* ── discovery ─────────────────────────────────────────────── */}
          {discovered === null ? (
            <Button
              type="button"
              variant="secondary"
              className="w-full gap-2"
              onClick={handleDiscover}
              disabled={isDiscovering || isLoading}
            >
              {isDiscovering ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Looking for pages…
                </>
              ) : (
                <>
                  <Search className="h-3.5 w-3.5" />
                  Find pages on this site
                </>
              )}
            </Button>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">
                  {discovered.length} page{discovered.length === 1 ? '' : 's'} found
                  {truncated ? ' (first 150)' : ''}
                </Label>
                {selectable.length > 0 && (
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    onClick={() =>
                      setSelected(allSelected ? new Set() : new Set(selectable.map((p) => p.url)))
                    }
                    disabled={isLoading}
                  >
                    {allSelected ? 'Clear all' : 'Select all'}
                  </button>
                )}
              </div>

              <div className="max-h-56 overflow-y-auto rounded-lg border border-border divide-y divide-border/60">
                {discovered.map((page) => (
                  <label
                    key={page.url}
                    className={`flex items-center gap-2.5 px-2.5 py-1.5 text-xs ${
                      page.alreadyAdded ? 'opacity-60' : 'cursor-pointer hover:bg-muted/50'
                    }`}
                  >
                    {page.alreadyAdded ? (
                      <Check className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <Checkbox
                        checked={selected.has(page.url)}
                        onCheckedChange={() => toggle(page.url)}
                        disabled={isLoading}
                        className="shrink-0"
                      />
                    )}
                    <span className="font-mono truncate flex-1">{page.path}</span>
                    {page.alreadyAdded && (
                      <span className="text-[10px] text-muted-foreground shrink-0">added</span>
                    )}
                  </label>
                ))}
              </div>

              <button
                type="button"
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                onClick={handleDiscover}
                disabled={isDiscovering || isLoading}
              >
                {isDiscovering ? 'Looking again…' : 'Search again'}
              </button>
            </div>
          )}

          {/* ── manual ────────────────────────────────────────────────── */}
          <div className="space-y-1.5">
            <Label htmlFor="page-urls" className="text-xs text-muted-foreground">
              Or paste addresses, one per line
            </Label>
            <Textarea
              id="page-urls"
              rows={discovered === null ? 5 : 3}
              placeholder={'example.com/about\nexample.com/contact'}
              value={raw}
              onChange={(e) => {
                setRaw(e.target.value);
                if (error) setError('');
              }}
              disabled={isLoading}
              className="font-mono text-xs"
            />
          </div>

          {totalToAdd > 0 && (
            <p className="text-xs text-muted-foreground">
              {totalToAdd} page{totalToAdd === 1 ? '' : 's'} will be added.
            </p>
          )}

          {error && (
            <div className="flex items-start gap-2 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {rejected.length > 0 && (
            <div className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/5 p-2.5">
              <p className="text-xs font-medium text-destructive">
                {rejected.length} address{rejected.length === 1 ? '' : 'es'} skipped
              </p>
              <ul className="space-y-0.5">
                {rejected.map((r, i) => (
                  <li key={i} className="text-[11px] text-muted-foreground">
                    <span className="font-mono">{r.url}</span> — {r.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading || totalToAdd === 0}>
            {isLoading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                Adding…
              </>
            ) : (
              'Add'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
