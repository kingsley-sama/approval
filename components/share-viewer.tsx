/**
 * ShareViewer — guest annotation experience for share-link recipients.
 * Visually identical to the project page. Upload / share actions are hidden
 * because guests are unauthenticated (those features require a session).
 */
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import ImageViewer from '@/components/annotation/image-viewer';
import CommentModal from '@/components/annotation/comment-modal';
import CommentsSidebar from '@/components/annotation/comments-sidebar';
import ThumbnailsSidebar from '@/components/annotation/thumbnails-sidebar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import type { ShareLink } from '@/app/actions/share-links';
import type { Shape } from '@/types/drawing';
import type { AttachmentRecord } from '@/app/actions/storage';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';

interface Pin {
  id: string;
  number: number;
  x: number;
  y: number;
  content: string;
  author: string;
  timestamp: string;
  status: 'active' | 'resolved';
  drawingData?: Shape | Shape[];
  attachments?: (AttachmentRecord & { signedUrl: string })[];
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

function dbCommentToPin(
  c: any,
  attachmentsByComment?: Record<string, (AttachmentRecord & { signedUrl: string })[]>,
): Pin {
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
    attachments: attachmentsByComment?.[c.id] ?? [],
  };
}

function buildThreads(resourceData: any): ThreadData[] {
  const attachmentsByComment = resourceData.attachmentsByComment;
  if (resourceData.type === 'thread') {
    return [{
      id: resourceData.thread.id,
      name: resourceData.thread.thread_name || resourceData.thread.image_filename || 'Image',
      url: resourceData.thread.image_path,
      pins: (resourceData.comments || []).map((c: any) => dbCommentToPin(c, attachmentsByComment)),
    }];
  }
  return (resourceData.threads || []).map((t: any, i: number) => ({
    id: t.id,
    name: t.thread_name || t.image_filename || `Image ${i + 1}`,
    url: t.image_path,
    pins: (resourceData.commentsByThread?.[t.id] || []).map((c: any) =>
      dbCommentToPin(c, attachmentsByComment),
    ),
  }));
}

export default function ShareViewer({ shareLink, resourceData, token }: ShareViewerProps) {
  const canComment = shareLink.permissions === 'comment' || shareLink.permissions === 'draw_and_comment';
  const canDraw = shareLink.permissions === 'draw_and_comment';
  const { toast } = useToast();

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
  const [pendingShapes, setPendingShapes] = useState<Shape[]>([]);
  const [selectedPin, setSelectedPin] = useState<string | null>(null);
  const [isNewPin, setIsNewPin] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hoveredPin, setHoveredPin] = useState<string | null>(null);

  const [hasAddedComment, setHasAddedComment] = useState(false);
  const [ownCommentCount, setOwnCommentCount] = useState(0);
  const [reviewIntent, setReviewIntent] = useState<'leave' | 'done' | null>(null);
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [thanksOpen, setThanksOpen] = useState(false);
  const pendingNavigationRef = useRef(false);
  const allowNavigationRef = useRef(false);
  const router = useRouter();

  useEffect(() => {
    try {
      const visited: string[] = JSON.parse(localStorage.getItem('share_visited_tokens') || '[]');
      if (!visited.includes(token)) {
        visited.push(token);
        localStorage.setItem('share_visited_tokens', JSON.stringify(visited));
      }
    } catch { /* ignore */ }

    const stored = localStorage.getItem('share_guest_name');
    if (stored) {
      setGuestName(stored);
      setNameInput(stored);
      setNameConfirmed(true);
    }
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
  const drawnShapes: Shape[] = pins.flatMap(p =>
    !p.drawingData ? [] : Array.isArray(p.drawingData) ? p.drawingData : [p.drawingData]
  );

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
    setPendingShapes(prev => [...prev, shape]);
    setPendingPinPos(prev => prev ?? center);
    setModalPosition(prev => (showModal ? prev : center));
    if (!showModal) {
      setSelectedPin(null);
      setIsNewPin(true);
      setShowModal(true);
    }
  };

  const handleEditComment = useCallback(async (commentId: string, newText: string) => {
    const trimmed = newText.trim();
    if (!trimmed) return { success: false, error: 'Comment cannot be empty' };
    if (!guestName) return { success: false, error: 'Please confirm your name first' };

    let previousContent = '';
    setThreads(prev => prev.map(t => {
      if (!t.pins.some(p => p.id === commentId)) return t;
      return {
        ...t,
        pins: t.pins.map(pin => {
          if (pin.id !== commentId) return pin;
          previousContent = pin.content;
          return { ...pin, content: trimmed };
        }),
      };
    }));

    try {
      const res = await fetch('/api/share/comment/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          commentId,
          userName: guestName,
          content: trimmed,
        }),
      });
      const result = await res.json();
      if (!result.success) {
        setThreads(prev => prev.map(t => {
          if (!t.pins.some(p => p.id === commentId)) return t;
          return {
            ...t,
            pins: t.pins.map(p => p.id === commentId ? { ...p, content: previousContent } : p),
          };
        }));
        toast({
          title: 'Failed to update comment',
          description: result.error ?? 'Please try again.',
          variant: 'destructive',
        });
        return { success: false, error: result.error ?? 'Failed to update comment' };
      }
      return { success: true };
    } catch (e: any) {
      setThreads(prev => prev.map(t => {
        if (!t.pins.some(p => p.id === commentId)) return t;
        return {
          ...t,
          pins: t.pins.map(p => p.id === commentId ? { ...p, content: previousContent } : p),
        };
      }));
      toast({
        title: 'Failed to update comment',
        description: e?.message || 'Please try again.',
        variant: 'destructive',
      });
      return { success: false, error: e?.message ?? 'Failed to update comment' };
    }
  }, [guestName, token, toast]);

  const handleAddComment = async (text: string) => {
    if (!currentThread || !pendingPinPos) return;
    setSaveError(null);

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
      drawingData: pendingShapes.length > 0 ? pendingShapes : undefined,
    };
    setThreads(prev =>
      prev.map((t, i) => i === currentIndex ? { ...t, pins: [...t.pins, optimisticPin] } : t),
    );
    setSelectedPin(localId);
    setShowModal(false);
    setIsNewPin(false);
    const savedPos = pendingPinPos;
    const savedShapes = pendingShapes;
    setPendingPinPos(null);
    setPendingShapes([]);

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
        const realPin = dbCommentToPin(result.comment);
        setThreads(prev =>
          prev.map((t, i) =>
            i === currentIndex
              ? { ...t, pins: t.pins.map(p => p.id === localId ? realPin : p) }
              : t,
          ),
        );
        setSelectedPin(realPin.id);
        setHasAddedComment(true);
        setOwnCommentCount(c => c + 1);
      } else {
        throw new Error(result.error || 'Save failed');
      }
    } catch (e: any) {
      setThreads(prev =>
        prev.map((t, i) =>
          i === currentIndex
            ? { ...t, pins: t.pins.filter(p => p.id !== localId) }
            : t,
        ),
      );
      setSelectedPin(null);
      toast({
        title: 'Comment failed to save',
        description: e?.message || 'Could not save comment. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const projectName =
    resourceData.type === 'project'
      ? resourceData.project?.project_name
      : resourceData.thread?.markup_projects?.project_name || 'Shared Project';

  // Fire-and-forget: kick off the email request in the background. We don't
  // await it from the click handler so the user gets immediate feedback.
  const submitReviewCompleteBackground = useCallback(() => {
    fetch('/api/share/review-complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        reviewerName: guestName || 'Guest',
        commentCount: ownCommentCount,
      }),
      keepalive: true,
    })
      .then(async (res) => {
        if (!res.ok) {
          const result = await res.json().catch(() => ({}));
          throw new Error(result?.error || `Request failed (${res.status})`);
        }
      })
      .catch((e) => {
        console.error('[review-complete] notify failed', e);
        toast({
          title: 'Notification may not have been sent',
          description: e?.message || 'You can let the team know directly.',
          variant: 'destructive',
        });
      });
  }, [token, guestName, ownCommentCount, toast]);

  const closeReviewModal = useCallback(() => {
    setReviewIntent(null);
  }, []);

  const handleLeaveAttempt = useCallback((e: React.MouseEvent) => {
    if (!hasAddedComment || reviewSubmitted || allowNavigationRef.current) return;
    e.preventDefault();
    setReviewIntent('leave');
  }, [hasAddedComment, reviewSubmitted]);

  const handleDoneClick = useCallback(() => {
    if (reviewSubmitted) return;
    setReviewIntent('done');
  }, [reviewSubmitted]);

  const handleConfirmDone = useCallback(() => {
    pendingNavigationRef.current = reviewIntent === 'leave';
    setReviewIntent(null);
    setReviewSubmitted(true);
    setThanksOpen(true);
    submitReviewCompleteBackground();
  }, [reviewIntent, submitReviewCompleteBackground]);

  const handleThanksClose = useCallback(() => {
    setThanksOpen(false);
    if (pendingNavigationRef.current) {
      pendingNavigationRef.current = false;
      allowNavigationRef.current = true;
      router.push('/projects');
    }
  }, [router]);

  const handleLeaveAnyway = useCallback(() => {
    setReviewIntent(null);
    allowNavigationRef.current = true;
    router.push('/projects');
  }, [router]);

  // Native browser-close warning when there are unconfirmed comments
  useEffect(() => {
    if (!hasAddedComment || reviewSubmitted) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasAddedComment, reviewSubmitted]);

  // Browser back-button guard: push a sentinel state and re-push on popstate
  useEffect(() => {
    if (!hasAddedComment || reviewSubmitted) return;
    if (typeof window === 'undefined') return;

    const SENTINEL = { __reviewGuard: true };
    window.history.pushState(SENTINEL, '', window.location.href);

    const onPopState = () => {
      if (allowNavigationRef.current) return;
      window.history.pushState(SENTINEL, '', window.location.href);
      setReviewIntent('leave');
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [hasAddedComment, reviewSubmitted]);

  const activeCount = threads.flatMap(t => t.pins).filter(p => p.status !== 'resolved').length;
  const resolvedCount = threads.flatMap(t => t.pins).filter(p => p.status === 'resolved').length;

  const permLabel =
    shareLink.permissions === 'view' ? 'View only' :
    shareLink.permissions === 'comment' ? 'Can comment' : 'Full access';

  // ── Guest name gate (only if commenting is enabled and name not yet set) ──────
  if (canComment && !nameConfirmed) {
    return (
      <div className="h-screen flex items-center justify-center bg-muted/30 px-4">
        <div className="bg-background rounded-3xl shadow-xl border border-border/60 w-full max-w-sm overflow-hidden">
          <div className="h-1 bg-accent" />
          <div className="p-8 space-y-5">
            <div className="flex items-center gap-3">
              <div className="relative w-11 h-11 rounded-full bg-primary/5 ring-1 ring-primary/15 flex items-center justify-center text-primary shrink-0">
                <CheckCircle2 className="h-5 w-5" />
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-accent ring-2 ring-background" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-semibold leading-tight text-primary">Enter your name</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Shown with your comments on{' '}
                  <span className="font-medium text-foreground">{projectName}</span>
                </p>
              </div>
            </div>
            <input
              type="text"
              className="w-full border border-border rounded-full px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              placeholder="Your name"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && confirmName()}
              autoFocus
            />
            <button
              onClick={confirmName}
              disabled={!nameInput.trim()}
              className="w-full py-2.5 bg-primary text-primary-foreground rounded-full text-sm font-semibold shadow-sm ring-1 ring-accent/30 hover:shadow-md hover:ring-accent/50 active:scale-[0.98] disabled:opacity-40 disabled:hover:shadow-sm disabled:active:scale-100 transition-all"
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-screen bg-background text-foreground flex flex-col ${isFullscreen ? 'fixed inset-0' : ''}`}>

      {/* ── Top nav — mirrors ProjectTopNav ───────────────────────────────── */}
      {!isFullscreen && (
        <header className="h-14 flex items-center justify-between px-4 border-b border-border/50 bg-background shrink-0 z-10">
          {/* Left */}
          <div className="flex items-center gap-3">
            <Link
              href="/projects"
              onClick={handleLeaveAttempt}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 flex items-center justify-center overflow-hidden">
                <Image src="/logo.png" alt="Logo" width={32} height={32} className="object-contain h-full w-full" />
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted text-muted-foreground text-xs font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                — ExposéProfi
              </div>
            </div>
          </div>

          {/* Center — project name */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground truncate max-w-xs">{projectName}</span>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{permLabel}</span>
          </div>

          {/* Right — stats + guest identity */}
          <div className="flex items-center gap-4 text-sm">
            <span>
              <span className="font-semibold">{activeCount}</span>
              <span className="text-muted-foreground ml-1">Active</span>
            </span>
            <span className="w-px h-4 bg-border" />
            <span>
              <span className="font-semibold">{resolvedCount}</span>
              <span className="text-muted-foreground ml-1">Resolved</span>
            </span>
            {nameConfirmed && canComment && (
              <>
                <span className="w-px h-4 bg-border" />
                {reviewSubmitted ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/5 text-primary text-xs font-semibold ring-1 ring-primary/15">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                    Review submitted
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handleDoneClick}
                    className="group inline-flex items-center gap-2 pl-2 pr-3.5 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold shadow-sm ring-1 ring-accent/30 hover:shadow-md hover:ring-accent/50 active:scale-[0.98] transition-all"
                  >
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-accent text-accent-foreground">
                      <CheckCircle2 className="h-3 w-3" />
                    </span>
                    Done reviewing
                  </button>
                )}
                <span className="w-px h-4 bg-border" />
                <div className="flex items-center gap-2 text-muted-foreground">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
                    {guestName[0]?.toUpperCase()}
                  </div>
                  <span className="text-sm">{guestName}</span>
                  <button
                    onClick={() => { setNameConfirmed(false); localStorage.removeItem('share_guest_name'); }}
                    className="text-xs underline underline-offset-2 hover:text-foreground transition-colors"
                  >
                    Change
                  </button>
                </div>
              </>
            )}
          </div>
        </header>
      )}

      {/* ── Error banner ──────────────────────────────────────────────────── */}
      {saveError && (
        <div className="bg-red-50 border-b border-red-200 px-6 py-2 flex items-center justify-between text-sm text-red-700">
          <span>⚠ {saveError}</span>
          <button onClick={() => setSaveError(null)} className="ml-4 text-red-500 hover:text-red-700 font-medium">
            Dismiss
          </button>
        </div>
      )}

      {/* ── Body — identical layout to project page ───────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Comments sidebar — read-only for guests */}
        {!isFullscreen && (
          <CommentsSidebar
            allImages={threads.map(t => ({ id: t.id, name: t.name, pins: t.pins }))}
            currentImageId={currentThread?.id || ''}
            selectedPinId={selectedPin}
            onSelectPin={(pinId) => {
              setSelectedPin(pinId);
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
            onResolve={() => {}}
            readOnly
            onEditComment={canComment ? handleEditComment : undefined}
            currentUser={guestName || 'Guest'}
            userRole="member"
          />
        )}

        {/* Image viewer */}
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
            hoveredPin={hoveredPin}
            onPinHover={setHoveredPin}
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
            currentImageName={currentThread.name}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            No images in this project.
          </div>
        )}

        {/* Thumbnails sidebar — upload disabled for guests */}
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

      {/* Review-complete confirmation */}
      <Dialog
        open={reviewIntent !== null}
        onOpenChange={(open) => { if (!open) closeReviewModal(); }}
      >
        <DialogContent className="sm:max-w-md rounded-2xl border-border/60 p-0 overflow-hidden">
          <div className="h-1 bg-accent" />
          <div className="p-6 space-y-4">
            <DialogHeader>
              <div className="flex items-center gap-3.5">
                <div className="relative w-11 h-11 rounded-full bg-primary/5 ring-1 ring-primary/15 flex items-center justify-center text-primary shrink-0">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-accent ring-2 ring-background" />
                </div>
                <div className="min-w-0 text-left">
                  <DialogTitle className="text-base text-primary">
                    {reviewIntent === 'leave' ? 'Are you done reviewing?' : 'Mark review as complete?'}
                  </DialogTitle>
                  <DialogDescription className="mt-0.5">
                    {ownCommentCount > 0 ? (
                      <>
                        You&apos;ve left {ownCommentCount}{' '}
                        {ownCommentCount === 1 ? 'comment' : 'comments'} on{' '}
                        <span className="font-medium text-foreground">{projectName}</span>.
                      </>
                    ) : (
                      <>
                        Confirm you&apos;ve finished reviewing{' '}
                        <span className="font-medium text-foreground">{projectName}</span>.
                      </>
                    )}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Letting us know helps the team start working on your feedback right away.
              You can always come back later and add more.
            </p>
            <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={closeReviewModal}
                className="px-5 py-2 text-sm font-medium rounded-full border border-border bg-background hover:bg-muted active:scale-[0.98] transition-all"
              >
                Cancel
              </button>
              {reviewIntent === 'leave' && (
                <button
                  type="button"
                  onClick={handleLeaveAnyway}
                  className="px-5 py-2 text-sm font-medium rounded-full text-muted-foreground hover:text-foreground hover:bg-muted active:scale-[0.98] transition-all"
                >
                  Leave without confirming
                </button>
              )}
              <button
                type="button"
                onClick={handleConfirmDone}
                className="px-5 py-2 text-sm font-semibold rounded-full bg-primary text-primary-foreground shadow-sm ring-1 ring-accent/30 hover:shadow-md hover:ring-accent/50 active:scale-[0.98] transition-all"
              >
                Yes, I&apos;m done
              </button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Thank-you confirmation (shown after Yes, I'm done) */}
      <Dialog
        open={thanksOpen}
        onOpenChange={(open) => { if (!open) handleThanksClose(); }}
      >
        <DialogContent className="sm:max-w-md rounded-2xl border-border/60 p-0 overflow-hidden">
          <div className="h-1 bg-accent" />
          <div className="p-6 space-y-4 text-center">
            <DialogHeader>
              <div className="flex flex-col items-center gap-3">
                <div className="relative w-14 h-14 rounded-full bg-primary/5 ring-1 ring-primary/15 flex items-center justify-center text-primary">
                  <CheckCircle2 className="h-7 w-7" />
                  <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-accent ring-2 ring-background" />
                </div>
                <DialogTitle className="text-lg text-primary">
                  Thank you for your feedback
                </DialogTitle>
                <DialogDescription>
                  Your review of{' '}
                  <span className="font-medium text-foreground">{projectName}</span>{' '}
                  has been marked complete. The team will take it from here.
                </DialogDescription>
              </div>
            </DialogHeader>
            <DialogFooter className="sm:justify-center pt-2">
              <button
                type="button"
                onClick={handleThanksClose}
                className="px-6 py-2 text-sm font-semibold rounded-full bg-primary text-primary-foreground shadow-sm ring-1 ring-accent/30 hover:shadow-md hover:ring-accent/50 active:scale-[0.98] transition-all"
              >
                {pendingNavigationRef.current ? 'Continue' : 'Close'}
              </button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Comment modal */}
      {showModal && (
        <CommentModal
          position={modalPosition}
          isNewPin={isNewPin}
          existingPin={isNewPin ? undefined : (pins.find(p => p.id === selectedPin) as any)}
          currentUser={guestName || 'Guest'}
          userRole="member"
          onClose={() => {
            setShowModal(false);
            setIsNewPin(false);
            setPendingPinPos(null);
            setPendingShape(null);
          }}
          onSubmit={canComment ? handleAddComment : async () => {}}
          onEditComment={canComment ? handleEditComment : undefined}
          isFullscreen={isFullscreen}
          disableAttachments
        />
      )}
    </div>
  );
}
