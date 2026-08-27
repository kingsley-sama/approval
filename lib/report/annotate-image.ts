/**
 * Burns pins and drawing markup into a flat image, server-side.
 *
 * The workspace draws these with Konva in the browser; a downloadable report
 * has no browser, so the same geometry is rebuilt as an SVG overlay and
 * composited onto the stored image with sharp.
 */

import type { Shape } from '@/types/drawing';
import { denormalizeShape } from '@/lib/drawing';

/** Wide enough to read small type in the PDF without making the file huge. */
const RENDER_WIDTH = 1600;

/**
 * Stroke widths are stored in the pixels of whatever canvas the shape was
 * drawn on, and that canvas width is not persisted alongside the shape. The
 * viewer renders an image at roughly this width, so it is the best available
 * reference for scaling strokes up to the report's resolution. Approximate by
 * necessity — geometry is exact, stroke weight is proportional.
 */
const REFERENCE_CANVAS_WIDTH = 1000;

export interface ReportPin {
  number: number;
  /** Percentages, 0–100, as stored on markup_comments. */
  x: number;
  y: number;
  resolved: boolean;
  shapes: Shape[];
}

const PIN_ACTIVE = '#ff6137';
const PIN_RESOLVED = '#649256';

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Only allow colours we can safely inline into SVG. */
function safeColor(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  return /^#[0-9a-fA-F]{3,8}$/.test(value) || /^rgba?\([\d.,\s%]+\)$/.test(value) ? value : fallback;
}

const n = (v: number) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : 0);

function shapeToSvg(shape: Shape, w: number, h: number, strokeScale: number): string {
  // Normalized shapes are fractions of the canvas; legacy ones are raw pixels
  // and are drawn as-is, exactly as the viewer treats them.
  const s = denormalizeShape(shape, w, h);
  const stroke = safeColor(s.color, '#ff0000');
  const width = Math.max(1, (s.strokeWidth || 2) * (shape.normalized ? strokeScale : 1));
  const common = `stroke="${stroke}" stroke-width="${n(width)}" fill="none" stroke-linecap="round" stroke-linejoin="round"`;

  switch (s.type) {
    case 'pen': {
      const pts = s.points;
      if (pts.length < 4) return '';
      const d = pts.reduce((acc, v, i) => (i % 2 === 0 ? `${acc} ${i === 0 ? 'M' : 'L'} ${n(v)}` : `${acc} ${n(v)}`), '');
      return `<path d="${d.trim()}" ${common} />`;
    }
    case 'line': {
      const [x1, y1, x2, y2] = s.points;
      return `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" ${common} />`;
    }
    case 'arrow': {
      const [x1, y1, x2, y2] = s.points;
      const angle = Math.atan2(y2 - y1, x2 - x1);
      // Konva scales the head with the stroke; mirror that so exported arrows
      // keep the proportions they had on screen.
      const len = (s.pointerLength || 10) * (shape.normalized ? strokeScale : 1);
      const half = ((s.pointerWidth || 10) * (shape.normalized ? strokeScale : 1)) / 2;
      const bx = x2 - Math.cos(angle) * len;
      const by = y2 - Math.sin(angle) * len;
      const p1 = `${n(bx - Math.sin(angle) * half)},${n(by + Math.cos(angle) * half)}`;
      const p2 = `${n(bx + Math.sin(angle) * half)},${n(by - Math.cos(angle) * half)}`;
      return (
        `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(bx)}" y2="${n(by)}" ${common} />` +
        `<polygon points="${n(x2)},${n(y2)} ${p1} ${p2}" fill="${stroke}" />`
      );
    }
    case 'rectangle': {
      const fill = s.fill ? safeColor(s.fill, 'none') : 'none';
      return `<rect x="${n(s.x)}" y="${n(s.y)}" width="${n(s.width)}" height="${n(s.height)}" stroke="${stroke}" stroke-width="${n(width)}" fill="${fill}" />`;
    }
    case 'highlight': {
      const opacity = typeof s.opacity === 'number' ? Math.max(0, Math.min(1, s.opacity)) : 0.3;
      return `<rect x="${n(s.x)}" y="${n(s.y)}" width="${n(s.width)}" height="${n(s.height)}" fill="${stroke}" fill-opacity="${opacity}" />`;
    }
    default:
      return '';
  }
}

function pinToSvg(pin: ReportPin, w: number, h: number, radius: number): string {
  const cx = (pin.x / 100) * w;
  const cy = (pin.y / 100) * h;
  const colour = pin.resolved ? PIN_RESOLVED : PIN_ACTIVE;
  const label = esc(String(pin.number));
  const fontSize = radius * 1.1;
  return (
    `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(radius)}" fill="${colour}" stroke="#ffffff" stroke-width="${n(radius * 0.16)}" />` +
    `<text x="${n(cx)}" y="${n(cy + fontSize * 0.35)}" font-family="Helvetica, Arial, sans-serif" font-size="${n(fontSize)}" font-weight="bold" fill="#ffffff" text-anchor="middle">${label}</text>`
  );
}

export interface AnnotatedImage {
  buffer: Buffer;
  width: number;
  height: number;
}

/**
 * Downloads the stored image, draws every pin and shape onto it, and returns a
 * JPEG. Returns null when the image cannot be fetched or decoded — a report
 * should still be produced for the pages that do work.
 */
export async function renderAnnotatedImage(
  imageUrl: string,
  pins: ReportPin[]
): Promise<AnnotatedImage | null> {
  let sharpFn: typeof import('sharp').default;
  try {
    sharpFn = (await import('sharp')).default;
  } catch (err) {
    console.error('[report] sharp unavailable:', err);
    return null;
  }

  let input: Buffer;
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`status ${res.status}`);
    input = Buffer.from(await res.arrayBuffer());
  } catch (err) {
    console.error('[report] could not fetch image', imageUrl, err);
    return null;
  }

  try {
    const base = sharpFn(input).rotate().flatten({ background: '#ffffff' });
    const meta = await base.metadata();
    if (!meta.width || !meta.height) return null;

    // Cap the width so a 6000px render doesn't bloat the PDF; never upscale.
    const scale = Math.min(1, RENDER_WIDTH / meta.width);
    const w = Math.max(1, Math.round(meta.width * scale));
    const h = Math.max(1, Math.round(meta.height * scale));

    const resized = await base.resize({ width: w, withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();

    if (pins.length === 0) {
      return { buffer: resized, width: w, height: h };
    }

    const strokeScale = w / REFERENCE_CANVAS_WIDTH;
    // Scale pins with the image so they stay legible on both a wide render and
    // a narrow one, within bounds.
    const radius = Math.max(12, Math.min(34, w * 0.017));

    const layers = [
      ...pins.flatMap((p) => p.shapes.map((s) => shapeToSvg(s, w, h, strokeScale))),
      ...pins.map((p) => pinToSvg(p, w, h, radius)),
    ]
      .filter(Boolean)
      .join('');

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${layers}</svg>`;

    const composited = await sharpFn(resized)
      .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
      .jpeg({ quality: 82 })
      .toBuffer();

    return { buffer: composited, width: w, height: h };
  } catch (err) {
    console.error('[report] could not annotate image', imageUrl, err);
    return null;
  }
}
