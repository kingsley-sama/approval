'use client';

import React, { useMemo, useRef, useState } from 'react';
import { Stage, Layer, Line, Rect, Arrow } from 'react-konva';
import Konva from 'konva';
import type {
  DrawingTool,
  Shape,
  FreehandShape,
  RectangleShape,
  ArrowShape,
  LineShape,
  HighlightShape,
  Point,
} from '@/types/drawing';
import { nanoid } from 'nanoid';
import { denormalizeShape } from '@/lib/drawing';

/**
 * Fully-controlled drawing canvas.
 * - `shapes` prop drives what is rendered (caller manages the list).
 * - `onShapeComplete(shape)` fires when the user finishes drawing a new shape.
 *   The caller decides whether to keep it (after comment confirmed) or discard it.
 * - `currentTool / currentColor / strokeWidth / isEnabled` control drawing mode.
 */

interface DrawingCanvasProps {
  imageWidth: number;
  imageHeight: number;
  /** All shapes to render (saved + pending). Caller-managed. */
  shapes: Shape[];
  currentTool: DrawingTool;
  currentColor: string;
  strokeWidth: number;
  isEnabled: boolean;
  /** Called when the user finishes drawing a new shape. */
  onShapeComplete?: (shape: Shape) => void;
  /**
   * Ids of shapes the eraser may remove — in practice the strokes not yet
   * attached to a comment. Anything outside this set stays untouchable, so a
   * stray eraser click cannot take somebody's saved annotation with it.
   */
  erasableIds?: ReadonlySet<string>;
  onEraseShape?: (shapeId: string) => void;
}

function DrawingCanvasInner({
  imageWidth,
  imageHeight,
  shapes,
  currentTool,
  currentColor,
  strokeWidth,
  isEnabled,
  onShapeComplete,
  erasableIds,
  onEraseShape,
}: DrawingCanvasProps) {
  const erasing = isEnabled && currentTool === 'eraser' && !!onEraseShape;
  const [currentShape, setCurrentShape] = useState<Shape | null>(null);
  const startPoint = useRef<Point>({ x: 0, y: 0 });

  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!isEnabled || currentTool === 'eraser') return;
    const point = e.target.getStage()?.getPointerPosition();
    if (!point) return;

    startPoint.current = point;

    const base = {
      id: nanoid(),
      color: currentColor,
      strokeWidth,
      createdAt: new Date().toISOString(),
    };

    if (currentTool === 'pen') {
      setCurrentShape({ ...base, type: 'pen', points: [point.x, point.y] } as FreehandShape);
    } else if (currentTool === 'rectangle') {
      setCurrentShape({ ...base, type: 'rectangle', x: point.x, y: point.y, width: 0, height: 0 } as RectangleShape);
    } else if (currentTool === 'arrow') {
      setCurrentShape({ ...base, type: 'arrow', points: [point.x, point.y, point.x, point.y], pointerLength: 10, pointerWidth: 10 } as ArrowShape);
    } else if (currentTool === 'line') {
      setCurrentShape({ ...base, type: 'line', points: [point.x, point.y, point.x, point.y] } as LineShape);
    } else if (currentTool === 'highlight') {
      setCurrentShape({ ...base, type: 'highlight', x: point.x, y: point.y, width: 0, height: 0, opacity: 0.3 } as HighlightShape);
    }
  };

  const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!currentShape || !isEnabled) return;
    const point = e.target.getStage()?.getPointerPosition();
    if (!point) return;

    if (currentShape.type === 'pen') {
      // Skip points closer than 2px to the last one — high-resolution mice fire
      // far more moves than needed, bloating both render cost and stored JSON.
      const pts = currentShape.points;
      const lastX = pts[pts.length - 2];
      const lastY = pts[pts.length - 1];
      if (Math.hypot(point.x - lastX, point.y - lastY) < 2) return;
      setCurrentShape({ ...currentShape, points: [...pts, point.x, point.y] });
    } else if (currentShape.type === 'rectangle') {
      setCurrentShape({ ...currentShape, width: point.x - currentShape.x, height: point.y - currentShape.y });
    } else if (currentShape.type === 'arrow' || currentShape.type === 'line') {
      setCurrentShape({ ...currentShape, points: [startPoint.current.x, startPoint.current.y, point.x, point.y] });
    } else if (currentShape.type === 'highlight') {
      setCurrentShape({ ...currentShape, width: point.x - currentShape.x, height: point.y - currentShape.y });
    }
  };

  const handleMouseUp = () => {
    if (!currentShape) return;
    onShapeComplete?.(currentShape);
    setCurrentShape(null);
  };

  const renderShape = (shape: Shape, key: string) => {
    // A thin stroke is a small target, so the eraser gets a generous hit area
    // without changing what is painted.
    const target = erasing && erasableIds?.has(shape.id);
    const hit = target
      ? {
          listening: true,
          hitStrokeWidth: Math.max(shape.strokeWidth ?? 3, 14),
          onClick: () => onEraseShape?.(shape.id),
          onTap: () => onEraseShape?.(shape.id),
          onMouseEnter: (e: Konva.KonvaEventObject<MouseEvent>) => {
            const stage = e.target.getStage();
            if (stage) stage.container().style.cursor = 'pointer';
          },
          onMouseLeave: (e: Konva.KonvaEventObject<MouseEvent>) => {
            const stage = e.target.getStage();
            if (stage) stage.container().style.cursor = '';
          },
          opacity: 0.75,
        }
      : { listening: false };


    if (shape.type === 'pen') {
      return <Line key={key} {...hit} points={shape.points} stroke={shape.color} strokeWidth={shape.strokeWidth} lineCap="round" lineJoin="round" tension={0.5} />;
    } else if (shape.type === 'rectangle') {
      return <Rect key={key} {...hit} x={shape.x} y={shape.y} width={shape.width} height={shape.height} stroke={shape.color} strokeWidth={shape.strokeWidth} fill={shape.fill} />;
    } else if (shape.type === 'arrow') {
      return <Arrow key={key} {...hit} points={shape.points} stroke={shape.color} strokeWidth={shape.strokeWidth} pointerLength={shape.pointerLength} pointerWidth={shape.pointerWidth} fill={shape.color} />;
    } else if (shape.type === 'line') {
      return <Line key={key} {...hit} points={shape.points} stroke={shape.color} strokeWidth={shape.strokeWidth} lineCap="round" lineJoin="round" />;
    } else if (shape.type === 'highlight') {
      return <Rect key={key} {...hit} x={shape.x} y={shape.y} width={shape.width} height={shape.height} fill={shape.color} opacity={target ? 0.5 : shape.opacity} />;
    }
    return null;
  };

  // Denormalize saved shapes once per shapes/size change rather than on every
  // render — while drawing, each mousemove re-renders this component and would
  // otherwise re-convert the entire saved shape list.
  const denormalizedShapes = useMemo(
    () => shapes.map(s => denormalizeShape(s, imageWidth, imageHeight)),
    [shapes, imageWidth, imageHeight]
  );

  return (
    <Stage
      width={imageWidth}
      height={imageHeight}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      <Layer>
        {denormalizedShapes.map((s, index) => renderShape(s, `${s.id}_${index}`))}
        {currentShape && renderShape(currentShape, '__current__')}
      </Layer>
    </Stage>
  );
}

export default React.memo(DrawingCanvasInner);
