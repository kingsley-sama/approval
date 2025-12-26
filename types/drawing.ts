/**
 * Drawing types and interfaces
 * Defines the structure for canvas-based annotations
 */

export type DrawingTool = 'pen' | 'rectangle' | 'arrow' | 'highlight' | 'eraser';

export interface Point {
  x: number;
  y: number;
}

export interface BaseShape {
  id: string;
  type: DrawingTool;
  color: string;
  strokeWidth: number;
  createdAt: string;
}

export interface FreehandShape extends BaseShape {
  type: 'pen';
  points: number[]; // Flattened array [x1, y1, x2, y2, ...]
}

export interface RectangleShape extends BaseShape {
  type: 'rectangle';
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: string;
}

export interface ArrowShape extends BaseShape {
  type: 'arrow';
  points: number[]; // [x1, y1, x2, y2]
  pointerLength: number;
  pointerWidth: number;
}

export interface HighlightShape extends BaseShape {
  type: 'highlight';
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
}

export type Shape = FreehandShape | RectangleShape | ArrowShape | HighlightShape;

export interface DrawingData {
  version: string;
  shapes: Shape[];
  metadata?: {
    imageWidth?: number;
    imageHeight?: number;
    [key: string]: any;
  };
}

export interface Drawing {
  id: string;
  threadId: string;
  drawingData: DrawingData;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  isDuplicated: boolean;
  originalDrawingId?: string;
}

export interface DrawingState {
  currentTool: DrawingTool;
  currentColor: string;
  strokeWidth: number;
  shapes: Shape[];
  history: Shape[][];
  historyStep: number;
  isDrawing: boolean;
}

export const DEFAULT_COLORS = [
  '#FF0000', // Red
  '#00FF00', // Green
  '#0000FF', // Blue
  '#FFFF00', // Yellow
  '#FF00FF', // Magenta
  '#00FFFF', // Cyan
  '#000000', // Black
  '#FFFFFF', // White
  '#FFA500', // Orange
  '#800080', // Purple
];

export const DEFAULT_STROKE_WIDTHS = [2, 4, 6, 8, 12];
