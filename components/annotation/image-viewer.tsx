'use client';

import { useRef, useState, useEffect } from 'react';
import { Maximize2, Minimize2, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { url } from 'inspector';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import DrawingToolbar from '@/components/drawing-toolbar';
import { DrawingTool, Shape } from '@/types/drawing';

// Dynamic import for DrawingCanvas to avoid SSR issues with Konva
const DrawingCanvas = dynamic(() => import('@/components/drawing-canvas'), {
  ssr: false,
});

interface Pin {
  id: number;
  x: number;
  y: number;
  comment: string;
  author: string;
  timestamp: string;
  isNew?: boolean;
}

interface ImageViewerProps {
  pins: Pin[];
  selectedPin: number | null;
  onPinClick: (x: number, y: number, pinId?: number) => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  hoveredPin: number | null;
  onPinHover: (pinId: number | null) => void;
  currentImageIndex: number;
  totalImages: number;
  onNavigate: (direction: 'prev' | 'next') => void;
  currentImageUrl: string;
}

type ZoomMode = 'fit-window' | 'fit-horizontal' | number;

export default function ImageViewer({
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
}: ImageViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [imageDimensions, setImageDimensions] = useState({ width: 1600, height: 1600 });
  const [zoom, setZoom] = useState<ZoomMode>('fit-window');
  const [showZoomMenu, setShowZoomMenu] = useState(false);

  // Drawing state
  const [drawingEnabled, setDrawingEnabled] = useState(false);
  const [currentTool, setCurrentTool] = useState<DrawingTool>('pen');
  const [currentColor, setCurrentColor] = useState('#ef4444'); // red-500
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [renderedDimensions, setRenderedDimensions] = useState({ width: 0, height: 0 });
  const [shapes, setShapes] = useState<Shape[]>([]);

  useEffect(() => {
    const img = imageRef.current;
    if (img && img.complete) {
      setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
    }

    const handleLoad = () => {
      if (img) {
        setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
      }
    };

    if (img) {
      img.addEventListener('load', handleLoad);
      return () => img.removeEventListener('load', handleLoad);
    }
  }, []);

  // Track rendered dimensions for drawing overlay
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

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (drawingEnabled) return; // Disable pin creation when drawing
    if (!imageRef.current || !containerRef.current) return;
    
    const target = e.target as HTMLElement;
    if (target.closest('[data-pin]')) return;

    const img = imageRef.current;
    const imgRect = img.getBoundingClientRect();
    const clickX = e.clientX - imgRect.left;
    const clickY = e.clientY - imgRect.top;
    
    const x = (clickX / imgRect.width) * 100;
    const y = (clickY / imgRect.height) * 100;
    
    onPinClick(Math.max(0, Math.min(100, x)), Math.max(0, Math.min(100, y)));
  };

  const getImageStyle = () => {
    if (isFullscreen) {
      if (zoom === 'fit-horizontal') {
        return { width: '100vw', height: 'auto' };
      } else if (zoom === 'fit-window') {
        return { maxWidth: '100vw', maxHeight: '100vh', width: 'auto', height: 'auto' };
      } else if (typeof zoom === 'number') {
        return { width: `${zoom}vw`, height: 'auto' };
      }
    } else {
      if (zoom === 'fit-window') {
        return { maxWidth: 'calc(100vw - 600px)', maxHeight: 'calc(100vh - 100px)', width: 'auto', height: 'auto' };
      } else if (zoom === 'fit-horizontal') {
        return { width: 'calc(100vw - 600px)', height: 'auto' };
      } else if (typeof zoom === 'number') {
        return { width: `${zoom}vw`, height: 'auto' };
      }
    }
  };

  const getZoomLabel = () => {
    if (zoom === 'fit-window') return 'Fit in Window';
    if (zoom === 'fit-horizontal') return 'Fit Horizontally';
    return `${zoom}%`;
  };

  const zoomOptions = [
    { label: 'Fit in Window', value: 'fit-window' as const },
    { label: 'Fit Horizontally', value: 'fit-horizontal' as const },
    { label: '25%', value: 25 },
    { label: '50%', value: 50 },
    { label: '75%', value: 75 },
    { label: '100%', value: 100 },
    { label: '125%', value: 125 },
    { label: '150%', value: 150 },
    { label: '175%', value: 175 },
    { label: '200%', value: 200 },
  ];

  return (
    <div 
      ref={containerRef}
      className={`flex-1 relative overflow-auto transition-colors ${'bg-gray-100'}`} 
    >
      {/* Drawing Toolbar */}
      <div className="sticky top-4 left-0 right-0 flex justify-center z-30 pointer-events-none">
        <div className="pointer-events-auto shadow-md rounded-lg overflow-hidden bg-white">
          <DrawingToolbar 
            currentTool={currentTool}
            currentColor={currentColor}
            strokeWidth={strokeWidth}
            isEnabled={drawingEnabled}
            onToolChange={setCurrentTool}
            onColorChange={setCurrentColor}
            onStrokeWidthChange={setStrokeWidth}
            onToggleDrawing={() => setDrawingEnabled(!drawingEnabled)}
          />
        </div>
      </div>

      <div className={isFullscreen ? 'inline-flex items-center justify-center w-screen h-screen' : 'inline-flex items-center justify-center min-w-full min-h-full'}>
        <div className="relative"
        onClick={handleClick}
        >
          <Image
            ref={imageRef}
            src={currentImageUrl || "public/modern-house-exterior.jpg"}
            width={imageDimensions.width}   
            height={imageDimensions.height}
            alt="Annotation image"
            className="block"
            style={{ ...getImageStyle(), cursor: "url(/sample_cursors/cursor.svg), auto" }}
            crossOrigin="anonymous"

          />
          
          {/* Drawing Canvas Overlay */}
          {renderedDimensions.width > 0 && (
             <div 
               style={{
                 position: 'absolute',
                 top: 0,
                 left: 0,
                 width: imageDimensions.width,
                 height: imageDimensions.height,
                 transform: `scale(${renderedDimensions.width / imageDimensions.width})`,
                 transformOrigin: 'top left',
                 pointerEvents: drawingEnabled ? 'auto' : 'none',
                 zIndex: 10
               }}
             >
               <DrawingCanvas
                 imageWidth={imageDimensions.width}
                 imageHeight={imageDimensions.height}
                 currentTool={currentTool}
                 currentColor={currentColor}
                 strokeWidth={strokeWidth}
                 isEnabled={drawingEnabled}
                 initialShapes={shapes}
                 onShapesChange={setShapes}
               />
             </div>
          )}

          {pins.map((pin) => (
            <div
              key={pin.id}
              data-pin={pin.id}
              className="absolute transform -translate-x-1/2 -translate-y-1/2 cursor-pointer group"
              style={{
                left: `${pin.x}%`,
                top: `${pin.y}%`,
              }}
              onMouseEnter={() => onPinHover(pin.id)}
              onMouseLeave={() => onPinHover(null)}
              onClick={(e) => {
                e.stopPropagation();
                onPinClick(pin.x, pin.y, pin.id);
              }}
            >
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full text-white text-sm font-semibold transition-all ${
                  selectedPin === pin.id
                    ? 'bg-blue-700 ring-2 ring-blue-300 scale-110 shadow-lg'
                    : hoveredPin === pin.id
                    ? 'bg-blue-700 scale-110 shadow-lg'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {pin.id}
              </div>
              
              {hoveredPin === pin.id && pin.comment && (
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap shadow-lg pointer-events-none z-10">
                  {pin.comment}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {isFullscreen && (
        <div className="fixed top-4 left-4 flex items-center gap-4 z-10">
          <button
            onClick={() => onNavigate('prev')}
            disabled={currentImageIndex === 0}
            className={`p-2 rounded-lg transition-colors ${
              currentImageIndex === 0
                ? 'bg-white/5 text-white/30 cursor-not-allowed'
                : 'bg-white/10 hover:bg-white/20 text-white'
            }`}
            title="Previous image"
          >
            <ChevronLeft size={20} />
          </button>
          
          <div className="text-white text-sm font-medium bg-white/10 px-3 py-2 rounded-lg">
            {currentImageIndex + 1} of {totalImages}
          </div>
          
          <button
            onClick={() => onNavigate('next')}
            disabled={currentImageIndex === totalImages - 1}
            className={`p-2 rounded-lg transition-colors ${
              currentImageIndex === totalImages - 1
                ? 'bg-white/5 text-white/30 cursor-not-allowed'
                : 'bg-white/10 hover:bg-white/20 text-white'
            }`}
            title="Next image"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      )}

      <div className={`fixed top-4 right-4 flex items-center gap-2 z-10`}>
        <div className="relative">
          <button
            onClick={() => setShowZoomMenu(!showZoomMenu)}
            className={`px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors ${
              isFullscreen
                ? 'bg-white/10 hover:bg-white/20 text-white'
                : 'bg-white hover:bg-gray-100 text-gray-700 border border-gray-300'
            }`}
          >
            {getZoomLabel()}
            <ChevronDown size={16} />
          </button>

          {showZoomMenu && (
            <div 
              onClick={(e) => e.stopPropagation()}
              className={`absolute top-full right-0 mt-1 w-48 rounded-lg shadow-lg z-20 ${
                isFullscreen ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-300'
              }`}
            >
              {zoomOptions.map((option) => (
                <button
                  key={option.label}
                  onClick={() => {
                    setZoom(option.value);
                    setShowZoomMenu(false);
                  }}
                  className={`w-full px-4 py-2 text-left text-sm transition-colors ${
                    zoom === option.value
                      ? isFullscreen ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-700'
                      : isFullscreen ? 'text-white hover:bg-gray-800' : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={onToggleFullscreen}
          className={`p-2 rounded-lg transition-colors ${
            isFullscreen
              ? 'bg-white/10 hover:bg-white/20 text-white'
              : 'bg-white hover:bg-gray-100 text-gray-700 border border-gray-300'
          }`}
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
        </button>
      </div>
    </div>
  );
}
