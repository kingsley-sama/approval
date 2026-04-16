'use client';

import React, { useRef, useState, useEffect, useMemo } from 'react';
import { 
  Maximize2, 
  Minimize2, 
  ChevronLeft, 
  ChevronRight, 
  Download,
  ChevronDown 
} from 'lucide-react';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import DrawingToolbar, { DRAWING_COLOR, STROKE_WIDTH } from '@/components/drawing-toolbar';
import { DrawingTool, Shape } from '@/types/drawing';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const DrawingCanvas = dynamic(() => import('@/components/drawing-canvas'), {
  ssr: false,
});

interface Pin {
  id: string;
  number: number;
  x: number;
  y: number;
  content: string;
  author: string;
  timestamp: string;
  status: 'active' | 'resolved';
}

interface ImageViewerProps {
  pins: Pin[];
  selectedPin: string | null;
  onPinClick: (x: number, y: number, pinId?: string) => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  hoveredPin: string | null;
  onPinHover: (pinId: string | null) => void;
  currentImageIndex: number;
  totalImages: number;
  onNavigate: (direction: 'prev' | 'next') => void;
  currentImageUrl: string;
  currentImageName?: string;
  drawnShapes: Shape[];
  pendingShape: Shape | null;
  onShapeComplete: (shape: Shape, center: { x: number; y: number }) => void;
  showDrawingTools?: boolean;
}

type ZoomMode = 'fit-window' | 'fit-horizontal' | number;

function ImageViewerInner({
  pins,
  selectedPin,
  onPinClick,
  isFullscreen,
  onToggleFullscreen,
  hoveredPin,
  onPinHover,
  currentImageIndex,
  totalImages,
  onNavigate,
  currentImageUrl,
  currentImageName,
  drawnShapes,
  pendingShape,
  onShapeComplete,
  showDrawingTools = true,
}: ImageViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [imageDimensions, setImageDimensions] = useState({ width: 1600, height: 1600 });
  const [zoom, setZoom] = useState<ZoomMode>('fit-window');
  const [activeTool, setActiveTool] = useState<DrawingTool | null>(null);
  const [renderedDimensions, setRenderedDimensions] = useState({ width: 0, height: 0 });

  const zoomOptions = [
    { label: 'Fit in Window', value: 'fit-window' as const },
    { label: 'Fit Horizontally', value: 'fit-horizontal' as const },
    { label: '50%', value: 50 },
    { label: '100%', value: 100 },
    { label: '150%', value: 150 },
    { label: '200%', value: 200 },
  ];

  const getShapeCenter = (shape: Shape, rw: number, rh: number) => {
    let px = 0, py = 0;
    if (shape.type === 'pen') {
      const xs = shape.points.filter((_, i) => i % 2 === 0);
      const ys = shape.points.filter((_, i) => i % 2 === 1);
      px = xs.reduce((a, b) => a + b, 0) / xs.length;
      py = ys.reduce((a, b) => a + b, 0) / ys.length;
    } else if (shape.type === 'rectangle' || shape.type === 'highlight') {
      px = shape.x + shape.width / 2;
      py = shape.y + shape.height / 2;
    } else if (shape.type === 'arrow') {
      px = (shape.points[0] + shape.points[2]) / 2;
      py = (shape.points[1] + shape.points[3]) / 2;
    }
    return { x: (px / rw) * 100, y: (py / rh) * 100 };
  };

  useEffect(() => {
    const img = imageRef.current;
    if (!img) return;
    const handleLoad = () => {
      setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
    };
    if (img.complete) handleLoad();
    img.addEventListener('load', handleLoad);
    return () => img.removeEventListener('load', handleLoad);
  }, [currentImageUrl]);

  useEffect(() => {
    if (!imageRef.current) return;
    const updateDimensions = () => {
      if (imageRef.current) {
        const rect = imageRef.current.getBoundingClientRect();
        setRenderedDimensions({ width: rect.width, height: rect.height });
      }
    };
    updateDimensions();
    const observer = new ResizeObserver(updateDimensions);
    observer.observe(imageRef.current);
    window.addEventListener('resize', updateDimensions);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateDimensions);
    };
  }, [zoom, isFullscreen, currentImageUrl, imageDimensions]);

  const shapes = useMemo(
    () => [...drawnShapes, ...(pendingShape ? [pendingShape] : [])],
    [drawnShapes, pendingShape]
  );

  // Exit fullscreen on Escape key
  useEffect(() => {
    if (!isFullscreen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onToggleFullscreen();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, onToggleFullscreen]);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (activeTool !== null) return;
    if (!imageRef.current) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-pin]')) return;
    const imgRect = imageRef.current.getBoundingClientRect();
    const x = ((e.clientX - imgRect.left) / imgRect.width) * 100;
    const y = ((e.clientY - imgRect.top) / imgRect.height) * 100;
    onPinClick(Math.max(0, Math.min(100, x)), Math.max(0, Math.min(100, y)));
  };

  const getImageStyle = () => {
    const baseWidth = isFullscreen ? '100vw' : 'calc(100vw - 600px)';
    // Subtract ~48px toolbar height so the image never pushes the toolbar off-screen
    const baseHeight = isFullscreen ? 'calc(100vh - 48px)' : 'calc(100vh - 100px)';

    if (zoom === 'fit-horizontal') return { width: baseWidth, height: 'auto' };
    if (zoom === 'fit-window') return { maxWidth: baseWidth, maxHeight: baseHeight, width: 'auto', height: 'auto' };
    if (typeof zoom === 'number') return { width: `${zoom}vw`, height: 'auto' };
  };

  const getZoomLabel = () => {
    const option = zoomOptions.find(o => o.value === zoom);
    return option ? option.label : `${zoom}%`;
  };

  return (
    <div
      ref={containerRef}
      className={`flex-1 flex flex-col relative overflow-hidden transition-colors ${isFullscreen ? 'bg-black' : 'bg-gray-100'}`}
    >
      {/* Viewer Toolbar */}
      <div className={`flex items-center justify-between px-4 py-2 border-b shrink-0 z-30 ${isFullscreen ? 'bg-zinc-900 border-zinc-700' : 'bg-background border-border/50'}`}>
        {/* Left: File Info */}
        <div className={`flex items-center gap-3 text-sm ${isFullscreen ? 'text-zinc-400' : 'text-muted-foreground'}`}>
          <span className={`font-medium ${isFullscreen ? 'text-zinc-100' : 'text-foreground'}`}>{currentImageName || 'Untitled'}</span>
          <span>JPG</span>
          <span>1.4 MB</span>
        </div>

        {/* Center: Navigation & Drawing Tools */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className={`h-7 gap-1 text-xs ${isFullscreen ? 'text-zinc-300 hover:text-white hover:bg-zinc-700' : 'text-muted-foreground'}`}
            onClick={() => onNavigate('prev')}
            disabled={currentImageIndex === 0}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Prev
          </Button>
          <span className={`text-sm min-w-[60px] text-center ${isFullscreen ? 'text-zinc-400' : 'text-muted-foreground'}`}>
            {currentImageIndex + 1} of {totalImages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className={`h-7 gap-1 text-xs ${isFullscreen ? 'text-zinc-300 hover:text-white hover:bg-zinc-700' : 'text-muted-foreground'}`}
            onClick={() => onNavigate('next')}
            disabled={currentImageIndex === totalImages - 1}
          >
            Next
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>

          {showDrawingTools && (
            <div className={`ml-4 pl-4 border-l ${isFullscreen ? 'border-zinc-600' : 'border-border/50'}`}>
              <DrawingToolbar
                activeTool={activeTool}
                onToolSelect={setActiveTool}
              />
            </div>
          )}
        </div>

        {/* Right: Zoom & Actions */}
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={`h-7 gap-1 text-xs font-normal ${isFullscreen ? 'text-zinc-300 hover:text-white hover:bg-zinc-700' : 'text-muted-foreground'}`}
              >
                {getZoomLabel()}
                <ChevronDown className="h-3 w-3 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {zoomOptions.map((option) => (
                <DropdownMenuItem key={option.label} onClick={() => setZoom(option.value)}>
                  {option.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            size="icon"
            className={`h-7 w-7 ${isFullscreen ? 'text-zinc-300 hover:text-white hover:bg-zinc-700' : 'text-muted-foreground'}`}
          >
            <Download className="h-3.5 w-3.5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className={`h-7 w-7 ${isFullscreen ? 'text-zinc-300 hover:text-white hover:bg-zinc-700' : 'text-muted-foreground'}`}
            onClick={onToggleFullscreen}
            title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {/* Main Image Viewport */}
      <div className="flex-1 flex items-center justify-center overflow-auto min-w-full min-h-full">
        <div data-annotation-image-container className="relative" onClick={handleClick}>
          <Image
            ref={imageRef}
            src={currentImageUrl || '/modern-house-exterior.jpg'}
            width={imageDimensions.width}
            height={imageDimensions.height}
            alt="Annotation view"
            className="block"
            sizes="(max-width: 768px) 100vw, calc(100vw - 600px)"
            quality={85}
            priority
            style={{
              ...getImageStyle(),
              cursor: activeTool ? 'crosshair' : 'default',
            }}
          />

          {/* Annotation/Drawing Layer */}
          {renderedDimensions.width > 0 && (
            <div
              className="absolute top-0 left-0 pointer-events-none"
              style={{
                width: renderedDimensions.width,
                height: renderedDimensions.height,
                pointerEvents: activeTool !== null ? 'auto' : 'none',
                zIndex: 10,
              }}
            >
              <DrawingCanvas
                imageWidth={renderedDimensions.width}
                imageHeight={renderedDimensions.height}
                shapes={shapes}
                currentTool={activeTool ?? 'pen'}
                currentColor={DRAWING_COLOR}
                strokeWidth={STROKE_WIDTH}
                isEnabled={activeTool !== null}
                onShapeComplete={(shape) => {
                  const center = getShapeCenter(shape, renderedDimensions.width, renderedDimensions.height);
                  onShapeComplete(shape, center);
                  setActiveTool(null);
                }}
              />
            </div>
          )}

          {/* Pins Layer */}
          {pins.map((pin) => (
            <div
              key={pin.id}
              data-pin={pin.id}
              className="absolute transform -translate-x-1/2 -translate-y-1/2 cursor-pointer group z-20"
              style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
              onMouseEnter={() => onPinHover(pin.id)}
              onMouseLeave={() => onPinHover(null)}
              onClick={(e) => {
                e.stopPropagation();
                onPinClick(pin.x, pin.y, pin.id);
              }}
            >
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full text-white text-sm font-semibold transition-all ${
                  pin.status === 'resolved'
                    ? 'bg-green-600 opacity-70'
                    : selectedPin === pin.id
                    ? 'bg-primary ring-2 ring-blue-300 scale-110 shadow-lg'
                    : 'bg-primary hover:bg-primary-400'
                }`}
              >
                {pin.number}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default React.memo(ImageViewerInner);