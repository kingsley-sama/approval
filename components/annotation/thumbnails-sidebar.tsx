'use client';

import { ChevronUp, ChevronDown } from 'lucide-react';
import ImageUploader from '@/components/image-uploader';

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
  onUploadComplete?: () => void;
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
            <img
              src={img.url || "/placeholder.svg"}
              alt={img.name}
              className="w-full h-full object-cover"
              crossOrigin="anonymous"
            />
          </div>
        ))}
      </div>

      <div className="border-t border-border p-2 flex items-center justify-between text-xs text-gray-600">
        <span>{images.findIndex(img => img.id === currentImageId) + 1} of {images.length}</span>
        <div className="flex gap-1">
          <button className="p-1 hover:bg-gray-100 rounded">
            <ChevronUp size={16} />
          </button>
          <button className="p-1 hover:bg-gray-100 rounded">
            <ChevronDown size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
