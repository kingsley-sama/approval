'use client';

import React, { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { X } from 'lucide-react';
import type { PanoramaHotspot } from '@/components/panorama/panorama-viewer';
import PanoramaCommentModal from '@/components/panorama/panorama-comment-modal';

const PanoramaViewer = dynamic(() => import('@/components/panorama/panorama-viewer'), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center bg-gray-950">
      <div className="w-64 rounded-2xl border border-white/10 bg-black/60 px-5 py-4 text-center shadow-2xl">
        <div className="mb-3 flex items-center justify-center">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-white/20 border-t-orange-500" />
        </div>
        <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-white/15">
          <div className="h-full w-40 rounded-full bg-orange-500" />
        </div>
        <p className="text-sm font-medium text-white/80">Preparing panorama viewer…</p>
      </div>
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
  token: string;
  canComment: boolean;
  showHeader?: boolean;
  showImageStrip?: boolean;
}

const GUEST_NAME_KEY = 'annot8_panorama_guest_name';

function getGuestNameStorageKey() {
  if (typeof window === 'undefined') return GUEST_NAME_KEY;
  return `${GUEST_NAME_KEY}:${window.location.hostname}`;
}

export default function PanoramaShareViewer({
  projectName,
  images,
  token,
  canComment,
  showHeader = true,
  showImageStrip = true,
}: PanoramaShareViewerProps) {
  const [imagesState, setImagesState] = useState<ShareImage[]>(images);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [guestName, setGuestName] = useState('');
  const [guestNameDraft, setGuestNameDraft] = useState('');
  const [isGuestNameModalOpen, setIsGuestNameModalOpen] = useState(false);
  const [addMode, setAddMode] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalPos, setModalPos] = useState({ x: 0, y: 0 });
  const [pendingCoords, setPendingCoords] = useState<{ pitch: number; yaw: number } | null>(null);

  const current = imagesState[currentIndex];

  const totalComments = useMemo(
    () => imagesState.reduce((sum, img) => sum + img.comments.length, 0),
    [imagesState],
  );

  const hotspots = useMemo<PanoramaHotspot[]>(
    () => (current?.comments ?? []).map(c => ({
      id: c.id, number: c.number, pitch: c.pitch, yaw: c.yaw, status: c.status, content: c.content,
    })),
    [current],
  );

  const selected = current?.comments.find(c => c.id === selectedId) ?? null;

  /** Ask for a display name once (stored per-host) before a guest can comment. */
  const persistGuestName = (name: string) => {
    const normalized = name.trim() || 'Guest';
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(getGuestNameStorageKey(), normalized);
    }
    setGuestName(normalized);
    return normalized;
  };

  const ensureGuestName = (): string | null => {
    if (guestName) return guestName;
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem(getGuestNameStorageKey()) : null;
    if (stored) { setGuestName(stored); return stored; }

    setGuestNameDraft('');
    setIsGuestNameModalOpen(true);
    return null;
  };

  const handleToggleAddMode = () => {
    if (!addMode) {
      const name = ensureGuestName();
      if (!name) return;
      setSelectedId(null);
    }
    setAddMode(v => !v);
    setShowModal(false);
  };

  const handleGuestNameSubmit = () => {
    const normalized = persistGuestName(guestNameDraft);
    setIsGuestNameModalOpen(false);
    setAddMode(true);
    setSelectedId(null);
    return normalized;
  };

  const handleAddHotspot = (pitch: number, yaw: number, screen: { x: number; y: number }) => {
    setPendingCoords({ pitch, yaw });
    setModalPos(screen);
    setShowModal(true);
  };

  const handleSubmit = async (text: string) => {
    if (!current || !pendingCoords) return;
    const name = ensureGuestName();
    if (!name) return;
    const { pitch, yaw } = pendingCoords;
    setShowModal(false);
    setPendingCoords(null);

    try {
      const res = await fetch('/api/share/panorama/comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, imageId: current.id, userName: name, content: text, pitch, yaw }),
      });
      const json = await res.json();
      if (!json.success || !json.comment) return;
      const c = json.comment;
      const newComment: ShareComment = {
        id: c.id, number: totalComments + 1, pitch: c.pitch, yaw: c.yaw,
        content: c.content, author: c.user_name, status: 'active',
      };
      setImagesState(prev => prev.map((img, i) =>
        i === currentIndex ? { ...img, comments: [...img.comments, newComment] } : img,
      ));
    } catch {
      /* swallow — guest can retry */
    }
  };

  if (!current) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-900 text-white">
        <p>This panorama has no images yet.</p>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-950">
      {showHeader && (
      <header className="h-12 flex items-center justify-between px-4 bg-black/60 text-white shrink-0 gap-3">
        <span className="text-sm font-medium truncate">{projectName}</span>
        <div className="flex items-center gap-2 shrink-0">
          {canComment && (
            <button
              onClick={handleToggleAddMode}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                addMode ? 'bg-orange-500 text-white' : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              {addMode ? 'Cancel comment' : 'Add comment'}
            </button>
          )}
          <span className="text-xs text-white/60">{canComment ? 'Shared panorama — you can comment' : 'Shared panorama'}</span>
        </div>
      </header>
      )}

      <div className="flex-1 flex overflow-hidden relative">
        <PanoramaViewer
          imageUrl={current.url}
          imageName={current.name}
          hotspots={hotspots}
          selectedId={selectedId}
          addMode={addMode}
          onToggleAddMode={handleToggleAddMode}
          onAddHotspot={handleAddHotspot}
          onSelectHotspot={setSelectedId}
          isFullscreen={isFullscreen}
          onToggleFullscreen={() => setIsFullscreen(v => !v)}
          currentImageIndex={currentIndex}
          totalImages={imagesState.length}
          onNavigate={(dir) => {
            setSelectedId(null);
            setCurrentIndex(i => dir === 'prev' ? Math.max(0, i - 1) : Math.min(imagesState.length - 1, i + 1));
          }}
          readOnly={!canComment}
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

        {showModal && canComment && (
          <PanoramaCommentModal
            position={modalPos}
            isNew
            currentUser={guestName || 'Guest'}
            userRole="guest"
            projectId=""
            onClose={() => { setShowModal(false); setPendingCoords(null); }}
            onSubmit={handleSubmit}
          />
        )}

        {isGuestNameModalOpen && canComment && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white p-4 shadow-2xl">
              <h3 className="text-sm font-semibold text-gray-900">Tell us your name</h3>
              <p className="mt-1 text-sm text-gray-600">
                This will be used for your comment on {typeof window !== 'undefined' ? window.location.host : 'this share link'}.
              </p>
              <input
                autoFocus
                value={guestNameDraft}
                onChange={(e) => setGuestNameDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleGuestNameSubmit(); }}
                placeholder="Your name"
                className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-orange-500"
              />
              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={() => { setIsGuestNameModalOpen(false); setGuestNameDraft(''); }}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleGuestNameSubmit}
                  className="rounded-lg bg-orange-500 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-600"
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {showImageStrip && imagesState.length > 1 && (
        <div className="h-20 shrink-0 bg-black/60 flex items-center gap-2 px-3 overflow-x-auto">
          {imagesState.map((img, i) => (
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
