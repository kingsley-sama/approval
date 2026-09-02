'use client';

import { useState } from 'react';
import { addWebsitePages } from '@/app/actions/website-captures';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Plus, Loader2, AlertCircle } from 'lucide-react';
import { parseUrlList } from '@/lib/website/url';

interface AddPagesModalProps {
  projectId: string;
  onAdded: () => void;
  trigger?: React.ReactNode;
}

/**
 * Adds URLs to a website review. No screenshots are taken — a page is just an
 * address the workspace can open live and hang comments off. Reviewers can
 * also add whatever page they are looking at straight from the viewer's
 * toolbar; this dialog is for seeding several at once.
 */
export default function AddPagesModal({ projectId, onAdded, trigger }: AddPagesModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [raw, setRaw] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [rejected, setRejected] = useState<{ url: string; reason: string }[]>([]);

  const urls = parseUrlList(raw);

  const handleSubmit = async () => {
    if (urls.length === 0) {
      setError('Paste at least one address');
      return;
    }
    setIsLoading(true);
    setError('');
    setRejected([]);

    const result = await addWebsitePages({ projectId, urls });
    setIsLoading(false);

    if (!result.success && result.error) {
      setError(result.error);
      return;
    }
    if (result.rejected.length > 0) {
      setRejected(result.rejected);
      // Some landed — refresh so those show up, but keep the dialog open so the
      // reviewer can see which addresses were refused and why.
      if (result.pages.length > 0) {
        setRaw('');
        onAdded();
      }
      return;
    }

    setRaw('');
    setIsOpen(false);
    onAdded();
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!isLoading) {
          setIsOpen(open);
          if (!open) {
            setError('');
            setRejected([]);
          }
        }
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

      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <Plus className="h-5 w-5 text-primary" />
            </div>
            <DialogTitle>Add pages</DialogTitle>
          </div>
          <DialogDescription className="pl-[52px]">
            One address per line. Each becomes a page of the review you can open
            live and comment on.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pl-[52px] pr-1">
          <div className="space-y-1.5">
            <Label htmlFor="page-urls">Addresses</Label>
            <Textarea
              id="page-urls"
              autoFocus
              rows={6}
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

          {urls.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {urls.length} page{urls.length === 1 ? '' : 's'} will be added.
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
          <Button onClick={handleSubmit} disabled={isLoading || urls.length === 0}>
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
