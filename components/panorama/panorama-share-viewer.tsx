'use client';

import React, { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { X } from 'lucide-react';
import type { PanoramaHotspot } from '@/components/panorama/panorama-viewer';

const PanoramaViewer = dynamic(() => import('@/components/panorama/panorama-viewer'), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center bg-gray-900">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white" />
    </div>
  ),
});

export interface ShareComment {
  id: string;
  number: number;
  pitch: number;
  yaw: number;
  content: string;
  author: string;
  status: 'active' | 'resolved';
}

export interface ShareImage {
  id: string;
  name: string;
  url: string;
  comments: ShareComment[];
}

interface PanoramaShareViewerProps {
  projectName: string;
  images: ShareImage[];
}

export default function PanoramaShareViewer({ projectName, images }: PanoramaShareViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const current = images[currentIndex];

  const hotspots = useMemo<PanoramaHotspot[]>(
    () => (current?.comments ?? []).map(c => ({
      id: c.id, number: c.number, pitch: c.pitch, yaw: c.yaw, status: c.status, content: c.content,
    })),
    [current],
  );

  const selected = current?.comments.find(c => c.id === selectedId) ?? null;

  if (!current) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-900 text-white">
        <p>This panorama has no images yet.</p>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-950">
      <header className="h-12 flex items-center justify-between px-4 bg-black/60 text-white shrink-0">
        <span className="text-sm font-medium truncate">{projectName}</span>
        <span className="text-xs text-white/60">Shared panorama</span>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        <PanoramaViewer
          imageUrl={current.url}
          imageName={current.name}
          hotspots={hotspots}
          selectedId={selectedId}
          addMode={false}
          onToggleAddMode={() => {}}
          onAddHotspot={() => {}}
          onSelectHotspot={setSelectedId}
          isFullscreen={isFullscreen}
          onToggleFullscreen={() => setIsFullscreen(v => !v)}
          currentImageIndex={currentIndex}
          totalImages={images.length}
          onNavigate={(dir) => {
            setSelectedId(null);
            setCurrentIndex(i => dir === 'prev' ? Math.max(0, i - 1) : Math.min(images.length - 1, i + 1));
          }}
          readOnly
        />

        {selected && (
          <div className="absolute top-4 right-4 z-30 w-72 rounded-xl bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b bg-gray-50">
              <span className="text-xs font-semibold">Comment #{selected.number}</span>
              <button onClick={() => setSelectedId(null)} className="text-gray-500 hover:text-gray-800">
                <X size={15} />
              </button>
            </div>
            <div className="p-3 space-y-1">
              <span className="text-xs font-medium text-gray-900">{selected.author}</span>
              <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{selected.content}</p>
              {selected.status === 'resolved' && (
                <span className="text-[10px] font-medium text-green-600">Resolved</span>
              )}
            </div>
          </div>
        )}
      </div>

      {images.length > 1 && (
        <div className="h-20 shrink-0 bg-black/60 flex items-center gap-2 px-3 overflow-x-auto">
          {images.map((img, i) => (
            <button
              key={img.id}
              onClick={() => { setSelectedId(null); setCurrentIndex(i); }}
              className={`relative h-14 w-24 shrink-0 rounded-md overflow-hidden border-2 transition-colors ${
                i === currentIndex ? 'border-orange-500' : 'border-transparent hover:border-white/40'
              }`}
            >
              <Image src={img.url} alt={img.name} fill sizes="96px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
