'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronUp, ChevronDown, GripVertical, FileText, Film, Trash2, Globe } from 'lucide-react';
import ImageUploader from '@/components/image-uploader';
import { getMediaKind } from '@/lib/media-type';
import { IconTooltip } from '@/components/ui/icon-tooltip';

interface ImageData {
  id: string;
  name: string;
  url: string;
  pins: any[];
  /** Website reviews: the live page this entry points at, with no stored image. */
  sourceUrl?: string | null;
}

interface ThumbnailsSidebarProps {
  images: ImageData[];
  currentImageId: string;
  onSelectImage: (imageId: string) => void;
  /** Persist a new image order (full list of ids, in display order). Drag-to-
   *  reorder is disabled when omitted or in read-only mode. */
  onReorderImages?: (orderedIds: string[]) => void;
  /** Delete a single image from the revision. The control is hidden when
   *  omitted or in read-only mode. Confirmation is the caller's concern. */
  onDeleteImage?: (imageId: string) => void;
  projectId: string;
  onUploadComplete?: () => void | Promise<void>;
  /** When true the upload button is hidden */
  readOnly?: boolean;
  /**
   * A website review lists pages, not images: the noun changes and there is
   * nothing to upload — pages are added by address, from the viewer.
   */
  variant?: 'image' | 'website';
}

/**
 * Thumbnail image, served straight from Supabase Storage.
 *
 * These deliberately bypass the Next.js image optimizer: at 128px the transform
 * buys very little, and routing 20+ multi-MB renders through `/_next/image`
 * made whole batches of tiles fail to render (the optimizer rejects or times out
 * under that load, and a failed entry stays failed). A plain lazy <img> always
 * paints, and the browser reuses these bytes for the full-size viewer.
 *
 * The retry covers a just-uploaded file that hasn't propagated through the
 * storage CDN yet: rather than leave a blank tile, retry a few times with a
 * cache-busting suffix so the image fills in on its own.
 */
function ThumbnailImage({ url, alt }: { url: string; alt: string }) {
  const [attempt, setAttempt] = useState(0);
  const base = url || '/placeholder.svg';
  const src = attempt > 0 ? `${base}${base.includes('?') ? '&' : '?'}retry=${attempt}` : base;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- optimizer bypassed on purpose, see above
    <img
      src={src}
      alt={alt}
      width={128}
      height={128}
      loading="lazy"
      decoding="async"
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

/**
 * PDFs, videos and live website pages have no image thumbnail, so show a
 * labelled icon tile. A live page is a URL the workspace opens in a frame —
 * there is no stored screenshot to show.
 */
function MediaPlaceholder({ kind }: { kind: 'pdf' | 'video' | 'page' }) {
  const Icon = kind === 'pdf' ? FileText : kind === 'video' ? Film : Globe;
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
  onDeleteImage,
  projectId,
  onUploadComplete,
  readOnly = false,
  variant = 'image',
}: ThumbnailsSidebarProps) {
  const isWebsite = variant === 'website';
  const noun = isWebsite ? 'page' : 'image';
  const currentIndex = images.findIndex(img => img.id === currentImageId);
  const reorderable = !readOnly && !!onReorderImages;
  const deletable = !readOnly && !!onDeleteImage;

  const [draggedId, setDraggedId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // The list reorders live while dragging rather than jumping on drop, so the
  // tiles themselves show where the image will land. `order` is that working
  // copy; it is only persisted when the drag finishes.
  const [order, setOrder] = useState<string[]>(() => images.map(img => img.id));
  const serverOrder = images.map(img => img.id).join('|');

  useEffect(() => {
    setOrder(images.map(img => img.id));
  }, [serverOrder]);

  const orderedImages = useMemo(() => {
    const byId = new Map(images.map(img => [img.id, img]));
    const seen = new Set(order);
    const list = order
      .map(id => byId.get(id))
      .filter((img): img is ImageData => Boolean(img));
    // An image that arrived after the last sync (a fresh upload) goes last.
    for (const img of images) if (!seen.has(img.id)) list.push(img);
    return list;
  }, [images, order]);

  // ── FLIP: animate tiles between positions ───────────────────────────────
  // Reordering swaps DOM nodes, which the browser paints instantly. Measuring
  // before and after lets us play the movement back as a transform so the
  // tiles glide instead of teleporting.
  const tileRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const prevRects = useRef<Map<string, DOMRect>>(new Map());

  useLayoutEffect(() => {
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    tileRefs.current.forEach((el, id) => {
      const next = el.getBoundingClientRect();
      const prev = prevRects.current.get(id);
      prevRects.current.set(id, next);
      if (!prev || reduceMotion) return;

      const dy = prev.top - next.top;
      if (Math.abs(dy) < 1) return;

      el.style.transition = 'none';
      el.style.transform = `translateY(${dy}px)`;
      requestAnimationFrame(() => {
        el.style.transition = 'transform 180ms cubic-bezier(0.2, 0, 0, 1)';
        el.style.transform = '';
      });
    });
  }, [orderedImages]);

  const moveWithin = (dragging: string, target: string) => {
    setOrder(prev => {
      const from = prev.indexOf(dragging);
      const to = prev.indexOf(target);
      if (from === -1 || to === -1 || from === to) return prev;
      const next = [...prev];
      next.splice(from, 1);
      next.splice(to, 0, dragging);
      return next;
    });
  };

  const commitOrder = () => {
    setDraggedId(null);
    if (order.join('|') !== serverOrder) onReorderImages?.(order);
  };

  // Dragging towards an edge of a scrollable list should bring more into view.
  const autoScroll = (clientY: number) => {
    const el = listRef.current;
    if (!el) return;
    const { top, bottom } = el.getBoundingClientRect();
    const EDGE = 64;
    if (clientY < top + EDGE) el.scrollTop -= 14;
    else if (clientY > bottom - EDGE) el.scrollTop += 14;
  };

  return (
    <div className="w-32 border-l border-border bg-white flex flex-col overflow-hidden">
      <div className="p-2 border-b border-border flex justify-between items-center">
        <span className="text-xs font-semibold text-gray-500">{isWebsite ? 'PAGES' : 'IMAGES'}</span>
        {!readOnly && !isWebsite && (
          <ImageUploader projectId={projectId} onUploadComplete={onUploadComplete} />
        )}
      </div>
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto"
        onDragOver={reorderable ? (e) => { e.preventDefault(); autoScroll(e.clientY); } : undefined}
      >
        {orderedImages.map((img) => {
          const openCount = img.pins.filter(p => p.status !== 'resolved').length;
          // A website review's page has a source URL but no stored image.
          const kind: 'image' | 'pdf' | 'video' | 'page' =
            !img.url && img.sourceUrl ? 'page' : getMediaKind(img.url, img.name);
          const isDragging = draggedId === img.id;
          return (
          <div
            key={img.id}
            ref={(el) => {
              if (el) tileRefs.current.set(img.id, el);
              else {
                tileRefs.current.delete(img.id);
                prevRects.current.delete(img.id);
              }
            }}
            draggable={reorderable}
            onClick={() => onSelectImage(img.id)}
            onDragStart={reorderable ? (e) => {
              setDraggedId(img.id);
              e.dataTransfer.effectAllowed = 'move';
              // Firefox refuses to start a drag without payload.
              e.dataTransfer.setData('text/plain', img.id);
            } : undefined}
            onDragOver={reorderable ? (e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (draggedId && draggedId !== img.id) moveWithin(draggedId, img.id);
            } : undefined}
            onDrop={reorderable ? (e) => {
              e.preventDefault();
              commitOrder();
            } : undefined}
            // Fires on a cancelled drag too, so the working order is never left
            // diverging from what was saved.
            onDragEnd={reorderable ? commitOrder : undefined}
            className={`group relative border-b border-border cursor-pointer ${
              currentImageId === img.id ? 'bg-blue-50' : 'hover:bg-gray-50'
            } ${isDragging ? 'opacity-60 ring-2 ring-inset ring-primary/60 shadow-sm' : ''}`}
          >
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
              {deletable && (
                <button
                  type="button"
                  aria-label={`Delete ${img.name}`}
                  title={`Delete ${noun}`}
                  className="absolute bottom-1 right-1 p-1 rounded bg-black/40 text-white opacity-0 group-hover:opacity-100 hover:bg-red-600 focus-visible:opacity-100 transition-all"
                  // Deleting must not also select the tile underneath.
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteImage?.(img.id);
                  }}
                >
                  <Trash2 size={12} />
                </button>
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
          <IconTooltip label={`Previous ${noun}`} side="top">
            <button
              aria-label={`Previous ${noun}`}
              className="p-1 hover:bg-gray-100 rounded disabled:opacity-40"
              disabled={currentIndex <= 0}
              onClick={() => {
                if (currentIndex > 0) onSelectImage(images[currentIndex - 1].id);
              }}
            >
              <ChevronUp size={16} />
            </button>
          </IconTooltip>
          <IconTooltip label={`Next ${noun}`} side="top">
            <button
              aria-label={`Next ${noun}`}
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
