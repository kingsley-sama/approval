'use client';

import { useState } from 'react';
import { ChevronUp, ChevronDown, GripVertical, FileText, Film } from 'lucide-react';
import NextImage from 'next/image';
import ImageUploader from '@/components/image-uploader';
import { getOptimizedImageUrl, IMAGE_SIZES } from '@/lib/image-url';
import { getMediaKind } from '@/lib/media-type';
import { IconTooltip } from '@/components/ui/icon-tooltip';

interface ImageData {
  id: string;
  name: string;
  url: string;
  pins: any[];
}

interface ThumbnailsSidebarProps {
  images: ImageData[];
  currentImageId: string;
  onSelectImage: (imageId: string) => void;
  /** Persist a new image order (full list of ids, in display order). Drag-to-
   *  reorder is disabled when omitted or in read-only mode. */
  onReorderImages?: (orderedIds: string[]) => void;
  projectId: string;
  onUploadComplete?: () => void | Promise<void>;
  /** When true the upload button is hidden */
  readOnly?: boolean;
}

/**
 * Thumbnail image with a transient-failure retry. A just-uploaded image can take
 * a moment to propagate through Supabase's storage CDN; the Next.js optimizer
 * may briefly 404 it. Rather than leave a blank tile, retry a few times with a
 * cache-busting suffix so the image fills in on its own.
 */
function ThumbnailImage({ url, alt }: { url: string; alt: string }) {
  const [attempt, setAttempt] = useState(0);
  const optimized = getOptimizedImageUrl(url, IMAGE_SIZES.SIDEBAR_THUMB) || '/placeholder.svg';
  const src = attempt > 0 ? `${optimized}${optimized.includes('?') ? '&' : '?'}retry=${attempt}` : optimized;
  return (
    <NextImage
      src={src}
      alt={alt}
      width={128}
      height={128}
      sizes="128px"
      quality={60}
      className="w-full h-full object-cover"
      onError={() => {
        if (attempt < 3) {
          const delay = 800 * (attempt + 1);
          setTimeout(() => setAttempt(a => a + 1), delay);
        }
      }}
    />
  );
}

/** PDFs and videos have no image thumbnail, so show a labelled icon tile. */
function MediaPlaceholder({ kind }: { kind: 'pdf' | 'video' }) {
  const Icon = kind === 'pdf' ? FileText : Film;
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-gray-100 text-gray-500">
      <Icon className="h-6 w-6" />
      <span className="text-[9px] font-semibold uppercase tracking-wide">{kind}</span>
    </div>
  );
}

export default function ThumbnailsSidebar({
  images,
  currentImageId,
  onSelectImage,
  onReorderImages,
  projectId,
  onUploadComplete,
  readOnly = false,
}: ThumbnailsSidebarProps) {
  const currentIndex = images.findIndex(img => img.id === currentImageId);
  const reorderable = !readOnly && !!onReorderImages;

  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const handleDrop = (targetId: string) => {
    if (draggedId && draggedId !== targetId) {
      const ids = images.map(img => img.id);
      const from = ids.indexOf(draggedId);
      const to = ids.indexOf(targetId);
      if (from !== -1 && to !== -1) {
        const next = [...ids];
        next.splice(from, 1);
        next.splice(to, 0, draggedId);
        onReorderImages?.(next);
      }
    }
    setDraggedId(null);
    setDragOverId(null);
  };

  return (
    <div className="w-32 border-l border-border bg-white flex flex-col overflow-hidden">
      <div className="p-2 border-b border-border flex justify-between items-center">
        <span className="text-xs font-semibold text-gray-500">IMAGES</span>
        {!readOnly && <ImageUploader projectId={projectId} onUploadComplete={onUploadComplete} />}
      </div>
      <div className="flex-1 overflow-y-auto">
        {images.map((img) => {
          const openCount = img.pins.filter(p => p.status !== 'resolved').length;
          const kind = getMediaKind(img.url, img.name);
          const isDragging = draggedId === img.id;
          const isDragOver = dragOverId === img.id && draggedId !== img.id;
          return (
          <div
            key={img.id}
            draggable={reorderable}
            onClick={() => onSelectImage(img.id)}
            onDragStart={reorderable ? (e) => {
              setDraggedId(img.id);
              e.dataTransfer.effectAllowed = 'move';
            } : undefined}
            onDragOver={reorderable ? (e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (dragOverId !== img.id) setDragOverId(img.id);
            } : undefined}
            onDragLeave={reorderable ? () => {
              setDragOverId(prev => (prev === img.id ? null : prev));
            } : undefined}
            onDrop={reorderable ? (e) => {
              e.preventDefault();
              handleDrop(img.id);
            } : undefined}
            onDragEnd={reorderable ? () => {
              setDraggedId(null);
              setDragOverId(null);
            } : undefined}
            className={`group relative border-b border-border cursor-pointer transition-colors ${
              currentImageId === img.id ? 'bg-blue-50' : 'hover:bg-gray-50'
            } ${isDragging ? 'opacity-40' : ''} ${isDragOver ? 'ring-2 ring-inset ring-primary' : ''}`}
          >
            {isDragOver && (
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary z-10" />
            )}
            <div
              className={`relative aspect-square overflow-hidden hover:opacity-80 transition-all ${
                currentImageId === img.id ? 'ring-2 ring-inset ring-blue-600' : ''
              }`}
            >
              {kind === 'image'
                ? <ThumbnailImage url={img.url} alt={img.name} />
                : <MediaPlaceholder kind={kind} />}
              {reorderable && (
                <span
                  className="absolute top-1 left-1 p-0.5 rounded bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
                  title="Drag to reorder"
                  // Stop the click-to-select firing when grabbing the handle.
                  onClick={(e) => e.stopPropagation()}
                >
                  <GripVertical size={12} />
                </span>
              )}
              {openCount > 0 && (
                <span
                  className="absolute top-1 right-1 min-w-4.5 h-4.5 px-1 rounded-full bg-primary text-white text-[10px] font-semibold flex items-center justify-center shadow-sm"
                  title={`${openCount} open ${openCount === 1 ? 'comment' : 'comments'}`}
                >
                  {openCount}
                </span>
              )}
            </div>
            <div
              className={`px-1.5 py-1 text-[10px] leading-tight truncate ${
                currentImageId === img.id ? 'text-blue-700 font-medium' : 'text-gray-600'
              }`}
              title={img.name}
            >
              {img.name}
            </div>
          </div>
          );
        })}
      </div>

      <div className="border-t border-border p-2 flex items-center justify-between text-xs text-gray-600">
        <span>{currentIndex + 1} of {images.length}</span>
        <div className="flex gap-1">
          <IconTooltip label="Previous image" side="top">
            <button
              aria-label="Previous image"
              className="p-1 hover:bg-gray-100 rounded disabled:opacity-40"
              disabled={currentIndex <= 0}
              onClick={() => {
                if (currentIndex > 0) onSelectImage(images[currentIndex - 1].id);
              }}
            >
              <ChevronUp size={16} />
            </button>
          </IconTooltip>
          <IconTooltip label="Next image" side="top">
            <button
              aria-label="Next image"
              className="p-1 hover:bg-gray-100 rounded disabled:opacity-40"
              disabled={currentIndex === images.length - 1}
              onClick={() => {
                if (currentIndex < images.length - 1) onSelectImage(images[currentIndex + 1].id);
              }}
            >
              <ChevronDown size={16} />
            </button>
          </IconTooltip>
        </div>
      </div>
    </div>
  );
}
