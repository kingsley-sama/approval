'use client';

import { useEffect } from 'react';
import { documentTitle } from '@/lib/app-title';

/**
 * Keeps the browser tab titled after the open project.
 *
 * Pages set an initial title through Next metadata, but the name can arrive
 * (or change) client-side — the workspaces load it after mount and update it
 * on rename — so this mirrors the current value into `document.title`.
 *
 * There is deliberately no cleanup on unmount: navigating away re-resolves the
 * destination route's metadata, which sets the title itself. Resetting here
 * would race that and flash the default title.
 */
export function useDocumentTitle(name?: string | null): void {
  useEffect(() => {
    if (!name?.trim()) return;
    document.title = documentTitle(name);
  }, [name]);
}
