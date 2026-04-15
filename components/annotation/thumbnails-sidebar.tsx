'use client';

import { ChevronUp, ChevronDown } from 'lucide-react';
import NextImage from 'next/image';
import ImageUploader from '@/components/image-uploader';
import { getOptimizedImageUrl, IMAGE_SIZES } from '@/lib/image-url';

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
  return (
    <div className="w-32 border-l border-border bg-white flex flex-col overflow-hidden">
      <div className="p-2 border-b border-border flex justify-between items-center">
        <span className="text-xs font-semibold text-gray-500">IMAGES</span>
        {!readOnly && <ImageUploader projectId={projectId} onUploadComplete={onUploadComplete} />}
      </div>
      <div className="flex-1 overflow-y-auto">
        {images.map((img) => (
          <div
            key={img.id}
            onClick={() => onSelectImage(img.id)}
            className={`border-b border-border aspect-square overflow-hidden cursor-pointer hover:opacity-80 transition-all ${
              currentImageId === img.id ? 'ring-2 ring-blue-600' : ''
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
          </div>
        ))}
      </div>

      <div className="border-t border-border p-2 flex items-center justify-between text-xs text-gray-600">
        <span>{images.findIndex(img => img.id === currentImageId) + 1} of {images.length}</span>
        <div className="flex gap-1">
          <button
            className="p-1 hover:bg-gray-100 rounded disabled:opacity-40"
            disabled={images.findIndex(img => img.id === currentImageId) === 0}
            onClick={() => {
              const idx = images.findIndex(img => img.id === currentImageId);
              if (idx > 0) onSelectImage(images[idx - 1].id);
            }}
          >
            <ChevronUp size={16} />
          </button>
          <button
            className="p-1 hover:bg-gray-100 rounded disabled:opacity-40"
            disabled={images.findIndex(img => img.id === currentImageId) === images.length - 1}
            onClick={() => {
              const idx = images.findIndex(img => img.id === currentImageId);
              if (idx < images.length - 1) onSelectImage(images[idx + 1].id);
            }}
          >
            <ChevronDown size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
