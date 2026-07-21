'use client';

// Loaded browser-side only (dynamic import with ssr:false in the editor), so
// the side-effect import of Pannellum — which sets window.pannellum — and its
// CSS are safe here.
import 'pannellum/build/pannellum.css';
import 'pannellum';

import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle, Camera, Link2, Loader2, Minus, MousePointer2, Plus,
} from 'lucide-react';
import { panoramaSrc, buildTourHotspotMarker } from './pannellum-utils';

declare global {
  interface Window {
    pannellum: any;
  }
}

export interface EditorHotspot {
  id: string;
  pitch: number;
  yaw: number;
  /** Label shown on the marker (falls back to the target scene's name). */
  label: string;
}

export interface EditorScene {
  id: string;
  name: string;
  url: string;
  initialPitch: number;
  initialYaw: number;
  initialHfov: number;
}

interface TourEditorViewerProps {
  scene: EditorScene;
  hotspots: EditorHotspot[];
  selectedHotspotId: string | null;
  linkMode: boolean;
  onToggleLinkMode: () => void;
  /** A click in link-mode resolved to spherical coords. */
  onPlaceHotspot: (pitch: number, yaw: number) => void;
  onSelectHotspot: (id: string) => void;
  /** "Save entry view" — capture the camera's current pitch/yaw/hfov. */
  onCaptureView: (view: { pitch: number; yaw: number; hfov: number }) => void;
  isSavingView?: boolean;
  readOnly?: boolean;
}

export default function TourEditorViewer({
  scene,
  hotspots,
  selectedHotspotId,
  linkMode,
  onToggleLinkMode,
  onPlaceHotspot,
  onSelectHotspot,
  onCaptureView,
  isSavingView = false,
  readOnly = false,
}: TourEditorViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<any>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [currentHfov, setCurrentHfov] = useState(scene.initialHfov || 110);
  // Keep latest values reachable from persistent DOM listeners without re-init.
  const linkModeRef = useRef(linkMode);
  const onPlaceRef = useRef(onPlaceHotspot);
  const onSelectRef = useRef(onSelectHotspot);
  const downRef = useRef<{ x: number; y: number } | null>(null);

  linkModeRef.current = linkMode;
  onPlaceRef.current = onPlaceHotspot;
  onSelectRef.current = onSelectHotspot;

  // Escape exits link-placement mode.
  useEffect(() => {
    if (!linkMode) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onToggleLinkMode(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [linkMode, onToggleLinkMode]);

  // (Re)create the viewer when the scene changes.
  useEffect(() => {
    if (!containerRef.current || !scene.url || typeof window === 'undefined' || !window.pannellum) return;

    setLoadError(null);
    setIsLoaded(false);
    setLoadProgress(0);
    setCurrentHfov(scene.initialHfov || 110);

    const progressTimer = window.setInterval(() => {
      setLoadProgress((prev) => (prev < 90 ? prev + Math.max(4, Math.floor(Math.random() * 8)) : prev));
    }, 120);

    const viewer = window.pannellum.viewer(containerRef.current, {
      type: 'equirectangular',
      panorama: panoramaSrc(scene.url),
      autoLoad: true,
      showControls: false, // we render our own controls
      showZoomCtrl: false,
      keyboardZoom: true,
      mouseZoom: true,
      draggable: true,
      friction: 0.15,
      pitch: scene.initialPitch,
      yaw: scene.initialYaw,
      hfov: scene.initialHfov,
    });
    viewerRef.current = viewer;

    try {
      viewer.on('load', () => {
        window.clearInterval(progressTimer);
        setLoadProgress(100);
        setIsLoaded(true);
      });
      viewer.on('error', (msg: string) => {
        window.clearInterval(progressTimer);
        console.error('Pannellum load error:', msg, 'for', scene.url);
        setLoadError(msg || 'This scene could not be loaded.');
      });
    } catch { /* older builds may not expose .on */ }

    const el = containerRef.current;
    const onMouseDown = (e: MouseEvent) => { downRef.current = { x: e.clientX, y: e.clientY }; };
    const onClick = (e: MouseEvent) => {
      if (!linkModeRef.current) return;
      const down = downRef.current;
      // Ignore drags (panning) — only treat near-stationary clicks as placements.
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
      try {
        const coords = viewer.mouseEventToCoords(e); // [pitch, yaw]
        if (Array.isArray(coords)) onPlaceRef.current(coords[0], coords[1]);
      } catch {
        /* mouseEventToCoords throws if the scene isn't ready yet */
      }
    };
    el.addEventListener('mousedown', onMouseDown);
    el.addEventListener('click', onClick);

    return () => {
      window.clearInterval(progressTimer);
      el.removeEventListener('mousedown', onMouseDown);
      el.removeEventListener('click', onClick);
      try { viewer.destroy(); } catch { /* noop */ }
      viewerRef.current = null;
    };
    // Recreate only when the image itself changes; initial view edits are saved
    // from the live camera, so re-initialising for them would be disruptive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene.id, scene.url]);

  // Sync hotspot markers whenever links or the selection change, or after load.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !isLoaded) return;

    const added: string[] = [];
    for (const h of hotspots) {
      try {
        viewer.addHotSpot({
          id: h.id,
          pitch: h.pitch,
          yaw: h.yaw,
          cssClass: 'tour-nav-hotspot-wrap',
          createTooltipFunc: buildTourHotspotMarker,
          createTooltipArgs: {
            label: h.label,
            selected: h.id === selectedHotspotId,
            onClick: () => onSelectRef.current(h.id),
          },
        });
        added.push(h.id);
      } catch (err) {
        console.warn('Failed to add tour hotspot', h.id, err);
      }
    }
    return () => {
      for (const id of added) {
        try { viewer.removeHotSpot(id); } catch { /* noop */ }
      }
    };
  }, [hotspots, selectedHotspotId, isLoaded]);

  const applyZoom = (nextHfov: number) => {
    const viewer = viewerRef.current;
    const clamped = Math.max(50, Math.min(140, nextHfov));
    setCurrentHfov(clamped);
    if (viewer?.setHfov) viewer.setHfov(clamped);
  };

  const captureView = () => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    try {
      onCaptureView({
        pitch: viewer.getPitch(),
        yaw: viewer.getYaw(),
        hfov: viewer.getHfov(),
      });
    } catch { /* scene not ready */ }
  };

  return (
    <div className="relative flex-1 bg-gray-900">
      <div
        ref={containerRef}
        className={`absolute inset-0 ${linkMode && !readOnly ? 'cursor-crosshair' : ''}`}
      />

      {/* Loading spinner until the equirectangular texture is ready */}
      {!isLoaded && !loadError && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-900/70 pointer-events-none">
          <div className="w-56 rounded-xl border border-white/10 bg-black/55 p-4 text-center text-white shadow-xl">
            <div className="mb-3 flex items-center justify-center">
              <Loader2 className="h-6 w-6 text-white animate-spin" />
            </div>
            <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full rounded-full bg-orange-500 transition-all duration-300"
                style={{ width: `${Math.max(4, loadProgress)}%` }}
              />
            </div>
            <p className="text-xs font-medium text-white/80">{loadProgress}% loading</p>
          </div>
        </div>
      )}

      {/* Friendly failure state instead of a blank canvas */}
      {loadError && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-gray-900 p-6">
          <div className="max-w-sm text-center text-white/90">
            <AlertTriangle className="h-9 w-9 mx-auto mb-3 text-amber-400" />
            <h3 className="text-base font-semibold mb-1">Scene couldn’t be displayed</h3>
            <p className="text-sm text-white/60">
              This image failed to load. Make sure it’s a reachable, equirectangular
              (2:1 ratio) photo and that the storage URL is publicly accessible.
            </p>
            <p className="mt-2 text-xs text-white/40 break-words">{loadError}</p>
          </div>
        </div>
      )}

      {/* Top-left: scene name + link-mode toggle */}
      <div className="absolute top-3 left-3 z-20 flex items-center gap-2">
        <span className="px-2.5 py-1 rounded-md bg-black/50 text-white text-xs font-medium backdrop-blur-sm">
          {scene.name}
        </span>
        {!readOnly && (
          <button
            onClick={onToggleLinkMode}
            aria-pressed={linkMode}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium backdrop-blur-sm transition-colors ${
              linkMode ? 'bg-orange-500 text-white ring-2 ring-orange-300/70' : 'bg-black/50 text-white hover:bg-black/70'
            }`}
            title={linkMode
              ? 'Link mode is ON — click the panorama where visitors should walk to another scene. Click here or press Esc to stop.'
              : 'Place a navigation link to another scene'}
          >
            {linkMode ? <MousePointer2 size={13} /> : <Link2 size={13} />}
            {linkMode ? 'Link mode: ON' : 'Add navigation link'}
          </button>
        )}
      </div>

      {/* Link-mode hint */}
      {linkMode && !readOnly && isLoaded && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 rounded-full bg-black/60 text-white/90 text-xs backdrop-blur-sm pointer-events-none">
          Click where visitors should walk to the next room
        </div>
      )}

      {/* Top-right: zoom + entry-view capture */}
      <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
        <div className="flex items-center rounded-md bg-black/50 p-1 backdrop-blur-sm">
          <button
            onClick={() => applyZoom(currentHfov + 10)}
            className="p-1.5 text-white hover:bg-white/10 rounded-sm transition-colors"
            title="Zoom out"
            aria-label="Zoom out"
          >
            <Minus size={15} />
          </button>
          <button
            onClick={() => applyZoom(currentHfov - 10)}
            className="p-1.5 text-white hover:bg-white/10 rounded-sm transition-colors"
            title="Zoom in"
            aria-label="Zoom in"
          >
            <Plus size={15} />
          </button>
        </div>
        {!readOnly && (
          <button
            onClick={captureView}
            disabled={isSavingView || !isLoaded}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-black/50 text-white text-xs font-medium hover:bg-black/70 backdrop-blur-sm transition-colors disabled:opacity-50"
            title="Save the current camera angle as this scene's entry view — visitors arrive facing this direction"
          >
            {isSavingView ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
            Save entry view
          </button>
        )}
      </div>
    </div>
  );
}
