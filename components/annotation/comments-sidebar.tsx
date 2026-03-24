'use client';

import { MessageSquare, ChevronDown, ChevronRight, Check } from 'lucide-react';
import { useState } from 'react';

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

export default function CommentsSidebar({ allImages, currentImageId, selectedPinId, onSelectPin, onResolve, readOnly = false }: CommentsSidebarProps) {
  const [expandedImages, setExpandedImages] = useState<string[]>([currentImageId]);

  const allPins = allImages.flatMap(img => img.pins);
  const resolvedCount = allPins.filter(p => p.status === 'resolved').length;
  const activeCount = allPins.filter(p => p.status !== 'resolved').length;

  const imageGroups = allImages.map(img => ({
    ...img,
    activeComments: img.pins.filter(p => p.status !== 'resolved'),
    resolvedComments: img.pins.filter(p => p.status === 'resolved'),
    totalComments: img.pins.length,
  })).filter(g => g.totalComments > 0);

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
      className={`border-t border-gray-200 p-4 ml-2 cursor-pointer transition-colors ${
        pin.status === 'resolved' ? 'bg-gray-50 opacity-70' : selectedPinId === pin.id ? 'bg-blue-50' : 'hover:bg-white'
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className={`flex items-center justify-center w-6 h-6 rounded-full text-white text-xs font-semibold ${
          pin.status === 'resolved' ? 'bg-green-600' : 'bg-blue-600'
        }`}>
          {pin.number}
        </div>
        <div className="flex-1">
          <p className={`text-sm font-semibold ${pin.status === 'resolved' ? 'line-through text-gray-500' : ''}`}>{pin.author}</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mb-2">{pin.timestamp}</p>
      <p className={`text-sm ${pin.status === 'resolved' ? 'line-through text-gray-500' : 'text-gray-700'}`}>{pin.content}</p>
      <div className="flex items-center gap-2 mt-3">
        {!readOnly && (
          <button
            onClick={(e) => { e.stopPropagation(); onResolve(pin.id); }}
            className={`text-xs ml-auto px-2 py-1 rounded flex items-center gap-1 transition-colors ${
              pin.status === 'resolved'
                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            <Check size={14} />
            {pin.status === 'resolved' ? 'Resolved' : 'Resolve'}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="w-72 border-r border-border bg-white flex flex-col overflow-hidden">
      <div className="border-b border-border p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Comments</h2>
          <ChevronDown size={16} className="text-gray-400" />
        </div>
        <div className="flex gap-2 text-sm">
          <span className="font-semibold px-2 py-1 rounded bg-blue-100 text-blue-700">
            {activeCount} Active
          </span>
          <span className="font-semibold px-2 py-1 rounded bg-green-100 text-green-700">
            {resolvedCount} Resolved
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {imageGroups.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <MessageSquare size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">No comments</p>
          </div>
        ) : (
          imageGroups.map(imageGroup => (
            <div key={imageGroup.id} className="border-b border-border">
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
                  {imageGroup.activeComments.length > 0 && (
                    <>
                      <div className="px-4 pt-3 pb-2">
                        <p className="text-xs font-semibold text-blue-700">Active</p>
                      </div>
                      {imageGroup.activeComments.map(renderCommentItem)}
                    </>
                  )}
                  {imageGroup.resolvedComments.length > 0 && (
                    <>
                      <div className="px-4 pt-3 pb-2">
                        <p className="text-xs font-semibold text-green-700">Resolved</p>
                      </div>
                      {imageGroup.resolvedComments.map(renderCommentItem)}
                    </>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
