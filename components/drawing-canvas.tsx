'use client';

import React, { useRef, useState } from 'react';
import { Stage, Layer, Line, Rect, Arrow } from 'react-konva';
import Konva from 'konva';
import type {
  DrawingTool,
  Shape,
  FreehandShape,
  RectangleShape,
  ArrowShape,
  HighlightShape,
  Point,
} from '@/types/drawing';
import { nanoid } from 'nanoid';

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
}: DrawingCanvasProps) {
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
    } else if (currentTool === 'highlight') {
      setCurrentShape({ ...base, type: 'highlight', x: point.x, y: point.y, width: 0, height: 0, opacity: 0.3 } as HighlightShape);
    }
  };

  const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!currentShape || !isEnabled) return;
    const point = e.target.getStage()?.getPointerPosition();
    if (!point) return;

    if (currentShape.type === 'pen') {
      setCurrentShape({ ...currentShape, points: [...currentShape.points, point.x, point.y] });
    } else if (currentShape.type === 'rectangle') {
      setCurrentShape({ ...currentShape, width: point.x - currentShape.x, height: point.y - currentShape.y });
    } else if (currentShape.type === 'arrow') {
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
    if (shape.type === 'pen') {
      return <Line key={key} points={shape.points} stroke={shape.color} strokeWidth={shape.strokeWidth} lineCap="round" lineJoin="round" tension={0.5} />;
    } else if (shape.type === 'rectangle') {
      return <Rect key={key} x={shape.x} y={shape.y} width={shape.width} height={shape.height} stroke={shape.color} strokeWidth={shape.strokeWidth} fill={shape.fill} />;
    } else if (shape.type === 'arrow') {
      return <Arrow key={key} points={shape.points} stroke={shape.color} strokeWidth={shape.strokeWidth} pointerLength={shape.pointerLength} pointerWidth={shape.pointerWidth} fill={shape.color} />;
    } else if (shape.type === 'highlight') {
      return <Rect key={key} x={shape.x} y={shape.y} width={shape.width} height={shape.height} fill={shape.color} opacity={shape.opacity} />;
    }
    return null;
  };

  return (
    <Stage
      width={imageWidth}
      height={imageHeight}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      <Layer>
        {shapes.map((s, index) => renderShape(s, `${s.id}_${index}`))}
        {currentShape && renderShape(currentShape, '__current__')}
      </Layer>
    </Stage>
  );
}

export default React.memo(DrawingCanvasInner);
