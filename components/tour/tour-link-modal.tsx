'use client';

import React, { useEffect, useState } from 'react';
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
import { Label } from '@/components/ui/label';
import { Check, Trash2 } from 'lucide-react';
import { getOptimizedImageUrl, IMAGE_SIZES } from '@/lib/image-url';

export interface LinkCandidateScene {
  id: string;
  name: string;
  url: string;
}

interface TourLinkModalProps {
  open: boolean;
  mode: 'create' | 'edit';
  /** Scenes the link can point to (every scene except the current one). */
  candidateScenes: LinkCandidateScene[];
  initialTargetId?: string | null;
  initialLabel?: string;
  isSaving?: boolean;
  onSubmit: (targetSceneId: string, label: string) => void | Promise<void>;
  onDelete?: () => void;
  onClose: () => void;
}

export default function TourLinkModal({
  open,
  mode,
  candidateScenes,
  initialTargetId,
  initialLabel,
  isSaving = false,
  onSubmit,
  onDelete,
  onClose,
}: TourLinkModalProps) {
  const [targetId, setTargetId] = useState<string | null>(initialTargetId ?? null);
  const [label, setLabel] = useState(initialLabel ?? '');

  // Re-seed local state each time the modal opens for a different hotspot/point.
  useEffect(() => {
    if (open) {
      setTargetId(initialTargetId ?? null);
      setLabel(initialLabel ?? '');
    }
  }, [open, initialTargetId, initialLabel]);

  const targetName = candidateScenes.find(s => s.id === targetId)?.name;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !isSaving) onClose(); }}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Link to a scene' : 'Edit navigation link'}</DialogTitle>
          <DialogDescription>
            Visitors who click this spot will walk to the selected scene.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {candidateScenes.length === 0 ? (
            <p className="text-sm text-muted-foreground rounded-md bg-muted px-3 py-4 text-center">
              This tour needs at least one other scene to link to. Upload more scenes first.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-1">
              {candidateScenes.map((scene) => {
                const isSelected = scene.id === targetId;
                return (
                  <button
                    key={scene.id}
                    type="button"
                    onClick={() => setTargetId(scene.id)}
                    className={`group relative rounded-lg overflow-hidden border-2 text-left transition-colors ${
                      isSelected ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <div className="relative aspect-video bg-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={getOptimizedImageUrl(scene.url, IMAGE_SIZES.SIDEBAR_THUMB)}
                        alt={scene.name}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                      {isSelected && (
                        <span className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                          <Check size={12} />
                        </span>
                      )}
                    </div>
                    <span className="block truncate px-1.5 py-1 text-[11px] font-medium text-foreground">
                      {scene.name}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="tour-link-label">Label (optional)</Label>
            <Input
              id="tour-link-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={targetName ? `Defaults to “${targetName}”` : 'e.g. Living room'}
              maxLength={200}
              disabled={isSaving}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {mode === 'edit' && onDelete ? (
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive gap-1.5"
              onClick={onDelete}
              disabled={isSaving}
            >
              <Trash2 size={14} />
              Remove link
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={isSaving}>Cancel</Button>
            <Button
              onClick={() => targetId && onSubmit(targetId, label.trim())}
              disabled={isSaving || !targetId}
            >
              {isSaving ? 'Saving…' : mode === 'create' ? 'Add link' : 'Save'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
