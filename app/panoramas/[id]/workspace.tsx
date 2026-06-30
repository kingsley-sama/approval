'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Upload } from 'lucide-react';
import { PanoramaTopNav, PanoramaShell, type PanoramaImageData, type PanoramaPin } from './template';
import PanoramaCommentModal from '@/components/panorama/panorama-comment-modal';
import type { PanoramaHotspot } from '@/components/panorama/panorama-viewer';
import { usePanoramaPreloader } from '@/hooks/use-panorama-preloader';
import { downloadPanorama } from '@/lib/panorama-download';
import {
  getPanoramaWorkspaceData,
  type PanoramaWorkspaceData,
} from '@/app/actions/panorama-images';
import {
  createPanoramaComment,
  resolvePanoramaComment,
  updatePanoramaComment,
  deletePanoramaComment,
  type PanoramaComment,
} from '@/app/actions/panorama-comments';
import { useToast } from '@/hooks/use-toast';
import { useConfirm } from '@/components/confirm-dialog';

// Pannellum touches `window` at module scope — load it browser-side only.
const PanoramaViewer = dynamic(() => import('@/components/panorama/panorama-viewer'), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center bg-gray-900">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white" />
    </div>
  ),
});

function commentToPin(c: PanoramaComment): PanoramaPin {
  return {
    id: c.id,
    number: c.display_number ?? c.pin_number,
    pitch: c.pitch,
    yaw: c.yaw,
    content: c.content,
    author: c.user_name,
    timestamp: c.created_at ? new Date(c.created_at).toLocaleDateString() : '',
    status: c.status === 'resolved' ? 'resolved' : 'active',
    replyCount: c.reply_count ?? 0,
  };
}

function workspaceToImages(data: PanoramaWorkspaceData): PanoramaImageData[] {
  return data.images.map((i: any) => ({
    id: i.id,
    name: i.name || i.image_filename || 'Panorama',
    url: i.image_path,
    pins: (data.commentsByImage[i.id] ?? []).map(commentToPin),
  }));
}

interface PanoramaWorkspaceProps {
  projectId: string;
  initialData: PanoramaWorkspaceData;
  fallbackName?: string;
}

export default function PanoramaWorkspace({ projectId, initialData, fallbackName }: PanoramaWorkspaceProps) {
  const [projectName, setProjectName] = useState(initialData.projectName ?? fallbackName ?? '');
  const currentUserName = initialData.currentUser.name || 'Anonymous';
  const currentUserRole = initialData.currentUser.role || 'member';

  const [imagesState, setImagesState] = useState<PanoramaImageData[]>(() => workspaceToImages(initialData));
  const [currentImageId, setCurrentImageId] = useState<string>(initialData.images[0]?.id ?? '');
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [selectedPin, setSelectedPin] = useState<string | null>(null);
  const [addMode, setAddMode] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [isNewPin, setIsNewPin] = useState(false);
  const [modalPos, setModalPos] = useState({ x: 0, y: 0 });
  const [pendingCoords, setPendingCoords] = useState<{ pitch: number; yaw: number } | null>(null);
  const [commentTab, setCommentTab] = useState<'active' | 'resolved'>('active');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [sidebarsCollapsed, setSidebarsCollapsed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const { toast } = useToast();
  const confirm = useConfirm();

  // Preload panorama images in the background
  const imageUrls = useMemo(() => imagesState.map(img => img.url), [imagesState]);
  usePanoramaPreloader(imageUrls, currentImageIndex);

  // Continuous pin numbering across every panorama in the project.
  const numberedImages = useMemo<PanoramaImageData[]>(() => {
    let counter = 0;
    return imagesState.map(img => ({
      ...img,
      pins: img.pins.map(pin => ({ ...pin, number: ++counter })),
    }));
  }, [imagesState]);

  const currentImage = numberedImages.find(img => img.id === currentImageId);
  const pins = currentImage?.pins ?? [];
  const visiblePins = useMemo(
    () => pins.filter(p => commentTab === 'resolved' ? p.status === 'resolved' : p.status !== 'resolved'),
    [pins, commentTab],
  );

  const hotspots = useMemo<PanoramaHotspot[]>(
    () => visiblePins.map(p => ({
      id: p.id, number: p.number, pitch: p.pitch, yaw: p.yaw, status: p.status, content: p.content,
    })),
    [visiblePins],
  );

  const refreshWorkspace = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getPanoramaWorkspaceData(projectId);
      if (data.projectName) setProjectName(data.projectName);
      const mapped = workspaceToImages(data);
      setImagesState(mapped);
      if (mapped.length > 0 && !mapped.some(m => m.id === currentImageId)) {
        setCurrentImageId(mapped[0].id);
        setCurrentImageIndex(0);
      }
    } catch (error) {
      console.error('Failed to refresh panorama workspace', error);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, currentImageId]);

  const closeModal = () => {
    setShowModal(false);
    setIsNewPin(false);
    setPendingCoords(null);
  };

  const handleToggleAddMode = () => {
    setAddMode(v => !v);
    setShowModal(false);
    setSelectedPin(null);
  };

  const handleAddHotspot = useCallback((pitch: number, yaw: number, screen: { x: number; y: number }) => {
    setPendingCoords({ pitch, yaw });
    setModalPos(screen);
    setSelectedPin(null);
    setIsNewPin(true);
    setShowModal(true);
  }, []);

  const handleSubmitComment = async (text: string) => {
    if (!currentImageId || !pendingCoords) return;
    const { pitch, yaw } = pendingCoords;
    // Keep add-mode ON after submitting so the user can keep dropping comments
    // (persistent toggle, like the drawing tool); the modal just closes.
    closeModal();

    const result = await createPanoramaComment(currentImageId, text, currentUserName, pitch, yaw, projectId);
    if (!result.success || !result.comment) {
      toast({ title: 'Failed to add comment', description: result.error ?? 'Please try again.', variant: 'destructive' });
      return;
    }
    const newPin = commentToPin(result.comment);
    setImagesState(prev => prev.map(img =>
      img.id === currentImageId ? { ...img, pins: [...img.pins, newPin] } : img
    ));
    setSelectedPin(newPin.id);
  };

  const handleSelectPin = useCallback((id: string) => {
    // Empty id = deselect (the thread panel "back" button sends this).
    if (!id) { setSelectedPin(null); return; }
    const img = imagesState.find(i => i.pins.some(p => p.id === id));
    if (img && img.id !== currentImageId) {
      const idx = imagesState.findIndex(i => i.id === img.id);
      setCurrentImageId(img.id);
      if (idx !== -1) setCurrentImageIndex(idx);
    }
    // Existing comments open in the sidebar slide-in thread (not the floating
    // modal); the floating modal is only used for creating a new comment.
    setSelectedPin(id);
    setShowModal(false);
    setIsNewPin(false);
    setPendingCoords(null);
  }, [imagesState, currentImageId]);

  const handleResolve = async (id: string) => {
    setImagesState(prev => prev.map(img => ({
      ...img,
      pins: img.pins.map(p => p.id === id ? { ...p, status: p.status === 'resolved' ? 'active' : 'resolved' } : p),
    })));
    const result = await resolvePanoramaComment(id, projectId);
    if (!result.success) {
      // Roll back
      setImagesState(prev => prev.map(img => ({
        ...img,
        pins: img.pins.map(p => p.id === id ? { ...p, status: p.status === 'resolved' ? 'active' : 'resolved' } : p),
      })));
      toast({ title: 'Failed to update status', description: result.error ?? 'Please try again.', variant: 'destructive' });
    }
  };

  const handleEdit = async (id: string, text: string) => {
    let previous = '';
    setImagesState(prev => prev.map(img => ({
      ...img,
      pins: img.pins.map(p => { if (p.id === id) { previous = p.content; return { ...p, content: text }; } return p; }),
    })));
    const result = await updatePanoramaComment(id, text, projectId);
    if (!result.success) {
      setImagesState(prev => prev.map(img => ({
        ...img,
        pins: img.pins.map(p => p.id === id ? { ...p, content: previous } : p),
      })));
      toast({ title: 'Failed to update comment', description: result.error ?? 'Please try again.', variant: 'destructive' });
    }
    return result;
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: 'Delete this comment?',
      description: 'Its replies will be removed too. This cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      destructive: true,
    });
    if (!ok) return;

    const snapshot = imagesState;
    setImagesState(prev => prev.map(img => ({ ...img, pins: img.pins.filter(p => p.id !== id) })));
    if (selectedPin === id) closeModal();
    setSelectedPin(null);

    const result = await deletePanoramaComment(id, projectId);
    if (!result.success) {
      setImagesState(snapshot);
      toast({ title: 'Failed to delete comment', description: result.error ?? 'Please try again.', variant: 'destructive' });
    }
  };

  const handleSwitchImage = useCallback((imageId: string) => {
    const index = imagesState.findIndex(img => img.id === imageId);
    if (index !== -1) setCurrentImageIndex(index);
    setCurrentImageId(imageId);
    setSelectedPin(null);
    setShowModal(false);
    // add-mode persists across panorama switches until toggled off
  }, [imagesState]);

  const handleNavigate = useCallback((direction: 'prev' | 'next') => {
    if (direction === 'prev' && currentImageIndex > 0) {
      handleSwitchImage(imagesState[currentImageIndex - 1].id);
    } else if (direction === 'next' && currentImageIndex < imagesState.length - 1) {
      handleSwitchImage(imagesState[currentImageIndex + 1].id);
    }
  }, [currentImageIndex, imagesState, handleSwitchImage]);

  const handleDownload = useCallback(async () => {
    if (!currentImage?.url) return;
    await downloadPanorama(currentImage.url, currentImage.name, () => setIsDownloading(true), () => setIsDownloading(false));
  }, [currentImage]);

  useEffect(() => {
    // Keep the index aligned if the image list changes underneath us.
    const idx = imagesState.findIndex(img => img.id === currentImageId);
    if (idx !== -1 && idx !== currentImageIndex) setCurrentImageIndex(idx);
  }, [imagesState, currentImageId, currentImageIndex]);

  const commentImages = numberedImages.map(img => ({
    id: img.id,
    name: img.name,
    pins: img.pins.map(p => ({
      id: p.id, number: p.number, content: p.content, author: p.author,
      status: p.status, timestamp: p.timestamp, replyCount: p.replyCount,
    })),
  }));

  const thumbnailImages = numberedImages.map(img => ({
    id: img.id,
    name: img.name,
    url: img.url,
    pinCount: img.pins.length,
  }));

  const canEdit = currentUserRole !== 'guest';

  return (
    <div className={`h-screen bg-background text-foreground flex flex-col ${isFullscreen ? 'fixed inset-0 z-50' : ''}`}>
      <PanoramaTopNav
        isFullscreen={isFullscreen}
        projectName={projectName}
        projectId={projectId}
        sidebarsCollapsed={sidebarsCollapsed}
        onToggleSidebars={() => setSidebarsCollapsed(v => !v)}
        currentImageUrl={currentImage?.url}
        currentImageName={currentImage?.name}
        onDownload={handleDownload}
        isDownloading={isDownloading}
      />

      <PanoramaShell
        isFullscreen={isFullscreen}
        sidebarsCollapsed={sidebarsCollapsed}
        commentImages={commentImages}
        thumbnailImages={thumbnailImages}
        currentImageId={currentImageId}
        selectedPinId={selectedPin}
        onSelectPin={handleSelectPin}
        onResolve={handleResolve}
        onTabChange={setCommentTab}
        onSelectImage={handleSwitchImage}
        projectId={projectId}
        onUploadComplete={refreshWorkspace}
        canUpload={canEdit}
        currentUser={currentUserName}
        userRole={currentUserRole}
        onEditComment={handleEdit}
        onDeleteComment={handleDelete}
        currentImageUrl={currentImage?.url}
        currentImageName={currentImage?.name}
        onDownload={handleDownload}
        isDownloading={isDownloading}
      >
        {imagesState.length === 0 ? (
          isLoading ? (
            <div className="flex-1 flex items-center justify-center bg-gray-100">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center bg-gray-100">
              <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full text-center">
                <div className="mb-4 flex justify-center">
                  <div className="p-4 bg-blue-50 rounded-full">
                    <Upload className="h-8 w-8 text-blue-600" />
                  </div>
                </div>
                <h2 className="text-xl font-semibold mb-2">No panoramas yet</h2>
                <p className="text-gray-500">Use “Add panorama” in the right panel to upload an equirectangular image.</p>
              </div>
            </div>
          )
        ) : (
          <PanoramaViewer
            imageUrl={currentImage?.url || ''}
            imageName={currentImage?.name}
            hotspots={hotspots}
            selectedId={selectedPin}
            addMode={addMode}
            onToggleAddMode={handleToggleAddMode}
            onAddHotspot={handleAddHotspot}
            onSelectHotspot={handleSelectPin}
            isFullscreen={isFullscreen}
            onToggleFullscreen={() => setIsFullscreen(v => !v)}
            currentImageIndex={currentImageIndex}
            totalImages={imagesState.length}
            onNavigate={handleNavigate}
            readOnly={!canEdit}
          />
        )}
      </PanoramaShell>

      {/* Floating modal is only for creating a new comment; existing comments
          open in the sidebar's slide-in thread panel. */}
      {showModal && isNewPin && (
        <PanoramaCommentModal
          position={modalPos}
          isNew
          currentUser={currentUserName}
          userRole={currentUserRole}
          projectId={projectId}
          onClose={closeModal}
          onSubmit={handleSubmitComment}
        />
      )}
    </div>
  );
}
