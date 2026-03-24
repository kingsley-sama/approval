/**
 * ShareViewer — public annotator experience for share-link recipients.
 * No auth required. Guest name stored in localStorage.
 */
'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import ImageViewer from '@/components/annotation/image-viewer';
import CommentModal from '@/components/annotation/comment-modal';
import CommentsSidebar from '@/components/annotation/comments-sidebar';
import ThumbnailsSidebar from '@/components/annotation/thumbnails-sidebar';
import type { ShareLink } from '@/app/actions/share-links';
import type { Shape } from '@/types/drawing';

interface Pin {
  id: string;
  number: number;
  x: number;
  y: number;
  content: string;
  author: string;
  timestamp: string;
  status: 'active' | 'resolved';
  drawingData?: Shape;
}

interface ThreadData {
  id: string;
  name: string;
  url: string;
  pins: Pin[];
}

interface ShareViewerProps {
  shareLink: ShareLink;
  resourceData: any;
  token: string;
}

function dbCommentToPin(c: any): Pin {
  return {
    id: c.id,
    number: c.display_number ?? c.pin_number ?? 1,
    x: c.x_position ?? 50,
    y: c.y_position ?? 50,
    content: c.content,
    author: c.user_name,
    timestamp: c.created_at ? new Date(c.created_at).toLocaleDateString() : '',
    status: c.status === 'resolved' ? 'resolved' : 'active',
    drawingData: c.drawing_data ?? undefined,
  };
}

function buildThreads(resourceData: any): ThreadData[] {
  if (resourceData.type === 'thread') {
    return [{
      id: resourceData.thread.id,
      name: resourceData.thread.thread_name || resourceData.thread.image_filename || 'Image',
      url: resourceData.thread.image_path,
      pins: (resourceData.comments || []).map(dbCommentToPin),
    }];
  }
  return (resourceData.threads || []).map((t: any, i: number) => ({
    id: t.id,
    name: t.thread_name || t.image_filename || `Image ${i + 1}`,
    url: t.image_path,
    pins: (resourceData.commentsByThread?.[t.id] || []).map(dbCommentToPin),
  }));
}

export default function ShareViewer({ shareLink, resourceData, token }: ShareViewerProps) {
  const canComment = shareLink.permissions === 'comment' || shareLink.permissions === 'draw_and_comment';
  const canDraw = shareLink.permissions === 'draw_and_comment';

  // Guest name — persisted in localStorage
  const [guestName, setGuestName] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [nameConfirmed, setNameConfirmed] = useState(false);

  const [threads, setThreads] = useState<ThreadData[]>(() => buildThreads(resourceData));
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalPosition, setModalPosition] = useState({ x: 0, y: 0 });
  const [pendingPinPos, setPendingPinPos] = useState<{ x: number; y: number } | null>(null);
  const [pendingShape, setPendingShape] = useState<Shape | null>(null);
  const [selectedPin, setSelectedPin] = useState<string | null>(null);
  const [isNewPin, setIsNewPin] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    // Persist guest name
    const stored = localStorage.getItem('share_guest_name');
    if (stored) {
      setGuestName(stored);
      setNameInput(stored);
      setNameConfirmed(true);
    }
    // Track this token so the guest dashboard can list it
    try {
      const visited: string[] = JSON.parse(localStorage.getItem('share_visited_tokens') || '[]');
      if (!visited.includes(token)) {
        visited.push(token);
        localStorage.setItem('share_visited_tokens', JSON.stringify(visited));
      }
    } catch { /* ignore */ }
  }, [token]);

  const confirmName = () => {
    const n = nameInput.trim();
    if (!n) return;
    setGuestName(n);
    setNameConfirmed(true);
    localStorage.setItem('share_guest_name', n);
  };

  const currentThread = threads[currentIndex];
  const pins = currentThread?.pins || [];
  const drawnShapes: Shape[] = pins.filter(p => p.drawingData).map(p => p.drawingData!);

  const handleImageClick = (x: number, y: number) => {
    if (!canComment || !nameConfirmed) return;
    setPendingPinPos({ x, y });
    setModalPosition({ x, y });
    setSelectedPin(null);
    setIsNewPin(true);
    setShowModal(true);
  };

  const handleShapeComplete = (shape: Shape, center: { x: number; y: number }) => {
    if (!canComment || !nameConfirmed) return;
    setPendingShape(shape);
    setPendingPinPos(center);
    setModalPosition(center);
    setSelectedPin(null);
    setIsNewPin(true);
    setShowModal(true);
  };

  const handleAddComment = async (text: string) => {
    if (!currentThread || !pendingPinPos) return;
    setSaveError(null);

    // 1. Optimistic pin — shown immediately in the UI
    const localId = `local_${Date.now()}`;
    const optimisticPin: Pin = {
      id: localId,
      number: (currentThread.pins.length || 0) + 1,
      x: pendingPinPos.x,
      y: pendingPinPos.y,
      content: text,
      author: guestName || 'Guest',
      timestamp: new Date().toLocaleDateString(),
      status: 'active',
      drawingData: pendingShape ?? undefined,
    };
    setThreads(prev =>
      prev.map((t, i) => i === currentIndex ? { ...t, pins: [...t.pins, optimisticPin] } : t)
    );
    setSelectedPin(localId);
    setShowModal(false);
    setIsNewPin(false);
    const savedPos = pendingPinPos;
    const savedShape = pendingShape;
    setPendingPinPos(null);
    setPendingShape(null);

    // 2. Persist to DB via API
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/share/comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          threadId: currentThread.id,
          userName: guestName,
          content: text,
          xPosition: savedPos.x,
          yPosition: savedPos.y,
          drawingData: savedShape ?? null,
        }),
      });
      const result = await res.json();
      if (result.success && result.comment) {
        // Replace optimistic pin with the real persisted pin
        const realPin = dbCommentToPin(result.comment);
        setThreads(prev =>
          prev.map((t, i) =>
            i === currentIndex
              ? { ...t, pins: t.pins.map(p => p.id === localId ? realPin : p) }
              : t
          )
        );
        setSelectedPin(realPin.id);
      } else {
        throw new Error(result.error || 'Save failed');
      }
    } catch (e: any) {
      console.error('Failed to submit comment', e);
      // Remove optimistic pin so the UI reflects reality
      setThreads(prev =>
        prev.map((t, i) =>
          i === currentIndex
            ? { ...t, pins: t.pins.filter(p => p.id !== localId) }
            : t
        )
      );
      setSelectedPin(null);
      setSaveError(e?.message || 'Could not save comment. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Permission label helper
  const permissionLabel =
    shareLink.permissions === 'view' ? 'View only' :
    shareLink.permissions === 'comment' ? 'Can comment' : 'Full access';

  const projectName =
    resourceData.type === 'project'
      ? resourceData.project?.project_name
      : resourceData.thread?.markup_projects?.project_name || 'Shared Project';

  // ── Guest name gate (only shown if commenting is enabled and name not set) ──
  if (canComment && !nameConfirmed) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm space-y-5">
          <div>
            <h2 className="text-lg font-semibold mb-1">Enter your name</h2>
            <p className="text-sm text-muted-foreground">
              This will appear alongside your comments on <span className="font-medium text-foreground">{projectName}</span>.
            </p>
          </div>
          <input
            type="text"
            className="w-full border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
            placeholder="Your name"
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && confirmName()}
            autoFocus
          />
          <button
            onClick={confirmName}
            disabled={!nameInput.trim()}
            className="w-full py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-screen bg-background flex flex-col ${isFullscreen ? 'fixed inset-0' : ''}`}>
      {/* Header */}
      {!isFullscreen && (
        <div className="border-b border-border bg-white px-6 py-3 grid grid-cols-3 items-center">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-semibold">{projectName}</h1>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              {permissionLabel}
            </span>
          </div>
          <div className="flex items-center justify-center gap-3 text-sm">
            <span>
              <span className="font-semibold">{threads.flatMap(t => t.pins).filter(p => p.status !== 'resolved').length}</span>
              <span className="text-muted-foreground ml-1">Active</span>
            </span>
            <span className="w-px h-4 bg-border" />
            <span>
              <span className="font-semibold">{threads.flatMap(t => t.pins).filter(p => p.status === 'resolved').length}</span>
              <span className="text-muted-foreground ml-1">Resolved</span>
            </span>
          </div>
          <div className="flex items-center justify-end gap-3 text-sm">
            <Link
              href="/shared"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
            >
              My Shared Projects
            </Link>
            {nameConfirmed && canComment && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
                  {guestName[0]?.toUpperCase()}
                </div>
                <span>{guestName}</span>
                <button
                  onClick={() => { setNameConfirmed(false); localStorage.removeItem('share_guest_name'); }}
                  className="text-xs underline underline-offset-2 hover:text-foreground transition-colors ml-1"
                >
                  Change
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Save error banner */}
      {saveError && (
        <div className="bg-red-50 border-b border-red-200 px-6 py-2 flex items-center justify-between text-sm text-red-700">
          <span>⚠ {saveError}</span>
          <button onClick={() => setSaveError(null)} className="ml-4 text-red-500 hover:text-red-700 font-medium">Dismiss</button>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Left: Comments sidebar — read-only for clients */}
        {!isFullscreen && (
          <CommentsSidebar
            allImages={threads.map(t => ({ id: t.id, name: t.name, pins: t.pins }))}
            currentImageId={currentThread?.id || ''}
            selectedPinId={selectedPin}
            onSelectPin={(pinId) => {
              setSelectedPin(pinId);
              // Switch to the image that owns this pin
              const ownerThread = threads.find(t => t.pins.some(p => p.id === pinId));
              if (ownerThread) {
                const idx = threads.indexOf(ownerThread);
                setCurrentIndex(idx);
                const pin = ownerThread.pins.find(p => p.id === pinId);
                if (pin) {
                  setModalPosition({ x: pin.x, y: pin.y });
                  setIsNewPin(false);
                  setShowModal(true);
                }
              }
            }}
            onResolve={() => {}} // no-op — clients cannot resolve
            readOnly
          />
        )}

        {/* Center: Image viewer */}
        {currentThread ? (
          <ImageViewer
            pins={pins}
            selectedPin={selectedPin}
            drawnShapes={drawnShapes}
            pendingShape={pendingShape}
            onShapeComplete={canDraw && nameConfirmed ? handleShapeComplete : () => {}}
            onPinClick={(x, y, pinId) => {
              if (pinId) {
                setSelectedPin(pinId);
                const pin = pins.find(p => p.id === pinId);
                if (pin) {
                  setModalPosition({ x: pin.x, y: pin.y });
                  setIsNewPin(false);
                  setShowModal(true);
                }
              } else {
                handleImageClick(x, y);
              }
            }}
            hoveredPin={null}
            onPinHover={() => {}}
            currentImageUrl={currentThread.url}
            currentImageIndex={currentIndex}
            totalImages={threads.length}
            onNavigate={(dir) => {
              if (dir === 'prev' && currentIndex > 0) setCurrentIndex(currentIndex - 1);
              if (dir === 'next' && currentIndex < threads.length - 1) setCurrentIndex(currentIndex + 1);
            }}
            isFullscreen={isFullscreen}
            onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
            showDrawingTools={canDraw && nameConfirmed}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            No images in this project.
          </div>
        )}

        {/* Right: Thumbnails sidebar — read-only (no upload) */}
        {!isFullscreen && (
          <ThumbnailsSidebar
            images={threads.map(t => ({ id: t.id, name: t.name, url: t.url, pins: t.pins }))}
            currentImageId={currentThread?.id || ''}
            onSelectImage={(id) => {
              const idx = threads.findIndex(t => t.id === id);
              if (idx !== -1) setCurrentIndex(idx);
            }}
            projectId=""
            readOnly
          />
        )}
      </div>

      {showModal && (
        <CommentModal
          position={modalPosition}
          isNewPin={isNewPin}
          existingPin={isNewPin ? undefined : (pins.find(p => p.id === selectedPin) as any)}
          currentUser={guestName || 'Guest'}
          onClose={() => {
            setShowModal(false);
            setIsNewPin(false);
            setPendingPinPos(null);
            setPendingShape(null);
          }}
          onSubmit={canComment ? handleAddComment : async () => {}}
          isFullscreen={isFullscreen}
        />
      )}
    </div>
  );
}
