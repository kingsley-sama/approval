'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Paperclip, Pen, Link2 } from 'lucide-react';

interface Pin {
  id: number;
  x: number;
  y: number;
  comment: string;
  author: string;
  timestamp: string;
  isNew?: boolean;
}

interface CommentModalProps {
  position: { x: number; y: number };
  onClose: () => void;
  onSubmit: (text: string) => void;
  pin?: Pin;
  isFullscreen?: boolean;
}

export default function CommentModal({ position, onClose, onSubmit, pin, isFullscreen }: CommentModalProps) {
  const [comment, setComment] = useState(pin?.comment || '');
  const [modalStyle, setModalStyle] = useState<any>({});
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updatePosition = () => {
      if (modalRef.current) {
        const imageContainer = document.querySelector('[data-pin]')?.closest('.relative') as HTMLElement;
        if (!imageContainer) return;

        const containerRect = imageContainer.getBoundingClientRect();
        const modal = modalRef.current;
        
        const pinPixelX = (position.x / 100) * containerRect.width;
        const pinPixelY = (position.y / 100) * containerRect.height;
        
        const gap = 8;
        let top = containerRect.top + pinPixelY + gap;
        let left = containerRect.left + pinPixelX;

        const modalWidth = 280;
        const modalHeight = 160;
        const padding = 15;

        if (left - modalWidth / 2 < padding) {
          left = modalWidth / 2 + padding;
        } else if (left + modalWidth / 2 > window.innerWidth - padding) {
          left = window.innerWidth - modalWidth / 2 - padding;
        }

        if (top + modalHeight > window.innerHeight - padding) {
          top = containerRect.top + pinPixelY - modalHeight - gap;
        }

        setModalStyle({
          position: 'fixed',
          left: `${left}px`,
          top: `${top}px`,
          transform: 'translateX(-50%)',
        });
      }
    };

    updatePosition();
    window.addEventListener('scroll', updatePosition);
    window.addEventListener('resize', updatePosition);
    
    return () => {
      window.removeEventListener('scroll', updatePosition);
      window.removeEventListener('resize', updatePosition);
    };
  }, [position, isFullscreen]);

  const handleSubmit = () => {
    if (comment.trim()) {
      onSubmit(comment);
      setComment('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      handleSubmit();
    }
  };

  return (
    <div className="z-50 pointer-events-none">
      <div
        ref={modalRef}
        className="bg-white rounded-md shadow-lg p-2 pointer-events-auto border border-border w-72 transition-all duration-200 ease-out"
        style={modalStyle}
      >
        <div className="flex items-start justify-between gap-2 mb-1.5">
          {pin?.author && (
            <div className="text-xs text-gray-600 flex-1">
              <div className="font-semibold leading-tight">{pin.author}</div>
              <div className="text-gray-500 text-xs">{pin.timestamp}</div>
            </div>
          )}
          <button
            onClick={onClose}
            className="p-0.5 hover:bg-gray-100 rounded text-gray-600 flex-shrink-0 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex gap-1.5 items-start mb-1.5">
          <textarea
            placeholder="Add comment..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
            className="w-full px-2 py-1.5 border border-border rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white resize-none transition-shadow duration-200"
            rows={2}
          />
        </div>

        <div className="flex gap-0.5 items-center justify-between">
          <div className="flex gap-0.5">
            <button className="p-1 hover:bg-gray-100 rounded text-gray-600 transition-colors duration-150" title="Table">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v18M15 3v18M3 9h18M3 15h18" />
              </svg>
            </button>
            <button className="p-1 hover:bg-gray-100 rounded text-gray-600 transition-colors duration-150" title="Draw">
              <Pen size={14} />
            </button>
            <button className="p-1 hover:bg-gray-100 rounded text-gray-600 transition-colors duration-150" title="Link">
              <Link2 size={14} />
            </button>
            <button className="p-1 hover:bg-gray-100 rounded text-gray-600 transition-colors duration-150" title="Attachment">
              <Paperclip size={14} />
            </button>
          </div>
          <button
            onClick={handleSubmit}
            className="px-2.5 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 transition-colors duration-150"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
