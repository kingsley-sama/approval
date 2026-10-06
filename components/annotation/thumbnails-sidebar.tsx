'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronUp,
  ChevronDown,
  GripVertical,
  Trash2,
  ArrowUpDown,
  ArrowDownAZ,
  ArrowUpAZ,
  Clock,
  LayoutGrid,
  MoreHorizontal,
  ChevronsUp,
  ChevronsDown,
  Hash,
} from 'lucide-react';
import ImageUploader from '@/components/image-uploader';
import { IconTooltip } from '@/components/ui/icon-tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ThumbnailMedia } from '@/components/annotation/thumbnail-media';
import ArrangeImagesDialog from '@/components/annotation/arrange-images-dialog';
import { sortImageIds, moveIdTo, type ImageSortMode } from '@/lib/image-order';

interface ImageData {
  id: string;
  name: string;
  url: string;
  pins: any[];
  /** Website reviews: the live page this entry points at, with no stored image. */
  sourceUrl?: string | null;
  /** When the image was uploaded — used by the "Upload order" sort. */
  createdAt?: string | null;
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
  /** Share token, so guests on a share link can load page thumbnails. */
  shareToken?: string;
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
  shareToken,
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
    setOrder(prev => moveIdTo(prev, dragging, prev.indexOf(target)));
  };

  /** Show a new order immediately and persist it (sort, menu moves, arrange). */
  const applyOrder = (next: string[]) => {
    if (next.join('|') === order.join('|')) return;
    setOrder(next);
    onReorderImages?.(next);
  };

  const currentIds = orderedImages.map(img => img.id);
  const applySort = (mode: ImageSortMode) => applyOrder(sortImageIds(orderedImages, mode));
  const moveTo = (id: string, position: number) => applyOrder(moveIdTo(currentIds, id, position));

  const [arrangeOpen, setArrangeOpen] = useState(false);
  // "Move to position…" — the image being moved and the typed 1-based position.
  const [positionTarget, setPositionTarget] = useState<{ id: string; name: string } | null>(null);
  const [positionInput, setPositionInput] = useState('');
  const submitPosition = () => {
    const n = Number.parseInt(positionInput, 10);
    if (!positionTarget || !Number.isFinite(n)) return;
    moveTo(positionTarget.id, n - 1);
    setPositionTarget(null);
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
      <div className="p-2 border-b border-border flex justify-between items-center gap-1">
        <span className="text-xs font-semibold text-gray-500">{isWebsite ? 'PAGES' : 'IMAGES'}</span>
        <div className="flex items-center gap-1">
          {reorderable && images.length > 1 && (
            <DropdownMenu>
              <IconTooltip label={`Sort or arrange ${noun}s`}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-full"
                    aria-label={`Sort or arrange ${noun}s`}
                  >
                    <ArrowUpDown className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
              </IconTooltip>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel className="text-xs text-gray-500">Sort {noun}s by</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => applySort('name-asc')}>
                  <ArrowDownAZ /> Name (A → Z)
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => applySort('name-desc')}>
                  <ArrowUpAZ /> Name (Z → A)
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => applySort('uploaded')}>
                  <Clock /> Upload order
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setArrangeOpen(true)}>
                  <LayoutGrid /> Arrange {noun}s…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {!readOnly && !isWebsite && (
            <ImageUploader projectId={projectId} onUploadComplete={onUploadComplete} />
          )}
        </div>
      </div>
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto"
        onDragOver={reorderable ? (e) => { e.preventDefault(); autoScroll(e.clientY); } : undefined}
      >
        {orderedImages.map((img, position) => {
          const openCount = img.pins.filter(p => p.status !== 'resolved').length;
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
              <ThumbnailMedia
                id={img.id}
                name={img.name}
                url={img.url}
                sourceUrl={img.sourceUrl}
                shareToken={shareToken}
              />
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
              {reorderable && orderedImages.length > 1 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={`Move ${img.name}`}
                      title={`Move ${noun}`}
                      className="absolute bottom-1 left-1 p-1 rounded bg-black/40 text-white opacity-0 group-hover:opacity-100 hover:bg-black/60 focus-visible:opacity-100 data-[state=open]:opacity-100 transition-all"
                      // Opening the menu must not also select the tile underneath.
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreHorizontal size={12} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" side="left" className="w-44" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenuItem disabled={position === 0} onSelect={() => moveTo(img.id, 0)}>
                      <ChevronsUp /> Move to top
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={position === 0} onSelect={() => moveTo(img.id, position - 1)}>
                      <ChevronUp /> Move up
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={position === orderedImages.length - 1}
                      onSelect={() => moveTo(img.id, position + 1)}
                    >
                      <ChevronDown /> Move down
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={position === orderedImages.length - 1}
                      onSelect={() => moveTo(img.id, orderedImages.length - 1)}
                    >
                      <ChevronsDown /> Move to bottom
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => {
                        setPositionInput(String(position + 1));
                        setPositionTarget({ id: img.id, name: img.name });
                      }}
                    >
                      <Hash /> Move to position…
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
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
              <span className="text-gray-400 tabular-nums">{position + 1}.</span> {img.name}
            </div>
          </div>
          );
        })}
      </div>

      {reorderable && (
        <>
          <ArrangeImagesDialog
            open={arrangeOpen}
            onOpenChange={setArrangeOpen}
            images={orderedImages}
            onSave={applyOrder}
            noun={noun}
          />
          <Dialog open={!!positionTarget} onOpenChange={(open) => { if (!open) setPositionTarget(null); }}>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Move to position</DialogTitle>
                <DialogDescription className="truncate" title={positionTarget?.name}>
                  {positionTarget?.name}
                </DialogDescription>
              </DialogHeader>
              <form
                onSubmit={(e) => { e.preventDefault(); submitPosition(); }}
                className="flex items-center gap-2"
              >
                <Input
                  type="number"
                  min={1}
                  max={orderedImages.length}
                  value={positionInput}
                  onChange={(e) => setPositionInput(e.target.value)}
                  autoFocus
                  aria-label="Position"
                  className="w-24"
                />
                <span className="text-sm text-gray-500">of {orderedImages.length}</span>
              </form>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPositionTarget(null)}>Cancel</Button>
                <Button onClick={submitPosition} disabled={!positionInput}>Move</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}

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
