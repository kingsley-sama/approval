'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowRight, RotateCw, ExternalLink, Lock, Loader2,
  MousePointer2, MessageSquarePlus, Monitor, Tablet, Smartphone, Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconTooltip } from '@/components/ui/icon-tooltip';

export type LiveMode = 'browse' | 'comment';

export interface LivePin {
  id: string;
  number: number;
  /** Percentage of the full scrollable document, not the viewport. */
  x: number;
  y: number;
  resolved: boolean;
}

interface LiveViewerProps {
  projectId: string;
  /** Share token, when a guest is viewing. */
  token?: string;
  /** URL currently under review. */
  url: string;
  /** Called when the visitor navigates within the site. */
  onUrlChange: (url: string) => void;
  pins: LivePin[];
  selectedPinId: string | null;
  onSelectPin: (pinId: string) => void;
  /** Fired when a pin is placed, in document percentages. */
  onPlacePin: (xPct: number, yPct: number) => void;
  /** False when the visitor may look but not comment. */
  canComment: boolean;
  /** True when this URL is already a page of the review. */
  isTrackedPage: boolean;
  onAddCurrentPage?: () => void;
  isAddingPage?: boolean;
}

const DEVICES = [
  { label: 'desktop', width: 0, icon: Monitor, title: 'Full width' },
  { label: 'tablet', width: 834, icon: Tablet, title: 'Tablet — 834px' },
  { label: 'mobile', width: 390, icon: Smartphone, title: 'Mobile — 390px' },
] as const;

const OVERLAY_ID = '__revision_pins__';
const ACCENT = '#ff6137';
const RESOLVED = '#649256';

export default function LiveViewer({
  projectId, token, url, onUrlChange, pins, selectedPinId,
  onSelectPin, onPlacePin, canComment, isTrackedPage, onAddCurrentPage, isAddingPage,
}: LiveViewerProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [mode, setMode] = useState<LiveMode>('browse');
  const [device, setDevice] = useState<(typeof DEVICES)[number]['label']>('desktop');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([url]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const proxySrc = `/api/websites/proxy?projectId=${encodeURIComponent(projectId)}&url=${encodeURIComponent(
    url
  )}${token ? `&token=${encodeURIComponent(token)}` : ''}`;

  // Keep the latest values available to listeners attached to the iframe
  // document without re-attaching them on every render.
  const stateRef = useRef({ mode, pins, selectedPinId, onPlacePin, onSelectPin, onUrlChange, canComment });
  stateRef.current = { mode, pins, selectedPinId, onPlacePin, onSelectPin, onUrlChange, canComment };

  const navigate = useCallback(
    (next: string, fromHistory = false) => {
      if (!fromHistory) {
        setHistory((prev) => {
          const trimmed = prev.slice(0, historyIndex + 1);
          return [...trimmed, next];
        });
        setHistoryIndex((i) => i + 1);
      }
      setIsLoading(true);
      setLoadError(null);
      stateRef.current.onUrlChange(next);
    },
    [historyIndex]
  );

  const goBack = () => {
    if (historyIndex === 0) return;
    const i = historyIndex - 1;
    setHistoryIndex(i);
    navigate(history[i], true);
  };

  const goForward = () => {
    if (historyIndex >= history.length - 1) return;
    const i = historyIndex + 1;
    setHistoryIndex(i);
    navigate(history[i], true);
  };

  const reload = () => {
    setIsLoading(true);
    setLoadError(null);
    const frame = frameRef.current;
    if (frame) frame.src = `${proxySrc}&_=${Date.now()}`;
  };

  /** Draw the pin markers into the framed document, in document coordinates. */
  const paintPins = useCallback(() => {
    const doc = frameRef.current?.contentDocument;
    if (!doc?.documentElement) return;

    let layer = doc.getElementById(OVERLAY_ID);
    if (!layer) {
      layer = doc.createElement('div');
      layer.id = OVERLAY_ID;
      layer.setAttribute(
        'style',
        'position:absolute;top:0;left:0;width:0;height:0;overflow:visible;z-index:2147483000;pointer-events:none;'
      );
      doc.documentElement.appendChild(layer);
    }
    layer.innerHTML = '';

    const docW = Math.max(doc.documentElement.scrollWidth, doc.body?.scrollWidth ?? 0);
    const docH = Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight ?? 0);
    if (!docW || !docH) return;

    for (const pin of stateRef.current.pins) {
      const marker = doc.createElement('div');
      const selected = pin.id === stateRef.current.selectedPinId;
      marker.setAttribute(
        'style',
        [
          'position:absolute',
          `left:${(pin.x / 100) * docW}px`,
          `top:${(pin.y / 100) * docH}px`,
          'transform:translate(-50%,-50%)',
          'width:28px;height:28px;border-radius:9999px',
          `background:${pin.resolved ? RESOLVED : ACCENT}`,
          `border:2px solid ${selected ? '#0c3133' : '#ffffff'}`,
          'box-shadow:0 1px 4px rgba(0,0,0,.35)',
          'color:#fff;font:600 12px/24px system-ui,sans-serif;text-align:center',
          'pointer-events:auto;cursor:pointer;user-select:none',
        ].join(';')
      );
      marker.textContent = String(pin.number);
      marker.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        stateRef.current.onSelectPin(pin.id);
      });
      layer.appendChild(marker);
    }
  }, []);

  /** Wire the framed document once it has loaded. */
  const handleLoad = useCallback(() => {
    setIsLoading(false);
    const frame = frameRef.current;
    const doc = frame?.contentDocument;

    if (!doc) {
      // Same-origin access failed — the frame navigated somewhere we do not
      // control, or the browser refused it.
      setLoadError('This page could not be opened inside the review.');
      return;
    }

    // Keep the address bar honest after a redirect.
    try {
      const declared = doc.querySelector('base')?.getAttribute('href');
      if (declared && declared !== url) stateRef.current.onUrlChange(declared);
    } catch {
      /* ignore */
    }

    const resolveHref = (raw: string): URL | null => {
      try {
        return new URL(raw, doc.querySelector('base')?.getAttribute('href') ?? url);
      } catch {
        return null;
      }
    };

    // Navigation and comment placement both run in the capture phase so the
    // page's own handlers do not get there first.
    doc.addEventListener(
      'click',
      (event) => {
        const e = event as MouseEvent;
        const { mode: m, canComment: allowed } = stateRef.current;

        if (m === 'comment') {
          if (!allowed) return;
          e.preventDefault();
          e.stopPropagation();
          const docW = Math.max(doc.documentElement.scrollWidth, doc.body?.scrollWidth ?? 0);
          const docH = Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight ?? 0);
          if (!docW || !docH) return;
          const x = ((e.clientX + (doc.defaultView?.scrollX ?? 0)) / docW) * 100;
          const y = ((e.clientY + (doc.defaultView?.scrollY ?? 0)) / docH) * 100;
          stateRef.current.onPlacePin(
            Math.max(0, Math.min(100, x)),
            Math.max(0, Math.min(100, y))
          );
          return;
        }

        // Browse mode: keep link navigation inside the proxy, or the frame
        // would go straight to the real origin and be refused.
        const anchor = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
        if (!anchor) return;
        const href = anchor.getAttribute('href') ?? '';
        if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
        const resolved = resolveHref(href);
        if (!resolved) return;
        if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return;

        e.preventDefault();
        e.stopPropagation();
        if (anchor.target === '_blank') {
          window.open(resolved.toString(), '_blank', 'noopener');
          return;
        }
        navigate(resolved.toString());
      },
      true
    );

    doc.addEventListener(
      'submit',
      (event) => {
        const form = event.target as HTMLFormElement | null;
        if (!form) return;
        const method = (form.getAttribute('method') ?? 'get').toLowerCase();
        const resolved = resolveHref(form.getAttribute('action') ?? '');
        if (!resolved) return;
        event.preventDefault();
        event.stopPropagation();
        if (method === 'get') {
          const data = new FormData(form);
          for (const [k, v] of data.entries()) {
            if (typeof v === 'string') resolved.searchParams.set(k, v);
          }
          navigate(resolved.toString());
        }
        // POSTs are not replayed through the proxy — submitting a real form on
        // the client's site from a review tool would be a side effect nobody
        // asked for.
      },
      true
    );

    paintPins();
    // Late-loading content changes the document height, which moves every pin.
    const view = doc.defaultView;
    view?.addEventListener('resize', paintPins);
    const settle = view?.setTimeout(paintPins, 1200);
    const settleLate = view?.setTimeout(paintPins, 3500);
    return () => {
      view?.removeEventListener('resize', paintPins);
      if (settle) view?.clearTimeout(settle);
      if (settleLate) view?.clearTimeout(settleLate);
    };
  }, [navigate, paintPins, url]);

  // Repaint whenever the pins or the selection change.
  useEffect(() => {
    paintPins();
  }, [pins, selectedPinId, paintPins]);

  // Comment mode gets a crosshair so it is obvious the next click drops a pin.
  useEffect(() => {
    const doc = frameRef.current?.contentDocument;
    if (!doc?.documentElement) return;
    doc.documentElement.style.cursor = mode === 'comment' ? 'crosshair' : '';
  }, [mode, isLoading]);

  const deviceWidth = DEVICES.find((d) => d.label === device)?.width ?? 0;
  const isSecure = url.startsWith('https://');

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-muted/30">
      {/* toolbar */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border/50 bg-background shrink-0">
        <IconTooltip label="Back">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goBack} disabled={historyIndex === 0} aria-label="Back">
            <ArrowLeft className="h-3.5 w-3.5" />
          </Button>
        </IconTooltip>
        <IconTooltip label="Forward">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goForward} disabled={historyIndex >= history.length - 1} aria-label="Forward">
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </IconTooltip>
        <IconTooltip label="Reload">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={reload} aria-label="Reload">
            <RotateCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </IconTooltip>

        <div className="flex-1 min-w-0 flex items-center gap-2 h-7 px-3 rounded-full bg-muted/60 border border-border/60">
          {isSecure ? <Lock className="h-3 w-3 text-emerald-600 shrink-0" /> : <span className="text-[10px] font-semibold uppercase text-amber-600 shrink-0">http</span>}
          <span className="truncate text-xs text-muted-foreground font-mono" title={url}>{url}</span>
          {isLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />}
        </div>

        {!isTrackedPage && onAddCurrentPage && (
          <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs shrink-0" onClick={onAddCurrentPage} disabled={isAddingPage}>
            {isAddingPage ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            Add page
          </Button>
        )}

        <div className="flex items-center rounded-full border border-border/60 overflow-hidden shrink-0">
          {DEVICES.map(({ label, icon: Icon, title }) => (
            <IconTooltip key={label} label={title}>
              <button
                type="button"
                onClick={() => setDevice(label)}
                aria-pressed={device === label}
                className={`h-7 w-8 flex items-center justify-center transition-colors ${
                  device === label ? 'bg-accent/10 text-accent' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            </IconTooltip>
          ))}
        </div>

        {canComment && (
          <div className="flex items-center rounded-full border border-border/60 overflow-hidden shrink-0">
            <IconTooltip label="Browse the site normally">
              <button
                type="button"
                onClick={() => setMode('browse')}
                aria-pressed={mode === 'browse'}
                className={`h-7 px-2.5 flex items-center gap-1 text-xs transition-colors ${
                  mode === 'browse' ? 'bg-accent/10 text-accent' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <MousePointer2 className="h-3.5 w-3.5" />
                Browse
              </button>
            </IconTooltip>
            <IconTooltip label={isTrackedPage ? 'Click the page to leave a comment' : 'Add this page to the review first'}>
              <button
                type="button"
                onClick={() => setMode('comment')}
                aria-pressed={mode === 'comment'}
                disabled={!isTrackedPage}
                className={`h-7 px-2.5 flex items-center gap-1 text-xs transition-colors disabled:opacity-40 ${
                  mode === 'comment' ? 'bg-accent/10 text-accent' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <MessageSquarePlus className="h-3.5 w-3.5" />
                Comment
              </button>
            </IconTooltip>
          </div>
        )}

        <IconTooltip label="Open the real page in a new tab">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
            aria-label="Open the real page in a new tab"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </IconTooltip>
      </div>

      {/* frame */}
      <div className="flex-1 overflow-auto flex justify-center bg-muted/40">
        <div
          className="bg-white shadow-sm transition-[width] duration-200"
          style={{ width: deviceWidth ? `${deviceWidth}px` : '100%', maxWidth: '100%', height: '100%' }}
        >
          {loadError ? (
            <div className="h-full flex items-center justify-center p-8 text-center">
              <div className="max-w-md">
                <p className="text-sm font-medium text-foreground mb-1">{loadError}</p>
                <p className="text-xs text-muted-foreground">
                  Some sites refuse to be displayed inside another page. Open it in a
                  new tab to check it, or use a different page of the site.
                </p>
              </div>
            </div>
          ) : (
            <iframe
              ref={frameRef}
              key={proxySrc}
              src={proxySrc}
              onLoad={handleLoad}
              title="Website under review"
              className="w-full h-full border-0 bg-white"
              // No allow-top-navigation: a frame-busting script cannot take the
              // whole app somewhere else. No allow-popups for the same reason.
              sandbox="allow-same-origin allow-scripts allow-forms"
            />
          )}
        </div>
      </div>
    </div>
  );
}
