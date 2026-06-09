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
import { normalizeShape } from '@/lib/drawing';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IconTooltip } from '@/components/ui/icon-tooltip';

const DrawingCanvas = dynamic(() => import('@/components/drawing-canvas'), {
  ssr: false,
});

// Custom cursor for comment/pin placement mode — orange map pin with "+" indicator
const COMMENT_PIN_CURSOR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='28' viewBox='0 0 20 28'%3E%3Cpath d='M10 27C10 27 19 15.5 19 9.5C19 4.5 15 1 10 1C5 1 1 4.5 1 9.5C1 15.5 10 27 10 27Z' fill='%23ff6137' stroke='white' stroke-width='1'/%3E%3Ccircle cx='10' cy='9.5' r='3.5' fill='white'/%3E%3Cline x1='8.5' y1='9.5' x2='11.5' y2='9.5' stroke='%23ff6137' stroke-width='1.5' stroke-linecap='round'/%3E%3Cline x1='10' y1='8' x2='10' y2='11' stroke='%23ff6137' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E") 10 27, crosshair`;

// Pencil cursor — matches the pen icon used in the drawing toolbar
const DRAWING_PENCIL_CURSOR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 20 20'%3E%3Cpath d='M13.586 3.586a2 2 0 112.828 2.828l-8.5 8.5a1 1 0 01-.39.242l-3 1a1 1 0 01-1.265-1.265l1-3a1 1 0 01.242-.39l8.5-8.5z' fill='%232563eb' stroke='white' stroke-width='1' stroke-linejoin='round'/%3E%3C/svg%3E") 3 21, crosshair`;

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

/** Build a sensible download filename from the image name, falling back to the
 *  URL's basename, and ensuring it carries an extension matching the blob type. */
function downloadFileName(name: string | undefined, mimeType: string, url: string): string {
  const fromUrl = url.split('/').pop()?.split('?')[0];
  const base = (name && name.trim()) || (fromUrl && decodeURIComponent(fromUrl)) || 'image';
  if (/\.[a-zA-Z0-9]{2,5}$/.test(base)) return base;
  return `${base}.${EXT_BY_MIME[mimeType] ?? 'jpg'}`;
}

interface Pin {
  id: string;
  number: number;
  x: number;
  y: number;
  content: string;
  author: string;
  timestamp: string;
  status: 'active' | 'resolved';
  isPending?: boolean;
}

interface ImageViewerProps {
  pins: Pin[];
  selectedPin: string | null;
  onPinClick: (x: number, y: number, pinId?: string) => void;
  onPinReposition?: (pinId: string, x: number, y: number) => void | Promise<void>;
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
  pendingShapes: Shape[];
  onShapeComplete: (shape: Shape, center: { x: number; y: number }) => void;
  onUndoShape?: () => void;
  /** Whether the undo control is actionable. Defaults to "has pending shapes"
   *  when omitted; pass explicitly to also cover saved-drawing undo. */
  canUndo?: boolean;
  showDrawingTools?: boolean;
}

type ZoomMode = 'fit-window' | 'fit-horizontal' | number;

function ImageViewerInner({
  pins,
  selectedPin,
  onPinClick,
  onPinReposition,
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
  pendingShapes,
  onShapeComplete,
  onUndoShape,
  canUndo,
  showDrawingTools = true,
}: ImageViewerProps) {
  // Fall back to the legacy "pending shapes only" rule when the caller does
  // not drive undo availability explicitly.
  const undoEnabled = canUndo ?? pendingShapes.length > 0;
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [imageDimensions, setImageDimensions] = useState({ width: 1600, height: 1600 });
  // False from the moment the source changes until the new image has loaded, so
  // a loading overlay can cover the switch instead of showing the stale image.
  const [imageLoaded, setImageLoaded] = useState(false);
  const [zoom, setZoom] = useState<ZoomMode>('fit-window');
  const [activeTool, setActiveTool] = useState<DrawingTool | null>(null);
  const [renderedDimensions, setRenderedDimensions] = useState({ width: 0, height: 0 });
  const [draggingPinId, setDraggingPinId] = useState<string | null>(null);
  const [draggingPinPosition, setDraggingPinPosition] = useState<{ x: number; y: number } | null>(null);
  const dragStateRef = useRef<{
    pinId: string;
    startClientX: number;
    startClientY: number;
    originX: number;
    originY: number;
    didMove: boolean;
  } | null>(null);
  const draggingPinPositionRef = useRef<{ x: number; y: number } | null>(null);
  const suppressNextClickRef = useRef(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // Fetch the stored image as a blob so the browser's download attribute works
  // even for cross-origin storage URLs (where `<a download>` is otherwise
  // ignored). Falls back to opening the image in a new tab on failure.
  const handleDownload = async () => {
    if (!currentImageUrl || isDownloading) return;
    setIsDownloading(true);
    try {
      const res = await fetch(currentImageUrl);
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = downloadFileName(currentImageName, blob.type, currentImageUrl);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(currentImageUrl, '_blank', 'noopener');
    } finally {
      setIsDownloading(false);
    }
  };

  const zoomOptions = [
    { label: 'Fit in Window', value: 'fit-window' as const },
    { label: 'Fit Horizontally', value: 'fit-horizontal' as const },
    { label: '50%', value: 50 },
    { label: '100%', value: 100 },
    { label: '150%', value: 150 },
    { label: '200%', value: 200 },
  ];

  const clampPercent = (value: number) => {
    if (!Number.isFinite(value)) return 50;
    return Math.max(0, Math.min(100, value));
  };

  // Pin sits at the point where the drawing began (the first mouse-down).
  const getShapeAnchor = (shape: Shape, rw: number, rh: number) => {
    if (rw <= 0 || rh <= 0) {
      return { x: 50, y: 50 };
    }

    let px = 0, py = 0;
    if (shape.type === 'pen') {
      px = shape.points[0] ?? 0;
      py = shape.points[1] ?? 0;
    } else if (shape.type === 'rectangle' || shape.type === 'highlight') {
      px = shape.x;
      py = shape.y;
    } else if (shape.type === 'arrow' || shape.type === 'line') {
      px = shape.points[0];
      py = shape.points[1];
    }
    return {
      x: clampPercent((px / rw) * 100),
      y: clampPercent((py / rh) * 100),
    };
  };

  useEffect(() => {
    const img = imageRef.current;
    if (!img) return;
    const handleLoad = () => {
      setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
      setImageLoaded(true);
    };
    // Reset to "loading" for the new source; if it's already cached (e.g. warmed
    // by the preloader) `complete` is true and the overlay never flashes.
    setImageLoaded(false);
    if (img.complete && img.naturalWidth > 0) handleLoad();
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
    () => [...drawnShapes, ...pendingShapes],
    [drawnShapes, pendingShapes]
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

  // Ctrl/Cmd+Z to undo the last drawn shape (while pending shapes exist)
  useEffect(() => {
    if (!onUndoShape) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        const target = e.target as HTMLElement | null;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
          return;
        }
        if (!undoEnabled) return;
        e.preventDefault();
        onUndoShape();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onUndoShape, undoEnabled]);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    if (activeTool !== null) return;
    if (!imageRef.current) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-pin]')) return;
    const imgRect = imageRef.current.getBoundingClientRect();
    const x = ((e.clientX - imgRect.left) / imgRect.width) * 100;
    const y = ((e.clientY - imgRect.top) / imgRect.height) * 100;
    onPinClick(Math.max(0, Math.min(100, x)), Math.max(0, Math.min(100, y)));
  };

  useEffect(() => {
    if (!draggingPinId) return;

    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState || !imageRef.current) return;

      const imgRect = imageRef.current.getBoundingClientRect();
      if (imgRect.width <= 0 || imgRect.height <= 0) return;

      const deltaX = ((event.clientX - dragState.startClientX) / imgRect.width) * 100;
      const deltaY = ((event.clientY - dragState.startClientY) / imgRect.height) * 100;

      const nextPosition = {
        x: clampPercent(dragState.originX + deltaX),
        y: clampPercent(dragState.originY + deltaY),
      };

      if (!dragState.didMove) {
        const distance = Math.hypot(event.clientX - dragState.startClientX, event.clientY - dragState.startClientY);
        if (distance > 3) {
          dragState.didMove = true;
          suppressNextClickRef.current = true;
        }
      }

      draggingPinPositionRef.current = nextPosition;
      setDraggingPinPosition(nextPosition);
    };

    const handlePointerUp = () => {
      const dragState = dragStateRef.current;
      if (!dragState) return;

      const finalPosition = draggingPinPositionRef.current ?? {
        x: dragState.originX,
        y: dragState.originY,
      };

      const moved = dragState.didMove;
      const pinId = dragState.pinId;

      dragStateRef.current = null;
      draggingPinPositionRef.current = null;
      setDraggingPinId(null);
      setDraggingPinPosition(null);

      if (!moved) return;

      onPinReposition?.(pinId, finalPosition.x, finalPosition.y);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [draggingPinId, onPinReposition]);

  const handlePinPointerDown = (event: React.PointerEvent<HTMLDivElement>, pin: Pin) => {
    // Pins stay draggable even while a drawing tool is active, so the user can
    // nudge a pin out of the way mid-marking to see the marks underneath it.
    // The marks themselves stay anchored. Pending pins aren't in the DB yet, so
    // they remain fixed.
    if (pin.isPending) return;

    event.preventDefault();
    event.stopPropagation();

    dragStateRef.current = {
      pinId: pin.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      originX: pin.x,
      originY: pin.y,
      didMove: false,
    };

    draggingPinPositionRef.current = { x: pin.x, y: pin.y };
    setDraggingPinId(pin.id);
    setDraggingPinPosition({ x: pin.x, y: pin.y });
  };

  const getImageStyle = () => {
    // baseWidth/baseHeight = width/height of the viewport area surrounding the image.
    // For fit-window we further subtract the wrapper's px-6 / py-8 padding so the
    // image is bounded by the *padded* area, leaving visible gutters on all four sides.
    const baseWidth = isFullscreen ? '100vw' : 'calc(100vw - 600px)';
    const fitWidth = isFullscreen ? '100vw' : 'calc(100vw - 600px - 48px)';
    // 56px top nav + ~45px viewer toolbar + 64px py-8 (top + bottom) = ~165px
    const fitHeight = isFullscreen ? 'calc(100vh - 100px)' : 'calc(100vh - 180px)';

    if (zoom === 'fit-horizontal') return { width: baseWidth, height: 'auto' };
    if (zoom === 'fit-window') return { maxWidth: fitWidth, maxHeight: fitHeight, width: 'auto', height: 'auto' };
    if (typeof zoom === 'number') {
      // Zoom as a percentage of the image's natural width.
      // Falls back to viewport-relative until natural dimensions are known.
      if (imageDimensions.width > 0) {
        return {
          width: `${(imageDimensions.width * zoom) / 100}px`,
          height: 'auto',
          maxWidth: 'none',
          maxHeight: 'none',
        };
      }
      return { width: `${zoom}vw`, height: 'auto', maxWidth: 'none' };
    }
  };

  const getZoomLabel = () => {
    const option = zoomOptions.find(o => o.value === zoom);
    return option ? option.label : `${zoom}%`;
  };

  return (
    <div
      ref={containerRef}
      className={`flex-1 flex flex-col relative overflow-hidden transition-colors ${isFullscreen ? 'bg-black' : 'bg-gray-200'}`}
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
          <span className={`text-sm min-w-15 text-center ${isFullscreen ? 'text-zinc-400' : 'text-muted-foreground'}`}>
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
                onUndo={onUndoShape}
                canUndo={undoEnabled}
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

          <IconTooltip label="Download image">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDownload}
              disabled={isDownloading || !currentImageUrl}
              aria-label="Download image"
              className={`h-7 w-7 ${isFullscreen ? 'text-zinc-300 hover:text-white hover:bg-zinc-700' : 'text-muted-foreground'}`}
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
          </IconTooltip>

          <IconTooltip label={isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}>
            <Button
              variant="ghost"
              size="icon"
              className={`h-7 w-7 ${isFullscreen ? 'text-zinc-300 hover:text-white hover:bg-zinc-700' : 'text-muted-foreground'}`}
              onClick={onToggleFullscreen}
            >
              {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </Button>
          </IconTooltip>
        </div>
      </div>

      {/* Main Image Viewport */}
      {/* The scroll container must NOT center its content: with `justify-content: center`
          the overflowed start edge (left) becomes unreachable by the scrollbar, so only
          vertical panning works. Centering lives on an inner wrapper that grows to fit the
          image (min-w/min-h-full keeps gutters when the image is smaller than the viewport),
          which keeps both horizontal and vertical edges scrollable. */}
      <div className="flex-1 overflow-auto relative">
        {/* Loading overlay — shows immediately on a switch and stays until the
            new image has loaded, hiding the previous image during the swap. */}
        {currentImageUrl && !imageLoaded && (
          <div className={`absolute inset-0 z-40 flex items-center justify-center ${isFullscreen ? 'bg-black' : 'bg-gray-200'}`}>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        )}
        <div className="flex items-center justify-center min-w-full min-h-full py-8 px-6">
          <div data-annotation-image-container className="relative" onClick={handleClick}>
          <Image
            ref={imageRef}
            src={currentImageUrl || '/modern-house-exterior.jpg'}
            width={imageDimensions.width}
            height={imageDimensions.height}
            alt="Annotation view"
            className="block"
            sizes="(max-width: 768px) 100vw, calc(100vw - 600px)"
            // Serve the original file rather than routing it through the Next.js
            // image optimizer. Revision uploads can be very large; optimizing them
            // makes sharp time out / error, leaving a broken-image placeholder that
            // the optimizer then caches so reloads can't recover it. Unoptimized
            // also preserves full resolution for zooming in on annotations.
            unoptimized
            priority
            style={{
              ...getImageStyle(),
              cursor: activeTool ? DRAWING_PENCIL_CURSOR : COMMENT_PIN_CURSOR,
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
                cursor: activeTool ? DRAWING_PENCIL_CURSOR : undefined,
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
                  // Compute the pin anchor from the raw pixel-coord shape (matches
                  // the canvas coords the user just clicked), then normalize the
                  // shape itself so it scales with future zoom changes.
                  const anchor = getShapeAnchor(shape, renderedDimensions.width, renderedDimensions.height);
                  const normalized = normalizeShape(shape, renderedDimensions.width, renderedDimensions.height);
                  onShapeComplete(normalized, anchor);
                }}
              />
            </div>
          )}

          {/* Pins Layer */}
          {pins.map((pin) => (
            <div
              key={pin.id}
              data-pin={pin.id}
              className={`absolute transform -translate-x-1/2 -translate-y-1/2 group z-20 touch-none ${pin.isPending ? 'cursor-not-allowed opacity-80' : draggingPinId === pin.id ? 'cursor-grabbing' : 'cursor-grab'}`}
              style={{
                left: `${draggingPinId === pin.id && draggingPinPosition ? draggingPinPosition.x : pin.x}%`,
                top: `${draggingPinId === pin.id && draggingPinPosition ? draggingPinPosition.y : pin.y}%`,
              }}
              onMouseEnter={() => onPinHover(pin.id)}
              onMouseLeave={() => onPinHover(null)}
              onPointerDown={(event) => handlePinPointerDown(event, pin)}
              onClick={(e) => {
                if (suppressNextClickRef.current) {
                  suppressNextClickRef.current = false;
                  e.preventDefault();
                  e.stopPropagation();
                  return;
                }
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
    </div>
  );
}

export default React.memo(ImageViewerInner);