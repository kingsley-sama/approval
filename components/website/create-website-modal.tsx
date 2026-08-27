'use client';

import { useState } from 'react';
import { createWebsiteProject } from '@/app/actions/website-projects';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
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
import {
  Globe,
  Loader2,
  Monitor,
  Smartphone,
  Tablet,
  ChevronDown,
  AlertCircle,
} from 'lucide-react';
import { DEFAULT_CAPTURE_SETTINGS, type ViewportLabel } from '@/lib/website/viewports';

interface CreateWebsiteModalProps {
  onCreated: (projectId?: string) => void;
  trigger?: React.ReactNode;
}

const VIEWPORT_OPTIONS: { label: ViewportLabel; title: string; hint: string; icon: typeof Monitor }[] = [
  { label: 'desktop', title: 'Desktop', hint: '1440px', icon: Monitor },
  { label: 'tablet', title: 'Tablet', hint: '834px', icon: Tablet },
  { label: 'mobile', title: 'Mobile', hint: '390px', icon: Smartphone },
];

export default function CreateWebsiteModal({ onCreated, trigger }: CreateWebsiteModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [viewports, setViewports] = useState<ViewportLabel[]>(['desktop']);
  const [fullPage, setFullPage] = useState(true);
  const [hideSelectors, setHideSelectors] = useState(
    DEFAULT_CAPTURE_SETTINGS.hideSelectors.join('\n')
  );
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const reset = () => {
    setUrl('');
    setName('');
    setViewports(['desktop']);
    setFullPage(true);
    setHideSelectors(DEFAULT_CAPTURE_SETTINGS.hideSelectors.join('\n'));
    setShowAdvanced(false);
    setError('');
    setNotice('');
  };

  const toggleViewport = (label: ViewportLabel) => {
    setViewports((prev) =>
      prev.includes(label)
        ? prev.length === 1
          ? prev // never leave zero selected
          : prev.filter((v) => v !== label)
        : [...prev, label]
    );
  };

  const handleSubmit = async () => {
    if (!url.trim()) {
      setError('Enter the address of the site you want feedback on');
      return;
    }
    setIsLoading(true);
    setError('');
    setNotice('');

    const result = await createWebsiteProject({
      url: url.trim(),
      name: name.trim() || undefined,
      settings: {
        fullPage,
        viewports,
        hideSelectors: hideSelectors
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
        waitMs: DEFAULT_CAPTURE_SETTINGS.waitMs,
      },
    });

    setIsLoading(false);

    if (!result.success) {
      setError(result.error ?? 'Could not start the review');
      return;
    }

    // The review exists either way — say plainly when no worker picked the
    // capture up, rather than dropping the user into an empty workspace.
    if (result.capture?.awaitingWorker) {
      setNotice(
        'Review created. No capture worker is configured, so the screenshots are queued and will appear once one runs.'
      );
    }

    const projectId = result.project?.id;
    reset();
    setIsOpen(false);
    onCreated(projectId);
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!isLoading) {
          setIsOpen(open);
          if (!open) reset();
        }
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" className="gap-1.5">
            <Globe className="h-3.5 w-3.5" />
            New review
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <Globe className="h-5 w-5 text-primary" />
            </div>
            <DialogTitle>Review a website</DialogTitle>
          </div>
          <DialogDescription className="pl-[52px]">
            We take a screenshot of the page, then you and your client pin feedback
            straight onto it — the same way you would on a rendering.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pl-[52px] pr-1">
          <div className="space-y-1.5">
            <Label htmlFor="website-url">Address</Label>
            <Input
              id="website-url"
              autoFocus
              placeholder="example.com/landing"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (error) setError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isLoading) handleSubmit();
              }}
              disabled={isLoading}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="website-name">
              Name <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              id="website-name"
              placeholder="Taken from the address if left blank"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={300}
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label>Capture at</Label>
            <div className="grid grid-cols-3 gap-2">
              {VIEWPORT_OPTIONS.map(({ label, title, hint, icon: Icon }) => {
                const active = viewports.includes(label);
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => toggleViewport(label)}
                    disabled={isLoading}
                    aria-pressed={active}
                    className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-xs transition-colors ${
                      active
                        ? 'border-primary bg-primary/5 text-foreground'
                        : 'border-border text-muted-foreground hover:border-border/80 hover:text-foreground'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="font-medium">{title}</span>
                    <span className="text-[10px] opacity-70">{hint}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
            />
            Capture options
          </button>

          {showAdvanced && (
            <div className="space-y-3 rounded-lg border border-border/60 bg-muted/30 p-3">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <Checkbox
                  checked={fullPage}
                  onCheckedChange={(v) => setFullPage(v === true)}
                  disabled={isLoading}
                  className="mt-0.5"
                />
                <span className="text-xs">
                  <span className="font-medium text-foreground">Capture the whole page</span>
                  <span className="block text-muted-foreground">
                    Off captures only what fits above the fold.
                  </span>
                </span>
              </label>

              <div className="space-y-1.5">
                <Label htmlFor="hide-selectors" className="text-xs">
                  Hide before capturing
                </Label>
                <Textarea
                  id="hide-selectors"
                  value={hideSelectors}
                  onChange={(e) => setHideSelectors(e.target.value)}
                  rows={4}
                  disabled={isLoading}
                  className="font-mono text-[11px]"
                />
                <p className="text-[11px] text-muted-foreground">
                  One CSS selector per line. These are removed before the screenshot —
                  without them, the cookie banner is the subject of every capture.
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {notice && <p className="text-xs text-muted-foreground">{notice}</p>}
        </div>

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading || !url.trim()}>
            {isLoading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                Starting…
              </>
            ) : (
              'Start review'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
