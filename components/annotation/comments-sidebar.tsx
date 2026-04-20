'use client';

import { MessageSquare, ChevronDown, ChevronRight, Check, FileText, ArrowLeft, MoreHorizontal, Paperclip, Video, Smile, Send } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import type { AttachmentRecord } from '@/app/actions/storage';
import CommentBody from './comment-body';
import { createReply, getRepliesForComment, type CommentReply } from '@/app/actions/replies';
import { getCurrentUser } from '@/app/actions/comments';

interface Pin {
  id: string;
  number: number;
  x: number;
  y: number;
  content: string;
  author: string;
  timestamp: string;
  status: 'active' | 'resolved';
  attachments?: (AttachmentRecord & { signedUrl: string })[];
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
  onTabChange?: (tab: 'active' | 'resolved') => void;
  readOnly?: boolean;
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

interface ThreadDetailProps {
  pin: Pin;
  onBack: () => void;
  onResolve: (pinId: string) => void;
  readOnly: boolean;
}

function ThreadDetail({ pin, onBack, onResolve, readOnly }: ThreadDetailProps) {
  const [reply, setReply] = useState('');
  const [replies, setReplies] = useState<CommentReply[]>([]);
  const [isLoadingReplies, setIsLoadingReplies] = useState(true);
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [currentUserName, setCurrentUserName] = useState('You');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isCancelled = false;

    const loadThread = async () => {
      setIsLoadingReplies(true);

      const [replyData, user] = await Promise.all([
        getRepliesForComment(pin.id),
        getCurrentUser(),
      ]);

      if (isCancelled) return;

      setReplies(replyData);
      if (user?.name) setCurrentUserName(user.name);
      setIsLoadingReplies(false);
    };

    loadThread();

    return () => {
      isCancelled = true;
    };
  }, [pin.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [replies.length, pin.id]);

  const handleSendReply = async () => {
    const trimmed = reply.trim();
    if (!trimmed || readOnly || isSendingReply) return;

    setIsSendingReply(true);

    const optimistic: CommentReply = {
      id: `opt_${Date.now()}`,
      comment_id: pin.id,
      user_name: currentUserName,
      content: trimmed,
      created_at: new Date().toISOString(),
    };

    setReplies(prev => [...prev, optimistic]);
    setReply('');

    const result = await createReply(pin.id, trimmed, currentUserName);

    if (result.success && result.reply) {
      setReplies(prev => prev.map(r => r.id === optimistic.id ? result.reply! : r));
    } else {
      setReplies(prev => prev.filter(r => r.id !== optimistic.id));
      setReply(trimmed);
    }

    setIsSendingReply(false);
  };

  const isMine = (name: string) =>
    name.trim().toLowerCase() === currentUserName.trim().toLowerCase();

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            aria-label="Back"
            className="flex items-center justify-center size-8 rounded-full ring-1 ring-border hover:ring-foreground hover:bg-foreground hover:text-background text-foreground transition-all duration-200 group"
          >
            <ArrowLeft className="size-3.75 transition-transform group-hover:-translate-x-0.5" strokeWidth={1.5} />
          </button>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold text-muted-foreground tracking-[0.18em] uppercase">
              Thread
            </span>
            <span className="flex items-center justify-center size-4 rounded-full bg-muted text-[10px] font-semibold text-foreground">
              1
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {!readOnly && (
            <button
              onClick={() => onResolve(pin.id)}
              aria-label="Mark resolved"
              className="size-7 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              <Check className="size-3.75" strokeWidth={1.75} />
            </button>
          )}
          <button
            aria-label="More options"
            className="size-7 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <MoreHorizontal className="size-4" strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {/* Chat thread */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-muted/20">
        <div className="flex justify-start">
          <div className="max-w-[88%] rounded-2xl rounded-tl-md border border-border/60 bg-background px-3 py-2.5 shadow-xs">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="size-6 rounded-full bg-muted ring-1 ring-inset ring-border flex items-center justify-center text-foreground font-semibold text-[10px] tracking-tight shrink-0">
                {getInitials(pin.author)}
              </div>
              <span className="text-[11px] font-semibold text-foreground truncate">{pin.author}</span>
              <span className="text-[10px] text-muted-foreground shrink-0">{pin.timestamp}</span>
            </div>

            <CommentBody
              content={pin.content}
              className="text-[13px] leading-relaxed text-foreground"
            />

            {pin.attachments && pin.attachments.length > 0 && (
              <div className="mt-2.5 space-y-1.5">
                <div className="flex flex-wrap gap-1.5">
                  {pin.attachments
                    .filter(a => a.mime_type.startsWith('image/'))
                    .map(a => (
                      <a key={a.id} href={a.signedUrl} target="_blank" rel="noopener noreferrer">
                        <img
                          src={a.signedUrl}
                          alt={a.original_filename}
                          className="h-14 w-14 rounded object-cover border border-border/40"
                        />
                      </a>
                    ))}
                </div>

                {pin.attachments
                  .filter(a => a.mime_type === 'application/pdf')
                  .map(a => (
                    <a
                      key={a.id}
                      href={a.signedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <FileText className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate max-w-45">{a.original_filename}</span>
                    </a>
                  ))}
              </div>
            )}
          </div>
        </div>

        {isLoadingReplies ? (
          <div className="text-xs text-muted-foreground px-1">Loading replies…</div>
        ) : replies.length === 0 ? (
          <div className="text-xs text-muted-foreground px-1">No replies yet. Start the conversation.</div>
        ) : (
          replies.map(item => {
            const mine = isMine(item.user_name);
            return (
              <div key={item.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[84%] rounded-2xl px-3 py-2 ${
                    mine
                      ? 'rounded-tr-md bg-primary text-primary-foreground'
                      : 'rounded-tl-md bg-background border border-border/60 text-foreground'
                  } ${item.id.startsWith('opt_') ? 'opacity-70' : ''}`}
                >
                  <div className={`text-[10px] mb-1 ${mine ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                    {mine ? 'You' : item.user_name}
                  </div>
                  <p className="text-[13px] leading-relaxed wrap-break-word">{item.content}</p>
                  <div className={`text-[10px] mt-1.5 ${mine ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                    {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Reply composer */}
      <div className="px-4 pt-3 pb-4 border-t border-border/50 bg-background">
        <div className="rounded-xl border border-border bg-background px-2.5 py-2">
          <input
            type="text"
            value={reply}
            onChange={e => setReply(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendReply();
              }
            }}
            placeholder={readOnly ? 'Read-only thread' : 'Type a reply...'}
            disabled={readOnly || isSendingReply}
            className="w-full bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
            style={{ fontFamily: 'var(--font-serif)' }}
          />

          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Add emoji"
                disabled
                className="size-7 flex items-center justify-center text-muted-foreground/60 rounded-full"
              >
                <Smile className="size-3.5" strokeWidth={1.5} />
              </button>
              <button
                type="button"
                aria-label="Attach file"
                disabled
                className="size-7 flex items-center justify-center text-muted-foreground/60 rounded-full"
              >
                <Paperclip className="size-3.5" strokeWidth={1.5} />
              </button>
              <button
                type="button"
                aria-label="Record video"
                disabled
                className="size-7 flex items-center justify-center text-muted-foreground/60 rounded-full"
              >
                <Video className="size-3.5" strokeWidth={1.5} />
              </button>
            </div>

            <button
              type="button"
              onClick={handleSendReply}
              disabled={readOnly || isSendingReply || !reply.trim()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground text-[10px] font-semibold tracking-[0.12em] uppercase rounded-md hover:opacity-90 disabled:opacity-45 transition-opacity"
            >
              <Send className="size-3.5" />
              {isSendingReply ? 'Sending' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CommentsSidebar({
  allImages,
  currentImageId,
  selectedPinId,
  onSelectPin,
  onResolve,
  onTabChange,
  readOnly = false,
}: CommentsSidebarProps) {
  const [expandedImages, setExpandedImages] = useState<string[]>([currentImageId]);
  const [activeTab, setActiveTab] = useState<'active' | 'resolved'>('active');
  const [openThreadPin, setOpenThreadPin] = useState<Pin | null>(null);

  useEffect(() => {
    setExpandedImages(prev =>
      prev.includes(currentImageId) ? prev : [...prev, currentImageId]
    );
  }, [currentImageId]);

  // Close thread if selected pin changes externally
  useEffect(() => {
    if (!selectedPinId) setOpenThreadPin(null);
  }, [selectedPinId]);

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

  const handleSelectPin = (pin: Pin) => {
    onSelectPin(pin.id);
    setOpenThreadPin(pin);
  };

  const renderCommentItem = (pin: Pin) => (
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
            pin.status === 'resolved'
              ? 'bg-green-100 text-green-700'
              : 'bg-primary text-white'
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
          <CommentBody
            content={pin.content}
            className={`text-sm leading-relaxed ${
              pin.status === 'resolved' ? 'line-through text-gray-500' : 'text-foreground'
            }`}
          />
          {pin.attachments && pin.attachments.length > 0 && (
            <div className="mt-2 space-y-1">
              <div className="flex flex-wrap gap-1">
                {pin.attachments
                  .filter(a => a.mime_type.startsWith('image/'))
                  .slice(0, 4)
                  .map(a => (
                    <a key={a.id} href={a.signedUrl} target="_blank" rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}>
                      <img src={a.signedUrl} alt={a.original_filename}
                        className="h-8 w-8 rounded object-cover border border-border/40" />
                    </a>
                  ))}
              </div>
              {pin.attachments
                .filter(a => a.mime_type === 'application/pdf')
                .map(a => (
                  <a key={a.id} href={a.signedUrl} target="_blank" rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                    <FileText className="h-3 w-3 shrink-0" />
                    <span className="truncate max-w-40">{a.original_filename}</span>
                  </a>
                ))}
            </div>
          )}
          {!readOnly && (
            <div className="mt-2 flex">
              <button
                onClick={e => { e.stopPropagation(); onResolve(pin.id); }}
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
    <div className="w-72 border-r border-border/50 bg-background flex flex-col overflow-hidden relative">
      {/* Main list — slides left when thread opens */}
      <div
        className={`flex flex-col h-full transition-transform duration-300 ease-in-out ${
          openThreadPin ? '-translate-x-full' : 'translate-x-0'
        }`}
      >
        {/* Tabs */}
        <div className="flex items-center gap-6 px-5 py-3 border-b border-border/50">
          <button
            onClick={() => { setActiveTab('active'); onTabChange?.('active'); }}
            className={`text-sm font-semibold pb-1 transition-colors ${
              activeTab === 'active'
                ? 'text-foreground border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {activeCount} Active
          </button>
          <button
            onClick={() => { setActiveTab('resolved'); onTabChange?.('resolved'); }}
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
                    <span className="text-sm font-semibold text-gray-900">
                      {imageGroup.name.length > 18
                        ? `${imageGroup.name.slice(0, 18)}...`
                        : imageGroup.name}
                    </span>
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

      {/* Thread detail — slides in from right */}
      <div
        className={`absolute inset-0 bg-background transition-transform duration-300 ease-in-out z-10 ${
          openThreadPin ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {openThreadPin && (
          <ThreadDetail
            pin={openThreadPin}
            onBack={() => setOpenThreadPin(null)}
            onResolve={onResolve}
            readOnly={readOnly}
          />
        )}
      </div>
    </div>
  );
}