'use client';

import React, { useRef, useState } from 'react';
import Image from 'next/image';
import {
  ArrowDown, ArrowUp, Link2, Loader2, MoreVertical, Orbit, Pencil, Play, Trash2, Upload,
} from 'lucide-react';
import { getTourSceneUploadUrl, registerTourScene } from '@/app/actions/tour-scenes';
import { xhrUpload } from '@/lib/upload';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface TourSidebarScene {
  id: string;
  name: string;
  url: string;
  hotspotCount: number;
  isStart: boolean;
}

interface TourScenesSidebarProps {
  scenes: TourSidebarScene[];
  currentSceneId: string;
  projectId: string;
  onSelectScene: (id: string) => void;
  /** Called after new scenes were uploaded so the parent can refetch. */
  onScenesChanged: () => void | Promise<void>;
  onSetStart: (id: string) => void;
  onRename: (id: string, name: string) => Promise<{ success: boolean; error?: string }>;
  onMove: (id: string, direction: 'up' | 'down') => void;
  onDelete: (id: string) => void;
  canEdit?: boolean;
}

const MB = 1024 * 1024;
const MAX = 50 * MB;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export default function TourScenesSidebar({
  scenes,
  currentSceneId,
  projectId,
  onSelectScene,
  onScenesChanged,
  onSetStart,
  onRename,
  onMove,
  onDelete,
  canEdit = true,
}: TourScenesSidebarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string } | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  const handleFiles = async (files: File[]) => {
    const valid = files.filter(f => IMAGE_TYPES.has(f.type) && f.size > 0 && f.size <= MAX);
    if (valid.length === 0) {
      setError('Use JPG/PNG/WebP images up to 50 MB.');
      return;
    }
    setError('');
    setUploading(true);
    try {
      for (const file of valid) {
        const urlResult = await getTourSceneUploadUrl(projectId, file.name);
        if (!urlResult.success || !urlResult.signedUrl || !urlResult.storagePath) continue;
        try {
          await xhrUpload(file, urlResult.signedUrl, () => {});
        } catch {
          continue;
        }
        await registerTourScene(projectId, file.name, urlResult.storagePath);
      }
      await onScenesChanged();
    } finally {
      setUploading(false);
    }
  };

  const openRename = (scene: TourSidebarScene) => {
    setRenameTarget({ id: scene.id, name: scene.name });
    setRenameValue(scene.name);
    setRenameError(null);
  };

  const confirmRename = async () => {
    if (!renameTarget) return;
    const trimmed = renameValue.trim();
    if (!trimmed) { setRenameError('Name cannot be empty'); return; }
    if (trimmed === renameTarget.name) { setRenameTarget(null); return; }
    setIsRenaming(true);
    setRenameError(null);
    const result = await onRename(renameTarget.id, trimmed);
    setIsRenaming(false);
    if (!result.success) {
      setRenameError(result.error ?? 'Failed to rename scene');
      return;
    }
    setRenameTarget(null);
  };

  return (
    <aside className="w-56 shrink-0 border-l border-border bg-background flex flex-col">
      <div className="px-3 py-2.5 border-b border-border flex items-center gap-2">
        <Orbit size={14} className="text-accent" />
        <span className="text-xs font-semibold text-foreground">Scenes</span>
        <span className="ml-auto text-[10px] text-muted-foreground">{scenes.length}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {scenes.map((scene, index) => (
          <div
            key={scene.id}
            className={`group relative w-full rounded-lg overflow-hidden border transition-colors ${
              scene.id === currentSceneId ? 'border-accent ring-2 ring-accent/40' : 'border-border hover:border-accent/50'
            }`}
          >
            <button
              onClick={() => onSelectScene(scene.id)}
              className="relative block w-full aspect-video"
            >
              <Image src={scene.url} alt={scene.name} fill sizes="200px" className="object-cover" />
              {scene.isStart && (
                <span
                  className="absolute top-1 left-1 flex items-center gap-1 rounded-full bg-green-600/90 px-1.5 py-0.5 text-[9px] font-semibold text-white"
                  title="Visitors start the tour here"
                >
                  <Play size={8} className="fill-current" />
                  Start
                </span>
              )}
            </button>

            <div className="absolute inset-x-0 bottom-0 bg-black/55 px-1.5 py-0.5 flex items-center gap-1">
              <span className="flex-1 text-[10px] text-white truncate">{scene.name}</span>
              <span
                className={`flex items-center gap-0.5 text-[9px] rounded-full px-1.5 leading-4 ${
                  scene.hotspotCount > 0 ? 'bg-orange-500 text-white' : 'bg-white/20 text-white/70'
                }`}
                title={`${scene.hotspotCount} navigation link${scene.hotspotCount === 1 ? '' : 's'} in this scene`}
              >
                <Link2 size={8} />
                {scene.hotspotCount}
              </span>
            </div>

            {canEdit && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    onClick={(e) => e.stopPropagation()}
                    className="absolute top-1 right-1 p-1 rounded-md bg-black/50 text-white opacity-0 group-hover:opacity-100 focus:opacity-100 data-[state=open]:opacity-100 hover:bg-black/70 transition-opacity"
                    aria-label={`Scene actions for ${scene.name}`}
                  >
                    <MoreVertical size={12} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onClick={() => onSetStart(scene.id)} disabled={scene.isStart}>
                    <Play size={13} className="mr-2" />
                    Set as start scene
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openRename(scene)}>
                    <Pencil size={13} className="mr-2" />
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onMove(scene.id, 'up')} disabled={index === 0}>
                    <ArrowUp size={13} className="mr-2" />
                    Move up
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onMove(scene.id, 'down')} disabled={index === scenes.length - 1}>
                    <ArrowDown size={13} className="mr-2" />
                    Move down
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => onDelete(scene.id)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 size={13} className="mr-2" />
                    Delete scene
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        ))}

        {scenes.length === 0 && (
          <p className="px-2 py-6 text-center text-[11px] text-muted-foreground">
            No scenes yet. Upload a 360° photo for each room or position.
          </p>
        )}
      </div>

      {canEdit && (
        <div className="p-2 border-t border-border">
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium py-2 hover:bg-primary/90 disabled:opacity-60"
          >
            {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            {uploading ? 'Uploading…' : 'Add scenes'}
          </button>
          {error && <p className="mt-1 text-[10px] text-destructive">{error}</p>}
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) handleFiles(Array.from(e.target.files));
              if (inputRef.current) inputRef.current.value = '';
            }}
          />
        </div>
      )}

      <Dialog
        open={!!renameTarget}
        onOpenChange={(open) => {
          if (!open && !isRenaming) {
            setRenameTarget(null);
            setRenameError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle>Rename scene</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={renameValue}
            onChange={(e) => { setRenameValue(e.target.value); if (renameError) setRenameError(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !isRenaming) confirmRename(); }}
            placeholder="Scene name"
            maxLength={300}
            disabled={isRenaming}
          />
          {renameError && <p className="text-xs text-destructive">{renameError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)} disabled={isRenaming}>
              Cancel
            </Button>
            <Button onClick={confirmRename} disabled={isRenaming || !renameValue.trim()}>
              {isRenaming ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
