'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Trash2, Pencil, Smile, Send } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { IconTooltip } from '@/components/ui/icon-tooltip';
import { getPanoramaReplies, createPanoramaReply, type PanoramaComment } from '@/app/actions/panorama-comments';

const EMOJI_OPTIONS = [
  '😀', '😂', '😍', '😎', '🤔', '😅', '😢', '😡',
  '👍', '👎', '🙌', '👏', '🙏', '💪', '👀', '✋',
  '❤️', '🔥', '✨', '🎉', '💯', '✅', '❌', '⚠️',
];

const ELEVATED_ROLES = ['admin', 'pm'];

export interface ThreadPin {
  id: string;
  number: number;
  content: string;
  author: string;
  timestamp: string;
  status: 'active' | 'resolved';
}

interface PanoramaThreadDetailProps {
  pin: ThreadPin;
  projectId: string;
  currentUser: string;
  userRole: string;
  onBack: () => void;
  onResolve: (id: string) => void;
  onEditComment: (id: string, text: string) => Promise<{ success: boolean; error?: string }>;
  onDeleteComment: (id: string) => void;
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

export default function PanoramaThreadDetail({
  pin, projectId, currentUser, userRole, onBack, onResolve, onEditComment, onDeleteComment,
}: PanoramaThreadDetailProps) {
  const [replies, setReplies] = useState<PanoramaComment[]>([]);
  const [isLoadingReplies, setIsLoadingReplies] = useState(true);
  const [reply, setReply] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(pin.content);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const isMine = (name: string) => name.trim().toLowerCase() === currentUser.trim().toLowerCase();
  const elevated = ELEVATED_ROLES.includes(userRole);
  const canEdit = elevated || isMine(pin.author);
  const canDelete = elevated || isMine(pin.author);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingReplies(true);
    getPanoramaReplies(pin.id).then(data => {
      if (!cancelled) { setReplies(data); setIsLoadingReplies(false); }
    });
    return () => { cancelled = true; };
  }, [pin.id]);

  useEffect(() => {
    setIsEditing(false);
    setEditText(pin.content);
    setEditError(null);
  }, [pin.id, pin.content]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [replies.length, pin.id]);

  const handleSaveEdit = async () => {
    const trimmed = editText.trim();
    if (!trimmed) { setEditError('Comment cannot be empty'); return; }
    if (trimmed === pin.content.trim()) { setIsEditing(false); return; }
    setIsSavingEdit(true);
    setEditError(null);
    const result = await onEditComment(pin.id, trimmed);
    setIsSavingEdit(false);
    if (result.success) setIsEditing(false);
    else setEditError(result.error ?? 'Failed to save changes');
  };

  const handleSend = async () => {
    const trimmed = reply.trim();
    if (!trimmed || isSending) return;
    setIsSending(true);
    const result = await createPanoramaReply(pin.id, trimmed, currentUser, projectId);
    if (result.success) {
      setReply('');
      setReplies(await getPanoramaReplies(pin.id));
    }
    setIsSending(false);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-3">
          <IconTooltip label="Back to comments">
            <button onClick={onBack} aria-label="Back"
              className="flex items-center justify-center size-8 rounded-full ring-1 ring-border hover:ring-foreground hover:bg-foreground hover:text-background text-foreground transition-all group">
              <ArrowLeft className="size-3.75 transition-transform group-hover:-translate-x-0.5" strokeWidth={1.5} />
            </button>
          </IconTooltip>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold text-muted-foreground tracking-[0.18em] uppercase">Thread</span>
            <span className="flex items-center justify-center size-4 rounded-full bg-muted text-[10px] font-semibold text-foreground">{pin.number}</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <IconTooltip label={pin.status === 'resolved' ? 'Mark active' : 'Mark resolved'}>
            <button onClick={() => onResolve(pin.id)} aria-label="Resolve"
              className="size-7 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
              <Check className="size-3.75" strokeWidth={1.75} />
            </button>
          </IconTooltip>
          {canDelete && (
            <IconTooltip label="Delete comment">
              <button onClick={() => onDeleteComment(pin.id)} aria-label="Delete comment"
                className="size-7 flex items-center justify-center rounded-full text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors">
                <Trash2 className="size-3.75" strokeWidth={1.75} />
              </button>
            </IconTooltip>
          )}
        </div>
      </div>

      {/* Chat */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-muted/20">
        {/* Original comment */}
        <div className="flex justify-start">
          <div className="group max-w-[88%] rounded-2xl rounded-tl-md border border-border/60 bg-background px-3 py-2.5 shadow-xs relative">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="size-6 rounded-full bg-muted ring-1 ring-inset ring-border flex items-center justify-center text-foreground font-semibold text-[10px] shrink-0">
                {getInitials(pin.author)}
              </div>
              <span className="text-[11px] font-semibold text-foreground truncate">{pin.author}</span>
              <span className="text-[10px] text-muted-foreground shrink-0">{pin.timestamp}</span>
            </div>

            {isEditing ? (
              <div>
                <textarea value={editText} onChange={e => setEditText(e.target.value)}
                  onKeyDown={e => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); handleSaveEdit(); }
                    if (e.key === 'Escape') { e.preventDefault(); setIsEditing(false); setEditText(pin.content); }
                  }}
                  autoFocus disabled={isSavingEdit} rows={3}
                  className="w-full px-2 py-1.5 border border-border rounded text-[13px] focus:outline-none focus:ring-1 focus:ring-primary/40 bg-white resize-none leading-relaxed" />
                {editError && <p className="text-[10px] text-red-500 mt-1">{editError}</p>}
                <div className="flex items-center justify-end gap-1 mt-1.5">
                  <button onClick={() => { setIsEditing(false); setEditText(pin.content); }} disabled={isSavingEdit}
                    className="px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted/60 rounded">Cancel</button>
                  <button onClick={handleSaveEdit} disabled={isSavingEdit || !editText.trim()}
                    className="px-2.5 py-0.5 bg-primary text-primary-foreground rounded text-[11px] font-medium hover:opacity-90 disabled:opacity-50">
                    {isSavingEdit ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-[13px] leading-relaxed text-foreground whitespace-pre-wrap break-words">{pin.content}</p>
                {canEdit && (
                  <IconTooltip label="Edit comment">
                    <button onClick={() => { setEditText(pin.content); setIsEditing(true); }} aria-label="Edit comment"
                      className="absolute top-2 right-2 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Pencil size={11} />
                    </button>
                  </IconTooltip>
                )}
              </>
            )}
          </div>
        </div>

        {/* Replies */}
        {isLoadingReplies ? (
          <div className="text-xs text-muted-foreground px-1">Loading replies…</div>
        ) : replies.length === 0 ? (
          <div className="text-xs text-muted-foreground px-1">No replies yet. Start the conversation.</div>
        ) : (
          replies.map(item => {
            const mine = isMine(item.user_name);
            return (
              <div key={item.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[84%] rounded-2xl px-3 py-2 ${mine ? 'rounded-tr-md bg-primary text-primary-foreground' : 'rounded-tl-md bg-background border border-border/60 text-foreground'}`}>
                  <div className={`text-[10px] mb-1 ${mine ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                    {mine ? 'You' : item.user_name}
                  </div>
                  <p className="text-[13px] leading-relaxed break-words whitespace-pre-wrap">{item.content}</p>
                  <div className={`text-[10px] mt-1.5 ${mine ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                    {item.created_at ? new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer (text + emoji only) */}
      <div className="px-4 pt-3 pb-4 border-t border-border/50 bg-background">
        <div className="relative rounded-xl border border-border bg-background px-2.5 py-2">
          <input type="text" value={reply} onChange={e => setReply(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Type a reply..." disabled={isSending}
            className="w-full bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none" />

          <div className="flex items-center justify-between mt-2">
            <Popover>
              <PopoverTrigger asChild>
                <IconTooltip label="Add emoji" side="top">
                  <button type="button" aria-label="Add emoji" disabled={isSending}
                    className="size-7 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-full transition-colors disabled:opacity-50">
                    <Smile className="size-3.5" strokeWidth={1.5} />
                  </button>
                </IconTooltip>
              </PopoverTrigger>
              <PopoverContent align="start" sideOffset={6} className="w-auto p-2">
                <div className="grid grid-cols-8 gap-1">
                  {EMOJI_OPTIONS.map(emoji => (
                    <button key={emoji} type="button" onClick={() => setReply(prev => prev + emoji)}
                      className="size-7 flex items-center justify-center text-base hover:bg-muted rounded transition-colors">{emoji}</button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            <button type="button" onClick={handleSend} disabled={isSending || !reply.trim()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground text-[10px] font-semibold tracking-[0.12em] uppercase rounded-md hover:opacity-90 disabled:opacity-45 transition-opacity">
              <Send className="size-3.5" />
              {isSending ? 'Sending' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
