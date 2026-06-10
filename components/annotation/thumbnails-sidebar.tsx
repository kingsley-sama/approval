'use client';

import { ChevronUp, ChevronDown } from 'lucide-react';
import NextImage from 'next/image';
import ImageUploader from '@/components/image-uploader';
import { getOptimizedImageUrl, IMAGE_SIZES } from '@/lib/image-url';
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
  projectId: string;
  onUploadComplete?: () => void | Promise<void>;
  /** When true the upload button is hidden */
  readOnly?: boolean;
}

export default function ThumbnailsSidebar({
  images,
  currentImageId,
  onSelectImage,
  projectId,
  onUploadComplete,
  readOnly = false,
}: ThumbnailsSidebarProps) {
  const currentIndex = images.findIndex(img => img.id === currentImageId);
  return (
    <div className="w-32 border-l border-border bg-white flex flex-col overflow-hidden">
      <div className="p-2 border-b border-border flex justify-between items-center">
        <span className="text-xs font-semibold text-gray-500">IMAGES</span>
        {!readOnly && <ImageUploader projectId={projectId} onUploadComplete={onUploadComplete} />}
      </div>
      <div className="flex-1 overflow-y-auto">
        {images.map((img) => {
          const openCount = img.pins.filter(p => p.status !== 'resolved').length;
          return (
          <div
            key={img.id}
            onClick={() => onSelectImage(img.id)}
            className={`border-b border-border cursor-pointer transition-colors ${
              currentImageId === img.id ? 'bg-blue-50' : 'hover:bg-gray-50'
            }`}
          >
            <div
              className={`relative aspect-square overflow-hidden hover:opacity-80 transition-all ${
                currentImageId === img.id ? 'ring-2 ring-inset ring-blue-600' : ''
              }`}
            >
              <NextImage
                src={getOptimizedImageUrl(img.url, IMAGE_SIZES.SIDEBAR_THUMB) || "/placeholder.svg"}
                alt={img.name}
                width={128}
                height={128}
                sizes="128px"
                quality={60}
                className="w-full h-full object-cover"
              />
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
