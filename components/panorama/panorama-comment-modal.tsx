'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { X, Check, RotateCcw, Trash2, Pencil, CornerDownRight, Send } from 'lucide-react';
import { getPanoramaReplies, type PanoramaComment } from '@/app/actions/panorama-comments';

export interface PanoramaModalPin {
  id: string;
  number: number;
  content: string;
  author: string;
  timestamp: string;
  status: 'active' | 'resolved';
  replyCount?: number;
}

interface PanoramaCommentModalProps {
  position: { x: number; y: number };
  isNew: boolean;
  existingPin?: PanoramaModalPin;
  currentUser: string;
  userRole: string;
  projectId: string;
  onClose: () => void;
  onSubmit: (text: string) => void;
  onResolve?: (id: string) => void;
  onEdit?: (id: string, text: string) => Promise<{ success: boolean; error?: string }>;
  onDelete?: (id: string) => void;
  onReply?: (id: string, text: string) => Promise<{ success: boolean; error?: string }>;
}

const WIDTH = 320;

export default function PanoramaCommentModal({
  position,
  isNew,
  existingPin,
  currentUser,
  userRole,
  projectId,
  onClose,
  onSubmit,
  onResolve,
  onEdit,
  onDelete,
  onReply,
}: PanoramaCommentModalProps) {
  const [text, setText] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(existingPin?.content ?? '');
  const [replyText, setReplyText] = useState('');
  const [replies, setReplies] = useState<PanoramaComment[]>([]);
  const [showReplies, setShowReplies] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  const canManage =
    !!existingPin &&
    (userRole === 'admin' ||
      userRole === 'pm' ||
      existingPin.author.trim().toLowerCase() === currentUser.trim().toLowerCase());

  // Clamp the floating card inside the viewport.
  const left = Math.max(12, Math.min(position.x, (typeof window !== 'undefined' ? window.innerWidth : 1200) - WIDTH - 12));
  const top = Math.max(12, Math.min(position.y, (typeof window !== 'undefined' ? window.innerHeight : 800) - 220));

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    // Defer so the opening click doesn't immediately close it.
    const t = setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', handler); };
  }, [onClose]);

  const loadReplies = async () => {
    if (!existingPin) return;
    setShowReplies(true);
    const r = await getPanoramaReplies(existingPin.id);
    setReplies(r);
  };

  const submitNew = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  const saveEdit = async () => {
    if (!existingPin || !onEdit) return;
    const trimmed = editText.trim();
    if (!trimmed || trimmed === existingPin.content) { setIsEditing(false); return; }
    setBusy(true);
    const res = await onEdit(existingPin.id, trimmed);
    setBusy(false);
    if (res.success) setIsEditing(false);
  };

  const sendReply = async () => {
    if (!existingPin || !onReply) return;
    const trimmed = replyText.trim();
    if (!trimmed) return;
    setBusy(true);
    const res = await onReply(existingPin.id, trimmed);
    setBusy(false);
    if (res.success) {
      setReplyText('');
      await loadReplies();
    }
  };

  return (
    <div
      ref={ref}
      style={{ position: 'fixed', left, top, width: WIDTH, zIndex: 60 }}
      className="rounded-xl border border-border bg-popover shadow-2xl overflow-hidden"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/40">
        <span className="text-xs font-semibold text-foreground">
          {isNew ? 'New comment' : `Comment #${existingPin?.number}`}
        </span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Close">
          <X size={15} />
        </button>
      </div>

      <div className="p-3 space-y-3">
        {isNew ? (
          <>
            <Textarea
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitNew(); }}
              placeholder="Add your comment…"
              rows={3}
              className="text-sm resize-none"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
              <Button size="sm" onClick={submitNew} disabled={!text.trim()}>Comment</Button>
            </div>
          </>
        ) : existingPin ? (
          <>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground">{existingPin.author}</span>
              <span className="text-[10px] text-muted-foreground">{existingPin.timestamp}</span>
            </div>

            {isEditing ? (
              <div className="space-y-2">
                <Textarea
                  autoFocus
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  rows={3}
                  className="text-sm resize-none"
                />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setIsEditing(false)} disabled={busy}>Cancel</Button>
                  <Button size="sm" onClick={saveEdit} disabled={busy || !editText.trim()}>Save</Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-foreground whitespace-pre-wrap break-words">{existingPin.content}</p>
            )}

            {existingPin.status === 'resolved' && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-600">
                <Check size={11} /> Resolved
              </span>
            )}

            {!isEditing && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {onResolve && (
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onResolve(existingPin.id)}>
                    <RotateCcw size={12} className="mr-1" />
                    {existingPin.status === 'resolved' ? 'Reopen' : 'Resolve'}
                  </Button>
                )}
                {canManage && onEdit && (
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => { setEditText(existingPin.content); setIsEditing(true); }}>
                    <Pencil size={12} className="mr-1" /> Edit
                  </Button>
                )}
                {canManage && onDelete && (
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive hover:text-destructive" onClick={() => onDelete(existingPin.id)}>
                    <Trash2 size={12} className="mr-1" /> Delete
                  </Button>
                )}
              </div>
            )}

            {/* Replies */}
            {onReply && (
              <div className="pt-2 border-t border-border space-y-2">
                {!showReplies ? (
                  <button onClick={loadReplies} className="text-xs text-accent hover:underline flex items-center gap-1">
                    <CornerDownRight size={12} />
                    {existingPin.replyCount ? `View ${existingPin.replyCount} repl${existingPin.replyCount > 1 ? 'ies' : 'y'}` : 'Reply'}
                  </button>
                ) : (
                  <>
                    {replies.map(r => (
                      <div key={r.id} className="pl-3 border-l-2 border-border">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-medium text-foreground">{r.user_name}</span>
                        </div>
                        <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words">{r.content}</p>
                      </div>
                    ))}
                    <div className="flex items-center gap-1.5">
                      <input
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') sendReply(); }}
                        placeholder="Write a reply…"
                        className="flex-1 h-8 rounded-md border border-border bg-background px-2 text-xs"
                      />
                      <Button size="icon" className="h-8 w-8" onClick={sendReply} disabled={busy || !replyText.trim()}>
                        <Send size={13} />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
