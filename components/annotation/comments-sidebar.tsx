'use client';

import { MessageSquare, ChevronDown, ChevronRight, Check } from 'lucide-react';
import { useState } from 'react';

interface Pin {
  id: number;
  x: number;
  y: number;
  comment: string;
  author: string;
  timestamp: string;
  isNew?: boolean;
  resolved?: boolean;
}

interface Image {
  id: number;
  name: string;
}

interface CommentsSidebarProps {
  pins: Pin[];
  selectedPin: number | null;
  setSelectedPin: (id: number) => void;
  onResolve: (pinId: number) => void;
  images: Image[];
  currentImageId: number;
  allImages: Array<{ id: number; name: string; pins: Array<{ id: number; comment: string; author: string; timestamp: string; isNew?: boolean; resolved?: boolean }> }>;
}

export default function CommentsSidebar({ pins, selectedPin, setSelectedPin, onResolve, images, currentImageId, allImages }: CommentsSidebarProps) {
  const [expandedImages, setExpandedImages] = useState<number[]>([currentImageId]);

  const allComments = allImages.flatMap(img => 
    img.pins.filter(p => p.comment)
  );
  const resolvedCount = allComments.filter(p => p.resolved).length;
  const activeCount = allComments.filter(p => !p.resolved).length;
  
  const imageGroups = allImages.map(img => {
    const imageComments = allComments.filter(pin => 
      img.pins.some(p => p.id === pin.id)
    );
    return {
      ...img,
      activeComments: imageComments.filter(p => !p.resolved),
      resolvedComments: imageComments.filter(p => p.resolved),
      totalComments: imageComments.length
    };
  }).filter(group => group.totalComments > 0);

  const toggleExpandImage = (imageId: number) => {
    setExpandedImages(prev =>
      prev.includes(imageId)
        ? prev.filter(id => id !== imageId)
        : [...prev, imageId]
    );
  };

  const renderCommentItem = (pin: any) => (
    <div
      key={pin.id}
      onClick={() => setSelectedPin(pin.id)}
      className={`border-t border-gray-200 p-4 ml-2 cursor-pointer transition-colors ${
        pin.resolved ? 'bg-gray-50' : selectedPin === pin.id ? 'bg-blue-50' : 'hover:bg-white'
      } ${pin.resolved ? 'opacity-60' : ''}`}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-semibold">
          {pin.id}
        </div>
        <div className="flex-1">
          <p className={`text-sm font-semibold ${pin.resolved ? 'line-through text-gray-500' : ''}`}>{pin.author}</p>
          {pin.isNew && !pin.resolved && (
            <span className="inline-block ml-1 px-2 py-0.5 bg-red-500 text-white text-xs rounded-full">
              New
            </span>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground mb-2">{pin.timestamp}</p>
      <p className={`text-sm ${pin.resolved ? 'line-through text-gray-500' : 'text-gray-700'}`}>{pin.comment}</p>
      <div className="flex items-center gap-2 mt-3">
        {pin.comment && (
          <button className="text-xs text-blue-600 hover:underline">
            1 Reply
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onResolve(pin.id);
          }}
          className={`text-xs ml-auto px-2 py-1 rounded flex items-center gap-1 transition-colors ${
            pin.resolved
              ? 'bg-green-100 text-green-700 hover:bg-green-200'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          <Check size={14} />
          {pin.resolved ? 'Resolved' : 'Resolve'}
        </button>
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
