'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowRight, RotateCw, ExternalLink, Lock, Loader2,
  MousePointer2, MessageSquarePlus, Monitor, Tablet, Smartphone, Plus,
  Maximize2, Minimize2, ChevronLeft, ChevronRight, ImageOff, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconTooltip } from '@/components/ui/icon-tooltip';
import DrawingToolbar, { DRAWING_COLOR, STROKE_WIDTH } from '@/components/drawing-toolbar';
import { denormalizeShape, normalizeShape } from '@/lib/drawing';
import { COMMENT_PIN_CURSOR, DRAWING_PENCIL_CURSOR } from '@/lib/annotation/cursors';
import { buildAnchor, fanOut, resolveAnchor, type ResolvedPoint } from '@/lib/website/anchor';
import type { PinAnchor, PinDevice } from '@/lib/website/anchor-schema';
import { fromProxyPath, toProxyPath, TOKEN_PARAM } from '@/lib/website/proxy-path';
import { samePage } from '@/lib/website/url';
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
 * possible because the proxy serves the page same-origin.
 *
 * Where a pin sits is decided by its anchor (lib/website/anchor.ts): the
 * element it was dropped on and the point within it, so it stays put while the
 * page loads, at other screen widths and after the content above it changes.
 * Pins without one (older comments) fall back to their stored percentage.
 * Drawings keep the image tool's contract — shapes normalised 0..1 against the
 * document box, anchor reported as a percentage — so the same comments, PDF
 * export and drawing data work for both.
 */

export type LiveMode = 'browse' | 'comment';

export interface LivePin {
  id: string;
  number: number;
  /** Percentage of the full scrollable document — the fallback position. */
  x: number;
  y: number;
  resolved: boolean;
  /** The element the pin is attached to, when it was placed on a website. */
  anchor?: PinAnchor | null;
}

interface LiveViewerProps {
  projectId: string;
  token?: string;
  url: string;
  onUrlChange: (url: string) => void;

  pins: LivePin[];
  selectedPinId: string | null;
  /** `at` is where the pin is drawn right now, as a document percentage. */
  onSelectPin: (pinId: string, at?: { x: number; y: number }) => void;
  onPlacePin: (xPct: number, yPct: number, anchor?: PinAnchor) => void;
  /** Drag a pin to a new spot, as on an image. It is re-anchored where it lands. */
  onPinReposition?: (pinId: string, xPct: number, yPct: number, anchor?: PinAnchor) => void | Promise<void>;
  hoveredPin?: string | null;
  onPinHover?: (pinId: string | null) => void;

  /** Markup for the selected/hovered comment, and the strokes not yet saved. */
  drawnShapes?: Shape[];
  pendingShapes?: Shape[];
  onShapeComplete?: (shape: Shape, center: { x: number; y: number }, anchor?: PinAnchor) => void;
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
const DEVICE_BADGE: Record<PinDevice, string> = { desktop: 'D', tablet: 'T', mobile: 'M' };

/** How long to wait for a page's layout to stop moving before placing pins. */
const SETTLE_MAX_MS = 4000;
const SETTLE_STEP_MS = 150;
const SETTLE_STABLE_STEPS = 3;

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
  const [device, setDevice] = useState<PinDevice>('desktop');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** Back/forward stack, kept as one value so moving through it is atomic. */
  const [hist, setHist] = useState<{ list: string[]; index: number }>({ list: [url], index: 0 });
  /** What is in the address box while it is being edited. */
  const [draftUrl, setDraftUrl] = useState(url);
  /**
   * The address the frame was pointed at. It is separate from `url` because
   * the frame can move on its own — a redirect, a client-side route change —
   * and reporting that upward must not reload the frame it came from.
   */
  const [frameUrl, setFrameUrl] = useState(url);
  const [reloadNonce, setReloadNonce] = useState(0);
  /** Layout has stopped moving, so pins can be placed without jumping. */
  const [settled, setSettled] = useState(false);
  const [brokenImages, setBrokenImages] = useState(0);
  const [brokenDismissed, setBrokenDismissed] = useState(false);

  /** The address the framed page last reported (shim → postMessage). */
  const reportedUrlRef = useRef<string | null>(null);

  const history = hist.list;
  const historyIndex = hist.index;

  // ── following the page we are asked to show ─────────────────────────────
  useEffect(() => {
    setDraftUrl(url);
    setHist((h) => (h.list[h.index] === url ? h : { list: [...h.list.slice(0, h.index + 1), url], index: h.index + 1 }));
    // Already on screen: the frame navigated there itself and told us.
    if (samePage(url, reportedUrlRef.current)) return;
    setFrameUrl(url);
  }, [url]);

  // A new document is coming: nothing of the old one's pins may linger.
  useEffect(() => {
    reportedUrlRef.current = null;
    setIsLoading(true);
    setLoadError(null);
    setSettled(false);
    setBrokenImages(0);
    setBrokenDismissed(false);
  }, [frameUrl, reloadNonce]);

  const proxySrc = useMemo(() => {
    try {
      const u = new URL(frameUrl);
      u.hash = '';
      const path = toProxyPath(u, projectId);
      return token ? `${path}${path.includes('?') ? '&' : '?'}${TOKEN_PARAM}=${encodeURIComponent(token)}` : path;
    } catch {
      return '';
    }
  }, [frameUrl, projectId, token]);

  // Listeners are attached to the framed document once per load, so everything
  // they need is read through a ref rather than captured at attach time.
  const s = useRef({
    url, mode, tool, pins, selectedPinId, hoveredPin, drawnShapes, pendingShapes, settled, device,
    onPlacePin, onSelectPin, onPinHover, onPinReposition, onShapeComplete, onEraseShape, onUrlChange,
    canComment, canDraw,
  });
  s.current = {
    url, mode, tool, pins, selectedPinId, hoveredPin, drawnShapes, pendingShapes, settled, device,
    onPlacePin, onSelectPin, onPinHover, onPinReposition, onShapeComplete, onEraseShape, onUrlChange,
    canComment, canDraw,
  };

  const doc = () => frameRef.current?.contentDocument ?? null;

  /**
   * The document's size, measured with our overlay taken out. The overlay is
   * as large as the document, so leaving it in made the measurement feed on
   * itself: the page could grow but never shrink back, and every pin placed
   * as a share of that height drifted.
   */
  const docBox = useCallback(() => {
    const d = doc();
    if (!d?.documentElement) return { w: 0, h: 0 };
    const layer = d.getElementById(LAYER_ID) as HTMLElement | null;
    const prev = layer?.style.display ?? '';
    if (layer) layer.style.display = 'none';
    const box = {
      w: Math.max(d.documentElement.scrollWidth, d.body?.scrollWidth ?? 0),
      h: Math.max(d.documentElement.scrollHeight, d.body?.scrollHeight ?? 0),
    };
    if (layer) layer.style.display = prev;
    return box;
  }, []);

  // Read through a ref: the pin and document listeners are created once per
  // load and would otherwise keep the address from that moment.
  const frameUrlRef = useRef(frameUrl);
  frameUrlRef.current = frameUrl;

  /** The page on show, as the site knows it. */
  const currentPageUrl = () => reportedUrlRef.current ?? frameUrlRef.current;

  // ── navigation ──────────────────────────────────────────────────────────
  const navigate = useCallback((next: string) => {
    s.current.onUrlChange(next);
  }, []);

  const goBack = () => {
    if (hist.index === 0) return;
    const i = hist.index - 1;
    setHist({ ...hist, index: i });
    navigate(hist.list[i]);
  };
  const goForward = () => {
    if (hist.index >= hist.list.length - 1) return;
    const i = hist.index + 1;
    setHist({ ...hist, index: i });
    navigate(hist.list[i]);
  };
  const reload = () => setReloadNonce((n) => n + 1);

  // ── overlay: shapes and pins, drawn in document coordinates ─────────────
  const buildShapeNode = (d: Document, shape: Shape, w: number, h: number): SVGElement | null => {
    const g = denormalizeShape(shape, w, h);
    const stroke = g.color || DRAWING_COLOR;
    const width = g.strokeWidth || STROKE_WIDTH;

    // Paint goes inline as well as in attributes: this SVG lives inside the
    // client's page, and a site rule as ordinary as `path { fill: currentColor }`
    // outranks a presentation attribute and would repaint the markup.
    const PAINT = ['stroke', 'stroke-width', 'fill', 'fill-opacity', 'stroke-linecap', 'stroke-linejoin'];
    const set = (el: SVGElement, attrs: Record<string, string | number>) => {
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)));
      el.setAttribute('style', PAINT.filter((k) => k in attrs).map((k) => `${k}:${attrs[k]}!important`).join(';'));
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
  const syncAnchor = useCallback((box?: { w: number; h: number }) => {
    const el = anchorRef.current;
    if (!el) return;
    const d = doc();
    const { w, h } = box ?? docBox();
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

  /** Element lookups for anchors, reused between scroll frames. */
  const elCache = useRef(new Map<string, Element | null>());
  /** The last measured document box; scrolling does not change it. */
  const boxRef = useRef({ w: 0, h: 0 });
  /** Pin elements by id, updated in place rather than rebuilt. */
  const pinNodes = useRef(new Map<string, HTMLDivElement>());
  /** Where each pin truly belongs (before fanning out), by id. */
  const truePos = useRef(new Map<string, ResolvedPoint>());
  /** Where each pin is drawn, in document coordinates, by id. */
  const shownPos = useRef(new Map<string, { x: number; y: number }>());
  const draggingId = useRef<string | null>(null);
  const suppressClick = useRef(false);

  /** The overlay's parts, created once per document. */
  const ensureLayer = (d: Document) => {
    let layer = d.getElementById(LAYER_ID) as HTMLDivElement | null;
    if (!layer) {
      layer = d.createElement('div');
      layer.id = LAYER_ID;
      // Zero-sized so it cannot stretch the page; everything in it overflows.
      layer.setAttribute(
        'style',
        'position:absolute;top:0;left:0;width:0;height:0;overflow:visible;pointer-events:none;z-index:2147483000;'
      );
      const style = d.createElement('style');
      style.textContent =
        '@keyframes rv-pulse{0%{box-shadow:0 0 0 0 rgba(255,97,55,.55)}100%{box-shadow:0 0 0 18px rgba(255,97,55,0)}}' +
        `#${LAYER_ID} .rv-pulse{animation:rv-pulse 1s ease-out 2}`;
      const shapes = d.createElementNS(SVG_NS, 'svg');
      shapes.setAttribute('data-rv-shapes', '');
      const links = d.createElementNS(SVG_NS, 'svg');
      links.setAttribute('data-rv-links', '');
      links.setAttribute('style', 'position:absolute;left:0;top:0;pointer-events:none;overflow:visible');
      const pinsBox = d.createElement('div');
      pinsBox.setAttribute('data-rv-pins', '');
      pinsBox.setAttribute('style', 'position:absolute;left:0;top:0;width:0;height:0;overflow:visible');
      // Pins attached to a fixed header or banner live here, in viewport
      // coordinates, so they stay with it instead of scrolling away.
      const fixedBox = d.createElement('div');
      fixedBox.setAttribute('data-rv-fixed', '');
      fixedBox.setAttribute('style', 'position:fixed;left:0;top:0;width:0;height:0;overflow:visible');
      layer.append(style, shapes, links, pinsBox, fixedBox);
      d.documentElement.appendChild(layer);
      pinNodes.current.clear();
    }
    return {
      layer,
      shapes: layer.querySelector('[data-rv-shapes]') as SVGSVGElement,
      links: layer.querySelector('[data-rv-links]') as SVGSVGElement,
      pinsBox: layer.querySelector('[data-rv-pins]') as HTMLDivElement,
      fixedBox: layer.querySelector('[data-rv-fixed]') as HTMLDivElement,
    };
  };

  /** A pin's current position as a percentage of the document, for the modal. */
  const pinPercent = (pinId: string) => {
    const pos = shownPos.current.get(pinId);
    const { w, h } = boxRef.current;
    if (!pos || !w || !h) return undefined;
    return { x: Math.max(0, Math.min(100, (pos.x / w) * 100)), y: Math.max(0, Math.min(100, (pos.y / h) * 100)) };
  };

  const selectPin = (pinId: string) => s.current.onSelectPin(pinId, pinPercent(pinId));

  const anchorContext = (box: { w: number; h: number }) => ({
    docWidth: box.w,
    docHeight: box.h,
    device: s.current.device,
    pageUrl: currentPageUrl(),
    overlayId: LAYER_ID,
  });

  /** Drag to reposition, exactly as on an image — then re-anchor on drop. */
  const startDrag = (d: Document, pinId: string, el: HTMLDivElement, e: MouseEvent) => {
    if (!s.current.onPinReposition) return;
    e.preventDefault();
    e.stopPropagation();
    const view = d.defaultView!;
    const startX = e.clientX, startY = e.clientY;
    const inFixed = el.parentElement?.hasAttribute('data-rv-fixed') ?? false;
    let moved = false;

    const onMove = (me: MouseEvent) => {
      if (!moved && Math.hypot(me.clientX - startX, me.clientY - startY) < 4) return;
      moved = true;
      draggingId.current = pinId;
      el.style.cursor = 'grabbing';
      // Dragging towards an edge brings more of the page into view.
      if (me.clientY < 40) view.scrollBy(0, -14);
      else if (me.clientY > view.innerHeight - 40) view.scrollBy(0, 14);
      el.style.left = `${me.clientX + (inFixed ? 0 : view.scrollX)}px`;
      el.style.top = `${me.clientY + (inFixed ? 0 : view.scrollY)}px`;
    };
    const onUp = (ue: MouseEvent) => {
      d.removeEventListener('mousemove', onMove, true);
      d.removeEventListener('mouseup', onUp, true);
      el.style.cursor = 'grab';
      if (!moved) { selectPin(pinId); suppressClick.current = true; setTimeout(() => { suppressClick.current = false; }, 0); return; }
      const box = docBox();
      boxRef.current = box;
      const px = ue.clientX + view.scrollX;
      const py = ue.clientY + view.scrollY;
      // Out of the way while measuring what it was dropped on.
      el.style.visibility = 'hidden';
      const anchor: PinAnchor = buildAnchor(d, px, py, anchorContext(box));
      el.style.visibility = '';
      // The drawing stays where it was made; only the pin moves.
      const before = s.current.pins.find((p) => p.id === pinId)?.anchor;
      const frame = before?.shapes ?? (
        before?.pageX != null && before.pageY != null && before.docWidth && before.docHeight
          ? {
              selector: before.selector, xPct: before.xPct, yPct: before.yPct, fixed: before.fixed,
              pageX: before.pageX, pageY: before.pageY, docWidth: before.docWidth, docHeight: before.docHeight,
            }
          : undefined
      );
      if (frame) anchor.shapes = frame;
      suppressClick.current = true;
      setTimeout(() => { suppressClick.current = false; draggingId.current = null; }, 0);
      s.current.onPinReposition?.(
        pinId,
        Math.max(0, Math.min(100, (px / box.w) * 100)),
        Math.max(0, Math.min(100, (py / box.h) * 100)),
        anchor,
      );
    };
    d.addEventListener('mousemove', onMove, true);
    d.addEventListener('mouseup', onUp, true);
  };

  const pinNode = (d: Document, pinId: string) => {
    let el = pinNodes.current.get(pinId);
    if (el && el.isConnected && el.ownerDocument === d) return el;
    el = d.createElement('div');
    el.setAttribute('data-rv-pin', pinId);
    el.addEventListener('mouseenter', () => s.current.onPinHover?.(pinId));
    el.addEventListener('mouseleave', () => s.current.onPinHover?.(null));
    el.addEventListener('mousedown', (ev) => startDrag(d, pinId, el!, ev as MouseEvent));
    el.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (suppressClick.current) return;
      if (!s.current.onPinReposition) selectPin(pinId);
    });
    pinNodes.current.set(pinId, el);
    return el;
  };

  /**
   * Places the pins. Cheap enough to run on every scroll frame: elements are
   * looked up once, nodes are reused, and only positions and styles change.
   * Pins stay hidden until the page has settled, so they never visibly jump
   * while images and fonts arrive.
   */
  const layoutPins = useCallback(() => {
    const d = doc();
    if (!d?.documentElement) return;
    const { pinsBox, fixedBox, links } = ensureLayer(d);
    const { w, h } = boxRef.current;
    const { mode: m, pins: list, selectedPinId: sel, hoveredPin: hov, settled: ready, device: dev } = s.current;

    const visible = m === 'comment' && ready && w > 0 && h > 0 ? list : [];
    const keep = new Set(visible.map((p) => p.id));
    pinNodes.current.forEach((node, id) => {
      if (!keep.has(id)) { node.remove(); pinNodes.current.delete(id); }
    });
    links.replaceChildren();
    truePos.current.clear();
    shownPos.current.clear();
    if (!visible.length) return;

    for (const pin of visible) {
      truePos.current.set(pin.id, resolveAnchor(d, pin.anchor, { x: pin.x, y: pin.y }, { w, h }, elCache.current));
    }

    // Nearby pins fan out so every number stays clickable; a hairline and a
    // dot keep showing where each one really points.
    const offsets = fanOut(
      visible
        .filter((p) => !truePos.current.get(p.id)!.fixed)
        .map((p) => ({ id: p.id, x: truePos.current.get(p.id)!.x, y: truePos.current.get(p.id)!.y })),
    );

    const view = d.defaultView;
    for (const pin of visible) {
      const at = truePos.current.get(pin.id)!;
      const off = offsets.get(pin.id);
      const x = at.x + (off?.dx ?? 0);
      const y = at.y + (off?.dy ?? 0);
      shownPos.current.set(pin.id, at.fixed ? { x: x + (view?.scrollX ?? 0), y: y + (view?.scrollY ?? 0) } : { x, y });

      const el = pinNode(d, pin.id);
      const parent = at.fixed ? fixedBox : pinsBox;
      if (el.parentElement !== parent) parent.appendChild(el);
      if (draggingId.current === pin.id) continue;

      const selected = pin.id === sel;
      const hovered = pin.id === hov;
      const pinDevice = pin.anchor?.device;
      const otherDevice = !!pinDevice && pinDevice !== dev;
      // Selected above hovered above open above resolved; newer above older.
      const tier = selected ? 4 : hovered ? 3 : pin.resolved ? 1 : 2;
      el.setAttribute(
        'style',
        [
          'position:absolute',
          `left:${x}px`,
          `top:${y}px`,
          'transform:translate(-50%,-50%)',
          'box-sizing:border-box;width:28px;height:28px;border-radius:9999px',
          `background:${pin.resolved ? RESOLVED : ACCENT}`,
          `border:2px solid ${selected || hovered ? '#0c3133' : '#ffffff'}`,
          `box-shadow:0 1px 4px rgba(0,0,0,.35)${selected ? ',0 0 0 4px rgba(255,97,55,.25)' : ''}`,
          'color:#fff;font:600 12px/24px system-ui,sans-serif;text-align:center',
          'pointer-events:auto;user-select:none',
          `z-index:${tier * 10000 + pin.number}`,
          `opacity:${otherDevice && !selected && !hovered ? 0.45 : 1}`,
          s.current.onPinReposition ? 'cursor:grab' : 'cursor:pointer',
        ].join(';')
      );
      el.title = otherDevice ? `Placed in ${pinDevice} view` : '';
      el.textContent = String(pin.number);
      if (otherDevice) {
        const badge = d.createElement('span');
        badge.textContent = DEVICE_BADGE[pinDevice!];
        badge.setAttribute(
          'style',
          'position:absolute;right:-7px;bottom:-7px;min-width:15px;height:15px;padding:0 3px;box-sizing:border-box;border-radius:8px;' +
            'background:#0c3133;border:1.5px solid #fff;color:#fff;font:700 8px/12px system-ui,sans-serif;text-align:center;pointer-events:none'
        );
        el.appendChild(badge);
      }

      if (off) {
        const line = d.createElementNS(SVG_NS, 'line');
        [['x1', at.x], ['y1', at.y], ['x2', x], ['y2', y]].forEach(([k, v]) => line.setAttribute(k as string, String(v)));
        line.setAttribute('stroke', '#0c3133');
        line.setAttribute('stroke-width', '1');
        line.setAttribute('stroke-opacity', '0.6');
        const dot = d.createElementNS(SVG_NS, 'circle');
        dot.setAttribute('cx', String(at.x));
        dot.setAttribute('cy', String(at.y));
        dot.setAttribute('r', '3');
        dot.setAttribute('fill', pin.resolved ? RESOLVED : ACCENT);
        dot.setAttribute('stroke', '#fff');
        dot.setAttribute('stroke-width', '1');
        links.append(line, dot);
      }
    }
  }, []);

  /** Shapes: rebuilt when they change, which is rare next to scrolling. */
  const paintShapes = useCallback(() => {
    const d = doc();
    if (!d?.documentElement) return;
    const { shapes: svg } = ensureLayer(d);
    const { w, h } = boxRef.current;
    svg.replaceChildren();
    svg.setAttribute('width', String(w));
    svg.setAttribute('height', String(h));
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);

    const commenting = s.current.mode === 'comment';
    const erasing = commenting && s.current.tool === 'eraser';

    // In comment mode the overlay swallows every pointer event before the page
    // sees it. Without this the site underneath stays live while you annotate:
    // buttons depress, menus open, and a mis-aimed pin navigates you away.
    // Blocking `click` alone was not enough — mousedown/pointerdown reached the
    // page first, so widgets reacted before the click was ever cancelled.
    const cursor = commenting ? (s.current.tool ? DRAWING_PENCIL_CURSOR : COMMENT_PIN_CURSOR) : '';
    // Size goes inline and !important: the width/height attributes lose to any
    // site rule, and one as common as `svg { max-width: 100% }` collapsed the
    // overlay to 0×0 inside its zero-sized layer — so there was nothing to
    // draw on, and the markup was clipped away with it.
    svg.setAttribute(
      'style',
      `position:absolute!important;left:0!important;top:0!important;display:block!important;` +
      `width:${w}px!important;height:${h}px!important;min-width:0!important;min-height:0!important;` +
      `max-width:none!important;max-height:none!important;overflow:visible!important;` +
      `pointer-events:${commenting ? 'auto' : 'none'}!important;${cursor ? `cursor:${cursor}!important;` : ''}`
    );

    // "Browse the site normally" means exactly that: no pins and no markup
    // laid over the page. Annotations belong to comment mode.
    if (!commenting || !w || !h) return;

    // A saved drawing was normalised against the page as it was when drawn.
    // Draw it at that size, then move it by however far its pin's element has
    // moved since, so the markup travels with what it marks.
    if (s.current.settled && s.current.drawnShapes.length) {
      const activeId = s.current.selectedPinId ?? s.current.hoveredPin;
      const owner = s.current.pins.find((p) => p.id === activeId);
      // The drawing's own frame when the pin has been dragged off it.
      const a = owner?.anchor?.shapes ?? owner?.anchor;
      const at = owner?.anchor?.shapes
        ? resolveAnchor(d, owner.anchor.shapes, { x: owner.x, y: owner.y }, { w, h }, elCache.current)
        : owner ? truePos.current.get(owner.id) : undefined;
      const group = d.createElementNS(SVG_NS, 'g');
      let sw = w, sh = h;
      if (a?.docWidth && a.docHeight && a.pageX != null && a.pageY != null && at && !at.fixed) {
        sw = a.docWidth;
        sh = a.docHeight;
        group.setAttribute('transform', `translate(${at.x - a.pageX} ${at.y - a.pageY})`);
      }
      for (const shape of s.current.drawnShapes) {
        const node = buildShapeNode(d, shape, sw, sh);
        if (node) group.appendChild(node);
      }
      svg.appendChild(group);
    }

    // Only strokes not yet attached to a comment can be erased. A saved
    // drawing belongs to somebody's comment, and removing it is the undo
    // path's job, which confirms before it takes a comment down with it.
    for (const shape of s.current.pendingShapes) {
      const node = buildShapeNode(d, shape, w, h);
      if (!node) continue;
      if (erasing && s.current.onEraseShape) {
        node.setAttribute('style', `${node.getAttribute('style') ?? ''};pointer-events:auto!important;cursor:pointer!important`);
        node.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          s.current.onEraseShape?.(shape.id);
        });
      }
      svg.appendChild(node);
    }
  }, []);

  /** Full repaint: measure, then pins (shapes read their positions), then shapes. */
  const paint = useCallback(() => {
    const d = doc();
    if (!d?.documentElement) return;
    const box = docBox();
    boxRef.current = box;
    syncAnchor(box);
    layoutPins();
    paintShapes();
  }, [docBox, syncAnchor, layoutPins, paintShapes]);

  /** Coalesces bursts (mutations, resizes) into one repaint per frame. */
  const ticking = useRef(false);
  const schedule = useCallback((full = true) => {
    if (full) elCache.current.clear();
    if (ticking.current) return;
    ticking.current = true;
    const done = () => { ticking.current = false; paint(); };
    let raf = 0;
    try { raf = requestAnimationFrame(done); } catch { /* hidden tab */ }
    setTimeout(() => { if (ticking.current) { try { cancelAnimationFrame(raf); } catch {} done(); } }, 100);
  }, [paint]);

  /**
   * Scrolling moves nothing in document space, so it only re-syncs the modal
   * anchor and whatever is attached to fixed or sticky elements.
   */
  const scrollTick = useRef(false);
  const onScroll = useCallback(() => {
    if (scrollTick.current) return;
    scrollTick.current = true;
    requestAnimationFrame(() => {
      scrollTick.current = false;
      syncAnchor(boxRef.current);
      const hasPinned = Array.from(truePos.current.values()).some((p) => p.fixed) ||
        s.current.pins.some((p) => p.anchor?.fixed);
      if (hasPinned || elCache.current.size) layoutPins();
    });
  }, [syncAnchor, layoutPins]);

  // ── settling: wait for the layout to stop moving before placing pins ────
  const settleRun = useRef(0);
  const settle = useCallback(() => {
    const run = ++settleRun.current;
    setSettled(false);
    const d = doc();
    if (!d?.defaultView) return;
    const started = Date.now();
    const fonts = (d as Document & { fonts?: FontFaceSet }).fonts;
    const fontsReady = fonts?.ready
      ? Promise.race([fonts.ready, new Promise((r) => setTimeout(r, 2000))])
      : Promise.resolve();
    let last = -1;
    let stable = 0;
    fontsReady.then(() => {
      const tick = () => {
        if (settleRun.current !== run) return;
        const { h } = docBox();
        stable = h === last ? stable + 1 : 0;
        last = h;
        if (stable >= SETTLE_STABLE_STEPS || Date.now() - started > SETTLE_MAX_MS) {
          setSettled(true);
          return;
        }
        setTimeout(tick, SETTLE_STEP_MS);
      };
      tick();
    });
  }, [docBox]);

  // ── images that did not load, so a broken page is not a silent one ──────
  const countBroken = useCallback(() => {
    const d = doc();
    if (!d) return;
    const broken = Array.from(d.images).filter((img) => {
      const src = (img.getAttribute('src') || '').trim();
      return src && !src.startsWith('data:') && img.complete && img.naturalWidth === 0;
    });
    setBrokenImages(broken.length);
  }, []);

  // ── drawing on the framed document ──────────────────────────────────────
  const attachDrawing = useCallback((d: Document) => {
    let active: Shape | null = null;
    let startX = 0, startY = 0;
    let startAnchor: PinAnchor | undefined;

    const point = (e: MouseEvent) => {
      const view = d.defaultView!;
      return { x: e.clientX + view.scrollX, y: e.clientY + view.scrollY };
    };

    const onDown = (ev: Event) => {
      const e = ev as MouseEvent;
      const t = s.current.tool;
      if (s.current.mode !== 'comment' || !t || t === 'eraser' || !s.current.canDraw) return;
      const target = e.target as Element | null;
      // Anything but a pin starts a stroke, so a site element stacked above the
      // overlay cannot swallow the gesture; a pin must stay clickable.
      if (target?.closest?.('[data-rv-pin]')) return;
      e.preventDefault();
      e.stopPropagation();

      const p = point(e);
      startX = p.x; startY = p.y;
      const box = docBox();
      boxRef.current = box;
      startAnchor = buildAnchor(d, p.x, p.y, anchorContext(box));
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
      const { w, h } = boxRef.current;
      const svg = d.querySelector(`#${LAYER_ID} [data-rv-shapes]`);
      if (svg && w && h) {
        svg.querySelectorAll('[data-preview]').forEach((n) => n.remove());
        const node = buildShapeNode(d, normalizeShape({ ...active } as Shape, w, h), w, h);
        if (node) { node.setAttribute('data-preview', '1'); svg.appendChild(node); }
      }
    };

    const onUp = () => {
      if (!active) return;
      const { w, h } = boxRef.current;
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
      }, startAnchor);
      schedule();
    };

    d.addEventListener('mousedown', onDown, true);
    d.addEventListener('mousemove', onMove, true);
    d.addEventListener('mouseup', onUp, true);
  }, [docBox, schedule]);

  /** A proxied link or form address → the site address it stands for. */
  const siteAddress = (raw: string): URL | null => {
    const parsed = fromProxyPath(raw);
    if (parsed) return parsed.target;
    try {
      const u = new URL(raw, currentPageUrl());
      if (u.origin === window.location.origin) return new URL(u.pathname + u.search + u.hash, new URL(currentPageUrl()).origin);
      return u;
    } catch {
      return null;
    }
  };

  const sameSite = (a: URL, b: string) => {
    try {
      const x = a.hostname.toLowerCase().replace(/^www\./, '');
      const y = new URL(b).hostname.toLowerCase().replace(/^www\./, '');
      return x === y || x.endsWith(`.${y}`);
    } catch {
      return false;
    }
  };

  // ── frame wiring ────────────────────────────────────────────────────────
  const handleLoad = useCallback(() => {
    setIsLoading(false);
    const d = doc();
    if (!d) { setLoadError('This page could not be opened inside the review.'); return; }
    // A new document: nothing cached from the last one still points anywhere.
    elCache.current.clear();
    pinNodes.current.clear();

    d.addEventListener('click', (ev) => {
      const e = ev as MouseEvent;
      const { mode: m, tool: t, canComment: allowed } = s.current;

      if (m === 'comment') {
        // With a tool selected the drawing handlers own the gesture.
        if (t) return;
        if (!allowed) return;
        // A click on a pin is that pin's business — it selects or drags. Any
        // other click, including one on the overlay itself (which is what the
        // reviewer is actually clicking now that it covers the page), places a
        // new pin.
        const target = e.target as HTMLElement | null;
        if (target?.closest?.('[data-rv-pin]')) return;
        e.preventDefault();
        e.stopPropagation();
        const box = docBox();
        boxRef.current = box;
        if (!box.w || !box.h) return;
        const view = d.defaultView!;
        const px = e.clientX + view.scrollX;
        const py = e.clientY + view.scrollY;
        s.current.onPlacePin(
          Math.max(0, Math.min(100, (px / box.w) * 100)),
          Math.max(0, Math.min(100, (py / box.h) * 100)),
          buildAnchor(d, px, py, anchorContext(box)),
        );
        return;
      }

      const link = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!link) return;
      const raw = link.getAttribute('href') ?? '';
      if (!raw || raw.startsWith('#') || /^javascript:/i.test(raw)) return;
      const target = siteAddress(link.href);
      if (!target || (target.protocol !== 'http:' && target.protocol !== 'https:')) return;
      // Same page, different fragment: let the page scroll itself.
      if (target.hash && samePage(target.toString(), currentPageUrl())) return;
      e.preventDefault();
      e.stopPropagation();
      // Another site cannot open in the review; it opens beside it.
      if (link.target === '_blank' || !sameSite(target, currentPageUrl())) {
        window.open(target.toString(), '_blank', 'noopener');
        return;
      }
      navigate(target.toString());
    }, true);

    d.addEventListener('submit', (ev) => {
      const form = ev.target as HTMLFormElement | null;
      if (!form) return;
      const method = (form.getAttribute('method') ?? 'get').toLowerCase();
      const target = siteAddress(form.action || currentPageUrl());
      ev.preventDefault();
      ev.stopPropagation();
      if (!target) return;
      if (method === 'get') {
        for (const [k, v] of new FormData(form).entries()) if (typeof v === 'string') target.searchParams.set(k, v);
        navigate(target.toString());
      }
      // POSTs are never replayed: submitting a real form on the client's site
      // from a review tool is a side effect nobody asked for.
    }, true);

    attachDrawing(d);
    paint();
    settle();

    const view = d.defaultView;
    view?.addEventListener('scroll', onScroll, true);
    view?.addEventListener('resize', () => schedule());
    let brokenTimer: number | undefined;
    d.addEventListener('error', (ev) => {
      if ((ev.target as Element | null)?.tagName !== 'IMG') return;
      if (brokenTimer) view?.clearTimeout(brokenTimer);
      brokenTimer = view?.setTimeout(countBroken, 600);
    }, true);
    try {
      if (view?.ResizeObserver) {
        const ro = new view.ResizeObserver(() => schedule());
        ro.observe(d.documentElement);
        if (d.body) ro.observe(d.body);
      }
      if (view?.MutationObserver && d.body) {
        let t: number | undefined;
        const mo = new view.MutationObserver(() => { if (t) view.clearTimeout(t); t = view.setTimeout(() => schedule(), 150); });
        mo.observe(d.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
      }
    } catch { /* observers are a nicety, not a requirement */ }
  }, [attachDrawing, countBroken, docBox, navigate, onScroll, paint, schedule, settle]);

  // ── the page reports where it really is (redirects, client-side routes) ─
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (!frameRef.current || e.source !== frameRef.current.contentWindow) return;
      const data = e.data as { __rv?: string; url?: unknown } | null;
      if (!data || data.__rv !== 'url' || typeof data.url !== 'string') return;
      const previous = reportedUrlRef.current;
      reportedUrlRef.current = data.url;
      if (!samePage(data.url, s.current.url)) s.current.onUrlChange(data.url);
      // A client-side route swapped the content under the pins: place them again.
      if (previous && !samePage(previous, data.url)) {
        elCache.current.clear();
        settle();
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [settle]);

  useEffect(() => {
    if (settled) countBroken();
  }, [settled, countBroken]);

  useEffect(() => { layoutPins(); paintShapes(); }, [pins, selectedPinId, hoveredPin, settled, device, mode, layoutPins, paintShapes]);
  useEffect(() => { paintShapes(); }, [drawnShapes, pendingShapes, tool, paintShapes]);

  // Selecting a comment brings its pin into view — from the sidebar the pin
  // may be a long way down the page — and pulses it so the eye finds it.
  useEffect(() => {
    if (!settled || !selectedPinId || mode !== 'comment') return;
    const d = doc();
    const view = d?.defaultView;
    const pos = shownPos.current.get(selectedPinId);
    if (!view || !pos) return;
    const top = view.scrollY;
    if (pos.y < top + 60 || pos.y > top + view.innerHeight - 60) {
      view.scrollTo({ top: Math.max(0, pos.y - view.innerHeight / 2), behavior: 'smooth' });
    }
    const node = pinNodes.current.get(selectedPinId);
    if (node) {
      node.classList.remove('rv-pulse');
      void node.offsetWidth;
      node.classList.add('rv-pulse');
    }
  }, [selectedPinId, settled, mode]);

  // A page the review has not seen before is no longer a dead end: commenting
  // on one registers it (workspace's handleAddComment), so the reviewer can
  // walk the whole site and mark up whatever they find. Comment mode therefore
  // survives navigation instead of snapping back to browsing.

  useEffect(() => {
    const d = doc();
    if (!d?.documentElement) return;
    // The overlay carries the cursor for the area it covers; this catches the
    // rest of the viewport when the document is shorter than the frame.
    d.documentElement.style.cursor =
      mode === 'comment' ? (tool ? DRAWING_PENCIL_CURSOR : COMMENT_PIN_CURSOR) : '';
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
  const pinsPending = mode === 'comment' && !isLoading && !settled && pins.length > 0;

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
      if (!sameSite(next, url)) return null;
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
      {/*
        Mode and drawing tools share one centred bar, laid out and styled like
        the image workspace's toolbar, and it stays up in fullscreen there too.
      */}
      {canComment && (
        <div className={`relative px-4 py-2 border-b shrink-0 z-30 flex items-center justify-center gap-4 ${isFullscreen ? 'bg-zinc-900 border-zinc-700' : 'bg-background border-border/50'}`}>
          <div className="flex items-center gap-0.5 bg-white/90 backdrop-blur-sm border border-gray-200 rounded-lg shadow-sm px-1 py-1">
            <IconTooltip label="Browse the site normally">
              <button type="button" onClick={() => setModeSafely('browse')} aria-pressed={mode === 'browse'}
                className={`px-2.5 py-2 rounded-md flex items-center gap-1.5 text-xs font-medium transition-all ${mode === 'browse' ? 'bg-accent text-accent-foreground shadow-inner' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'}`}>
                <MousePointer2 className="h-4 w-4" />Browse
              </button>
            </IconTooltip>
            <IconTooltip label={isTrackedPage ? 'Click the page to comment, or pick a drawing tool' : 'Comment here — this page joins the review automatically'}>
              <button type="button" onClick={() => setModeSafely('comment')} aria-pressed={mode === 'comment'}
                className={`px-2.5 py-2 rounded-md flex items-center gap-1.5 text-xs font-medium transition-all ${mode === 'comment' ? 'bg-accent text-accent-foreground shadow-inner' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'}`}>
                <MessageSquarePlus className="h-4 w-4" />Comment
              </button>
            </IconTooltip>
          </div>

          {/* Picking a tool switches to comment mode itself, so the palette is
              always on show rather than a reward for finding the toggle. */}
          {canDraw && (
            <div className={`pl-4 border-l ${isFullscreen ? 'border-zinc-600' : 'border-border/50'}`}>
              <DrawingToolbar
                activeTool={tool}
                onToolSelect={pickTool}
                onUndo={onUndoShape}
                canUndo={canUndo}
                showEraser={!!onEraseShape}
              />
            </div>
          )}

          {/* Out of the flow so it never pushes the controls off centre. */}
          {mode === 'comment' && !isFullscreen && (
            <span className="absolute right-4 top-1/2 -translate-y-1/2 max-w-56 text-right text-[11px] leading-tight text-muted-foreground hidden 2xl:block">
              {tool ? 'Drag on the page to mark it up.' : 'Click the page to drop a comment pin.'}
              {!isTrackedPage && ' This page joins the review when you save.'}
            </span>
          )}
        </div>
      )}

      {isFullscreen && onToggleFullscreen && (
        <button onClick={onToggleFullscreen} aria-label="Exit fullscreen"
          className="absolute top-2 right-3 z-40 h-8 w-8 flex items-center justify-center rounded-md bg-black/60 text-white hover:bg-black/80">
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
                key={`${proxySrc}#${reloadNonce}`}
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
              {isLoading && proxySrc && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/70 pointer-events-none">
                  <span className="flex items-center gap-2 rounded-full bg-background/95 border border-border/60 shadow-sm px-3 py-1.5 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />Loading page…
                  </span>
                </div>
              )}
              {pinsPending && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-none">
                  <span className="flex items-center gap-2 rounded-full bg-background/95 border border-border/60 shadow-sm px-3 py-1 text-[11px] text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />Placing pins…
                  </span>
                </div>
              )}
              {brokenImages > 0 && !brokenDismissed && !isLoading && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full bg-background/95 border border-border/60 shadow-sm pl-3 pr-1.5 py-1 text-[11px] text-muted-foreground">
                  <ImageOff className="h-3.5 w-3.5 shrink-0" />
                  <span>{brokenImages} {brokenImages === 1 ? 'image' : 'images'} couldn&rsquo;t load</span>
                  <button type="button" onClick={reload} className="font-medium text-accent hover:underline">Retry</button>
                  <button type="button" onClick={() => setBrokenDismissed(true)} aria-label="Dismiss" className="p-0.5 rounded hover:bg-muted"><X className="h-3 w-3" /></button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
