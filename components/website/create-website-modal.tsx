'use client';

import { useState } from 'react';
import { createWebsiteProject } from '@/app/actions/website-projects';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Globe, Loader2, AlertCircle } from 'lucide-react';

interface CreateWebsiteModalProps {
  onCreated: (projectId?: string) => void;
  trigger?: React.ReactNode;
}

/**
 * Starts a website review from an address.
 *
 * The review opens the live site in the workspace, so there is nothing to
 * configure up front — no viewports, no capture options. The reviewer picks a
 * device width and browses from there.
 */
export default function CreateWebsiteModal({ onCreated, trigger }: CreateWebsiteModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setUrl('');
    setName('');
    setError('');
  };

  const handleSubmit = async () => {
    if (!url.trim()) {
      setError('Enter the address of the site you want feedback on');
      return;
    }
    setIsLoading(true);
    setError('');

    const result = await createWebsiteProject({
      url: url.trim(),
      name: name.trim() || undefined,
    });

    setIsLoading(false);

    if (!result.success) {
      setError(result.error ?? 'Could not start the review');
      return;
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

      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <Globe className="h-5 w-5 text-primary" />
            </div>
            <DialogTitle>Review a website</DialogTitle>
          </div>
          <DialogDescription className="pl-[52px]">
            The site opens live in the workspace. Browse it as you normally
            would, then switch to Comment to pin feedback straight onto the page.
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
            <p className="text-[11px] text-muted-foreground">
              Only pages on this site can be opened in the review.
            </p>
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

          {error && (
            <div className="flex items-start gap-2 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
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
