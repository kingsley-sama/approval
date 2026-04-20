'use client';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ImageViewer from '@/components/annotation/image-viewer';
import CommentModal from '@/components/annotation/comment-modal';
import { getProjectThreads } from '@/app/actions/threads';
import { getThreadComments, resolveComment, getCurrentUser, DbComment, updateCommentPosition } from '@/app/actions/comments';
import { getAttachmentUploadUrl, registerAttachment, getAttachmentsForComments } from '@/app/actions/storage';
import { useCommentQueue } from '@/hooks/use-comment-queue';
import { useRealtimeComments } from '@/hooks/use-realtime-comments';
import { useToast } from '@/hooks/use-toast';
import { Upload } from 'lucide-react';
import ImageUploader from '@/components/image-uploader';
import { ProjectTopNav, ProjectShell, ProjectImageData, ProjectPin } from './template';
import type { Shape } from '@/types/drawing';

type Pin = ProjectPin;
type ImageData = ProjectImageData;

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
  const [currentUserName, setCurrentUserName] = useState<string>('Anonymous');
  const [currentUserRole, setCurrentUserRole] = useState<string>('member');
  const [commentTab, setCommentTab] = useState<'active' | 'resolved'>('active');

  const { enqueue, getPendingForThread, drainQueue, pendingCount, isSyncing } = useCommentQueue();
  const { toast } = useToast();
  // Holds File[] per localId so they can be uploaded once the comment is synced
  const pendingAttachments = useRef<Map<string, File[]>>(new Map());

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
    attachments: c.attachments ?? [],
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
      setImagesState(prev => prev.map(img => {
        const idx = img.pins.findIndex(p => p.id === localId);
        if (idx === -1) return img;
        return {
          ...img,
          pins: img.pins.map(p => p.id === localId ? realPin : p),
        };
      }));
      // Upload any attachments that were queued for this comment
      const files = pendingAttachments.current.get(localId);
      if (files && files.length > 0) {
        pendingAttachments.current.delete(localId);
        uploadAttachmentsForComment(comment.id, projectId, files);
      }
    },
    onFailed: (localId: string) => {
      pendingAttachments.current.delete(localId);
      setImagesState(prev => prev.map(img => {
        if (!img.pins.some(p => p.id === localId)) return img;
        return {
          ...img,
          pins: img.pins.filter(p => p.id !== localId),
        };
      }));
      toast({
        title: 'Comment failed to save',
        description: 'Your comment could not be saved after several attempts. Please try again.',
        variant: 'destructive',
      });
    },
  };

  /** Upload files to project-scoped attachment storage after a comment is confirmed. */
  async function uploadAttachmentsForComment(commentId: string, pid: string, files: File[]) {
    const failed: string[] = [];
    for (const file of files) {
      try {
        const urlResult = await getAttachmentUploadUrl(pid, file.name, file.type, file.size);
        if (!urlResult.success || !urlResult.signedUrl || !urlResult.storagePath) {
          failed.push(file.name);
          continue;
        }

        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('PUT', urlResult.signedUrl!);
          xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
          xhr.onload = () => xhr.status < 300 ? resolve() : reject();
          xhr.onerror = () => reject();
          xhr.send(file);
        });

        await registerAttachment(commentId, pid, urlResult.storagePath, file.name, file.type, file.size);
      } catch {
        failed.push(file.name);
      }
    }
    if (failed.length > 0) {
      toast({
        title: 'Attachment upload failed',
        description: `Could not upload: ${failed.join(', ')}. Your comment was saved without these files.`,
        variant: 'destructive',
      });
    }
  }

  const fetchThreads = async () => {
    setIsLoading(true);
    try {
      const [threads, userInfo] = await Promise.all([
        getProjectThreads(projectId),
        getCurrentUser(),
      ]);
      if (userInfo?.name) setCurrentUserName(userInfo.name);
      if (userInfo?.role) setCurrentUserRole(userInfo.role);
      // Fetch all comments in parallel
      const commentsByThread = await Promise.all(
        threads.map((t: any) => getThreadComments(t.id))
      );
      // Batch-fetch attachments for all comments in one query
      const allCommentIds = commentsByThread.flat().map((c: DbComment) => c.id);
      const attachmentMap = await getAttachmentsForComments(allCommentIds);
      const mappedImages: ImageData[] = threads.map((t: any, i: number) => {
        const enriched = commentsByThread[i].map((c: DbComment) => ({
          ...c,
          attachments: attachmentMap[c.id] ?? [],
        }));
        const dbPins = enriched.map(dbCommentToPin);
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

  const handleRealtimeComment = useCallback((comment: DbComment) => {
    if (comment.type === 'reply' || comment.parent_comment_id) {
      return;
    }

    setImagesState(prev => prev.map(img => {
      if (img.id !== comment.thread_id) return img;
      const alreadyExists = img.pins.some(p =>
        p.id === comment.id ||
        (p.id.startsWith('local_') && p.content === comment.content &&
          Math.abs(new Date(p.timestamp).getTime() - new Date(comment.created_at ?? '').getTime()) < 5000)
      );
      if (alreadyExists) return img;
      return {
        ...img,
        pins: [...img.pins, dbCommentToPin(comment)],
      };
    }));
  }, []);

  const { connectionStatus } = useRealtimeComments({
    threadIds: imagesState.map(img => img.id),
    onNewComment: handleRealtimeComment,
  });

  const currentImage = imagesState.find(img => img.id === currentImageId);
  const pins = currentImage?.pins || [];
  const visiblePins = useMemo(
    () => pins.filter(p => commentTab === 'resolved' ? p.status === 'resolved' : p.status !== 'resolved'),
    [pins, commentTab]
  );
  // Extract Konva shapes from visible pins to pass to the drawing canvas
  const drawnShapes = useMemo<Shape[]>(
    () => visiblePins.filter(p => p.drawingData).map(p => p.drawingData!),
    [visiblePins]
  );

  /** Called by ImageViewer when the user finishes drawing a shape. */
  const handleShapeComplete = useCallback((shape: Shape, center: { x: number; y: number }) => {
    setPendingShape(shape);
    setPendingPinPos(center);
    setModalPosition(center);
    setSelectedPin(null);
    setIsNewPin(true);
    setShowModal(true);
  }, []);

  const handleImageClick = useCallback((x: number, y: number) => {
    // Store position and open modal — no placeholder pin yet
    // The real pin is only created in the DB on submit
    setPendingPinPos({ x, y });
    setModalPosition({ x, y });
    setSelectedPin(null);
    setIsNewPin(true);
    setShowModal(true);
  }, []);

  const handleAddComment = async (text: string, attachmentFiles: File[] = []) => {
    if (!currentImageId || !pendingPinPos) return;
    const currentPins = imagesState.find(img => img.id === currentImageId)?.pins ?? [];
    const pinNumber = currentPins.length + 1;

    // 1. Enqueue locally — instant, no network wait
    const queued = enqueue(currentImageId, text, currentUserName, pendingPinPos.x, pendingPinPos.y, pinNumber, pendingShape ?? undefined);
    // Store any attachment files keyed by localId — uploaded after the comment syncs
    if (attachmentFiles.length > 0) {
      pendingAttachments.current.set(queued.localId, attachmentFiles);
    }
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

  const handleAddAttachmentToComment = async (commentId: string, files: File[]) => {
    await uploadAttachmentsForComment(commentId, projectId, files);
    const updated = await getAttachmentsForComments([commentId]);
    setImagesState(prev => prev.map(img => {
      if (!img.pins.some(p => p.id === commentId)) return img;
      return {
        ...img,
        pins: img.pins.map(p =>
          p.id === commentId ? { ...p, attachments: updated[commentId] ?? p.attachments } : p
        ),
      };
    }));
  };

  const handleSwitchImage = useCallback((imageId: string) => {
    const index = imagesState.findIndex(img => img.id === imageId);
    if (index !== -1) {
      setCurrentImageIndex(index);
    }
    setCurrentImageId(imageId);
    setSelectedPin(null);
    setShowModal(false);
  }, [imagesState]);

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

  const handleNavigateImages = useCallback((direction: 'prev' | 'next') => {
    if (direction === 'prev' && currentImageIndex > 0) {
      handleSwitchImage(imagesState[currentImageIndex - 1].id);
      setCurrentImageIndex(currentImageIndex - 1);
    } else if (direction === 'next' && currentImageIndex < imagesState.length - 1) {
      handleSwitchImage(imagesState[currentImageIndex + 1].id);
      setCurrentImageIndex(currentImageIndex + 1);
    }
  }, [currentImageIndex, imagesState, handleSwitchImage]);

  const handlePinClick = useCallback((x: number, y: number, pinId?: string) => {
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
  }, [pins, handleImageClick]);

  const handlePinReposition = useCallback(async (pinId: string, x: number, y: number) => {
    // Local optimistic comments are not in the DB yet.
    if (pinId.startsWith('local_') || !currentImageId) return;

    const imageBeforeUpdate = imagesState.find(img => img.id === currentImageId);
    const pinBeforeUpdate = imageBeforeUpdate?.pins.find(pin => pin.id === pinId);
    if (!pinBeforeUpdate) return;

    const previousPosition = { x: pinBeforeUpdate.x, y: pinBeforeUpdate.y };

    setImagesState(prev => prev.map(img =>
      img.id === currentImageId
        ? {
            ...img,
            pins: img.pins.map(pin =>
              pin.id === pinId
                ? { ...pin, x, y }
                : pin
            ),
          }
        : img
    ));

    if (selectedPin === pinId) {
      setModalPosition({ x, y });
    }

    const result = await updateCommentPosition(pinId, x, y, projectId);
    if (!result.success) {
      setImagesState(prev => prev.map(img =>
        img.id === currentImageId
          ? {
              ...img,
              pins: img.pins.map(pin =>
                pin.id === pinId
                  ? { ...pin, x: previousPosition.x, y: previousPosition.y }
                  : pin
              ),
            }
          : img
      ));

      if (selectedPin === pinId) {
        setModalPosition(previousPosition);
      }

      toast({
        title: 'Unable to move pin',
        description: result.error ?? 'Pin position could not be saved. Please try again.',
        variant: 'destructive',
      });
    }
  }, [currentImageId, imagesState, projectId, selectedPin, toast]);

  return (
    <div className={`h-screen bg-background text-foreground flex flex-col ${isFullscreen ? 'fixed inset-0' : ''}`}>
      <ProjectTopNav
        isFullscreen={isFullscreen}
        projectName={projectName}
        projectId={projectId}
        pins={pins}
        pendingCount={pendingCount}
        isSyncing={isSyncing}
      />

      {connectionStatus === 'disconnected' && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-6 py-1.5 text-xs text-yellow-800 flex items-center justify-between">
          <span>Live updates paused.</span>
          <button onClick={fetchThreads} className="underline underline-offset-2 hover:text-yellow-900">Refresh</button>
        </div>
      )}

      <ProjectShell
        isFullscreen={isFullscreen}
        images={imagesState}
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
        onResolveComment={handleResolveComment}
        projectId={projectId}
        onSelectImage={handleSwitchImage}
        onUploadComplete={fetchThreads}
        onCommentTabChange={setCommentTab}
      >

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
            pins={visiblePins}
            selectedPin={selectedPin}
            drawnShapes={drawnShapes}
            pendingShape={pendingShape}
            currentImageName={currentImage?.name}
            onShapeComplete={handleShapeComplete}
            onPinClick={handlePinClick}
            onPinReposition={handlePinReposition}
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

      </ProjectShell>

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
          currentUser={currentUserName}
          userRole={currentUserRole}
          isNewPin={isNewPin}
          isFullscreen={isFullscreen}
          onAddAttachment={!isNewPin ? handleAddAttachmentToComment : undefined}
        />
      )}
    </div>
  );
}
