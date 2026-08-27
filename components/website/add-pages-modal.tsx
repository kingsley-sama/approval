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
import { Plus, Loader2, AlertCircle, Monitor, Smartphone, Tablet } from 'lucide-react';
import { parseUrlList } from '@/lib/website/url';
import type { ViewportLabel } from '@/lib/website/viewports';

interface AddPagesModalProps {
  projectId: string;
  /** Project default, pre-selected. */
  defaultViewports: ViewportLabel[];
  onAdded: () => void;
  trigger?: React.ReactNode;
}

const VIEWPORT_OPTIONS: { label: ViewportLabel; title: string; icon: typeof Monitor }[] = [
  { label: 'desktop', title: 'Desktop', icon: Monitor },
  { label: 'tablet', title: 'Tablet', icon: Tablet },
  { label: 'mobile', title: 'Mobile', icon: Smartphone },
];

export default function AddPagesModal({
  projectId,
  defaultViewports,
  onAdded,
  trigger,
}: AddPagesModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [raw, setRaw] = useState('');
  const [viewports, setViewports] = useState<ViewportLabel[]>(
    defaultViewports.length ? defaultViewports : ['desktop']
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [rejected, setRejected] = useState<{ url: string; reason: string }[]>([]);

  const urls = parseUrlList(raw);
  const captureCount = urls.length * viewports.length;

  const toggleViewport = (label: ViewportLabel) => {
    setViewports((prev) =>
      prev.includes(label)
        ? prev.length === 1
          ? prev
          : prev.filter((v) => v !== label)
        : [...prev, label]
    );
  };

  const handleSubmit = async () => {
    if (urls.length === 0) {
      setError('Paste at least one address');
      return;
    }
    setIsLoading(true);
    setError('');
    setRejected([]);

    const result = await addWebsitePages({ projectId, urls, viewports });
    setIsLoading(false);

    if (!result.success && result.error) {
      setError(result.error);
      return;
    }
    if (result.rejected.length > 0) {
      setRejected(result.rejected);
      // Some landed — refresh so the good ones show up, but keep the dialog
      // open so the user can see which addresses were refused and why.
      if (result.queued.length > 0) {
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
            One address per line. Each becomes its own screenshot to comment on.
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

          <div className="space-y-2">
            <Label>Capture at</Label>
            <div className="flex gap-2">
              {VIEWPORT_OPTIONS.map(({ label, title, icon: Icon }) => {
                const active = viewports.includes(label);
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => toggleViewport(label)}
                    disabled={isLoading}
                    aria-pressed={active}
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                      active
                        ? 'border-primary bg-primary/5 text-foreground'
                        : 'border-border text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {title}
                  </button>
                );
              })}
            </div>
          </div>

          {captureCount > 0 && (
            <p className="text-xs text-muted-foreground">
              {captureCount} screenshot{captureCount === 1 ? '' : 's'} will be queued.
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
                Queueing…
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
