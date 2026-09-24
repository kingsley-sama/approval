import type { PinAnchor, PinDevice } from '@/lib/website/anchor-schema';

/**
 * Element anchors for pins on a framed website — the DOM half of
 * lib/website/anchor-schema.ts. Runs in the parent page against the framed
 * document, which is same-origin because it is served through the proxy.
 *
 * The selector strategy matches the embed script's (app/embed/v1.js), so a
 * comment left through either one resolves the same way in both.
 */

/**
 * Prefer an id, then a stable-looking data attribute, then a positional path.
 * Classes are skipped on purpose: utility and hashed CSS-module class names
 * change on every build, which is exactly when an anchor must not.
 */
export function cssPath(el: Element): string {
  const doc = el.ownerDocument;
  const esc = (v: string) => (doc.defaultView?.CSS?.escape ?? CSS.escape)(v);
  if (el.id && /^[A-Za-z][\w-]*$/.test(el.id)) return `#${el.id}`;

  const parts: string[] = [];
  let node: Element | null = el;
  let depth = 0;
  while (node && node.nodeType === 1 && node !== doc.documentElement && depth < 8) {
    let seg = node.tagName.toLowerCase();
    const testId = node.getAttribute('data-testid') || node.getAttribute('data-test') || node.getAttribute('data-id');
    if (testId) {
      parts.unshift(`${seg}[data-testid="${esc(testId)}"]`);
      break;
    }
    if (node.id && /^[A-Za-z][\w-]*$/.test(node.id)) {
      parts.unshift(`#${node.id}`);
      break;
    }
    const parent: Element | null = node.parentElement;
    if (parent) {
      const tag = node.tagName;
      const same = Array.from(parent.children).filter((c) => c.tagName === tag);
      if (same.length > 1) seg += `:nth-of-type(${same.indexOf(node) + 1})`;
    }
    parts.unshift(seg);
    node = parent;
    depth++;
  }
  return parts.join(' > ');
}

/** Whether an element lives in a fixed or sticky container. */
export function positioning(el: Element): 'fixed' | 'sticky' | null {
  const view = el.ownerDocument.defaultView;
  if (!view) return null;
  for (let node: Element | null = el; node && node !== el.ownerDocument.documentElement; node = node.parentElement) {
    const pos = view.getComputedStyle(node).position;
    if (pos === 'fixed') return 'fixed';
    if (pos === 'sticky') return 'sticky';
  }
  return null;
}

/**
 * The page element under a point, skipping our own overlay. html/body are not
 * anchors — they are the document, and the pixel fallback covers them.
 */
export function elementAt(doc: Document, clientX: number, clientY: number, overlayId: string): Element | null {
  const stack = doc.elementsFromPoint(clientX, clientY);
  for (const el of stack) {
    if (el.closest(`#${overlayId}`)) continue;
    if (el === doc.documentElement || el === doc.body) return null;
    return el;
  }
  return null;
}

function textOf(el: Element): string {
  return (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120);
}

export interface AnchorContext {
  docWidth: number;
  docHeight: number;
  device: PinDevice;
  pageUrl: string;
  overlayId: string;
}

/** Records what is under a click, in document pixels. */
export function buildAnchor(doc: Document, pageX: number, pageY: number, ctx: AnchorContext): PinAnchor {
  const view = doc.defaultView;
  const scrollX = view?.scrollX ?? 0;
  const scrollY = view?.scrollY ?? 0;
  const anchor: PinAnchor = {
    pageX: Math.round(pageX),
    pageY: Math.round(pageY),
    docWidth: Math.round(ctx.docWidth),
    docHeight: Math.round(ctx.docHeight),
    viewportWidth: view?.innerWidth,
    device: ctx.device,
    pageUrl: ctx.pageUrl,
  };

  const el = elementAt(doc, pageX - scrollX, pageY - scrollY, ctx.overlayId);
  if (!el) return anchor;
  const rect = el.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return anchor;

  const selector = cssPath(el);
  // Only keep a selector that finds this element again.
  try {
    if (!selector || doc.querySelector(selector) !== el) return anchor;
  } catch {
    return anchor;
  }

  // 0..100, the same scale the embed script writes into this column.
  const pct = (v: number) => Math.max(0, Math.min(100, v * 100));
  return {
    ...anchor,
    selector,
    xPct: pct((pageX - scrollX - rect.left) / rect.width),
    yPct: pct((pageY - scrollY - rect.top) / rect.height),
    elementText: textOf(el) || undefined,
    fixed: positioning(el) === 'fixed' || undefined,
  };
}

export interface ResolvedPoint {
  /** Document pixels, or viewport pixels when `fixed`. */
  x: number;
  y: number;
  fixed: boolean;
  /** How the point was found — the element, stored pixels, or the old percentage. */
  via: 'element' | 'pixels' | 'percent';
}

/**
 * Where an anchored pin belongs in the current document. `cache` keeps the
 * element lookups between scroll frames; clear it when the DOM changes.
 */
export function resolveAnchor(
  doc: Document,
  anchor: PinAnchor | null | undefined,
  fallbackPct: { x: number; y: number },
  box: { w: number; h: number },
  cache?: Map<string, Element | null>,
): ResolvedPoint {
  const view = doc.defaultView;
  if (anchor?.selector && anchor.xPct != null && anchor.yPct != null) {
    let el: Element | null | undefined = cache?.get(anchor.selector);
    if (el === undefined || (el && !el.isConnected)) {
      try { el = doc.querySelector(anchor.selector); } catch { el = null; }
      cache?.set(anchor.selector, el);
    }
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.width >= 1 && r.height >= 1) {
        const kind = positioning(el);
        const vx = r.left + (anchor.xPct / 100) * r.width;
        const vy = r.top + (anchor.yPct / 100) * r.height;
        if (kind === 'fixed') return { x: vx, y: vy, fixed: true, via: 'element' };
        return { x: vx + (view?.scrollX ?? 0), y: vy + (view?.scrollY ?? 0), fixed: false, via: 'element' };
      }
    }
  }
  if (anchor?.pageY != null && anchor.pageX != null && anchor.docWidth) {
    // Content is usually centred, so scale x with the width; y stays in pixels,
    // because what is above a point does not grow when the page gets longer.
    return { x: (anchor.pageX / anchor.docWidth) * box.w, y: Math.min(anchor.pageY, box.h), fixed: false, via: 'pixels' };
  }
  return { x: (fallbackPct.x / 100) * box.w, y: (fallbackPct.y / 100) * box.h, fixed: false, via: 'percent' };
}

/**
 * Nearby pins pushed apart so every number stays clickable. Returns a display
 * offset per pin id; pins that do not collide are left where they are.
 */
export function fanOut(
  points: Array<{ id: string; x: number; y: number }>,
  threshold = 24,
): Map<string, { dx: number; dy: number }> {
  const out = new Map<string, { dx: number; dy: number }>();
  const used = new Set<string>();
  for (const p of points) {
    if (used.has(p.id)) continue;
    const group = points.filter((q) => !used.has(q.id) && Math.hypot(q.x - p.x, q.y - p.y) < threshold);
    group.forEach((q) => used.add(q.id));
    if (group.length < 2) continue;
    const cx = group.reduce((a, q) => a + q.x, 0) / group.length;
    const cy = group.reduce((a, q) => a + q.y, 0) / group.length;
    const radius = 18 + group.length * 4;
    group.forEach((q, i) => {
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / group.length;
      out.set(q.id, { dx: cx + Math.cos(angle) * radius - q.x, dy: cy + Math.sin(angle) * radius - q.y });
    });
  }
  return out;
}
