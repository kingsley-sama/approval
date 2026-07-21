'use client';

// Loaded browser-side only (dynamic import with ssr:false in the workspace), so
// the side-effect import of Pannellum — which sets window.pannellum — and its CSS
// are safe here.
import 'pannellum/build/pannellum.css';
import 'pannellum';

import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, RotateCw, Plus, Minus, MousePointer2, AlertTriangle, Loader2 } from 'lucide-react';
import { panoramaImageUrl } from '@/lib/panorama-image';

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

/**
 * Pannellum uploads the panorama to a WebGL texture, which requires a
 * CORS-enabled image. Pannellum requests panoramas with `crossOrigin:
 * 'anonymous'` (its default) and Supabase Storage serves public objects with
 * `Access-Control-Allow-Origin: *`, so images load directly from Supabase's CDN
 * — no same-origin proxy needed. (Previously routed through /api/panorama-proxy,
 * which streamed every full-size image through a serverless function and burned
 * host bandwidth; serving direct is free.)
 *
 * We also run the image through Supabase's on-read transform (resize + re-encode)
 * so viewers download a fraction of the raw equirectangular file — see
 * `panoramaImageUrl`. If that transformed URL fails to load (source over
 * Supabase's 50MP/25MB transform limit), the effect below falls back to the
 * untransformed original.
 */
function panoramaSrc(url: string): string {
  return panoramaImageUrl(url);
}

/**
 * Load a panorama image with retries. The first cold load of a not-yet-cached
 * image can transiently fail (proxy cold start / large file); a plain onerror
 * would then strand the user on the error overlay even though a reload fixes it.
 * Retrying a couple of times with backoff — and a cache-busting param so a
 * failed response isn't reused — makes that self-heal automatically.
 * Returns a cleanup function that cancels any pending retry.
 */
function loadPanoramaWithRetry(
  src: string,
  { onLoad, onError }: { onLoad: () => void; onError: () => void },
  maxAttempts = 3,
): () => void {
  let attempt = 0;
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let img: HTMLImageElement | null = null;

  const tryLoad = () => {
    if (cancelled) return;
    attempt += 1;
    img = new window.Image();
    // Match Pannellum's CORS request so this probe and the WebGL texture load
    // share one browser cache entry instead of downloading the image twice.
    img.crossOrigin = 'anonymous';
    img.onload = () => { if (!cancelled) onLoad(); };
    img.onerror = () => {
      if (cancelled) return;
      if (attempt < maxAttempts) {
        // Exponential backoff (500ms, 1000ms); bust the cache so we don't
        // re-read a cached error response.
        timer = setTimeout(tryLoad, 500 * attempt);
      } else {
        onError();
      }
    };
    // Only add the cache-buster on retries, so the first (usually successful)
    // load shares the same URL Pannellum uses and hits the same cache entry.
    img.src = attempt === 1 ? src : `${src}${src.includes('?') ? '&' : '?'}_retry=${attempt}`;
  };

  tryLoad();

  return () => {
    cancelled = true;
    if (timer) clearTimeout(timer);
    if (img) { img.onload = null; img.onerror = null; }
  };
}

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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [currentHfov, setCurrentHfov] = useState(100);
  // When the Supabase transform fails (source over the 50MP/25MB limit), fall
  // back to the untransformed original. Reset whenever the image changes.
  const [useOriginalSrc, setUseOriginalSrc] = useState(false);
  // Keep latest values reachable from persistent DOM listeners without re-init.
  const addModeRef = useRef(addMode);
  const onAddRef = useRef(onAddHotspot);
  const onSelectRef = useRef(onSelectHotspot);
  const downRef = useRef<{ x: number; y: number } | null>(null);

  addModeRef.current = addMode;
  onAddRef.current = onAddHotspot;
  onSelectRef.current = onSelectHotspot;

  // Escape exits the persistent comment mode.
  useEffect(() => {
    if (!addMode) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onToggleAddMode(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [addMode, onToggleAddMode]);

  // (Re)create the viewer when the image changes.
  useEffect(() => {
    if (!containerRef.current || !imageUrl || typeof window === 'undefined' || !window.pannellum) return;

    setLoadError(null);
    setIsLoaded(false);
    setLoadProgress(0);
    setCurrentHfov(100);

    const progressTimer = window.setInterval(() => {
      setLoadProgress((prev) => (prev < 90 ? prev + Math.max(4, Math.floor(Math.random() * 8)) : prev));
    }, 120);

    // Transformed (small) URL by default; the untransformed original only after
    // a transform failure. `resolvedSrc !== imageUrl` tells us the transform is
    // in play, which is what lets the error handler try the fallback exactly once.
    const resolvedSrc = useOriginalSrc ? imageUrl : panoramaSrc(imageUrl);

    const viewer = window.pannellum.viewer(containerRef.current, {
      type: 'equirectangular',
      panorama: resolvedSrc,
      autoLoad: true,
      showControls: false, // we render our own controls
      showZoomCtrl: false,
      keyboardZoom: true,
      mouseZoom: true,
      draggable: true,
      friction: 0.15,
    });
    viewerRef.current = viewer;

    // Surface load failures (unreachable URL, CORS, non-equirectangular image)
    // as a friendly overlay instead of a silent blank canvas.
    try {
      viewer.on('load', () => {
        window.clearInterval(progressTimer);
        setLoadProgress(100);
        setIsLoaded(true);
      });
      viewer.on('error', (msg: string) => {
        window.clearInterval(progressTimer);
        // If the transformed URL failed (e.g. source exceeds Supabase's
        // 50MP/25MB transform limit), retry once with the untransformed
        // original before surfacing an error.
        if (!useOriginalSrc && resolvedSrc !== imageUrl) {
          console.warn('Panorama transform failed, falling back to original:', msg, 'for', imageUrl);
          setUseOriginalSrc(true);
          return;
        }
        console.error('Pannellum load error:', msg, 'for', imageUrl);
        setLoadError(msg || 'This panorama could not be loaded.');
      });
    } catch { /* older builds may not expose .on */ }

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

    const cancelImageLoad = loadPanoramaWithRetry(resolvedSrc, {
      onLoad: () => {
        window.clearInterval(progressTimer);
        setLoadProgress(100);
      },
      onError: () => {
        window.clearInterval(progressTimer);
        // Let the Pannellum 'error' handler above drive the transform→original
        // fallback; only show the overlay once we're already on the original.
        if (useOriginalSrc || resolvedSrc === imageUrl) {
          setLoadError('The panorama image could not be loaded.');
        }
      },
    });

    return () => {
      window.clearInterval(progressTimer);
      el.removeEventListener('mousedown', onMouseDown);
      el.removeEventListener('click', onClick);
      cancelImageLoad();
      try { viewer.destroy(); } catch { /* noop */ }
      viewerRef.current = null;
    };
  }, [imageUrl, readOnly, useOriginalSrc]);

  // A new image starts optimistic again: try its transformed URL first.
  useEffect(() => {
    setUseOriginalSrc(false);
  }, [imageUrl]);

  // Sync hotspots whenever the comments or selection change, or when the image finishes loading.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !isLoaded) return;

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
      } catch (err) {
        console.warn('Failed to add hotspot', h.id, err);
        /* a duplicate id or not-yet-loaded scene — skip */
      }
    }
    return () => {
      for (const id of added) {
        try { viewer.removeHotSpot(id); } catch { /* noop */ }
      }
    };
  }, [hotspots, selectedId, isLoaded]);

  const toggleAutoRotate = () => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    // -2 deg/s when starting; 0 stops.
    if (viewer.getConfig?.()?.autoRotate) viewer.stopAutoRotate();
    else viewer.startAutoRotate(-2);
  };

  const applyZoom = (nextHfov: number) => {
    const viewer = viewerRef.current;
    const clamped = Math.max(60, Math.min(160, nextHfov));
    setCurrentHfov(clamped);
    if (!viewer) return;
    if (typeof viewer.setHfov === 'function') {
      viewer.setHfov(clamped);
    } else if (typeof viewer.setZoom === 'function') {
      viewer.setZoom(clamped / 100);
    }
  };

  return (
    <div className={`relative flex-1 ${isFullscreen ? 'bg-black' : 'bg-gray-900'}`}>
      <div
        ref={containerRef}
        className={`absolute inset-0 ${addMode && !readOnly ? 'cursor-crosshair' : ''}`}
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
            <h3 className="text-base font-semibold mb-1">Panorama couldn’t be displayed</h3>
            <p className="text-sm text-white/60">
              This image failed to load. Make sure it’s a reachable, equirectangular
              (2:1 ratio) photo and that the storage URL is publicly accessible.
            </p>
            {loadError && (
              <p className="mt-2 text-xs text-white/40 break-words">{loadError}</p>
            )}
          </div>
        </div>
      )}

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
            aria-pressed={addMode}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium backdrop-blur-sm transition-colors ${
              addMode ? 'bg-orange-500 text-white ring-2 ring-orange-300/70' : 'bg-black/50 text-white hover:bg-black/70'
            }`}
            title={addMode ? 'Comment mode is ON — click the panorama to drop comments. Click here or press Esc to stop.' : 'Turn on comment mode'}
          >
            {addMode ? <MousePointer2 size={13} /> : <Plus size={13} />}
            {addMode ? 'Comment mode: ON' : 'Add comment'}
          </button>
        )}
      </div>

      {/* Top-right: controls */}
      <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
        <div className="flex items-center rounded-md bg-black/50 p-1 backdrop-blur-sm">
          <button
            onClick={() => applyZoom(currentHfov - 10)}
            className="p-1.5 text-white hover:bg-white/10 rounded-sm transition-colors"
            title="Zoom out"
            aria-label="Zoom out"
          >
            <Minus size={15} />
          </button>
          <button
            onClick={() => applyZoom(currentHfov + 10)}
            className="p-1.5 text-white hover:bg-white/10 rounded-sm transition-colors"
            title="Zoom in"
            aria-label="Zoom in"
          >
            <Plus size={15} />
          </button>
        </div>
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
