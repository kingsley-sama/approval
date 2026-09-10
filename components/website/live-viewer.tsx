'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowRight, RotateCw, ExternalLink, Lock, Loader2,
  MousePointer2, MessageSquarePlus, Monitor, Tablet, Smartphone, Plus,
  Maximize2, Minimize2, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconTooltip } from '@/components/ui/icon-tooltip';
import DrawingToolbar, { DRAWING_COLOR, STROKE_WIDTH } from '@/components/drawing-toolbar';
import { denormalizeShape, normalizeShape } from '@/lib/drawing';
import type { DrawingTool, Shape } from '@/types/drawing';

/**
 * The website viewer, built to match what the image workspace can do.
 *
 * Everything outside the frame — comments, replies, attachments, resolve,
 * numbering, sharing — is already the image tool's, because a website review is
 * a markup project and a page is a thread. The difference was only ever here:
 * the image viewer could draw, drag pins, zoom and go fullscreen, and this
 * could not. It can now.
 *
 * Pins and markup live in an overlay injected *inside* the framed document
 * rather than floating above it in the parent. That is what makes them scroll
 * with the content and stay attached through layout changes, and it is only
 * possible because the proxy and the snapshot both serve the page same-origin.
 *
 * Geometry matches the image tool exactly so the two are interchangeable:
 * shapes are stored normalised 0..1 against the document box, and a shape's
 * anchor is reported as a percentage — the same contract ImageViewer uses, so
 * the same comments, the same PDF export and the same drawing data work for
 * both without translation.
 */

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
  token?: string;
  url: string;
  onUrlChange: (url: string) => void;

  pins: LivePin[];
  selectedPinId: string | null;
  onSelectPin: (pinId: string) => void;
  onPlacePin: (xPct: number, yPct: number) => void;
  /** Drag a pin to a new spot, as on an image. */
  onPinReposition?: (pinId: string, xPct: number, yPct: number) => void | Promise<void>;
  hoveredPin?: string | null;
  onPinHover?: (pinId: string | null) => void;

  /** Markup for the selected/hovered comment, and the strokes not yet saved. */
  drawnShapes?: Shape[];
  pendingShapes?: Shape[];
  onShapeComplete?: (shape: Shape, center: { x: number; y: number }) => void;
  /** Erase one not-yet-saved shape by id. Enables the eraser tool. */
  onEraseShape?: (shapeId: string) => void;
  onUndoShape?: () => void;
  canUndo?: boolean;

  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;

  /** Page navigation, mirroring the image viewer's prev/next. */
  currentIndex?: number;
  totalPages?: number;
  onNavigate?: (direction: 'prev' | 'next') => void;

  canComment: boolean;
  canDraw?: boolean;
  isTrackedPage: boolean;
  onAddCurrentPage?: () => void;
  isAddingPage?: boolean;
}

const DEVICES = [
  { label: 'desktop', width: 0, icon: Monitor, title: 'Full width' },
  { label: 'tablet', width: 834, icon: Tablet, title: 'Tablet — 834px' },
  { label: 'mobile', width: 390, icon: Smartphone, title: 'Mobile — 390px' },
] as const;

const LAYER_ID = '__revision_layer__';
const SVG_NS = 'http://www.w3.org/2000/svg';
const ACCENT = '#ff6137';
const RESOLVED = '#649256';

export default function LiveViewer({
  projectId, token, url, onUrlChange,
  pins, selectedPinId, onSelectPin, onPlacePin, onPinReposition, hoveredPin, onPinHover,
  drawnShapes = [], pendingShapes = [], onShapeComplete, onEraseShape, onUndoShape, canUndo,
  isFullscreen = false, onToggleFullscreen,
  currentIndex = 0, totalPages = 1, onNavigate,
  canComment, canDraw = true, isTrackedPage, onAddCurrentPage, isAddingPage,
}: LiveViewerProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<LiveMode>('browse');
  const [tool, setTool] = useState<DrawingTool | null>(null);
  const [device, setDevice] = useState<(typeof DEVICES)[number]['label']>('desktop');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([url]);
  const [historyIndex, setHistoryIndex] = useState(0);
  /** What is in the address box while it is being edited. */
  const [draftUrl, setDraftUrl] = useState(url);

  useEffect(() => {
    setDraftUrl(url);
  }, [url]);

  const proxySrc = `/api/websites/proxy?projectId=${encodeURIComponent(projectId)}&url=${encodeURIComponent(
    url
  )}${token ? `&token=${encodeURIComponent(token)}` : ''}`;

  // Listeners are attached to the framed document once per load, so everything
  // they need is read through a ref rather than captured at attach time.
  const s = useRef({
    mode, tool, pins, selectedPinId, hoveredPin, drawnShapes, pendingShapes,
    onPlacePin, onSelectPin, onPinHover, onPinReposition, onShapeComplete, onEraseShape, onUrlChange,
    canComment, canDraw,
  });
  s.current = {
    mode, tool, pins, selectedPinId, hoveredPin, drawnShapes, pendingShapes,
    onPlacePin, onSelectPin, onPinHover, onPinReposition, onShapeComplete, onEraseShape, onUrlChange,
    canComment, canDraw,
  };

  const doc = () => frameRef.current?.contentDocument ?? null;

  const docBox = useCallback(() => {
    const d = doc();
    if (!d?.documentElement) return { w: 0, h: 0 };
    return {
      w: Math.max(d.documentElement.scrollWidth, d.body?.scrollWidth ?? 0),
      h: Math.max(d.documentElement.scrollHeight, d.body?.scrollHeight ?? 0),
    };
  }, []);

  // ── navigation ──────────────────────────────────────────────────────────
  const navigate = useCallback((next: string, fromHistory = false) => {
    if (!fromHistory) {
      setHistory((prev) => [...prev.slice(0, historyIndex + 1), next]);
      setHistoryIndex((i) => i + 1);
    }
    setIsLoading(true);
    setLoadError(null);
    s.current.onUrlChange(next);
  }, [historyIndex]);

  const goBack = () => { if (historyIndex > 0) { const i = historyIndex - 1; setHistoryIndex(i); navigate(history[i], true); } };
  const goForward = () => { if (historyIndex < history.length - 1) { const i = historyIndex + 1; setHistoryIndex(i); navigate(history[i], true); } };
  const reload = () => { setIsLoading(true); setLoadError(null); const f = frameRef.current; if (f) f.src = `${proxySrc}&_=${Date.now()}`; };

  // ── overlay: shapes and pins, drawn in document coordinates ─────────────
  const buildShapeNode = (d: Document, shape: Shape, w: number, h: number): SVGElement | null => {
    const g = denormalizeShape(shape, w, h);
    const stroke = g.color || DRAWING_COLOR;
    const width = g.strokeWidth || STROKE_WIDTH;

    const set = (el: SVGElement, attrs: Record<string, string | number>) => {
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)));
      return el;
    };

    switch (g.type) {
      case 'pen': {
        if (g.points.length < 4) return null;
        const pts = g.points.reduce<string[]>((acc, v, i) => {
          if (i % 2 === 0) acc.push(`${i === 0 ? 'M' : 'L'} ${v}`);
          else acc[acc.length - 1] += ` ${v}`;
          return acc;
        }, []).join(' ');
        return set(d.createElementNS(SVG_NS, 'path'), {
          d: pts, stroke, 'stroke-width': width, fill: 'none',
          'stroke-linecap': 'round', 'stroke-linejoin': 'round',
        });
      }
      case 'line': {
        const [x1, y1, x2, y2] = g.points;
        return set(d.createElementNS(SVG_NS, 'line'), { x1, y1, x2, y2, stroke, 'stroke-width': width, 'stroke-linecap': 'round' });
      }
      case 'arrow': {
        const [x1, y1, x2, y2] = g.points;
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const len = g.pointerLength || 12;
        const half = (g.pointerWidth || 12) / 2;
        const bx = x2 - Math.cos(angle) * len;
        const by = y2 - Math.sin(angle) * len;
        const group = d.createElementNS(SVG_NS, 'g');
        group.appendChild(set(d.createElementNS(SVG_NS, 'line'), { x1, y1, x2: bx, y2: by, stroke, 'stroke-width': width, 'stroke-linecap': 'round' }));
        group.appendChild(set(d.createElementNS(SVG_NS, 'polygon'), {
          points: `${x2},${y2} ${bx - Math.sin(angle) * half},${by + Math.cos(angle) * half} ${bx + Math.sin(angle) * half},${by - Math.cos(angle) * half}`,
          fill: stroke,
        }));
        return group;
      }
      case 'rectangle':
        return set(d.createElementNS(SVG_NS, 'rect'), {
          x: g.x, y: g.y, width: g.width, height: g.height,
          stroke, 'stroke-width': width, fill: g.fill || 'none',
        });
      case 'highlight':
        return set(d.createElementNS(SVG_NS, 'rect'), {
          x: g.x, y: g.y, width: g.width, height: g.height,
          fill: stroke, 'fill-opacity': typeof g.opacity === 'number' ? g.opacity : 0.3,
        });
      default:
        return null;
    }
  };

  /**
   * Mirror the framed document's coordinate space into the parent page.
   *
   * CommentModal positions itself off `[data-annotation-image-container]`:
   * it reads that element's rect and treats a pin's x/y as a percentage of it.
   * On an image the element is the image itself. Here the pins live inside the
   * iframe, so the parent has nothing to measure — the modal found no anchor,
   * bailed out of positioning entirely, and the comment box fell to the corner
   * of the screen.
   *
   * This div is that anchor: an empty, untouchable box laid over the frame,
   * sized to the *whole* scrollable document and offset by the frame's own
   * scroll. Its rect is therefore exactly where the document's origin sits on
   * screen, so the modal's existing arithmetic lands on the pin with no
   * special-casing on its side — the website and the image feed it the same
   * contract.
   */
  const syncAnchor = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const d = doc();
    const { w, h } = docBox();
    if (!d?.documentElement || !w || !h) {
      el.style.display = 'none';
      return;
    }
    const view = d.defaultView;
    el.style.display = 'block';
    el.style.left = `${-(view?.scrollX ?? 0)}px`;
    el.style.top = `${-(view?.scrollY ?? 0)}px`;
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
  }, [docBox]);

  const paint = useCallback(() => {
    syncAnchor();
    const d = doc();
    if (!d?.documentElement) return;
    const { w, h } = docBox();
    if (!w || !h) return;

    let layer = d.getElementById(LAYER_ID);
    if (!layer) {
      layer = d.createElement('div');
      layer.id = LAYER_ID;
      d.documentElement.appendChild(layer);
    }
    layer.setAttribute(
      'style',
      `position:absolute;top:0;left:0;width:${w}px;height:${h}px;pointer-events:none;z-index:2147483000;overflow:visible;`
    );
    layer.innerHTML = '';

    // markup
    const svg = d.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', String(w));
    svg.setAttribute('height', String(h));
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    const erasing = s.current.mode === 'comment' && s.current.tool === 'eraser';
    const drawing = s.current.mode === 'comment' && !!s.current.tool && !erasing;
    const armed = drawing || erasing;
    svg.setAttribute('style', `position:absolute;inset:0;pointer-events:${armed ? 'auto' : 'none'};${drawing ? 'cursor:crosshair;' : ''}`);
    layer.appendChild(svg);

    for (const shape of s.current.drawnShapes) {
      const node = buildShapeNode(d, shape, w, h);
      if (node) svg.appendChild(node);
    }

    // Only strokes not yet attached to a comment can be erased. A saved
    // drawing belongs to somebody's comment, and removing it is the undo
    // path's job, which confirms before it takes a comment down with it.
    for (const shape of s.current.pendingShapes) {
      const node = buildShapeNode(d, shape, w, h);
      if (!node) continue;
      if (erasing && s.current.onEraseShape) {
        node.setAttribute('style', 'pointer-events:auto;cursor:pointer');
        // A thin stroke is a small target, so widen the hit area without
        // changing what is painted.
        node.setAttribute('stroke-linecap', 'round');
        node.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          s.current.onEraseShape?.(shape.id);
        });
      }
      svg.appendChild(node);
    }

    // pins
    for (const pin of s.current.pins) {
      const el = d.createElement('div');
      const selected = pin.id === s.current.selectedPinId;
      const hovered = pin.id === s.current.hoveredPin;
      el.setAttribute(
        'style',
        [
          'position:absolute',
          `left:${(pin.x / 100) * w}px`,
          `top:${(pin.y / 100) * h}px`,
          'transform:translate(-50%,-50%)',
          'width:28px;height:28px;border-radius:9999px',
          `background:${pin.resolved ? RESOLVED : ACCENT}`,
          `border:2px solid ${selected || hovered ? '#0c3133' : '#ffffff'}`,
          `box-shadow:0 1px 4px rgba(0,0,0,.35)${selected ? ',0 0 0 4px rgba(255,97,55,.25)' : ''}`,
          'color:#fff;font:600 12px/24px system-ui,sans-serif;text-align:center',
          'pointer-events:auto;user-select:none',
          s.current.onPinReposition ? 'cursor:grab' : 'cursor:pointer',
        ].join(';')
      );
      el.textContent = String(pin.number);
      el.addEventListener('mouseenter', () => s.current.onPinHover?.(pin.id));
      el.addEventListener('mouseleave', () => s.current.onPinHover?.(null));

      // Drag to reposition, exactly as on an image. A small threshold keeps a
      // click from being read as a zero-length drag.
      let dragging = false;
      el.addEventListener('mousedown', (ev) => {
        const e = ev as MouseEvent;
        if (!s.current.onPinReposition) return;
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX, startY = e.clientY;
        let moved = false;

        const onMove = (me: MouseEvent) => {
          if (!moved && Math.hypot(me.clientX - startX, me.clientY - startY) < 4) return;
          moved = true;
          dragging = true;
          el.style.cursor = 'grabbing';
          const view = d.defaultView!;
          el.style.left = `${me.clientX + view.scrollX}px`;
          el.style.top = `${me.clientY + view.scrollY}px`;
        };
        const onUp = (ue: MouseEvent) => {
          d.removeEventListener('mousemove', onMove, true);
          d.removeEventListener('mouseup', onUp, true);
          el.style.cursor = 'grab';
          if (!moved) { s.current.onSelectPin(pin.id); return; }
          const view = d.defaultView!;
          const nx = ((ue.clientX + view.scrollX) / w) * 100;
          const ny = ((ue.clientY + view.scrollY) / h) * 100;
          s.current.onPinReposition?.(pin.id, Math.max(0, Math.min(100, nx)), Math.max(0, Math.min(100, ny)));
          setTimeout(() => { dragging = false; }, 0);
        };
        d.addEventListener('mousemove', onMove, true);
        d.addEventListener('mouseup', onUp, true);
      });

      el.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (!dragging) s.current.onSelectPin(pin.id);
      });

      layer.appendChild(el);
    }
  }, [docBox, syncAnchor]);

  const ticking = useRef(false);
  const schedule = useCallback(() => {
    if (ticking.current) return;
    ticking.current = true;
    const done = () => { ticking.current = false; paint(); };
    let raf = 0;
    try { raf = requestAnimationFrame(done); } catch { /* hidden tab */ }
    setTimeout(() => { if (ticking.current) { try { cancelAnimationFrame(raf); } catch {} done(); } }, 100);
  }, [paint]);

  // ── drawing on the framed document ──────────────────────────────────────
  const attachDrawing = useCallback((d: Document) => {
    let active: Shape | null = null;
    let startX = 0, startY = 0;

    const point = (e: MouseEvent) => {
      const view = d.defaultView!;
      return { x: e.clientX + view.scrollX, y: e.clientY + view.scrollY };
    };

    const onDown = (ev: Event) => {
      const e = ev as MouseEvent;
      const t = s.current.tool;
      if (s.current.mode !== 'comment' || !t || t === 'eraser' || !s.current.canDraw) return;
      const target = e.target as Element | null;
      // Only the markup layer starts a stroke; a pin must stay clickable.
      if (!target || target.namespaceURI !== SVG_NS) return;
      e.preventDefault();
      e.stopPropagation();

      const p = point(e);
      startX = p.x; startY = p.y;
      const base = { id: `s_${Date.now()}`, color: DRAWING_COLOR, strokeWidth: STROKE_WIDTH, createdAt: new Date().toISOString() };
      active =
        t === 'pen' ? ({ ...base, type: 'pen', points: [p.x, p.y] } as Shape)
        : t === 'rectangle' ? ({ ...base, type: 'rectangle', x: p.x, y: p.y, width: 0, height: 0 } as Shape)
        : t === 'highlight' ? ({ ...base, type: 'highlight', x: p.x, y: p.y, width: 0, height: 0, opacity: 0.3 } as Shape)
        : t === 'arrow' ? ({ ...base, type: 'arrow', points: [p.x, p.y, p.x, p.y], pointerLength: 12, pointerWidth: 12 } as Shape)
        : ({ ...base, type: 'line', points: [p.x, p.y, p.x, p.y] } as Shape);
    };

    const onMove = (ev: Event) => {
      if (!active) return;
      const e = ev as MouseEvent;
      const p = point(e);
      if (active.type === 'pen') active.points.push(p.x, p.y);
      else if (active.type === 'rectangle' || active.type === 'highlight') {
        active.x = Math.min(startX, p.x); active.y = Math.min(startY, p.y);
        active.width = Math.abs(p.x - startX); active.height = Math.abs(p.y - startY);
      } else active.points = [startX, startY, p.x, p.y];

      // Preview without disturbing the saved sets.
      const { w, h } = docBox();
      const layer = d.getElementById(LAYER_ID);
      const svg = layer?.querySelector('svg');
      if (svg && w && h) {
        svg.querySelectorAll('[data-preview]').forEach((n) => n.remove());
        const node = buildShapeNode(d, normalizeShape({ ...active } as Shape, w, h), w, h);
        if (node) { node.setAttribute('data-preview', '1'); svg.appendChild(node); }
      }
    };

    const onUp = () => {
      if (!active) return;
      const { w, h } = docBox();
      const shape = active;
      active = null;
      if (!w || !h) return;

      const tiny =
        (shape.type === 'rectangle' || shape.type === 'highlight')
          ? shape.width < 4 && shape.height < 4
          : shape.type === 'pen'
          ? shape.points.length < 6
          : Math.hypot(shape.points[2] - shape.points[0], shape.points[3] - shape.points[1]) < 6;
      if (tiny) { schedule(); return; }

      // Same contract as the image viewer: normalised shape, anchor in percent.
      const normalized = normalizeShape(shape, w, h);
      const ax = shape.type === 'rectangle' || shape.type === 'highlight' ? shape.x : shape.points[0];
      const ay = shape.type === 'rectangle' || shape.type === 'highlight' ? shape.y : shape.points[1];
      s.current.onShapeComplete?.(normalized, {
        x: Math.max(0, Math.min(100, (ax / w) * 100)),
        y: Math.max(0, Math.min(100, (ay / h) * 100)),
      });
      schedule();
    };

    d.addEventListener('mousedown', onDown, true);
    d.addEventListener('mousemove', onMove, true);
    d.addEventListener('mouseup', onUp, true);
  }, [docBox, schedule]);

  // ── frame wiring ────────────────────────────────────────────────────────
  const handleLoad = useCallback(() => {
    setIsLoading(false);
    const d = doc();
    if (!d) { setLoadError('This page could not be opened inside the review.'); return; }

    try {
      const declared = d.querySelector('base')?.getAttribute('href');
      if (declared && declared !== url) s.current.onUrlChange(declared);
    } catch { /* ignore */ }

    const resolve = (raw: string): URL | null => {
      try { return new URL(raw, d.querySelector('base')?.getAttribute('href') ?? url); } catch { return null; }
    };

    d.addEventListener('click', (ev) => {
      const e = ev as MouseEvent;
      const { mode: m, tool: t, canComment: allowed } = s.current;

      if (m === 'comment') {
        // With a tool selected the drawing handlers own the gesture.
        if (t) return;
        if (!allowed) return;
        const target = e.target as HTMLElement | null;
        if (target?.closest?.(`#${LAYER_ID}`)) return;
        e.preventDefault();
        e.stopPropagation();
        const { w, h } = docBox();
        if (!w || !h) return;
        const view = d.defaultView!;
        s.current.onPlacePin(
          Math.max(0, Math.min(100, ((e.clientX + view.scrollX) / w) * 100)),
          Math.max(0, Math.min(100, ((e.clientY + view.scrollY) / h) * 100))
        );
        return;
      }

      const anchor = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute('href') ?? '';
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
      const target = resolve(href);
      if (!target || (target.protocol !== 'http:' && target.protocol !== 'https:')) return;
      e.preventDefault();
      e.stopPropagation();
      if (anchor.target === '_blank') { window.open(target.toString(), '_blank', 'noopener'); return; }
      navigate(target.toString());
    }, true);

    d.addEventListener('submit', (ev) => {
      const form = ev.target as HTMLFormElement | null;
      if (!form) return;
      const method = (form.getAttribute('method') ?? 'get').toLowerCase();
      const target = resolve(form.getAttribute('action') ?? '');
      if (!target) return;
      ev.preventDefault();
      ev.stopPropagation();
      if (method === 'get') {
        for (const [k, v] of new FormData(form).entries()) if (typeof v === 'string') target.searchParams.set(k, v);
        navigate(target.toString());
      }
      // POSTs are never replayed: submitting a real form on the client's site
      // from a review tool is a side effect nobody asked for.
    }, true);

    attachDrawing(d);
    paint();

    const view = d.defaultView;
    view?.addEventListener('scroll', schedule, true);
    view?.addEventListener('resize', schedule);
    try {
      if (view?.ResizeObserver) {
        const ro = new view.ResizeObserver(schedule);
        ro.observe(d.documentElement);
        if (d.body) ro.observe(d.body);
      }
      if (view?.MutationObserver && d.body) {
        let t: number | undefined;
        const mo = new view.MutationObserver(() => { if (t) view.clearTimeout(t); t = view.setTimeout(schedule, 150); });
        mo.observe(d.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
      }
    } catch { /* observers are a nicety, not a requirement */ }
    view?.setTimeout(paint, 1200);
    view?.setTimeout(paint, 3500);
  }, [attachDrawing, docBox, navigate, paint, schedule, url]);

  useEffect(() => { paint(); }, [pins, selectedPinId, hoveredPin, drawnShapes, pendingShapes, tool, mode, paint]);

  // A page the review has not seen before is no longer a dead end: commenting
  // on one registers it (workspace's handleAddComment), so the reviewer can
  // walk the whole site and mark up whatever they find. Comment mode therefore
  // survives navigation instead of snapping back to browsing.

  useEffect(() => {
    const d = doc();
    if (!d?.documentElement) return;
    d.documentElement.style.cursor = mode === 'comment' && !tool ? 'crosshair' : '';

  }, [mode, tool, isLoading]);

  // Leaving comment mode must also drop the tool, or the next click draws.
  const setModeSafely = (next: LiveMode) => {
    setMode(next);
    if (next === 'browse') setTool(null);
  };

  /**
   * Picking a tool is itself the intent to mark the page up, so it carries the
   * viewer into comment mode; clearing the tool leaves the user in comment mode
   * placing pins, which is where they were heading anyway.
   */
  const pickTool = (next: DrawingTool | null) => {
    setTool(next);
    if (next) setMode('comment');
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (tool) setTool(null);
      else if (mode === 'comment') setModeSafely('browse');
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [mode, tool]);

  const deviceWidth = DEVICES.find((x) => x.label === device)?.width ?? 0;
  const isSecure = url.startsWith('https://');

  /**
   * Typing an address is the other half of "browse the site freely" — links
   * only reach what a page happens to link to. The proxy refuses anything
   * off-site anyway; resolving here means a typo shows as a no-op instead of
   * an error page inside the frame.
   */
  const resolveTyped = (raw: string): string | null => {
    const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw)
      ? raw
      : raw.startsWith('/')
      ? new URL(raw, url).toString()
      : `https://${raw}`;
    try {
      const next = new URL(candidate);
      if (next.protocol !== 'http:' && next.protocol !== 'https:') return null;
      const a = next.hostname.toLowerCase().replace(/^www\./, '');
      const b = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
      if (a !== b && !a.endsWith(`.${b}`)) return null;
      return next.toString();
    } catch {
      return null;
    }
  };

  return (
    <div className={`flex-1 flex flex-col min-w-0 overflow-hidden ${isFullscreen ? 'bg-black' : 'bg-muted/30'}`}>
      {!isFullscreen && (
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border/50 bg-background shrink-0 flex-wrap">
          <IconTooltip label="Back"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={goBack} disabled={historyIndex === 0} aria-label="Back"><ArrowLeft className="h-3.5 w-3.5" /></Button></IconTooltip>
          <IconTooltip label="Forward"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={goForward} disabled={historyIndex >= history.length - 1} aria-label="Forward"><ArrowRight className="h-3.5 w-3.5" /></Button></IconTooltip>
          <IconTooltip label="Reload"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={reload} aria-label="Reload"><RotateCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} /></Button></IconTooltip>

          <form
            className="flex-1 min-w-[160px] flex items-center gap-2 h-7 px-3 rounded-full bg-muted/60 border border-border/60 focus-within:border-accent/60"
            onSubmit={(e) => {
              e.preventDefault();
              const next = draftUrl.trim();
              if (!next || next === url) return;
              const resolved = resolveTyped(next);
              if (!resolved) {
                setDraftUrl(url);
                return;
              }
              // Through navigate() so a typed address joins the back/forward
              // history like a clicked link does.
              navigate(resolved);
            }}
          >
            {isSecure ? <Lock className="h-3 w-3 text-emerald-600 shrink-0" /> : <span className="text-[10px] font-semibold uppercase text-amber-600 shrink-0">http</span>}
            <input
              type="text"
              aria-label="Page address"
              value={draftUrl}
              title={url}
              onChange={(e) => setDraftUrl(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              onBlur={() => setDraftUrl(url)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setDraftUrl(url);
                  e.currentTarget.blur();
                }
              }}
              className="flex-1 min-w-0 bg-transparent text-xs text-muted-foreground font-mono outline-none focus:text-foreground"
              spellCheck={false}
            />
            {isLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />}
          </form>

          {!isTrackedPage && onAddCurrentPage && (
            <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs shrink-0" onClick={onAddCurrentPage} disabled={isAddingPage}>
              {isAddingPage ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}Add page
            </Button>
          )}

          {totalPages > 1 && onNavigate && (
            <div className="flex items-center gap-0.5 shrink-0 text-[11px] text-muted-foreground">
              <IconTooltip label="Previous page"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onNavigate('prev')} disabled={currentIndex <= 0} aria-label="Previous page"><ChevronLeft className="h-3.5 w-3.5" /></Button></IconTooltip>
              <span className="tabular-nums px-1">{currentIndex + 1}/{totalPages}</span>
              <IconTooltip label="Next page"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onNavigate('next')} disabled={currentIndex >= totalPages - 1} aria-label="Next page"><ChevronRight className="h-3.5 w-3.5" /></Button></IconTooltip>
            </div>
          )}

          <div className="flex items-center rounded-full border border-border/60 overflow-hidden shrink-0">
            {DEVICES.map(({ label, icon: Icon, title }) => (
              <IconTooltip key={label} label={title}>
                <button type="button" onClick={() => setDevice(label)} aria-pressed={device === label}
                  className={`h-7 w-8 flex items-center justify-center transition-colors ${device === label ? 'bg-accent/10 text-accent' : 'text-muted-foreground hover:text-foreground'}`}>
                  <Icon className="h-3.5 w-3.5" />
                </button>
              </IconTooltip>
            ))}
          </div>

          {canComment && (
            <div className="flex items-center rounded-full border border-border/60 overflow-hidden shrink-0">
              <IconTooltip label="Browse the site normally">
                <button type="button" onClick={() => setModeSafely('browse')} aria-pressed={mode === 'browse'}
                  className={`h-7 px-2.5 flex items-center gap-1 text-xs transition-colors ${mode === 'browse' ? 'bg-accent/10 text-accent' : 'text-muted-foreground hover:text-foreground'}`}>
                  <MousePointer2 className="h-3.5 w-3.5" />Browse
                </button>
              </IconTooltip>
              <IconTooltip label={isTrackedPage ? 'Click the page to comment, or pick a drawing tool' : 'Comment here — this page joins the review automatically'}>
                <button type="button" onClick={() => setModeSafely('comment')} aria-pressed={mode === 'comment'}
                  className={`h-7 px-2.5 flex items-center gap-1 text-xs transition-colors ${mode === 'comment' ? 'bg-accent/10 text-accent' : 'text-muted-foreground hover:text-foreground'}`}>
                  <MessageSquarePlus className="h-3.5 w-3.5" />Comment
                </button>
              </IconTooltip>
            </div>
          )}

          {onToggleFullscreen && (
            <IconTooltip label="Fullscreen">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onToggleFullscreen} aria-label="Fullscreen"><Maximize2 className="h-3.5 w-3.5" /></Button>
            </IconTooltip>
          )}
          <IconTooltip label="Open the real page in a new tab">
            <a href={url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
              aria-label="Open the real page in a new tab"><ExternalLink className="h-3.5 w-3.5" /></a>
          </IconTooltip>
        </div>
      )}

      {/*
        Drawing tools sit in the open, as they do on an image. They used to be
        revealed only after switching to comment mode, which made drawing on a
        website look like a feature that did not exist. Picking a tool now
        switches the mode itself, so the toolbar is the way in rather than a
        reward for having already found the way in.
      */}
      {!isFullscreen && canComment && canDraw && (
        <div className="px-3 py-1.5 border-b border-border/50 bg-background shrink-0 flex items-center gap-3">
          <DrawingToolbar
            activeTool={tool}
            onToolSelect={pickTool}
            onUndo={onUndoShape}
            canUndo={canUndo}
            showEraser={!!onEraseShape}
          />
          {mode === 'comment' ? (
            <span className="text-[11px] text-muted-foreground">
              {tool ? 'Drag on the page to mark it up.' : 'Click the page to drop a comment pin.'}
              {!isTrackedPage && ' This page joins the review when you save.'}
            </span>
          ) : null}
        </div>
      )}

      {isFullscreen && onToggleFullscreen && (
        <button onClick={onToggleFullscreen} aria-label="Exit fullscreen"
          className="absolute top-3 right-3 z-20 h-8 w-8 flex items-center justify-center rounded-md bg-black/60 text-white hover:bg-black/80">
          <Minimize2 className="h-4 w-4" />
        </button>
      )}

      <div className="flex-1 overflow-auto flex justify-center bg-muted/40">
        <div className="relative overflow-hidden bg-white shadow-sm transition-[width] duration-200"
          style={{ width: deviceWidth ? `${deviceWidth}px` : '100%', maxWidth: '100%', height: '100%' }}>
          {loadError ? (
            <div className="h-full flex items-center justify-center p-8 text-center">
              <div className="max-w-md">
                <p className="text-sm font-medium text-foreground mb-1">{loadError}</p>
                <p className="text-xs text-muted-foreground">Some sites refuse to be displayed inside another page. Open it in a new tab to check it, or use a different page of the site.</p>
              </div>
            </div>
          ) : (
            <>
              <iframe
                ref={frameRef}
                key={proxySrc}
                src={proxySrc}
                onLoad={handleLoad}
                title="Website under review"
                className="w-full h-full border-0 bg-white"
                sandbox="allow-same-origin allow-scripts allow-forms"
              />
              {/* See syncAnchor: the framed document's box, projected here so
                  the comment modal can measure it. Never visible, never
                  clickable — it exists only to be measured. */}
              <div
                ref={anchorRef}
                data-annotation-image-container
                aria-hidden="true"
                className="absolute pointer-events-none"
                style={{ display: 'none' }}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
