'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { Orbit } from 'lucide-react';
import type { TourPlayerScene } from './tour-player';

// Pannellum touches `window` at module scope — load it browser-side only.
const TourPlayer = dynamic(() => import('./tour-player'), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center bg-gray-900">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white" />
    </div>
  ),
});

interface TourShareViewerProps {
  tourName: string;
  scenes: TourPlayerScene[];
  startSceneId: string | null;
  /** Slim brand header above the player (share page: yes, iframe embed: no). */
  showHeader?: boolean;
}

export default function TourShareViewer({
  tourName,
  scenes,
  startSceneId,
  showHeader = true,
}: TourShareViewerProps) {
  return (
    <div className="h-screen flex flex-col bg-gray-950">
      {showHeader && (
        <header className="h-12 shrink-0 flex items-center justify-between px-4 border-b border-white/10 bg-gray-950">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 flex items-center justify-center overflow-hidden shrink-0">
              <Image src="/logo.png" alt="Company logo" width={28} height={28} className="object-contain h-full w-full" />
            </div>
            <span className="text-sm font-medium text-white truncate">{tourName}</span>
          </div>
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 text-white/70 text-[11px] font-medium">
            <Orbit size={11} />
            Virtual tour
          </span>
        </header>
      )}
      <div className="flex-1 relative flex">
        <TourPlayer
          tourName={tourName}
          scenes={scenes}
          startSceneId={startSceneId}
          showTitle={!showHeader}
        />
      </div>
    </div>
  );
}
