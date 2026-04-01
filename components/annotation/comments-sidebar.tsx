'use client';

import { MessageSquare, ChevronDown, ChevronRight, Check } from 'lucide-react';
import { useState, useEffect } from 'react';

interface Pin {
  id: string;
  number: number;
  x: number;
  y: number;
  content: string;
  author: string;
  timestamp: string;
  status: 'active' | 'resolved';
}

interface ImageData {
  id: string;
  name: string;
  pins: Pin[];
}

interface CommentsSidebarProps {
  allImages: ImageData[];
  currentImageId: string;
  selectedPinId: string | null;
  onSelectPin: (id: string) => void;
  onResolve: (pinId: string) => void;
  /** When true the resolve button is hidden — for read-only viewers like share clients */
  readOnly?: boolean;
}

export default function CommentsSidebar({
  allImages,
  currentImageId,
  selectedPinId,
  onSelectPin,
  onResolve,
  readOnly = false,
}: CommentsSidebarProps) {
  const [expandedImages, setExpandedImages] = useState<string[]>([currentImageId]);
  const [activeTab, setActiveTab] = useState<'active' | 'resolved'>('active');

  // Auto-expand the current image when it changes
  useEffect(() => {
    setExpandedImages(prev =>
      prev.includes(currentImageId) ? prev : [...prev, currentImageId]
    );
  }, [currentImageId]);

  const allPins = allImages.flatMap(img => img.pins);
  const resolvedCount = allPins.filter(p => p.status === 'resolved').length;
  const activeCount = allPins.filter(p => p.status !== 'resolved').length;

  const imageGroups = allImages
    .map(img => {
      const filtered = img.pins.filter(p =>
        activeTab === 'resolved' ? p.status === 'resolved' : p.status !== 'resolved'
      );
      return {
        ...img,
        filteredPins: filtered,
        totalComments: filtered.length,
        // still need these for the full counts in header
        activeComments: img.pins.filter(p => p.status !== 'resolved'),
        resolvedComments: img.pins.filter(p => p.status === 'resolved'),
      };
    })
    .filter(g => g.totalComments > 0);

  const toggleExpandImage = (imageId: string) => {
    setExpandedImages(prev =>
      prev.includes(imageId)
        ? prev.filter(id => id !== imageId)
        : [...prev, imageId]
    );
  };

 const renderCommentItem = (pin: Pin) => (
  <div
    key={pin.id}
    onClick={() => onSelectPin(pin.id)}
    className={`border-t border-border/40 px-4 py-3 ml-2 cursor-pointer transition-colors ${
      pin.status === 'resolved'
        ? 'bg-gray-50 opacity-70'
        : selectedPinId === pin.id
        ? 'bg-blue-50'
        : 'hover:bg-white'
    }`}
  >
    <div className="flex items-start gap-3">
      {/* Pin number */}
      <span
        className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white ${
          pin.status === 'resolved' ? 'bg-green-600' : 'bg-primary'
        }`}
      >
        {pin.number}
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span
            className={`text-sm font-semibold ${
              pin.status === 'resolved' ? 'line-through text-gray-500' : 'text-foreground'
            }`}
          >
            {pin.author}
          </span>
        </div>

        <p className="text-xs text-muted-foreground mb-1.5">
          {pin.timestamp}
        </p>

        <p
          className={`text-sm leading-relaxed ${
            pin.status === 'resolved'
              ? 'line-through text-gray-500'
              : 'text-foreground'
          }`}
        >
          {pin.content}
        </p>

        {!readOnly && (
          <div className="mt-2 flex">
            <button
              onClick={e => {
                e.stopPropagation();
                onResolve(pin.id);
              }}
              className={`ml-auto text-[11px] px-2 py-0.5 rounded flex items-center gap-1 transition-colors ${
                pin.status === 'resolved'
                  ? 'bg-green-100 text-green-700 hover:bg-green-200'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              <Check size={12} />
              {pin.status === 'resolved' ? 'Resolved' : 'Resolve'}
            </button>
          </div>
        )}
      </div>
    </div>
  </div>
);
  return (
    <div className="w-72 border-r border-border/50 bg-background flex flex-col overflow-hidden">
      {/* Header tabs */}
      <div className="flex items-center gap-6 px-5 py-3 border-b border-border/50">
        <button
          onClick={() => setActiveTab('active')}
          className={`text-sm font-semibold pb-1 transition-colors ${
            activeTab === 'active'
              ? 'text-foreground border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {activeCount} Active
        </button>
        <button
          onClick={() => setActiveTab('resolved')}
          className={`text-sm pb-1 transition-colors ${
            activeTab === 'resolved'
              ? 'text-foreground font-semibold border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {resolvedCount} Resolved
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {imageGroups.length === 0 ? (
          <div className="p-2 text-center text-muted-foreground">
            <MessageSquare size={22} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">No comments</p>
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {imageGroups.map(imageGroup => (
              <div key={imageGroup.id}>
                <button
                  onClick={() => toggleExpandImage(imageGroup.id)}
                  className="w-full flex items-center gap-2 p-4 hover:bg-gray-50 transition-colors"
                >
                  {expandedImages.includes(imageGroup.id) ? (
                    <ChevronDown size={16} className="text-gray-600" />
                  ) : (
                    <ChevronRight size={16} className="text-gray-600" />
                  )}
                  <span className="text-sm font-semibold text-gray-900">{imageGroup.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground bg-gray-100 px-2 py-1 rounded">
                    {imageGroup.totalComments}
                  </span>
                </button>

                {expandedImages.includes(imageGroup.id) && (
                  <div className="bg-gray-50">
                    {imageGroup.filteredPins.map(renderCommentItem)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
