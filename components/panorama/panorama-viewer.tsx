'use client';

// Loaded browser-side only (dynamic import with ssr:false in the workspace), so
// the side-effect import of Pannellum — which sets window.pannellum — and its CSS
// are safe here.
import 'pannellum/build/pannellum.css';
import 'pannellum';

import React, { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, RotateCw, Plus, MousePointer2 } from 'lucide-react';

declare global {
  interface Window {
    pannellum: any;
  }
}

export interface PanoramaHotspot {
  id: string;
  number: number;
  pitch: number;
  yaw: number;
  status: 'active' | 'resolved';
  content: string;
}

interface PanoramaViewerProps {
  imageUrl: string;
  imageName?: string;
  hotspots: PanoramaHotspot[];
  selectedId: string | null;
  addMode: boolean;
  onToggleAddMode: () => void;
  /** A click in add-mode resolved to spherical coords + the screen point of the click. */
  onAddHotspot: (pitch: number, yaw: number, screen: { x: number; y: number }) => void;
  onSelectHotspot: (id: string) => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  currentImageIndex: number;
  totalImages: number;
  onNavigate: (direction: 'prev' | 'next') => void;
  readOnly?: boolean;
}

const ACTIVE_COLOR = '#f97316';   // orange-500
const RESOLVED_COLOR = '#22c55e'; // green-500

/** Build the DOM for a numbered hotspot marker. Called by Pannellum, which
 *  positions the returned element at the hotspot's pitch/yaw. */
function buildHotspotTooltip(
  hotSpotDiv: HTMLElement,
  args: { number: number; status: 'active' | 'resolved'; selected: boolean; content: string; onClick: () => void },
) {
  hotSpotDiv.classList.add('pano-hotspot');
  const marker = document.createElement('div');
  const color = args.status === 'resolved' ? RESOLVED_COLOR : ACTIVE_COLOR;
  marker.style.cssText = [
    'width:26px', 'height:26px', 'border-radius:9999px',
    `background:${color}`, 'color:#fff', 'display:flex',
    'align-items:center', 'justify-content:center',
    'font-size:12px', 'font-weight:700', 'cursor:pointer',
    'box-shadow:0 0 0 2px #fff, 0 2px 6px rgba(0,0,0,.4)',
    'transform:translate(-50%,-50%)',
    args.selected ? 'outline:3px solid rgba(255,255,255,.9)' : '',
    args.status === 'resolved' ? 'opacity:.85' : '',
  ].join(';');
  marker.textContent = String(args.number);
  marker.title = args.content;
  marker.addEventListener('click', (e) => { e.stopPropagation(); args.onClick(); });
  hotSpotDiv.appendChild(marker);
}

export default function PanoramaViewer({
  imageUrl,
  imageName,
  hotspots,
  selectedId,
  addMode,
  onToggleAddMode,
  onAddHotspot,
  onSelectHotspot,
  isFullscreen,
  onToggleFullscreen,
  currentImageIndex,
  totalImages,
  onNavigate,
  readOnly = false,
}: PanoramaViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<any>(null);
  // Keep latest values reachable from persistent DOM listeners without re-init.
  const addModeRef = useRef(addMode);
  const onAddRef = useRef(onAddHotspot);
  const onSelectRef = useRef(onSelectHotspot);
  const downRef = useRef<{ x: number; y: number } | null>(null);

  addModeRef.current = addMode;
  onAddRef.current = onAddHotspot;
  onSelectRef.current = onSelectHotspot;

  // (Re)create the viewer when the image changes.
  useEffect(() => {
    if (!containerRef.current || !imageUrl || typeof window === 'undefined' || !window.pannellum) return;

    const viewer = window.pannellum.viewer(containerRef.current, {
      type: 'equirectangular',
      panorama: imageUrl,
      autoLoad: true,
      showControls: false, // we render our own controls
      showZoomCtrl: false,
      keyboardZoom: true,
      mouseZoom: true,
      draggable: true,
      friction: 0.15,
    });
    viewerRef.current = viewer;

    const el = containerRef.current;
    const onMouseDown = (e: MouseEvent) => { downRef.current = { x: e.clientX, y: e.clientY }; };
    const onClick = (e: MouseEvent) => {
      if (readOnly || !addModeRef.current) return;
      const down = downRef.current;
      // Ignore drags (panning) — only treat near-stationary clicks as placements.
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
      try {
        const coords = viewer.mouseEventToCoords(e); // [pitch, yaw]
        if (Array.isArray(coords)) {
          onAddRef.current(coords[0], coords[1], { x: e.clientX, y: e.clientY });
        }
      } catch {
        /* mouseEventToCoords throws if the scene isn't ready yet */
      }
    };
    el.addEventListener('mousedown', onMouseDown);
    el.addEventListener('click', onClick);

    return () => {
      el.removeEventListener('mousedown', onMouseDown);
      el.removeEventListener('click', onClick);
      try { viewer.destroy(); } catch { /* noop */ }
      viewerRef.current = null;
    };
  }, [imageUrl, readOnly]);

  // Sync hotspots whenever the comments or selection change.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    // Pannellum has no "clear all" — track what we added and remove each.
    const added: string[] = [];
    for (const h of hotspots) {
      try {
        viewer.addHotSpot({
          id: h.id,
          pitch: h.pitch,
          yaw: h.yaw,
          cssClass: 'pano-hotspot-wrap',
          createTooltipFunc: buildHotspotTooltip,
          createTooltipArgs: {
            number: h.number,
            status: h.status,
            selected: h.id === selectedId,
            content: h.content,
            onClick: () => onSelectRef.current(h.id),
          },
        });
        added.push(h.id);
      } catch {
        /* a duplicate id or not-yet-loaded scene — skip */
      }
    }
    return () => {
      for (const id of added) {
        try { viewer.removeHotSpot(id); } catch { /* noop */ }
      }
    };
  }, [hotspots, selectedId]);

  const toggleAutoRotate = () => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    // -2 deg/s when starting; 0 stops.
    if (viewer.getConfig?.()?.autoRotate) viewer.stopAutoRotate();
    else viewer.startAutoRotate(-2);
  };

  return (
    <div className={`relative flex-1 ${isFullscreen ? 'bg-black' : 'bg-gray-900'}`}>
      <div
        ref={containerRef}
        className={`absolute inset-0 ${addMode && !readOnly ? 'cursor-crosshair' : ''}`}
      />

      {/* Top-left: image name + add-comment toggle */}
      <div className="absolute top-3 left-3 z-20 flex items-center gap-2">
        {imageName && (
          <span className="px-2.5 py-1 rounded-md bg-black/50 text-white text-xs font-medium backdrop-blur-sm">
            {imageName}
          </span>
        )}
        {!readOnly && (
          <button
            onClick={onToggleAddMode}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium backdrop-blur-sm transition-colors ${
              addMode ? 'bg-orange-500 text-white' : 'bg-black/50 text-white hover:bg-black/70'
            }`}
            title={addMode ? 'Click the panorama to drop a comment' : 'Add a comment'}
          >
            {addMode ? <MousePointer2 size={13} /> : <Plus size={13} />}
            {addMode ? 'Click to place' : 'Add comment'}
          </button>
        )}
      </div>

      {/* Top-right: controls */}
      <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
        <button
          onClick={toggleAutoRotate}
          className="p-1.5 rounded-md bg-black/50 text-white hover:bg-black/70 backdrop-blur-sm transition-colors"
          title="Toggle auto-rotate"
        >
          <RotateCw size={15} />
        </button>
        <button
          onClick={onToggleFullscreen}
          className="p-1.5 rounded-md bg-black/50 text-white hover:bg-black/70 backdrop-blur-sm transition-colors"
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>
      </div>

      {/* Bottom-center: image navigation */}
      {totalImages > 1 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2">
          <button
            onClick={() => onNavigate('prev')}
            disabled={currentImageIndex <= 0}
            className="p-1.5 rounded-md bg-black/50 text-white hover:bg-black/70 backdrop-blur-sm transition-colors disabled:opacity-40"
            title="Previous panorama"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="px-2 py-1 rounded-md bg-black/50 text-white text-xs backdrop-blur-sm">
            {currentImageIndex + 1} / {totalImages}
          </span>
          <button
            onClick={() => onNavigate('next')}
            disabled={currentImageIndex >= totalImages - 1}
            className="p-1.5 rounded-md bg-black/50 text-white hover:bg-black/70 backdrop-blur-sm transition-colors disabled:opacity-40"
            title="Next panorama"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
