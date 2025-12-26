/**
 * DrawingToolbar Component
 * Toolbar for selecting drawing tools, colors, and stroke widths
 */

'use client';

import React from 'react';
import type { DrawingTool } from '@/types/drawing';
import { DEFAULT_COLORS, DEFAULT_STROKE_WIDTHS } from '@/types/drawing';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface DrawingToolbarProps {
  currentTool: DrawingTool;
  currentColor: string;
  strokeWidth: number;
  isEnabled: boolean;
  onToolChange: (tool: DrawingTool) => void;
  onColorChange: (color: string) => void;
  onStrokeWidthChange: (width: number) => void;
  onToggleDrawing: () => void;
}

export default function DrawingToolbar({
  currentTool,
  currentColor,
  strokeWidth,
  isEnabled,
  onToolChange,
  onColorChange,
  onStrokeWidthChange,
  onToggleDrawing,
}: DrawingToolbarProps) {
  const tools: { value: DrawingTool; label: string; icon: string }[] = [
    { value: 'pen', label: 'Pen', icon: '✏️' },
    { value: 'rectangle', label: 'Rectangle', icon: '▢' },
    { value: 'arrow', label: 'Arrow', icon: '→' },
    { value: 'highlight', label: 'Highlight', icon: '🖍️' },
  ];

  return (
    <div className="flex items-center gap-4 p-4 bg-white border-b">
      {/* Toggle Drawing Mode */}
      <Button
        onClick={onToggleDrawing}
        variant={isEnabled ? 'default' : 'outline'}
        size="sm"
      >
        {isEnabled ? '🎨 Drawing Enabled' : '🔒 Drawing Disabled'}
      </Button>

      <div className="h-6 w-px bg-gray-300" />

      {/* Tool Selection */}
      <div className="flex gap-2">
        {tools.map((tool) => (
          <button
            key={tool.value}
            onClick={() => onToolChange(tool.value)}
            disabled={!isEnabled}
            className={`
              px-3 py-2 rounded border transition-colors
              ${currentTool === tool.value
                ? 'bg-blue-500 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }
              ${!isEnabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
            `}
            title={tool.label}
          >
            <span className="text-lg">{tool.icon}</span>
            <span className="ml-2 text-sm">{tool.label}</span>
          </button>
        ))}
      </div>

      <div className="h-6 w-px bg-gray-300" />

      {/* Color Picker */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-600">Color:</span>
        <div className="flex gap-1">
          {DEFAULT_COLORS.map((color) => (
            <button
              key={color}
              onClick={() => onColorChange(color)}
              disabled={!isEnabled}
              className={`
                w-8 h-8 rounded border-2 transition-all
                ${currentColor === color
                  ? 'border-gray-800 scale-110'
                  : 'border-gray-300 hover:scale-105'
                }
                ${!isEnabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
              style={{ backgroundColor: color }}
              title={color}
            />
          ))}
        </div>
        
        {/* Custom color input */}
        <input
          type="color"
          value={currentColor}
          onChange={(e) => onColorChange(e.target.value)}
          disabled={!isEnabled}
          className="w-8 h-8 rounded border cursor-pointer disabled:opacity-50"
          title="Custom color"
        />
      </div>

      <div className="h-6 w-px bg-gray-300" />

      {/* Stroke Width */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-600">Width:</span>
        <Select
          value={strokeWidth.toString()}
          onValueChange={(value) => onStrokeWidthChange(Number(value))}
          disabled={!isEnabled}
        >
          <SelectTrigger className="w-20">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DEFAULT_STROKE_WIDTHS.map((width) => (
              <SelectItem key={width} value={width.toString()}>
                {width}px
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
