'use client';

import { ChevronUp, ChevronDown } from 'lucide-react';

interface ImageData {
  id: number;
  name: string;
  url: string;
  pins: any[];
}

interface ThumbnailsSidebarProps {
  images: ImageData[];
  currentImageId: number;
  onSelectImage: (imageId: number) => void;
}

export default function ThumbnailsSidebar({
  images,
  currentImageId,
  onSelectImage,
}: ThumbnailsSidebarProps) {
  return (
    <div className="w-32 border-l border-border bg-white flex flex-col overflow-hidden">
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
