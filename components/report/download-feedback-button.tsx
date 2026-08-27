'use client';

import { useState } from 'react';
import { FileDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconTooltip } from '@/components/ui/icon-tooltip';
import { useToast } from '@/hooks/use-toast';

interface DownloadFeedbackButtonProps {
  projectId: string;
  /** Share token, when the viewer is a guest rather than a signed-in user. */
  token?: string;
  /** Render with a visible label instead of icon-only. */
  withLabel?: boolean;
}

/**
 * Downloads the project's feedback as a PDF — every annotated image with its
 * pins and markup burned in, followed by the numbered comments.
 *
 * Fetched as a blob rather than a plain link so the button can show progress:
 * the server re-renders every annotated image, which takes a few seconds on a
 * large project and would otherwise look like nothing happened.
 */
export default function DownloadFeedbackButton({
  projectId,
  token,
  withLabel = false,
}: DownloadFeedbackButtonProps) {
  const { toast } = useToast();
  const [isBusy, setIsBusy] = useState(false);

  const handleDownload = async () => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      const url = `/api/projects/${projectId}/report${token ? `?token=${encodeURIComponent(token)}` : ''}`;
      const res = await fetch(url);

      if (!res.ok) {
        let message = `The report could not be generated (${res.status}).`;
        try {
          const body = await res.json();
          if (body?.error) message = body.error;
        } catch {
          /* non-JSON error body — keep the status message */
        }
        toast({ title: 'No report generated', description: message, variant: 'destructive' });
        return;
      }

      const blob = await res.blob();
      // Prefer the filename the server chose; fall back to something sensible.
      const disposition = res.headers.get('content-disposition') ?? '';
      const match = /filename="?([^";]+)"?/i.exec(disposition);
      const name = match?.[1] ?? 'feedback.pdf';

      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      toast({
        title: 'No report generated',
        description: err instanceof Error ? err.message : 'Something went wrong building the PDF.',
        variant: 'destructive',
      });
    } finally {
      setIsBusy(false);
    }
  };

  if (withLabel) {
    return (
      <Button variant="outline" size="sm" className="gap-1.5" onClick={handleDownload} disabled={isBusy}>
        {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
        {isBusy ? 'Preparing…' : 'Feedback PDF'}
      </Button>
    );
  }

  return (
    <IconTooltip label={isBusy ? 'Building the report…' : 'Download all feedback as a PDF'}>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-foreground"
        onClick={handleDownload}
        disabled={isBusy}
        aria-label="Download feedback as PDF"
      >
        {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
      </Button>
    </IconTooltip>
  );
}
