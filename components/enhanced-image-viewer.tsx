/**
 * EnhancedImageViewer Component
 * Integrates image viewing with drawing canvas and comments
 */

'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import DrawingCanvas from '@/components/drawing-canvas';
import DrawingToolbar from '@/components/drawing-toolbar';
import ShareLinkManager from '@/components/share-link-manager';
import {
  getDrawingsByThread,
  saveDrawing,
  updateDrawing,
} from '@/app/actions/drawings';
import type { Drawing, DrawingTool, DrawingData, Shape } from '@/types/drawing';
import { Button } from '@/components/ui/button';

interface EnhancedImageViewerProps {
  threadId: string;
  threadName: string;
  imagePath: string;
  imageWidth?: number;
  imageHeight?: number;
  projectId: string;
  projectName: string;
  currentUser: string;
  canDraw?: boolean;
}

export default function EnhancedImageViewer({
  threadId,
  threadName,
  imagePath,
  imageWidth = 1200,
  imageHeight = 800,
  projectId,
  projectName,
  currentUser,
  canDraw = true,
}: EnhancedImageViewerProps) {
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [currentDrawing, setCurrentDrawing] = useState<Drawing | null>(null);
  const [shapes, setShapes] = useState<Shape[]>([]);
  
  const [isDrawingEnabled, setIsDrawingEnabled] = useState(false);
  const [currentTool, setCurrentTool] = useState<DrawingTool | null>(null);
  const [currentColor, setCurrentColor] = useState('#FF0000');
  const [strokeWidth, setStrokeWidth] = useState(4);
  
  const [isLoading, setIsLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');

  // Load drawings on mount
  useEffect(() => {
    loadDrawings();
  }, [threadId]);

  const loadDrawings = async () => {
    setIsLoading(true);
    const result = await getDrawingsByThread(threadId);
    
    if (result.success && result.drawings) {
      setDrawings(result.drawings);
      // Load the most recent drawing
      if (result.drawings.length > 0) {
        const latest = result.drawings[result.drawings.length - 1];
        setCurrentDrawing(latest);
        setShapes(latest.drawingData.shapes || []);
      }
    }
    
    setIsLoading(false);
  };

  const handleSaveDrawing = async (data: DrawingData) => {
    setSaveStatus('Saving...');

    let result;
    if (currentDrawing) {
      // Update existing drawing
      result = await updateDrawing({
        drawingId: currentDrawing.id,
        drawingData: data,
      });
    } else {
      // Create new drawing
      result = await saveDrawing({
        threadId,
        drawingData: data,
        createdBy: currentUser,
      });
    }

    if (result.success && result.drawing) {
      setSaveStatus('Saved!');
      setCurrentDrawing(result.drawing);
      await loadDrawings();
      setTimeout(() => setSaveStatus(''), 3000);
    } else {
      setSaveStatus(`Error: ${result.error}`);
      setTimeout(() => setSaveStatus(''), 5000);
    }
  };

  const handleShapeComplete = async (shape: Shape) => {
    const newShapes = [...shapes, shape];
    setShapes(newShapes);
    await handleSaveDrawing({
      version: '1.0',
      shapes: newShapes,
      metadata: {
        imageWidth,
        imageHeight,
      },
    });
  };

  return (
    <div className="space-y-4">
      {/* Header with actions */}
      <div className="flex items-center justify-between p-4 bg-white border-b">
        <div>
          <h2 className="text-xl font-bold">{threadName}</h2>
          <p className="text-sm text-gray-600">{projectName}</p>
        </div>
        <div className="flex gap-2">
          <ShareLinkManager
            resourceType="thread"
            resourceId={threadId}
            createdBy={currentUser}
            resourceName={threadName}
          />
          
          {drawings.length > 0 && (
            <span className="text-sm text-gray-600 flex items-center">
              📝 {drawings.length} drawing{drawings.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Drawing toolbar */}
      {canDraw && (
        <DrawingToolbar
          activeTool={currentTool}
          onToolSelect={(tool) => {
            setCurrentTool(tool);
            setIsDrawingEnabled(tool !== null);
          }}
        />
      )}

      {/* Image + Drawing Canvas */}
      <div className="relative bg-gray-100 rounded-lg overflow-hidden">
        <div className="relative">
          <Image
            src={imagePath}
            alt={threadName}
            width={imageWidth}
            height={imageHeight}
            className="w-full h-auto"
            priority
          />
          
          {canDraw && (
            <div className="absolute inset-0 pointer-events-auto">
              <DrawingCanvas
                imageWidth={imageWidth}
                imageHeight={imageHeight}
                shapes={shapes}
                currentTool={currentTool ?? 'pen'}
                currentColor={currentColor}
                strokeWidth={strokeWidth}
                isEnabled={isDrawingEnabled && currentTool !== null}
                onShapeComplete={handleShapeComplete}
              />
            </div>
          )}
        </div>

        {/* Status overlay */}
        {saveStatus && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-black/80 text-white px-4 py-2 rounded shadow-lg">
            {saveStatus}
          </div>
        )}
      </div>

      {/* Drawing history */}
      {drawings.length > 1 && (
        <div className="p-4 bg-white border rounded">
          <h3 className="font-semibold mb-3">Drawing History</h3>
          <div className="flex gap-2 overflow-x-auto">
            {drawings.map((drawing, index) => (
              <button
                key={drawing.id}
                onClick={() => {
                  setCurrentDrawing(drawing);
                  setShapes(drawing.drawingData.shapes || []);
                }}
                className={`
                  px-3 py-2 rounded border text-sm whitespace-nowrap
                  ${currentDrawing?.id === drawing.id
                    ? 'bg-blue-500 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }
                `}
              >
                Version {index + 1}
                <span className="block text-xs opacity-75">
                  {new Date(drawing.createdAt).toLocaleString()}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
