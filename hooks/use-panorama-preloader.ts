'use client';

import { useEffect, useRef } from 'react';

/**
 * Preloads panorama images in the background so switching between panoramas
 * in a project feels instant.
 *
 * Unlike regular images, panorama images are typically larger equirectangular
 * files (2:1 ratio, often 2-10 MB each). Preloading them while viewing ensures
 * smooth navigation through a project's panoramas.
 *
 * Neighbours of the current image are preloaded eagerly (covers Prev/Next and
 * most thumbnail clicks); the remaining images are warmed during idle time so
 * jumping to any thumbnail is eventually instant too.
 */
export function usePanoramaPreloader(urls: string[], currentIndex: number) {
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
    // rest to idle time to avoid contending with the active panorama load.
    const eager = order.slice(0, 3); // Reduce eager count (panoramas are larger)
    const deferred = order.slice(3);
    eager.forEach(i => preload(urls[i]));

    if (deferred.length === 0) return;

    const runDeferred = () => deferred.forEach(i => preload(urls[i]));
    const idle = window as typeof window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    if (idle.requestIdleCallback) {
      const id = idle.requestIdleCallback(runDeferred, { timeout: 2500 });
      return () => idle.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(runDeferred, 500);
    return () => clearTimeout(id);
  }, [urls, currentIndex]);
}
