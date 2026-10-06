'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownAZ, ArrowUpAZ, Clock, ChevronsUp, ChevronsDown } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ThumbnailMedia } from '@/components/annotation/thumbnail-media';
import { sortImageIds, moveIdTo, type ImageSortMode } from '@/lib/image-order';

interface ArrangeImage {
  id: string;
  name: string;
  url: string;
  sourceUrl?: string | null;
  createdAt?: string | null;
}

interface ArrangeImagesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The images in their current display order. */
  images: ArrangeImage[];
  onSave: (orderedIds: string[]) => void;
  noun?: 'image' | 'page';
}

/**
 * A full-size grid for rearranging a large project. The sidebar is one narrow
 * column, so moving an image across 20+ others there means a long drag with
 * auto-scroll; here many tiles are visible at once. Changes stay local until
 * Save, so an exploratory shuffle can be thrown away with Cancel.
 */
export default function ArrangeImagesDialog({
  open,
  onOpenChange,
  images,
  onSave,
  noun = 'image',
}: ArrangeImagesDialogProps) {
  const [order, setOrder] = useState<string[]>([]);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Start from the live order each time the dialog opens.
  useEffect(() => {
    if (open) setOrder(images.map(img => img.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on open
  }, [open]);

  const byId = useMemo(() => new Map(images.map(img => [img.id, img])), [images]);
  const ordered = order.map(id => byId.get(id)).filter((img): img is ArrangeImage => Boolean(img));
  const initialOrder = images.map(img => img.id).join('|');
  const dirty = order.join('|') !== initialOrder;

  const applySort = (mode: ImageSortMode) => setOrder(sortImageIds(ordered, mode));

  const moveWithin = (dragging: string, target: string) => {
    setOrder(prev => moveIdTo(prev, dragging, prev.indexOf(target)));
  };

  const autoScroll = (clientY: number) => {
    const el = gridRef.current;
    if (!el) return;
    const { top, bottom } = el.getBoundingClientRect();
    const EDGE = 80;
    if (clientY < top + EDGE) el.scrollTop -= 16;
    else if (clientY > bottom - EDGE) el.scrollTop += 16;
  };

  const plural = noun === 'page' ? 'pages' : 'images';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[90vh] flex flex-col gap-4">
        <DialogHeader>
          <DialogTitle>Arrange {plural}</DialogTitle>
          <DialogDescription>
            Drag {plural} into place, or sort them all at once. Nothing changes until you save.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-gray-500 mr-1">Sort:</span>
          <Button variant="outline" size="sm" onClick={() => applySort('name-asc')}>
            <ArrowDownAZ className="h-4 w-4" /> Name A → Z
          </Button>
          <Button variant="outline" size="sm" onClick={() => applySort('name-desc')}>
            <ArrowUpAZ className="h-4 w-4" /> Name Z → A
          </Button>
          <Button variant="outline" size="sm" onClick={() => applySort('uploaded')}>
            <Clock className="h-4 w-4" /> Upload order
          </Button>
        </div>

        <div
          ref={gridRef}
          className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1"
          onDragOver={(e) => { e.preventDefault(); autoScroll(e.clientY); }}
        >
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {ordered.map((img, index) => {
              const isDragging = draggedId === img.id;
              return (
                <div
                  key={img.id}
                  draggable
                  onDragStart={(e) => {
                    setDraggedId(img.id);
                    e.dataTransfer.effectAllowed = 'move';
                    // Firefox refuses to start a drag without payload.
                    e.dataTransfer.setData('text/plain', img.id);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (draggedId && draggedId !== img.id) moveWithin(draggedId, img.id);
                  }}
                  onDrop={(e) => { e.preventDefault(); setDraggedId(null); }}
                  onDragEnd={() => setDraggedId(null)}
                  className={`group relative rounded-md border border-border bg-white overflow-hidden cursor-grab active:cursor-grabbing transition-shadow ${
                    isDragging ? 'opacity-50 ring-2 ring-primary' : 'hover:shadow-md'
                  }`}
                >
                  <div className="relative aspect-square overflow-hidden bg-gray-50">
                    <ThumbnailMedia id={img.id} name={img.name} url={img.url} sourceUrl={img.sourceUrl} />
                    <span className="absolute top-1 left-1 min-w-5 h-5 px-1 rounded bg-black/60 text-white text-[11px] font-semibold flex items-center justify-center">
                      {index + 1}
                    </span>
                    <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      <button
                        type="button"
                        aria-label={`Move ${img.name} to the start`}
                        title="Move to start"
                        disabled={index === 0}
                        className="p-0.5 rounded bg-black/50 text-white hover:bg-black/70 disabled:opacity-40"
                        onClick={() => setOrder(prev => moveIdTo(prev, img.id, 0))}
                      >
                        <ChevronsUp size={14} />
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${img.name} to the end`}
                        title="Move to end"
                        disabled={index === ordered.length - 1}
                        className="p-0.5 rounded bg-black/50 text-white hover:bg-black/70 disabled:opacity-40"
                        onClick={() => setOrder(prev => moveIdTo(prev, img.id, prev.length - 1))}
                      >
                        <ChevronsDown size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="px-1.5 py-1 text-[11px] leading-tight truncate text-gray-700" title={img.name}>
                    {img.name}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!dirty}
            onClick={() => {
              onSave(order);
              onOpenChange(false);
            }}
          >
            Save order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
