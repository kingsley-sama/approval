'use client';

import { ExternalLink, Lock, Monitor, Smartphone, Tablet, RefreshCw } from 'lucide-react';
import { IconTooltip } from '@/components/ui/icon-tooltip';
import { Button } from '@/components/ui/button';

interface BrowserFrameProps {
  /** The URL this capture came from. */
  url: string | null;
  /** desktop | tablet | mobile — drives the device icon. */
  viewport?: string | null;
  /** When the screenshot was taken, for the staleness hint. */
  capturedAt?: string | null;
  /** Shown when a newer version of the page may exist. */
  onRecapture?: () => void;
  isRecapturing?: boolean;
}

const DEVICE_ICON: Record<string, typeof Monitor> = {
  desktop: Monitor,
  tablet: Tablet,
  mobile: Smartphone,
};

/** "34 days ago" — plain, no dependency on the row being fresh. */
function ageLabel(iso: string): string | null {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? 'a month ago' : `${months} months ago`;
}

/**
 * The address-bar chrome above a capture.
 *
 * This is what makes the section read as *website* review rather than image
 * review: the reviewer sees which URL and which device they are commenting on,
 * and can open the live page in one click to check whether the screenshot is
 * still accurate.
 */
export default function BrowserFrame({
  url,
  viewport,
  capturedAt,
  onRecapture,
  isRecapturing,
}: BrowserFrameProps) {
  if (!url) return null;

  const DeviceIcon = DEVICE_ICON[viewport ?? 'desktop'] ?? Monitor;
  const isSecure = url.startsWith('https://');
  const age = capturedAt ? ageLabel(capturedAt) : null;
  // Three weeks is roughly when "the site has probably changed" starts being
  // the likelier explanation for a disagreement than "the feedback is wrong".
  const isStale = capturedAt ? Date.now() - new Date(capturedAt).getTime() > 21 * 86_400_000 : false;

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50 bg-muted/40 shrink-0">
      <div className="flex items-center gap-1.5 shrink-0" aria-hidden="true">
        <span className="w-2.5 h-2.5 rounded-full bg-destructive/40" />
        <span className="w-2.5 h-2.5 rounded-full bg-amber-400/50" />
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/40" />
      </div>

      <div className="flex-1 min-w-0 flex items-center gap-2 h-7 px-3 rounded-full bg-background border border-border/60">
        {isSecure ? (
          <Lock className="h-3 w-3 text-emerald-600 shrink-0" aria-hidden="true" />
        ) : (
          <span className="text-[10px] font-semibold uppercase text-amber-600 shrink-0">http</span>
        )}
        <span className="truncate text-xs text-muted-foreground font-mono" title={url}>
          {url}
        </span>
      </div>

      <IconTooltip label={`Captured at ${viewport ?? 'desktop'} width`}>
        <span className="flex items-center gap-1.5 px-2 h-7 rounded-full bg-background border border-border/60 text-[11px] text-muted-foreground shrink-0 cursor-default">
          <DeviceIcon className="h-3.5 w-3.5" />
          <span className="hidden sm:inline capitalize">{viewport ?? 'desktop'}</span>
        </span>
      </IconTooltip>

      {age && (
        <IconTooltip
          label={
            isStale
              ? 'This screenshot is old — the live site may have changed since. Re-capture to be sure.'
              : 'When this screenshot was taken'
          }
        >
          <span
            className={`hidden md:inline text-[11px] px-2 h-7 leading-7 rounded-full border shrink-0 cursor-default ${
              isStale
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-700'
                : 'border-border/60 bg-background text-muted-foreground'
            }`}
          >
            Captured {age}
          </span>
        </IconTooltip>
      )}

      {onRecapture && (
        <IconTooltip label="Re-capture this page">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground shrink-0"
            onClick={onRecapture}
            disabled={isRecapturing}
            aria-label="Re-capture this page"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRecapturing ? 'animate-spin' : ''}`} />
          </Button>
        </IconTooltip>
      )}

      <IconTooltip label="Open the live page in a new tab">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
          aria-label="Open the live page in a new tab"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </IconTooltip>
    </div>
  );
}
