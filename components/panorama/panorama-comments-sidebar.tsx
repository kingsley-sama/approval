'use client';

import React, { useMemo, useState } from 'react';
import { Check, MessageSquare, RotateCcw } from 'lucide-react';

export interface PanoramaSidebarPin {
  id: string;
  number: number;
  content: string;
  author: string;
  status: 'active' | 'resolved';
  timestamp: string;
  replyCount?: number;
}

export interface PanoramaSidebarImage {
  id: string;
  name: string;
  pins: PanoramaSidebarPin[];
}

interface PanoramaCommentsSidebarProps {
  images: PanoramaSidebarImage[];
  selectedPinId: string | null;
  onSelectPin: (id: string) => void;
  onResolve: (id: string) => void;
  onTabChange?: (tab: 'active' | 'resolved') => void;
}

export default function PanoramaCommentsSidebar({
  images,
  selectedPinId,
  onSelectPin,
  onResolve,
  onTabChange,
}: PanoramaCommentsSidebarProps) {
  const [tab, setTab] = useState<'active' | 'resolved'>('active');

  const rows = useMemo(() => {
    const out: (PanoramaSidebarPin & { imageName: string })[] = [];
    for (const img of images) {
      for (const pin of img.pins) {
        if (tab === 'resolved' ? pin.status === 'resolved' : pin.status !== 'resolved') {
          out.push({ ...pin, imageName: img.name });
        }
      }
    }
    return out;
  }, [images, tab]);

  const switchTab = (t: 'active' | 'resolved') => {
    setTab(t);
    onTabChange?.(t);
  };

  return (
    <aside className="w-72 shrink-0 border-r border-border bg-background flex flex-col">
      <div className="px-3 py-2.5 border-b border-border flex items-center gap-2">
        <MessageSquare size={14} className="text-accent" />
        <span className="text-xs font-semibold text-foreground">Comments</span>
      </div>

      <div className="flex border-b border-border">
        {(['active', 'resolved'] as const).map(t => (
          <button
            key={t}
            onClick={() => switchTab(t)}
            className={`flex-1 py-2 text-xs font-medium capitalize transition-colors ${
              tab === t ? 'text-accent border-b-2 border-accent' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 p-6 text-center">
            <MessageSquare size={28} className="opacity-40" />
            <p className="text-xs">{tab === 'resolved' ? 'No resolved comments.' : 'No comments yet. Click "Add comment", then click the panorama.'}</p>
          </div>
        ) : (
          <ul className="p-2 space-y-1.5">
            {rows.map(pin => (
              <li key={pin.id}>
                <button
                  onClick={() => onSelectPin(pin.id)}
                  className={`w-full text-left rounded-lg border p-2.5 transition-colors ${
                    pin.id === selectedPinId ? 'border-accent bg-accent/5' : 'border-border hover:bg-muted/50'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`shrink-0 w-5 h-5 rounded-full text-[10px] font-bold text-white flex items-center justify-center ${
                      pin.status === 'resolved' ? 'bg-green-500' : 'bg-orange-500'
                    }`}>
                      {pin.number}
                    </span>
                    <span className="text-xs font-medium text-foreground truncate">{pin.author}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground truncate max-w-[80px]" title={pin.imageName}>{pin.imageName}</span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 break-words">{pin.content}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); onResolve(pin.id); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onResolve(pin.id); } }}
                      className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                    >
                      {pin.status === 'resolved' ? <RotateCcw size={10} /> : <Check size={10} />}
                      {pin.status === 'resolved' ? 'Reopen' : 'Resolve'}
                    </span>
                    {(pin.replyCount ?? 0) > 0 && (
                      <span className="text-[10px] text-muted-foreground">{pin.replyCount} repl{(pin.replyCount ?? 0) > 1 ? 'ies' : 'y'}</span>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
