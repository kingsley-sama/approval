'use client';
import React, { useState, useEffect } from 'react';
import ImageViewer from '@/components/annotation/image-viewer';
import CommentsSidebar from '@/components/annotation/comments-sidebar';
import ThumbnailsSidebar from '@/components/annotation/thumbnails-sidebar';
import CommentModal from '@/components/annotation/comment-modal';
import { getProjectThreads } from '@/app/actions/threads';
import { getThreadComments, resolveComment, DbComment } from '@/app/actions/comments';
import { useCommentQueue } from '@/hooks/use-comment-queue';
import { Upload, ArrowLeft, ChevronLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import ImageUploader from '@/components/image-uploader';
import ShareLinkManager from '@/components/share-link-manager';
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
  isPending?: boolean;
  drawingData?: Shape; // non-null when this pin was created by drawing a shape
}

interface ImageData {
  id: string;
  name: string;
  url: string;
  pins: Pin[];
}

interface ProjectPageProps {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    name?: string;
  }>;
}

export default function ProjectPage({ params, searchParams }: ProjectPageProps) {
  const { id: projectId } = React.use(params);
  const { name } = React.use(searchParams);
  const projectName = name ? decodeURIComponent(name) : `Project ${projectId}`;
  const router = useRouter();

  const [imagesState, setImagesState] = useState<ImageData[]>([]);
  const [currentImageId, setCurrentImageId] = useState<string>('');
  const [showModal, setShowModal] = useState(false);
  const [modalPosition, setModalPosition] = useState({ x: 0, y: 0 });
  const [selectedPin, setSelectedPin] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hoveredPin, setHoveredPin] = useState<string | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isNewPin, setIsNewPin] = useState(false);
  const [pendingPinPos, setPendingPinPos] = useState<{ x: number; y: number } | null>(null);
  // Shape drawn by the user, awaiting comment confirmation before being committed
  const [pendingShape, setPendingShape] = useState<Shape | null>(null);

  const { enqueue, getPendingForThread, drainQueue, pendingCount, isSyncing } = useCommentQueue();

  const dbCommentToPin = (c: DbComment): Pin => ({
    id: c.id,
    number: c.display_number ?? c.pin_number,
    x: c.x_position,
    y: c.y_position,
    content: c.content,
    author: c.user_name,
    timestamp: c.created_at ? new Date(c.created_at).toLocaleDateString() : '',
    status: c.status === 'resolved' ? 'resolved' : 'active',
    drawingData: c.drawing_data ?? undefined,
  });

  const pendingToPin = (p: { localId: string; pinNumber: number; x: number; y: number; content: string; userName: string; createdAt: string; drawingData?: any }): Pin => ({
    id: p.localId,
    number: p.pinNumber,
    x: p.x,
    y: p.y,
    content: p.content,
    author: p.userName,
    timestamp: new Date(p.createdAt).toLocaleDateString(),
    status: 'active',
    isPending: true,
    drawingData: p.drawingData,
  });

  const syncCallbacks = {
    onSynced: (localId: string, comment: DbComment) => {
      const realPin = dbCommentToPin(comment);
      setImagesState(prev => prev.map(img => ({
        ...img,
        pins: img.pins.map(p => p.id === localId ? realPin : p),
      })));
    },
    onFailed: (localId: string) => {
      // Mark the pin as failed after MAX_RETRIES so the user can see it
      setImagesState(prev => prev.map(img => ({
        ...img,
        pins: img.pins.map(p => p.id === localId ? { ...p, status: 'error' as any } : p),
      })));
    },
  };

  const fetchThreads = async () => {
    setIsLoading(true);
    try {
      const threads = await getProjectThreads(projectId);
      // Fetch all comments in parallel
      const commentsByThread = await Promise.all(
        threads.map((t: any) => getThreadComments(t.id))
      );
      const mappedImages: ImageData[] = threads.map((t: any, i: number) => {
        const dbPins = commentsByThread[i].map(dbCommentToPin);
        // Merge any locally-queued comments not yet in the DB
        const dbIds = new Set(dbPins.map(p => p.id));
        const localPins = getPendingForThread(t.id)
          .filter(pending => !dbIds.has(pending.localId))
          .map(pendingToPin);
        return {
          id: t.id,
          name: t.thread_name || t.image_filename || 'Untitled',
          url: t.image_path,
          pins: [...dbPins, ...localPins],
        };
      });
      setImagesState(mappedImages);
      if (mappedImages.length > 0 && !currentImageId) {
        setCurrentImageId(mappedImages[0].id);
        setCurrentImageIndex(0);
      }
      // Drain any stale queue items (e.g. from a previous session)
      drainQueue(syncCallbacks.onSynced, syncCallbacks.onFailed);
    } catch (error) {
      console.error('Failed to fetch threads', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchThreads();
  }, [projectId]);

  const currentImage = imagesState.find(img => img.id === currentImageId);
  const pins = currentImage?.pins || [];
  // Extract Konva shapes from saved pins to pass to the drawing canvas
  const drawnShapes: Shape[] = pins
    .filter(p => p.drawingData)
    .map(p => p.drawingData!);

  /** Called by ImageViewer when the user finishes drawing a shape. */
  const handleShapeComplete = (shape: Shape, center: { x: number; y: number }) => {
    setPendingShape(shape);
    setPendingPinPos(center);
    setModalPosition(center);
    setSelectedPin(null);
    setIsNewPin(true);
    setShowModal(true);
  };

  const handleImageClick = (x: number, y: number) => {
    // Store position and open modal — no placeholder pin yet
    // The real pin is only created in the DB on submit
    setPendingPinPos({ x, y });
    setModalPosition({ x, y });
    setSelectedPin(null);
    setIsNewPin(true);
    setShowModal(true);
  };

  const handleAddComment = async (text: string) => {
    if (!currentImageId || !pendingPinPos) return;
    const currentPins = imagesState.find(img => img.id === currentImageId)?.pins ?? [];
    const pinNumber = currentPins.length + 1;

    // 1. Enqueue locally — instant, no network wait
    const queued = enqueue(currentImageId, text, 'Kingsley Francis', pendingPinPos.x, pendingPinPos.y, pinNumber, pendingShape ?? undefined);
    const localPin = pendingToPin(queued);

    // 2. Add pin to UI state immediately
    setImagesState(prev => prev.map(img =>
      img.id === currentImageId
        ? { ...img, pins: [...img.pins, localPin] }
        : img
    ));
    setSelectedPin(localPin.id);
    setShowModal(false);
    setIsNewPin(false);
    setPendingPinPos(null);
    setPendingShape(null);

    // 3. Sync to DB in the background (non-blocking)
    drainQueue(syncCallbacks.onSynced, syncCallbacks.onFailed);
  };

  const handleSwitchImage = (imageId: string) => {
    const index = imagesState.findIndex(img => img.id === imageId);
    if (index !== -1) {
      setCurrentImageIndex(index);
    }
    setCurrentImageId(imageId);
    setSelectedPin(null);
    setShowModal(false);
  };

  const handleResolveComment = async (pinId: string) => {
    // Optimistic update
    setImagesState(prev => prev.map(img =>
      img.id === currentImageId
        ? {
            ...img,
            pins: img.pins.map(pin =>
              pin.id === pinId
                ? { ...pin, status: pin.status === 'resolved' ? 'active' : 'resolved' }
                : pin
            ),
          }
        : img
    ));
    // Persist to DB
    const result = await resolveComment(pinId, projectId);
    if (!result.success) {
      console.error('Failed to resolve comment:', result.error);
      // Roll back on failure
      setImagesState(prev => prev.map(img =>
        img.id === currentImageId
          ? {
              ...img,
              pins: img.pins.map(pin =>
                pin.id === pinId
                  ? { ...pin, status: pin.status === 'resolved' ? 'active' : 'resolved' }
                  : pin
              ),
            }
          : img
      ));
    }
  };

  const handleNavigateImages = (direction: 'prev' | 'next') => {
    if (direction === 'prev' && currentImageIndex > 0) {
      handleSwitchImage(imagesState[currentImageIndex - 1].id);
      setCurrentImageIndex(currentImageIndex - 1);
    } else if (direction === 'next' && currentImageIndex < imagesState.length - 1) {
      handleSwitchImage(imagesState[currentImageIndex + 1].id);
      setCurrentImageIndex(currentImageIndex + 1);
    }
  };

  return (
    <div className={`h-screen bg-background text-foreground flex flex-col ${isFullscreen ? 'fixed inset-0' : ''}`}>
      {!isFullscreen && (
        <div className="border-b border-border bg-white px-6 py-3 grid grid-cols-3 items-center">
          {/* Left: back button + project name */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/')}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              <ChevronLeft className="w-4 h-4" />
              Dashboard
            </button>
            <div className="w-px h-5 bg-border shrink-0" />
            <h1 className="text-sm font-semibold truncate">{projectName}</h1>
          </div>

          {/* Center: pin stats + sync indicator */}
          <div className="flex items-center justify-center gap-4">
            <div className="flex items-center gap-3 text-sm">
              <span>
                <span className="font-semibold text-foreground">{pins.filter(p => p.content && p.status !== 'resolved').length}</span>
                <span className="text-muted-foreground ml-1">Active</span>
              </span>
              <span className="w-px h-4 bg-border" />
              <span>
                <span className="font-semibold text-foreground">{pins.filter(p => p.status === 'resolved').length}</span>
                <span className="text-muted-foreground ml-1">Resolved</span>
              </span>
            </div>
            {pendingCount > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
                <span className={`w-1.5 h-1.5 rounded-full ${isSyncing ? 'bg-amber-500 animate-pulse' : 'bg-amber-400'}`} />
                {isSyncing ? `Saving ${pendingCount}…` : `${pendingCount} unsaved`}
              </div>
            )}
          </div>

          {/* Right: actions */}
          <div className="flex items-center justify-end gap-3">
            <button className="px-4 py-1.5 border border-border rounded-md text-sm hover:bg-muted transition-colors">
              Browse
            </button>
            <ShareLinkManager
              resourceType="project"
              resourceId={projectId}
              createdBy="user"
              resourceName={projectName}
            />
          </div>
        </div>
      )}

      <div className={`flex-1 flex overflow-hidden ${isFullscreen ? 'bg-black' : ''}`}>
        {!isFullscreen && (
          <CommentsSidebar
            allImages={imagesState}
            currentImageId={currentImageId}
            selectedPinId={selectedPin}
            onSelectPin={(pinId) => {
              setSelectedPin(pinId);
              setPendingPinPos(null);
              // Switch to the image containing this pin if necessary
              const img = imagesState.find(i => i.pins.some(p => p.id === pinId));
              if (img && img.id !== currentImageId) handleSwitchImage(img.id);
              const pin = img?.pins.find(p => p.id === pinId) ?? pins.find(p => p.id === pinId);
              if (pin) {
                setModalPosition({ x: pin.x, y: pin.y });
                setIsNewPin(false);
                setShowModal(true);
              }
            }}
            onResolve={handleResolveComment}
          />
        )}

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center bg-gray-100">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : imagesState.length === 0 ? (
          <div className="flex-1 flex items-center justify-center bg-gray-100">
            <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full text-center">
              <div className="mb-4 flex justify-center">
                <div className="p-4 bg-blue-50 rounded-full">
                  <Upload className="h-8 w-8 text-blue-600" />
                </div>
              </div>
              <h2 className="text-xl font-semibold mb-2">Upload to Project</h2>
              <p className="text-gray-500 mb-6">
                This project has no images yet. Upload images to start annotating.
              </p>
              <div className="flex justify-center">
                <ImageUploader 
                  projectId={projectId} 
                  onUploadComplete={fetchThreads}
                  trigger={
                    <button className="px-6 py-3 bg-blue-600 text-white rounded-md font-semibold hover:bg-blue-700 transition-colors">
                      Select Images
                    </button>
                  }
                />
              </div>
            </div>
          </div>
        ) : (
          <ImageViewer
            pins={pins}
            selectedPin={selectedPin}
            drawnShapes={drawnShapes}
            pendingShape={pendingShape}
            onShapeComplete={handleShapeComplete}
            onPinClick={(x, y, pinId) => {
              if (pinId) {
                setSelectedPin(pinId);
                setPendingPinPos(null);
                setPendingShape(null);
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
            isFullscreen={isFullscreen}
            onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
            hoveredPin={hoveredPin}
            onPinHover={setHoveredPin}
            currentImageIndex={currentImageIndex}
            totalImages={imagesState.length}
            onNavigate={handleNavigateImages}
            currentImageUrl={currentImage?.url || ''}
          />
        )}

        {!isFullscreen && (
          <ThumbnailsSidebar
            images={imagesState}
            currentImageId={currentImageId}
            onSelectImage={handleSwitchImage}
            projectId={projectId}
            onUploadComplete={fetchThreads}
          />
        )}
      </div>

      {showModal && (
        <CommentModal
          position={modalPosition}
          onClose={() => {
            setShowModal(false);
            setIsNewPin(false);
            setPendingPinPos(null);
            setPendingShape(null); // discard the drawn shape if user cancels
          }}
          onSubmit={handleAddComment}
          existingPin={selectedPin ? pins.find(p => p.id === selectedPin) : undefined}
          currentUser="Kingsley Francis"
          isNewPin={isNewPin}
          isFullscreen={isFullscreen}
        />
      )}
    </div>
  );
}
