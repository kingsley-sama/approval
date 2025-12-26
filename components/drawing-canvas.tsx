/**
 * DrawingCanvas Component
 * Canvas-based drawing layer for image annotations
 * Supports freehand, rectangles, arrows, and highlights with undo/redo
 */

'use client';

import React, { useRef, useState, useEffect } from 'react';
import { Stage, Layer, Line, Rect, Arrow } from 'react-konva';
import Konva from 'konva';
import type {
  DrawingTool,
  Shape,
  DrawingData,
  FreehandShape,
  RectangleShape,
  ArrowShape,
  HighlightShape,
  Point,
} from '@/types/drawing';
import { nanoid } from 'nanoid';

interface DrawingCanvasProps {
  imageWidth: number;
  imageHeight: number;
  initialShapes?: Shape[];
  currentTool: DrawingTool;
  currentColor: string;
  strokeWidth: number;
  isEnabled: boolean;
  onShapesChange?: (shapes: Shape[]) => void;
  onSave?: (data: DrawingData) => void;
}

export default function DrawingCanvas({
  imageWidth,
  imageHeight,
  initialShapes = [],
  currentTool,
  currentColor,
  strokeWidth,
  isEnabled,
  onShapesChange,
  onSave,
}: DrawingCanvasProps) {
  const [shapes, setShapes] = useState<Shape[]>(initialShapes);
  const [history, setHistory] = useState<Shape[][]>([initialShapes]);
  const [historyStep, setHistoryStep] = useState(0);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentShape, setCurrentShape] = useState<Shape | null>(null);

  const stageRef = useRef<Konva.Stage>(null);
  const startPoint = useRef<Point>({ x: 0, y: 0 });

  // Update shapes when initial shapes change
  useEffect(() => {
    setShapes(initialShapes);
    setHistory([initialShapes]);
    setHistoryStep(0);
  }, [initialShapes]);

  // Notify parent of shape changes
  useEffect(() => {
    onShapesChange?.(shapes);
  }, [shapes, onShapesChange]);

  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!isEnabled || currentTool === 'eraser') return;

    const stage = e.target.getStage();
    if (!stage) return;

    const point = stage.getPointerPosition();
    if (!point) return;

    setIsDrawing(true);
    startPoint.current = point;

    const baseShape = {
      id: nanoid(),
      color: currentColor,
      strokeWidth,
      createdAt: new Date().toISOString(),
    };

    if (currentTool === 'pen') {
      const newShape: FreehandShape = {
        ...baseShape,
        type: 'pen',
        points: [point.x, point.y],
      };
      setCurrentShape(newShape);
    } else if (currentTool === 'rectangle') {
      const newShape: RectangleShape = {
        ...baseShape,
        type: 'rectangle',
        x: point.x,
        y: point.y,
        width: 0,
        height: 0,
      };
      setCurrentShape(newShape);
    } else if (currentTool === 'arrow') {
      const newShape: ArrowShape = {
        ...baseShape,
        type: 'arrow',
        points: [point.x, point.y, point.x, point.y],
        pointerLength: 10,
        pointerWidth: 10,
      };
      setCurrentShape(newShape);
    } else if (currentTool === 'highlight') {
      const newShape: HighlightShape = {
        ...baseShape,
        type: 'highlight',
        x: point.x,
        y: point.y,
        width: 0,
        height: 0,
        opacity: 0.3,
      };
      setCurrentShape(newShape);
    }
  };

  const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!isDrawing || !currentShape || !isEnabled) return;

    const stage = e.target.getStage();
    if (!stage) return;

    const point = stage.getPointerPosition();
    if (!point) return;

    if (currentShape.type === 'pen') {
      const updatedShape = {
        ...currentShape,
        points: [...currentShape.points, point.x, point.y],
      };
      setCurrentShape(updatedShape);
    } else if (currentShape.type === 'rectangle') {
      const updatedShape: RectangleShape = {
        ...currentShape,
        width: point.x - currentShape.x,
        height: point.y - currentShape.y,
      };
      setCurrentShape(updatedShape);
    } else if (currentShape.type === 'arrow') {
      const updatedShape: ArrowShape = {
        ...currentShape,
        points: [startPoint.current.x, startPoint.current.y, point.x, point.y],
      };
      setCurrentShape(updatedShape);
    } else if (currentShape.type === 'highlight') {
      const updatedShape: HighlightShape = {
        ...currentShape,
        width: point.x - currentShape.x,
        height: point.y - currentShape.y,
      };
      setCurrentShape(updatedShape);
    }
  };

  const handleMouseUp = () => {
    if (!isDrawing || !currentShape) return;

    setIsDrawing(false);

    // Add shape to shapes array
    const newShapes = [...shapes, currentShape];
    setShapes(newShapes);

    // Update history for undo/redo
    const newHistory = history.slice(0, historyStep + 1);
    newHistory.push(newShapes);
    setHistory(newHistory);
    setHistoryStep(newHistory.length - 1);

    setCurrentShape(null);
  };

  const undo = () => {
    if (historyStep === 0) return;
    const newStep = historyStep - 1;
    setHistoryStep(newStep);
    setShapes(history[newStep]);
  };

  const redo = () => {
    if (historyStep >= history.length - 1) return;
    const newStep = historyStep + 1;
    setHistoryStep(newStep);
    setShapes(history[newStep]);
  };

  const clear = () => {
    setShapes([]);
    setHistory([[]]);
    setHistoryStep(0);
  };

  const save = () => {
    const drawingData: DrawingData = {
      version: '1.0',
      shapes,
      metadata: {
        imageWidth,
        imageHeight,
      },
    };
    onSave?.(drawingData);
  };

  // Render individual shape
  const renderShape = (shape: Shape, index: number) => {
    const key = `${shape.id}-${index}`;

    if (shape.type === 'pen') {
      return (
        <Line
          key={key}
          points={shape.points}
          stroke={shape.color}
          strokeWidth={shape.strokeWidth}
          lineCap="round"
          lineJoin="round"
          tension={0.5}
        />
      );
    } else if (shape.type === 'rectangle') {
      return (
        <Rect
          key={key}
          x={shape.x}
          y={shape.y}
          width={shape.width}
          height={shape.height}
          stroke={shape.color}
          strokeWidth={shape.strokeWidth}
          fill={shape.fill}
        />
      );
    } else if (shape.type === 'arrow') {
      return (
        <Arrow
          key={key}
          points={shape.points}
          stroke={shape.color}
          strokeWidth={shape.strokeWidth}
          pointerLength={shape.pointerLength}
          pointerWidth={shape.pointerWidth}
        />
      );
    } else if (shape.type === 'highlight') {
      return (
        <Rect
          key={key}
          x={shape.x}
          y={shape.y}
          width={shape.width}
          height={shape.height}
          fill={shape.color}
          opacity={shape.opacity}
        />
      );
    }
    return null;
  };

  return (
    <div className="relative">
      <Stage
        ref={stageRef}
        width={imageWidth}
        height={imageHeight}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        className={isEnabled ? 'cursor-crosshair' : 'cursor-default'}
      >
        <Layer>
          {/* Render saved shapes */}
          {shapes.map((shape, i) => renderShape(shape, i))}

          {/* Render current shape being drawn */}
          {currentShape && renderShape(currentShape, -1)}
        </Layer>
      </Stage>

      {/* Export undo/redo/clear/save functions for parent components */}
      {isEnabled && (
        <div className="absolute top-2 right-2 flex gap-2 bg-white/90 p-2 rounded shadow-lg">
          <button
            onClick={undo}
            disabled={historyStep === 0}
            className="px-3 py-1 bg-blue-500 text-white rounded disabled:opacity-50"
            title="Undo"
          >
            ↶
          </button>
          <button
            onClick={redo}
            disabled={historyStep >= history.length - 1}
            className="px-3 py-1 bg-blue-500 text-white rounded disabled:opacity-50"
            title="Redo"
          >
            ↷
          </button>
          <button
            onClick={clear}
            className="px-3 py-1 bg-red-500 text-white rounded"
            title="Clear All"
          >
            Clear
          </button>
          <button
            onClick={save}
            className="px-3 py-1 bg-green-500 text-white rounded"
            title="Save"
          >
            Save
          </button>
        </div>
      )}
    </div>
  );
}
