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
import {
  panoramaSrc, panoramaRetrySrc, plainPannellumError, buildTourHotspotMarker, MAX_AUTO_RETRIES,
} from './pannellum-utils';
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

/** Crossfade between scenes. */
const SCENE_FADE_MS = 650;
/** Camera glide toward the clicked hotspot before the crossfade. */
const STEP_IN_MS = 450;
/** Settle from the zoomed-in entry view to the scene's normal field of view. */
const STEP_OUT_MS = 750;
/** Entry hfov as a fraction of the target's — the "walking in" effect. */
const STEP_ZOOM = 0.7;
/** How long a transition waits for a not-yet-downloaded scene before letting
 *  Pannellum fetch it itself (it then shows its own loading state). */
const MAX_PREFETCH_WAIT_MS = 4000;
/** Parallel background downloads while warming the rest of the tour. */
const BACKGROUND_PRELOAD_CONCURRENCY = 2;
/** Stop warming non-adjacent rooms past this much downloaded data — protects
 *  memory/bandwidth on tours whose scenes have no web-optimized copy yet. */
const BACKGROUND_PRELOAD_BUDGET_BYTES = 150 * 1024 * 1024;

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
  const sceneConfigsRef = useRef<Record<string, any>>({});
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
  /** A hotspot was clicked but the next scene is still downloading. */
  const [awaitingScene, setAwaitingScene] = useState(false);
  // Native fullscreen when available; CSS overlay fallback when blocked (iframes).
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  const [cssFullscreen, setCssFullscreen] = useState(false);
  const isFullscreen = nativeFullscreen || cssFullscreen;
  const [currentHfov, setCurrentHfov] = useState(scenes[0]?.initialHfov ?? 105);
  // Reload attempt after a scene fails: rebuilds the viewer at that scene with a
  // cache-busted URL. Scoped to the current `scenes` so new tour data starts fresh.
  const [reload, setReload] = useState<{ scenes: TourPlayerScene[]; sceneId: string; attempt: number } | null>(null);
  const activeReload = reload && reload.scenes === scenes && scenes.some(s => s.id === reload.sceneId) ? reload : null;
  const startId = activeReload?.sceneId ?? firstSceneId;
  const attempt = activeReload?.attempt ?? 0;

  // ── preloading ────────────────────────────────────────────────────────────
  // Scenes are downloaded ahead of time into in-memory blob URLs and swapped
  // into Pannellum's (live-read) scene configs, so walking into a room never
  // waits on the network — independent of the storage CDN's cache headers.
  const blobUrlsRef = useRef(new Map<string, string>());
  const inflightRef = useRef(new Map<string, Promise<string | null>>());
  const preloadedBytesRef = useRef(0);

  const applyBlobUrl = useCallback((url: string, blobUrl: string) => {
    for (const scene of scenesRef.current) {
      const cfg = sceneConfigsRef.current[scene.id];
      if (scene.url === url && cfg && !cfg.__retry) cfg.panorama = blobUrl;
    }
  }, []);

  const prefetchScene = useCallback((url: string): Promise<string | null> => {
    const ready = blobUrlsRef.current.get(url);
    if (ready) return Promise.resolve(ready);
    const pending = inflightRef.current.get(url);
    if (pending) return pending;
    const p = fetch(panoramaSrc(url), { mode: 'cors' })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then(blob => {
        preloadedBytesRef.current += blob.size;
        const blobUrl = URL.createObjectURL(blob);
        blobUrlsRef.current.set(url, blobUrl);
        applyBlobUrl(url, blobUrl);
        return blobUrl;
      })
      .catch(err => {
        // Not fatal: Pannellum will request the URL itself when the scene opens.
        console.warn('Tour scene preload failed', url, err);
        return null;
      })
      .finally(() => inflightRef.current.delete(url));
    inflightRef.current.set(url, p);
    return p;
  }, [applyBlobUrl]);

  // Free the downloaded scenes when the player goes away.
  useEffect(() => {
    const blobUrls = blobUrlsRef.current;
    return () => {
      for (const blobUrl of blobUrls.values()) URL.revokeObjectURL(blobUrl);
      blobUrls.clear();
    };
  }, []);

  /** Rooms reachable from `sceneId` first (in parallel), then the rest of the
   *  tour quietly in the background, so every click is instant. */
  const preloadFrom = useCallback((sceneId: string) => {
    const all = scenesRef.current;
    const scene = all.find(s => s.id === sceneId);
    if (!scene) return;
    const neighborIds = new Set(scene.hotspots.map(h => h.targetSceneId));
    const neighbors = all.filter(s => neighborIds.has(s.id));
    // Everything else, with the current room last (it's already on screen).
    const rest = [
      ...all.filter(s => s.id !== sceneId && !neighborIds.has(s.id)),
      scene,
    ];

    void Promise.all(neighbors.map(s => prefetchScene(s.url))).then(async () => {
      const queue = [...rest];
      const worker = async () => {
        for (let next = queue.shift(); next; next = queue.shift()) {
          if (scenesRef.current !== all) return; // tour data changed — stop
          if (preloadedBytesRef.current > BACKGROUND_PRELOAD_BUDGET_BYTES) return;
          await prefetchScene(next.url);
        }
      };
      await Promise.all(Array.from({ length: BACKGROUND_PRELOAD_CONCURRENCY }, worker));
    });
  }, [prefetchScene]);

  // ── navigation ────────────────────────────────────────────────────────────
  const transitioningRef = useRef(false);
  /** hfov to settle to once the scene being entered has loaded. */
  const settleHfovRef = useRef<number | null>(null);

  /**
   * Move to another scene. From a hotspot (`from` set) this is a Biganto-style
   * step: glide the camera toward the marker while zooming in, crossfade, and
   * settle out of a zoomed-in view of the next room — reads as walking forward.
   * From the scene strip it is a plain crossfade.
   */
  const goToScene = useCallback(async (
    targetSceneId: string,
    pitch?: number | null,
    yaw?: number | null,
    from?: { pitch: number; yaw: number },
  ) => {
    const viewer = viewerRef.current;
    if (!viewer || transitioningRef.current || viewer.getScene?.() === targetSceneId) return;
    const target = scenesRef.current.find(s => s.id === targetSceneId);
    if (!target) return;
    transitioningRef.current = true;

    try {
      const ready = prefetchScene(target.url);
      const glide = from
        ? new Promise<void>((resolve) => {
            try {
              const hfov = viewer.getHfov();
              // Keep the glide near eye level even for floor markers.
              viewer.lookAt(from.pitch * 0.4, from.yaw, Math.max(40, hfov * STEP_ZOOM), STEP_IN_MS, resolve);
            } catch { resolve(); }
          })
        : Promise.resolve();

      await glide;
      let waited = false;
      const timeout = new Promise<null>(r => window.setTimeout(() => r(null), MAX_PREFETCH_WAIT_MS));
      const pendingTimer = window.setTimeout(() => { waited = true; setAwaitingScene(true); }, 150);
      await Promise.race([ready, timeout]);
      window.clearTimeout(pendingTimer);
      if (waited) setAwaitingScene(false);
      if (viewerRef.current !== viewer) return; // viewer was rebuilt meanwhile

      const settle = target.initialHfov;
      settleHfovRef.current = from ? settle : null;
      viewer.loadScene(
        targetSceneId,
        pitch ?? target.initialPitch,
        yaw ?? target.initialYaw,
        from ? settle * STEP_ZOOM : settle,
      );
    } catch (err) {
      console.warn('Failed to load tour scene', targetSceneId, err);
    } finally {
      transitioningRef.current = false;
    }
  }, [prefetchScene]);

  // (Re)create the multi-scene viewer whenever the tour data changes.
  useEffect(() => {
    if (!containerRef.current || scenes.length === 0 || typeof window === 'undefined' || !window.pannellum || !startId) return;

    setLoadError(null);
    setIsLoaded(false);
    setLoadProgress(0);
    setAwaitingScene(false);
    setCurrentSceneId(startId);
    settleHfovRef.current = null;
    let retryTimer: number | undefined;

    const progressTimer = window.setInterval(() => {
      setLoadProgress((prev) => (prev < 90 ? prev + Math.max(4, Math.floor(Math.random() * 8)) : prev));
    }, 120);

    const sceneConfigs: Record<string, any> = {};
    for (const scene of scenes) {
      const isRetry = scene.id === startId && attempt > 0;
      sceneConfigs[scene.id] = {
        type: 'equirectangular',
        // A retry goes back to the network with a fresh URL; otherwise use the
        // preloaded copy when we already have it.
        panorama: isRetry
          ? panoramaRetrySrc(panoramaSrc(scene.url), attempt)
          : blobUrlsRef.current.get(scene.url) ?? panoramaSrc(scene.url),
        __retry: isRetry || undefined,
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
            onClick: () => goToScene(h.targetSceneId, h.targetPitch, h.targetYaw, { pitch: h.pitch, yaw: h.yaw }),
          },
        })),
      };
    }
    sceneConfigsRef.current = sceneConfigs;

    const viewer = window.pannellum.viewer(containerRef.current, {
      default: {
        firstScene: startId,
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
        const settle = settleHfovRef.current;
        settleHfovRef.current = null;
        if (settle != null) {
          // Step out of the zoomed entry view while the crossfade finishes.
          try { viewer.setHfov(settle, STEP_OUT_MS); } catch { /* noop */ }
          setCurrentHfov(settle);
        } else {
          try { setCurrentHfov(viewer.getHfov()); } catch { /* noop */ }
        }
        const sceneId = viewer.getScene?.();
        if (sceneId) preloadFrom(sceneId);
      });
      viewer.on('scenechange', (sceneId: string) => {
        setCurrentSceneId(sceneId);
      });
      viewer.on('error', (msg: string) => {
        window.clearInterval(progressTimer);
        settleHfovRef.current = null;
        const failedId: string = viewer.getScene?.() ?? startId;
        const nextAttempt = failedId === startId ? attempt + 1 : 1;
        console.error('Pannellum tour load error:', msg, 'scene', failedId, 'attempt', nextAttempt - 1);
        if (nextAttempt <= MAX_AUTO_RETRIES) {
          // Transient failures (cold CDN load, stale non-CORS cache entry) usually
          // clear on a fresh request — retry quietly before showing the error.
          retryTimer = window.setTimeout(
            () => setReload({ scenes, sceneId: failedId, attempt: nextAttempt }),
            700 * nextAttempt,
          );
          return;
        }
        setLoadError(plainPannellumError(msg || '') || 'This tour could not be loaded.');
      });
    } catch { /* older builds may not expose .on */ }

    return () => {
      window.clearInterval(progressTimer);
      window.clearTimeout(retryTimer);
      try { viewer.destroy(); } catch { /* noop */ }
      viewerRef.current = null;
    };
  }, [scenes, startId, attempt, goToScene, preloadFrom]);

  const retryFailedScene = () => {
    if (!startId) return;
    setReload({ scenes, sceneId: currentSceneId ?? startId, attempt: attempt + 1 });
  };

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

      {/* Next room still downloading after a hotspot click */}
      {awaitingScene && isLoaded && !loadError && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <div className="rounded-full bg-black/45 p-3 backdrop-blur-sm">
            <Loader2 className="h-6 w-6 text-white animate-spin" />
          </div>
        </div>
      )}

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
            <button
              onClick={retryFailedScene}
              className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20 transition-colors"
            >
              <RotateCw className="h-3.5 w-3.5" />
              Try again
            </button>
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
