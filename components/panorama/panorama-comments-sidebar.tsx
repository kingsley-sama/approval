'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, MessageSquare } from 'lucide-react';
import PanoramaThreadDetail from './panorama-thread-detail';

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
  currentImageId: string;
  selectedPinId: string | null;
  onSelectPin: (id: string) => void;
  onResolve: (id: string) => void;
  onTabChange?: (tab: 'active' | 'resolved') => void;
  // Thread-detail wiring
  currentUser: string;
  userRole: string;
  projectId: string;
  onEditComment: (id: string, text: string) => Promise<{ success: boolean; error?: string }>;
  onDeleteComment: (id: string) => void;
}

export default function PanoramaCommentsSidebar({
  images,
  currentImageId,
  selectedPinId,
  onSelectPin,
  onResolve,
  onTabChange,
  currentUser,
  userRole,
  projectId,
  onEditComment,
  onDeleteComment,
}: PanoramaCommentsSidebarProps) {
  const [activeTab, setActiveTab] = useState<'active' | 'resolved'>('active');
  const [expandedImages, setExpandedImages] = useState<string[]>(currentImageId ? [currentImageId] : []);
  const [openThreadPin, setOpenThreadPin] = useState<PanoramaSidebarPin | null>(null);

  // Auto-expand the current panorama's group when it changes.
  useEffect(() => {
    if (!currentImageId) return;
    setExpandedImages(prev => (prev.includes(currentImageId) ? prev : [...prev, currentImageId]));
  }, [currentImageId]);

  // Open the thread when a hotspot is selected (e.g. clicked in the viewer);
  // close it when the selection is cleared.
  useEffect(() => {
    if (!selectedPinId) { setOpenThreadPin(null); return; }
    for (const img of images) {
      const fresh = img.pins.find(p => p.id === selectedPinId);
      if (fresh) { setOpenThreadPin(fresh); return; }
    }
  }, [selectedPinId, images]);

  const { activeCount, resolvedCount } = useMemo(() => {
    const all = images.flatMap(img => img.pins);
    return {
      activeCount: all.filter(p => p.status !== 'resolved').length,
      resolvedCount: all.filter(p => p.status === 'resolved').length,
    };
  }, [images]);

  const imageGroups = useMemo(
    () =>
      images
        .map(img => {
          const filteredPins = img.pins.filter(p =>
            activeTab === 'resolved' ? p.status === 'resolved' : p.status !== 'resolved',
          );
          return { ...img, filteredPins, totalComments: filteredPins.length };
        })
        .filter(g => g.totalComments > 0),
    [images, activeTab],
  );

  const toggleExpand = (id: string) =>
    setExpandedImages(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));

  const switchTab = (t: 'active' | 'resolved') => {
    setActiveTab(t);
    onTabChange?.(t);
  };

  const handleSelectPin = (pin: PanoramaSidebarPin) => {
    onSelectPin(pin.id);
    setOpenThreadPin(pin);
  };

  const renderPin = (pin: PanoramaSidebarPin) => {
    return (
      <div
        key={pin.id}
        onClick={() => handleSelectPin(pin)}
        className={`border-t border-border/40 px-4 py-3 ml-2 cursor-pointer transition-colors ${
          pin.status === 'resolved'
            ? 'bg-gray-50 opacity-70'
            : selectedPinId === pin.id
            ? 'bg-blue-50'
            : 'hover:bg-white'
        }`}
      >
        <div className="flex items-start gap-3">
          <span
            className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
              pin.status === 'resolved' ? 'bg-green-100 text-green-700' : 'bg-primary text-white'
            }`}
          >
            {pin.number}
          </span>
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
            <p className="text-xs text-muted-foreground mb-1.5">{pin.timestamp}</p>
            <p
              className={`text-sm leading-relaxed line-clamp-3 break-words ${
                pin.status === 'resolved' ? 'line-through text-gray-500' : 'text-foreground'
              }`}
            >
              {pin.content}
            </p>
            <div className="mt-2 flex items-center justify-end gap-1.5">
              {(pin.replyCount ?? 0) > 0 && (
                <span
                  className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-blue-50 text-blue-700"
                  title={`${pin.replyCount} ${pin.replyCount === 1 ? 'reply' : 'replies'}`}
                >
                  <MessageSquare size={12} strokeWidth={1.75} />
                  {pin.replyCount}
                </span>
              )}
              <button
                onClick={e => { e.stopPropagation(); onResolve(pin.id); }}
                className={`text-[11px] px-2 py-0.5 rounded flex items-center gap-1 transition-colors ${
                  pin.status === 'resolved'
                    ? 'bg-green-100 text-green-700 hover:bg-green-200'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                <Check size={12} />
                {pin.status === 'resolved' ? 'Resolved' : 'Resolve'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <aside className="w-72 shrink-0 border-r border-border/50 bg-background flex flex-col overflow-hidden relative">
      {/* Main list — slides left when a thread opens */}
      <div className={`flex flex-col h-full transition-transform duration-300 ease-in-out ${openThreadPin ? '-translate-x-full' : 'translate-x-0'}`}>
        {/* Tabs */}
        <div className="flex items-center gap-6 px-5 py-3 border-b border-border/50">
          <button
            onClick={() => switchTab('active')}
            className={`text-sm font-semibold pb-1 transition-colors ${
              activeTab === 'active'
                ? 'text-foreground border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {activeCount} Active
          </button>
          <button
            onClick={() => switchTab('resolved')}
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
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 p-6 text-center">
              <MessageSquare size={26} className="opacity-40" />
              <p className="text-sm">
                {activeTab === 'resolved'
                  ? 'No resolved comments.'
                  : 'No comments yet. Click “Add comment”, then click the panorama.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {imageGroups.map(group => {
                const expanded = expandedImages.includes(group.id);
                return (
                  <div key={group.id}>
                    <button
                      onClick={() => toggleExpand(group.id)}
                      className={`w-full flex items-center gap-2 p-4 transition-colors hover:bg-gray-50 ${
                        group.id === currentImageId ? 'bg-accent/5' : ''
                      }`}
                    >
                      {expanded ? (
                        <ChevronDown size={16} className="text-gray-600 shrink-0" />
                      ) : (
                        <ChevronRight size={16} className="text-gray-600 shrink-0" />
                      )}
                      <span className="text-sm font-semibold text-gray-900 truncate" title={group.name}>
                        {group.name}
                      </span>
                      {group.id === currentImageId && (
                        <span className="text-[9px] font-medium uppercase tracking-wide text-accent bg-accent/10 px-1.5 py-0.5 rounded">
                          Viewing
                        </span>
                      )}
                      <span className="ml-auto text-xs text-muted-foreground bg-gray-100 px-2 py-1 rounded shrink-0">
                        {group.totalComments}
                      </span>
                    </button>
                    {expanded && <div className="bg-gray-50">{group.filteredPins.map(renderPin)}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Thread detail — slides in from the right */}
      <div className={`absolute inset-0 bg-background transition-transform duration-300 ease-in-out z-10 ${openThreadPin ? 'translate-x-0' : 'translate-x-full'}`}>
        {openThreadPin && (
          <PanoramaThreadDetail
            pin={openThreadPin}
            projectId={projectId}
            currentUser={currentUser}
            userRole={userRole}
            onBack={() => { setOpenThreadPin(null); onSelectPin(''); }}
            onResolve={onResolve}
            onEditComment={onEditComment}
            onDeleteComment={(id) => { onDeleteComment(id); setOpenThreadPin(null); }}
          />
        )}
      </div>
    </aside>
  );
}
