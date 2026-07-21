'use client';

// Loaded browser-side only (dynamic import with ssr:false in parents), so the
// side-effect import of Pannellum — which sets window.pannellum — and its CSS
// are safe here.
import 'pannellum/build/pannellum.css';
import 'pannellum';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, Loader2, Maximize2, Minimize2, Minus, Plus, RotateCw,
} from 'lucide-react';
import { panoramaSrc, buildTourHotspotMarker } from './pannellum-utils';
import { getOptimizedImageUrl, IMAGE_SIZES } from '@/lib/image-url';

declare global {
  interface Window {
    pannellum: any;
  }
}

export interface TourPlayerHotspot {
  id: string;
  pitch: number;
  yaw: number;
  label: string;
  targetSceneId: string;
  targetPitch: number | null;
  targetYaw: number | null;
}

export interface TourPlayerScene {
  id: string;
  name: string;
  url: string;
  initialPitch: number;
  initialYaw: number;
  initialHfov: number;
  hotspots: TourPlayerHotspot[];
}

interface TourPlayerProps {
  tourName: string;
  scenes: TourPlayerScene[];
  startSceneId?: string | null;
  /** Show the tour/scene title overlay (top-left). */
  showTitle?: boolean;
  /** Show the room thumbnail strip (bottom). */
  showSceneStrip?: boolean;
  /** Hide the fullscreen button (e.g. when a parent already manages fullscreen). */
  allowFullscreen?: boolean;
}

const SCENE_FADE_MS = 900;

export default function TourPlayer({
  tourName,
  scenes,
  startSceneId,
  showTitle = true,
  showSceneStrip = true,
  allowFullscreen = true,
}: TourPlayerProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<any>(null);
  const scenesRef = useRef<TourPlayerScene[]>(scenes);
  scenesRef.current = scenes;

  const firstSceneId = useMemo(() => {
    if (startSceneId && scenes.some(s => s.id === startSceneId)) return startSceneId;
    return scenes[0]?.id ?? null;
  }, [scenes, startSceneId]);

  const [currentSceneId, setCurrentSceneId] = useState<string | null>(firstSceneId);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Native fullscreen when available; CSS overlay fallback when blocked (iframes).
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  const [cssFullscreen, setCssFullscreen] = useState(false);
  const isFullscreen = nativeFullscreen || cssFullscreen;
  const [currentHfov, setCurrentHfov] = useState(scenes[0]?.initialHfov ?? 105);

  /** Warm the browser cache for every scene reachable from the given scene. */
  const preloadNeighbors = useCallback((sceneId: string) => {
    const scene = scenesRef.current.find(s => s.id === sceneId);
    if (!scene) return;
    for (const h of scene.hotspots) {
      const target = scenesRef.current.find(s => s.id === h.targetSceneId);
      if (target) {
        const img = new window.Image();
        img.src = panoramaSrc(target.url);
      }
    }
  }, []);

  const goToScene = useCallback((targetSceneId: string, pitch?: number | null, yaw?: number | null) => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.getScene?.() === targetSceneId) return;
    try {
      viewer.loadScene(targetSceneId, pitch ?? undefined, yaw ?? undefined);
    } catch (err) {
      console.warn('Failed to load tour scene', targetSceneId, err);
    }
  }, []);

  // (Re)create the multi-scene viewer whenever the tour data changes.
  useEffect(() => {
    if (!containerRef.current || scenes.length === 0 || typeof window === 'undefined' || !window.pannellum || !firstSceneId) return;

    setLoadError(null);
    setIsLoaded(false);
    setLoadProgress(0);
    setCurrentSceneId(firstSceneId);

    const progressTimer = window.setInterval(() => {
      setLoadProgress((prev) => (prev < 90 ? prev + Math.max(4, Math.floor(Math.random() * 8)) : prev));
    }, 120);

    const sceneConfigs: Record<string, any> = {};
    for (const scene of scenes) {
      sceneConfigs[scene.id] = {
        type: 'equirectangular',
        panorama: panoramaSrc(scene.url),
        pitch: scene.initialPitch,
        yaw: scene.initialYaw,
        hfov: scene.initialHfov,
        hotSpots: scene.hotspots.map((h) => ({
          id: h.id,
          pitch: h.pitch,
          yaw: h.yaw,
          cssClass: 'tour-nav-hotspot-wrap',
          createTooltipFunc: buildTourHotspotMarker,
          createTooltipArgs: {
            label: h.label,
            onClick: () => goToScene(h.targetSceneId, h.targetPitch, h.targetYaw),
          },
        })),
      };
    }

    const viewer = window.pannellum.viewer(containerRef.current, {
      default: {
        firstScene: firstSceneId,
        sceneFadeDuration: SCENE_FADE_MS,
        autoLoad: true,
        showControls: false, // we render our own controls
        keyboardZoom: true,
        mouseZoom: true,
        draggable: true,
        friction: 0.15,
      },
      scenes: sceneConfigs,
    });
    viewerRef.current = viewer;

    try {
      viewer.on('load', () => {
        window.clearInterval(progressTimer);
        setLoadProgress(100);
        setIsLoaded(true);
        try { setCurrentHfov(viewer.getHfov()); } catch { /* noop */ }
        const sceneId = viewer.getScene?.();
        if (sceneId) preloadNeighbors(sceneId);
      });
      viewer.on('scenechange', (sceneId: string) => {
        setCurrentSceneId(sceneId);
        preloadNeighbors(sceneId);
      });
      viewer.on('error', (msg: string) => {
        window.clearInterval(progressTimer);
        console.error('Pannellum tour load error:', msg);
        setLoadError(msg || 'This tour could not be loaded.');
      });
    } catch { /* older builds may not expose .on */ }

    return () => {
      window.clearInterval(progressTimer);
      try { viewer.destroy(); } catch { /* noop */ }
      viewerRef.current = null;
    };
  }, [scenes, firstSceneId, goToScene, preloadNeighbors]);

  // Track native fullscreen exits (Esc key) so the button state stays in sync.
  useEffect(() => {
    const onChange = () => setNativeFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = () => {
    if (nativeFullscreen) {
      document.exitFullscreen().catch(() => {});
      return;
    }
    if (cssFullscreen) {
      setCssFullscreen(false);
      return;
    }
    const el = wrapRef.current;
    // Native fullscreen can be blocked inside iframes without allowfullscreen;
    // fall back to a fixed-position overlay in that case.
    if (el?.requestFullscreen) {
      el.requestFullscreen().catch(() => setCssFullscreen(true));
    } else {
      setCssFullscreen(true);
    }
  };

  const toggleAutoRotate = () => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    if (viewer.getConfig?.()?.autoRotate) viewer.stopAutoRotate();
    else viewer.startAutoRotate(-2);
  };

  const applyZoom = (nextHfov: number) => {
    const viewer = viewerRef.current;
    const clamped = Math.max(50, Math.min(140, nextHfov));
    setCurrentHfov(clamped);
    if (viewer?.setHfov) viewer.setHfov(clamped);
  };

  const currentScene = scenes.find(s => s.id === currentSceneId) ?? null;
  const currentIndex = currentScene ? scenes.indexOf(currentScene) : -1;

  if (scenes.length === 0) {
    return (
      <div className="relative flex-1 flex items-center justify-center bg-gray-900 text-white/70 text-sm">
        This tour has no scenes yet.
      </div>
    );
  }

  return (
    <div
      ref={wrapRef}
      className={`bg-black ${cssFullscreen ? 'fixed inset-0 z-[100]' : 'relative flex-1 h-full'}`}
    >
      <div ref={containerRef} className="absolute inset-0" />

      {/* Loading overlay until the first scene's texture is ready */}
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
            <h3 className="text-base font-semibold mb-1">Tour couldn’t be displayed</h3>
            <p className="text-sm text-white/60">
              A scene failed to load. Make sure every scene is a reachable,
              equirectangular (2:1 ratio) photo.
            </p>
            <p className="mt-2 text-xs text-white/40 break-words">{loadError}</p>
          </div>
        </div>
      )}

      {/* Top-left: tour + scene name */}
      {showTitle && (
        <div className="absolute top-3 left-3 z-20 flex items-center gap-2 max-w-[70%]">
          <span className="px-2.5 py-1 rounded-md bg-black/50 text-white text-xs font-semibold backdrop-blur-sm truncate">
            {tourName}
          </span>
          {currentScene && (
            <span className="px-2.5 py-1 rounded-md bg-black/40 text-white/80 text-xs backdrop-blur-sm truncate">
              {currentScene.name}
            </span>
          )}
        </div>
      )}

      {/* Top-right: controls */}
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
        <button
          onClick={toggleAutoRotate}
          className="p-1.5 rounded-md bg-black/50 text-white hover:bg-black/70 backdrop-blur-sm transition-colors"
          title="Toggle auto-rotate"
          aria-label="Toggle auto-rotate"
        >
          <RotateCw size={15} />
        </button>
        {allowFullscreen && (
          <button
            onClick={toggleFullscreen}
            className="p-1.5 rounded-md bg-black/50 text-white hover:bg-black/70 backdrop-blur-sm transition-colors"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
        )}
      </div>

      {/* Bottom: room strip + scene counter */}
      {showSceneStrip && scenes.length > 1 && (
        <div className="absolute bottom-0 inset-x-0 z-20 bg-gradient-to-t from-black/70 to-transparent pt-8 pb-3 px-3">
          <div className="flex items-end gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
            {scenes.map((scene) => (
              <button
                key={scene.id}
                onClick={() => goToScene(scene.id)}
                className={`group shrink-0 w-28 text-left transition-transform ${
                  scene.id === currentSceneId ? '' : 'hover:-translate-y-0.5'
                }`}
                title={scene.name}
              >
                <div
                  className={`relative h-16 w-28 rounded-lg overflow-hidden border-2 transition-colors ${
                    scene.id === currentSceneId ? 'border-orange-500' : 'border-white/25 group-hover:border-white/60'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={getOptimizedImageUrl(scene.url, IMAGE_SIZES.SIDEBAR_THUMB)}
                    alt={scene.name}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>
                <span className={`mt-1 block truncate text-[11px] font-medium ${
                  scene.id === currentSceneId ? 'text-orange-400' : 'text-white/80'
                }`}>
                  {scene.name}
                </span>
              </button>
            ))}
          </div>
          {currentIndex >= 0 && (
            <span className="absolute right-3 -top-1 px-2 py-0.5 rounded-md bg-black/50 text-white/80 text-[11px] backdrop-blur-sm">
              {currentIndex + 1} / {scenes.length}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
