'use client';

import React, { useRef, useState } from 'react';
import Image from 'next/image';
import { Upload, Loader2, Globe } from 'lucide-react';
import { getPanoramaUploadUrl, registerPanoramaImage } from '@/app/actions/panorama-images';
import { xhrUpload } from '@/lib/upload';

export interface PanoramaImageItem {
  id: string;
  name: string;
  url: string;
  pinCount: number;
}

interface PanoramaThumbnailsSidebarProps {
  images: PanoramaImageItem[];
  currentImageId: string;
  onSelectImage: (id: string) => void;
  projectId: string;
  onUploadComplete: () => void | Promise<void>;
  canUpload?: boolean;
}

const MB = 1024 * 1024;
const MAX = 50 * MB;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export default function PanoramaThumbnailsSidebar({
  images,
  currentImageId,
  onSelectImage,
  projectId,
  onUploadComplete,
  canUpload = true,
}: PanoramaThumbnailsSidebarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

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
        const urlResult = await getPanoramaUploadUrl(projectId, file.name);
        if (!urlResult.success || !urlResult.signedUrl || !urlResult.storagePath) continue;
        try {
          await xhrUpload(file, urlResult.signedUrl, () => {});
        } catch {
          continue;
        }
        await registerPanoramaImage(projectId, file.name, urlResult.storagePath);
      }
      await onUploadComplete();
    } finally {
      setUploading(false);
    }
  };

  return (
    <aside className="w-48 shrink-0 border-l border-border bg-background flex flex-col">
      <div className="px-3 py-2.5 border-b border-border flex items-center gap-2">
        <Globe size={14} className="text-accent" />
        <span className="text-xs font-semibold text-foreground">Panoramas</span>
        <span className="ml-auto text-[10px] text-muted-foreground">{images.length}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {images.map((img) => (
          <button
            key={img.id}
            onClick={() => onSelectImage(img.id)}
            className={`group relative w-full aspect-video rounded-lg overflow-hidden border transition-colors ${
              img.id === currentImageId ? 'border-accent ring-2 ring-accent/40' : 'border-border hover:border-accent/50'
            }`}
          >
            <Image src={img.url} alt={img.name} fill sizes="160px" className="object-cover" />
            <div className="absolute inset-x-0 bottom-0 bg-black/50 px-1.5 py-0.5 flex items-center justify-between">
              <span className="text-[10px] text-white truncate">{img.name}</span>
              {img.pinCount > 0 && (
                <span className="text-[9px] text-white bg-orange-500 rounded-full px-1.5 leading-4">{img.pinCount}</span>
              )}
            </div>
          </button>
        ))}
      </div>

      {canUpload && (
        <div className="p-2 border-t border-border">
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium py-2 hover:bg-primary/90 disabled:opacity-60"
          >
            {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            {uploading ? 'Uploading…' : 'Add panorama'}
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
    </aside>
  );
}
