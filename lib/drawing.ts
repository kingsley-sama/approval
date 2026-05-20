/**
 * Shape coordinate helpers.
 *
 * New shapes are stored as fractions (0..1) of the canvas/rendered-image
 * dimensions so they remain correctly placed across any zoom level. Shapes
 * created before this change have raw pixel coords and are rendered as-is
 * (their position is only correct at the zoom level they were drawn at —
 * legacy behavior preserved).
 */

import type { Shape } from '@/types/drawing';

function safeDiv(n: number, d: number): number {
  return d > 0 ? n / d : 0;
}

export function normalizeShape(shape: Shape, w: number, h: number): Shape {
  if (shape.normalized) return shape;
  if (w <= 0 || h <= 0) return shape;

  if (shape.type === 'pen') {
    return {
      ...shape,
      normalized: true,
      points: shape.points.map((v, i) => (i % 2 === 0 ? safeDiv(v, w) : safeDiv(v, h))),
    };
  }
  if (shape.type === 'rectangle' || shape.type === 'highlight') {
    return {
      ...shape,
      normalized: true,
      x: safeDiv(shape.x, w),
      y: safeDiv(shape.y, h),
      width: safeDiv(shape.width, w),
      height: safeDiv(shape.height, h),
    };
  }
  if (shape.type === 'arrow') {
    const [x1, y1, x2, y2] = shape.points;
    return {
      ...shape,
      normalized: true,
      points: [safeDiv(x1, w), safeDiv(y1, h), safeDiv(x2, w), safeDiv(y2, h)],
    };
  }
  return shape;
}

export function denormalizeShape(shape: Shape, w: number, h: number): Shape {
  if (!shape.normalized) return shape;

  if (shape.type === 'pen') {
    return {
      ...shape,
      points: shape.points.map((v, i) => (i % 2 === 0 ? v * w : v * h)),
    };
  }
  if (shape.type === 'rectangle' || shape.type === 'highlight') {
    return {
      ...shape,
      x: shape.x * w,
      y: shape.y * h,
      width: shape.width * w,
      height: shape.height * h,
    };
  }
  if (shape.type === 'arrow') {
    const [x1, y1, x2, y2] = shape.points;
    return {
      ...shape,
      points: [x1 * w, y1 * h, x2 * w, y2 * h],
    };
  }
  return shape;
}

/**
 * Shift a shape's geometry. For normalized shapes pass fractional deltas
 * (a value of 0.1 means "10% of the canvas"); for legacy pixel shapes pass
 * pixel deltas.
 */
export function shiftShape(shape: Shape, dxPx: number, dyPx: number, dxFrac: number, dyFrac: number): Shape {
  const useFrac = shape.normalized === true;
  const dx = useFrac ? dxFrac : dxPx;
  const dy = useFrac ? dyFrac : dyPx;

  if (shape.type === 'pen') {
    return {
      ...shape,
      points: shape.points.map((v, i) => (i % 2 === 0 ? v + dx : v + dy)),
    };
  }
  if (shape.type === 'rectangle' || shape.type === 'highlight') {
    return { ...shape, x: shape.x + dx, y: shape.y + dy };
  }
  if (shape.type === 'arrow') {
    const [x1, y1, x2, y2] = shape.points;
    return { ...shape, points: [x1 + dx, y1 + dy, x2 + dx, y2 + dy] };
  }
  return shape;
}

export function shiftDrawingData(
  drawingData: Shape | Shape[] | undefined,
  dxPx: number,
  dyPx: number,
  dxFrac: number,
  dyFrac: number,
): Shape | Shape[] | undefined {
  if (drawingData == null) return drawingData;
  if (Array.isArray(drawingData)) {
    return drawingData.map(s => shiftShape(s, dxPx, dyPx, dxFrac, dyFrac));
  }
  return shiftShape(drawingData, dxPx, dyPx, dxFrac, dyFrac);
}
