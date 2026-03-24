'use client';

import React from 'react';
import type { DrawingTool } from '@/types/drawing';

export const DRAWING_COLOR = '#f43f5e'; // fixed rose-500
export const STROKE_WIDTH = 3;

interface DrawingToolbarProps {
  activeTool: DrawingTool | null;
  onToolSelect: (tool: DrawingTool | null) => void;
}

const tools: { value: DrawingTool; label: string; icon: React.ReactNode }[] = [
  {
    value: 'pen',
    label: 'Freehand',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
        <path d="M13.586 3.586a2 2 0 112.828 2.828l-8.5 8.5a1 1 0 01-.39.242l-3 1a1 1 0 01-1.265-1.265l1-3a1 1 0 01.242-.39l8.5-8.5z" />
      </svg>
    ),
  },
  {
    value: 'rectangle',
    label: 'Rectangle',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4">
        <rect x="3" y="4" width="14" height="12" rx="1.5" />
      </svg>
    ),
  },
  {
    value: 'arrow',
    label: 'Arrow',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <line x1="4" y1="16" x2="16" y2="4" />
        <polyline points="9 4 16 4 16 11" />
      </svg>
    ),
  },
  {
    value: 'highlight',
    label: 'Highlight',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
        <path d="M9.5 3a.5.5 0 00-.5.5V13H6l4 4 4-4h-3V3.5a.5.5 0 00-.5-.5h-1z" />
        <rect x="3" y="15" width="14" height="2" rx="1" opacity={0.4} />
      </svg>
    ),
  },
  {
    value: 'eraser',
    label: 'Eraser',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <path d="M4 16l3-3 7-7-3-3-7 7-3 3h6z" />
        <line x1="11" y1="3" x2="17" y2="9" />
      </svg>
    ),
  },
];

export default function DrawingToolbar({ activeTool, onToolSelect }: DrawingToolbarProps) {
  return (
    <div className="flex items-center gap-0.5 bg-white/90 backdrop-blur-sm border border-gray-200 rounded-lg shadow-sm px-1 py-1">
      {tools.map((tool, i) => (
        <React.Fragment key={tool.value}>
          {/* Divider before eraser */}
          {i === tools.length - 1 && (
            <div className="w-px h-5 bg-gray-200 mx-0.5 flex-shrink-0" />
          )}
          <button
            onClick={() => onToolSelect(activeTool === tool.value ? null : tool.value)}
            title={tool.label}
            className={`p-2 rounded-md transition-all ${
              activeTool === tool.value
                ? 'bg-rose-500 text-white shadow-inner'
                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
            }`}
          >
            {tool.icon}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
}
