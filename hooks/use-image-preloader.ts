'use client';

import { useEffect, useRef } from 'react';

/**
 * Warms the browser cache for full-resolution images so switching between them
 * feels instant.
 *
 * The annotation viewer renders originals with `unoptimized`, so the full-size
 * file for an image is only ever downloaded the first time it becomes the
 * current image — the sidebar only fetches a 128px thumbnail. Without this,
 * every switch triggers a fresh multi-MB fetch + decode (the "laggy switch").
 *
 * Neighbours of the current image are preloaded eagerly (covers Prev/Next and
 * most thumbnail clicks); the remaining images are warmed during idle time so
 * jumping to any thumbnail is eventually instant too.
 */
export function useImagePreloader(urls: string[], currentIndex: number) {
  // Hold references to the in-flight Image objects so they aren't garbage
  // collected before the browser finishes caching them.
  const cache = useRef<Map<string, HTMLImageElement>>(new Map());

  useEffect(() => {
    if (typeof window === 'undefined' || urls.length === 0) return;

    const preload = (url: string | undefined) => {
      if (!url || cache.current.has(url)) return;
      const img = new window.Image();
      img.decoding = 'async';
      img.src = url;
      cache.current.set(url, img);
    };

    // Visit order: current first, then expand outward (next, prev, next+1, …)
    // so the images most likely to be viewed next are warmed first.
    const order: number[] = [currentIndex];
    for (let d = 1; d < urls.length; d++) {
      if (currentIndex + d < urls.length) order.push(currentIndex + d);
      if (currentIndex - d >= 0) order.push(currentIndex - d);
    }

    // Eagerly warm the current image and its immediate neighbours; defer the
    // rest to idle time to avoid contending with the active fetch.
    const eager = order.slice(0, 4);
    const deferred = order.slice(4);
    eager.forEach(i => preload(urls[i]));

    if (deferred.length === 0) return;

    const runDeferred = () => deferred.forEach(i => preload(urls[i]));
    const idle = window as typeof window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    if (idle.requestIdleCallback) {
      const id = idle.requestIdleCallback(runDeferred, { timeout: 2000 });
      return () => idle.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(runDeferred, 300);
    return () => clearTimeout(id);
  }, [urls, currentIndex]);
}
