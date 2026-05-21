'use client';

import { MessageSquare, ChevronDown, ChevronRight, Check, FileText, ArrowLeft, MoreHorizontal, Paperclip, Video, Smile, Send, Pencil, X, ImageIcon, XCircle, Trash2 } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import type { AttachmentRecord } from '@/app/actions/storage';
import CommentBody from './comment-body';
import { createReply, getRepliesForComment, type CommentReply } from '@/app/actions/replies';
import { getCurrentUser } from '@/app/actions/comments';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { uploadCommentAttachments, validateAttachments } from '@/lib/comment-attachments';
import { IconTooltip } from '@/components/ui/icon-tooltip';

const EMOJI_OPTIONS = [
  '😀', '😂', '😍', '😎', '🤔', '😅', '😢', '😡',
  '👍', '👎', '🙌', '👏', '🙏', '💪', '👀', '✋',
  '❤️', '🔥', '✨', '🎉', '💯', '✅', '❌', '⚠️',
];

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
  replyCount?: number;
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
  onEditComment?: (commentId: string, newText: string) => Promise<{ success: boolean; error?: string }>;
  onDeleteAttachment?: (commentId: string, attachmentId: string) => Promise<void>;
  onDeleteComment?: (commentId: string) => Promise<void>;
  currentUser?: string;
  userRole?: string;
  /** Required to enable attachment uploads in replies. */
  projectId?: string;
}

const ELEVATED_ROLES = ['admin', 'pm'];

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
  onEditComment?: (commentId: string, newText: string) => Promise<{ success: boolean; error?: string }>;
  onDeleteAttachment?: (commentId: string, attachmentId: string) => Promise<void>;
  onDeleteComment?: (commentId: string) => Promise<void>;
  currentUser?: string;
  userRole?: string;
  projectId?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ThreadDetail({ pin, onBack, onResolve, readOnly, onEditComment, onDeleteAttachment, onDeleteComment, currentUser, userRole, projectId }: ThreadDetailProps) {
  const [reply, setReply] = useState('');
  const [replies, setReplies] = useState<CommentReply[]>([]);
  const [isLoadingReplies, setIsLoadingReplies] = useState(true);
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [currentUserName, setCurrentUserName] = useState(currentUser || 'You');
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(pin.content);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const replyFileInputRef = useRef<HTMLInputElement>(null);
  const [pendingReplyFiles, setPendingReplyFiles] = useState<{ id: string; file: File }[]>([]);
  const [replyAttachmentError, setReplyAttachmentError] = useState<string | null>(null);
  const [isDraggingReply, setIsDraggingReply] = useState(false);
  const replyDragDepthRef = useRef(0);
  const canAttachToReply = !readOnly && !!projectId;
  const canDeleteAttachment = !readOnly && !!onDeleteAttachment;
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<string | null>(null);

  const handleAttachmentDelete = async (commentId: string, attachmentId: string) => {
    if (!onDeleteAttachment) return;
    setDeletingAttachmentId(attachmentId);
    // Optimistically remove from local reply state if it belonged to a reply
    const snapshot = replies;
    setReplies(prev => prev.map(r => ({
      ...r,
      attachments: r.attachments?.filter(a => a.id !== attachmentId),
    })));
    try {
      await onDeleteAttachment(commentId, attachmentId);
    } catch {
      setReplies(snapshot);
    } finally {
      setDeletingAttachmentId(null);
    }
  };

  useEffect(() => {
    let isCancelled = false;

    const loadThread = async () => {
      setIsLoadingReplies(true);

      const replyData = await getRepliesForComment(pin.id);
      // Only fetch the authenticated user when no `currentUser` was supplied
      // by the parent (e.g. share-link guests already provide their guest name).
      const user = currentUser ? null : await getCurrentUser();

      if (isCancelled) return;

      setReplies(replyData);
      if (currentUser) {
        setCurrentUserName(currentUser);
      } else if (user?.name) {
        setCurrentUserName(user.name);
      }
      setIsLoadingReplies(false);
    };

    loadThread();

    return () => {
      isCancelled = true;
    };
  }, [pin.id, currentUser]);

  // Reset edit UI when the open pin changes
  useEffect(() => {
    setIsEditing(false);
    setEditText(pin.content);
    setEditError(null);
  }, [pin.id, pin.content]);

  const canEdit =
    !!onEditComment &&
    (
      (userRole && ELEVATED_ROLES.includes(userRole)) ||
      (pin.author?.trim().toLowerCase() === (currentUser ?? currentUserName).trim().toLowerCase())
    );

  const canDelete =
    !readOnly &&
    !!onDeleteComment &&
    (
      (userRole && ELEVATED_ROLES.includes(userRole)) ||
      (pin.author?.trim().toLowerCase() === (currentUser ?? currentUserName).trim().toLowerCase())
    );

  const handleStartEdit = () => {
    setEditText(pin.content);
    setEditError(null);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditText(pin.content);
    setEditError(null);
  };

  const handleSaveEdit = async () => {
    if (!onEditComment) return;
    const trimmed = editText.trim();
    if (!trimmed) {
      setEditError('Comment cannot be empty');
      return;
    }
    if (trimmed === pin.content.trim()) {
      setIsEditing(false);
      return;
    }
    setIsSavingEdit(true);
    setEditError(null);
    const result = await onEditComment(pin.id, trimmed);
    setIsSavingEdit(false);
    if (result.success) {
      setIsEditing(false);
    } else {
      setEditError(result.error ?? 'Failed to save changes');
    }
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [replies.length, pin.id]);

  const handleSendReply = async () => {
    const trimmed = reply.trim();
    const filesToUpload = pendingReplyFiles.map(f => f.file);
    if ((!trimmed && filesToUpload.length === 0) || readOnly || isSendingReply) return;

    setIsSendingReply(true);

    const optimisticContent = trimmed || (filesToUpload.length === 1
      ? `📎 ${filesToUpload[0].name}`
      : `📎 ${filesToUpload.length} attachments`);

    const optimistic: CommentReply = {
      id: `opt_${Date.now()}`,
      comment_id: pin.id,
      user_name: currentUserName,
      content: optimisticContent,
      created_at: new Date().toISOString(),
    };

    setReplies(prev => [...prev, optimistic]);
    setReply('');
    setPendingReplyFiles([]);
    setReplyAttachmentError(null);

    const result = await createReply(pin.id, optimisticContent, currentUserName);

    if (result.success && result.reply) {
      const newReply = result.reply;
      setReplies(prev => prev.map(r => r.id === optimistic.id ? newReply : r));

      if (filesToUpload.length > 0 && projectId) {
        const { failed } = await uploadCommentAttachments(newReply.id, projectId, filesToUpload);
        if (failed.length > 0) {
          setReplyAttachmentError(`Failed to upload: ${failed.join(', ')}`);
        }
        // Re-fetch replies so the new attachments (with signed URLs) appear
        const refreshed = await getRepliesForComment(pin.id);
        setReplies(refreshed);
      }
    } else {
      setReplies(prev => prev.filter(r => r.id !== optimistic.id));
      setReply(trimmed);
      setPendingReplyFiles(filesToUpload.map(file => ({ id: crypto.randomUUID(), file })));
    }

    setIsSendingReply(false);
  };

  const addReplyFiles = (files: File[]) => {
    if (!canAttachToReply) return;
    setReplyAttachmentError(null);
    const { valid, errors } = validateAttachments(files);
    if (errors.length) setReplyAttachmentError(errors.join('; '));
    if (!valid.length) return;
    setPendingReplyFiles(prev => [
      ...prev,
      ...valid.map(file => ({ id: crypto.randomUUID(), file })),
    ]);
  };

  const handleReplyFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (replyFileInputRef.current) replyFileInputRef.current.value = '';
    addReplyFiles(files);
  };

  const removePendingReplyFile = (id: string) => {
    setPendingReplyFiles(prev => prev.filter(f => f.id !== id));
  };

  const handleReplyDragEnter = (e: React.DragEvent) => {
    if (!canAttachToReply) return;
    if (!Array.from(e.dataTransfer.types || []).includes('Files')) return;
    e.preventDefault();
    e.stopPropagation();
    replyDragDepthRef.current += 1;
    setIsDraggingReply(true);
  };

  const handleReplyDragOver = (e: React.DragEvent) => {
    if (!canAttachToReply) return;
    if (!Array.from(e.dataTransfer.types || []).includes('Files')) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleReplyDragLeave = (e: React.DragEvent) => {
    if (!canAttachToReply) return;
    e.preventDefault();
    e.stopPropagation();
    replyDragDepthRef.current = Math.max(0, replyDragDepthRef.current - 1);
    if (replyDragDepthRef.current === 0) setIsDraggingReply(false);
  };

  const handleReplyDrop = (e: React.DragEvent) => {
    if (!canAttachToReply) return;
    e.preventDefault();
    e.stopPropagation();
    replyDragDepthRef.current = 0;
    setIsDraggingReply(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length) addReplyFiles(files);
  };

  const isMine = (name: string) =>
    name.trim().toLowerCase() === currentUserName.trim().toLowerCase();

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-3">
          <IconTooltip label="Back to comments">
            <button
              onClick={onBack}
              aria-label="Back"
              className="flex items-center justify-center size-8 rounded-full ring-1 ring-border hover:ring-foreground hover:bg-foreground hover:text-background text-foreground transition-all duration-200 group"
            >
              <ArrowLeft className="size-3.75 transition-transform group-hover:-translate-x-0.5" strokeWidth={1.5} />
            </button>
          </IconTooltip>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold text-muted-foreground tracking-[0.18em] uppercase">
              Thread
            </span>
            <span className="flex items-center justify-center size-4 rounded-full bg-muted text-[10px] font-semibold text-foreground">
              {pin.number}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {!readOnly && (
            <IconTooltip label={pin.status === 'resolved' ? 'Mark active' : 'Mark resolved'}>
              <button
                onClick={() => onResolve(pin.id)}
                aria-label="Mark resolved"
                className="size-7 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                <Check className="size-3.75" strokeWidth={1.75} />
              </button>
            </IconTooltip>
          )}
          {canDelete && (
            <IconTooltip label="Delete comment">
              <button
                onClick={() => onDeleteComment?.(pin.id)}
                aria-label="Delete comment"
                className="size-7 flex items-center justify-center rounded-full text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
              >
                <Trash2 className="size-3.75" strokeWidth={1.75} />
              </button>
            </IconTooltip>
          )}
          <IconTooltip label="More options">
            <button
              aria-label="More options"
              className="size-7 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              <MoreHorizontal className="size-4" strokeWidth={1.75} />
            </button>
          </IconTooltip>
        </div>
      </div>

      {/* Chat thread */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-muted/20">
        <div className="flex justify-start">
          <div className="group max-w-[88%] rounded-2xl rounded-tl-md border border-border/60 bg-background px-3 py-2.5 shadow-xs relative">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="size-6 rounded-full bg-muted ring-1 ring-inset ring-border flex items-center justify-center text-foreground font-semibold text-[10px] tracking-tight shrink-0">
                {getInitials(pin.author)}
              </div>
              <span className="text-[11px] font-semibold text-foreground truncate">{pin.author}</span>
              <span className="text-[10px] text-muted-foreground shrink-0">{pin.timestamp}</span>
            </div>

            {isEditing ? (
              <div>
                <textarea
                  value={editText}
                  onChange={e => setEditText(e.target.value)}
                  onKeyDown={e => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                      e.preventDefault();
                      handleSaveEdit();
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      handleCancelEdit();
                    }
                  }}
                  autoFocus
                  disabled={isSavingEdit}
                  className="w-full px-2 py-1.5 border border-border rounded text-[13px] focus:outline-none focus:ring-1 focus:ring-primary/40 bg-white resize-none leading-relaxed"
                  rows={3}
                />
                {editError && (
                  <p className="text-[10px] text-red-500 mt-1">{editError}</p>
                )}
                <div className="flex items-center justify-end gap-1 mt-1.5">
                  <button
                    onClick={handleCancelEdit}
                    disabled={isSavingEdit}
                    className="px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted/60 rounded transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    disabled={isSavingEdit || !editText.trim()}
                    className="px-2.5 py-0.5 bg-primary text-primary-foreground rounded text-[11px] font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {isSavingEdit ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <CommentBody
                  content={pin.content}
                  className="text-[13px] leading-relaxed text-foreground"
                />
                {canEdit && (
                  <IconTooltip label="Edit comment">
                    <button
                      onClick={handleStartEdit}
                      aria-label="Edit comment"
                      className="absolute top-2 right-2 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Pencil size={11} />
                    </button>
                  </IconTooltip>
                )}
              </>
            )}

            {pin.attachments && pin.attachments.length > 0 && (
              <div className="mt-2.5 space-y-1.5">
                <div className="flex flex-wrap gap-1.5">
                  {pin.attachments
                    .filter(a => a.mime_type.startsWith('image/'))
                    .map(a => (
                      <div key={a.id} className="relative group">
                        <a href={a.signedUrl} target="_blank" rel="noopener noreferrer">
                          <img
                            src={a.signedUrl}
                            alt={a.original_filename}
                            className={`h-14 w-14 rounded object-cover border border-border/40 ${
                              deletingAttachmentId === a.id ? 'opacity-40' : ''
                            }`}
                          />
                        </a>
                        {canDeleteAttachment && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleAttachmentDelete(pin.id, a.id);
                            }}
                            disabled={deletingAttachmentId === a.id}
                            title="Remove attachment"
                            aria-label="Remove attachment"
                            className="absolute -top-1 -right-1 bg-white rounded-full text-gray-500 hover:text-red-600 shadow-sm border border-gray-200 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-100"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                </div>

                {pin.attachments
                  .filter(a => a.mime_type === 'application/pdf')
                  .map(a => (
                    <div key={a.id} className="group flex items-center gap-1.5 text-xs">
                      <a
                        href={a.signedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`flex items-center gap-1.5 flex-1 min-w-0 text-muted-foreground hover:text-foreground ${
                          deletingAttachmentId === a.id ? 'opacity-40' : ''
                        }`}
                      >
                        <FileText className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate max-w-45">{a.original_filename}</span>
                      </a>
                      {canDeleteAttachment && (
                        <button
                          type="button"
                          onClick={() => handleAttachmentDelete(pin.id, a.id)}
                          disabled={deletingAttachmentId === a.id}
                          title="Remove attachment"
                          aria-label="Remove attachment"
                          className="shrink-0 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-100"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
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
            const imageAttachments = item.attachments?.filter(a => a.mime_type.startsWith('image/')) ?? [];
            const pdfAttachments = item.attachments?.filter(a => a.mime_type === 'application/pdf') ?? [];
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
                  {(imageAttachments.length > 0 || pdfAttachments.length > 0) && (
                    <div className="mt-2 space-y-1.5">
                      {imageAttachments.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {imageAttachments.map(a => (
                            <div key={a.id} className="relative group">
                              <a href={a.signedUrl} target="_blank" rel="noopener noreferrer">
                                <img
                                  src={a.signedUrl}
                                  alt={a.original_filename}
                                  className={`h-12 w-12 rounded object-cover border border-border/40 ${
                                    deletingAttachmentId === a.id ? 'opacity-40' : ''
                                  }`}
                                />
                              </a>
                              {canDeleteAttachment && mine && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleAttachmentDelete(item.id, a.id);
                                  }}
                                  disabled={deletingAttachmentId === a.id}
                                  title="Remove attachment"
                                  aria-label="Remove attachment"
                                  className="absolute -top-1 -right-1 bg-white rounded-full text-gray-500 hover:text-red-600 shadow-sm border border-gray-200 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-100"
                                >
                                  <XCircle className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {pdfAttachments.map(a => (
                        <div key={a.id} className="group flex items-center gap-1.5">
                          <a
                            href={a.signedUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`flex items-center gap-1.5 flex-1 min-w-0 text-[11px] hover:underline ${
                              mine ? 'text-primary-foreground/90' : 'text-muted-foreground hover:text-foreground'
                            } ${deletingAttachmentId === a.id ? 'opacity-40' : ''}`}
                          >
                            <FileText className="h-3 w-3 shrink-0" />
                            <span className="truncate max-w-40">{a.original_filename}</span>
                          </a>
                          {canDeleteAttachment && isMine(item.user_name) && (
                            <button
                              type="button"
                              onClick={() => handleAttachmentDelete(item.id, a.id)}
                              disabled={deletingAttachmentId === a.id}
                              title="Remove attachment"
                              aria-label="Remove attachment"
                              className={`shrink-0 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-100 ${
                                mine ? 'text-primary-foreground/70 hover:text-primary-foreground' : 'text-gray-400 hover:text-red-600'
                              }`}
                            >
                              <XCircle className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
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
        <div
          className={`relative rounded-xl border bg-background px-2.5 py-2 transition-colors ${
            isDraggingReply && canAttachToReply
              ? 'border-primary ring-2 ring-primary/30'
              : 'border-border'
          }`}
          onDragEnter={handleReplyDragEnter}
          onDragOver={handleReplyDragOver}
          onDragLeave={handleReplyDragLeave}
          onDrop={handleReplyDrop}
        >
          {isDraggingReply && canAttachToReply && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-primary/5 border-2 border-dashed border-primary">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-primary">
                <Paperclip className="size-3" />
                Drop files to attach
              </div>
            </div>
          )}

          {pendingReplyFiles.length > 0 && (
            <div className="space-y-1 mb-2">
              {pendingReplyFiles.map(p => (
                <div
                  key={p.id}
                  className="flex items-center gap-1.5 px-2 py-1 bg-muted/40 border border-border/60 rounded text-[11px]"
                >
                  {p.file.type.startsWith('image/') ? (
                    <ImageIcon className="size-3 text-blue-500 shrink-0" />
                  ) : (
                    <FileText className="size-3 text-muted-foreground shrink-0" />
                  )}
                  <span className="flex-1 truncate text-foreground">{p.file.name}</span>
                  <span className="text-muted-foreground shrink-0">{formatBytes(p.file.size)}</span>
                  <IconTooltip label="Remove attachment">
                    <button
                      type="button"
                      onClick={() => removePendingReplyFile(p.id)}
                      aria-label="Remove attachment"
                      className="text-muted-foreground hover:text-red-500 shrink-0 transition-colors"
                    >
                      <X className="size-3" />
                    </button>
                  </IconTooltip>
                </div>
              ))}
            </div>
          )}

          {replyAttachmentError && (
            <p className="text-[10px] text-red-500 mb-1.5">{replyAttachmentError}</p>
          )}

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
            style={{ fontFamily: 'var(--font-body)' }}
          />

          <input
            ref={replyFileInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
            className="hidden"
            onChange={handleReplyFileSelect}
          />

          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-1">
              <Popover>
                <PopoverTrigger asChild>
                  <IconTooltip label="Add emoji" side="top">
                    <button
                      type="button"
                      aria-label="Add emoji"
                      disabled={readOnly || isSendingReply}
                      className="size-7 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-full transition-colors disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                    >
                      <Smile className="size-3.5" strokeWidth={1.5} />
                    </button>
                  </IconTooltip>
                </PopoverTrigger>
                <PopoverContent align="start" sideOffset={6} className="w-auto p-2">
                  <div className="grid grid-cols-8 gap-1">
                    {EMOJI_OPTIONS.map(emoji => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setReply(prev => prev + emoji)}
                        className="size-7 flex items-center justify-center text-base hover:bg-muted rounded transition-colors"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
              <IconTooltip
                side="top"
                label={canAttachToReply ? 'Attach file (images or PDF, max 20 MB)' : 'Attachments unavailable'}
              >
                <button
                  type="button"
                  aria-label="Attach file"
                  disabled={!canAttachToReply || isSendingReply}
                  onClick={() => replyFileInputRef.current?.click()}
                  className={`size-7 flex items-center justify-center rounded-full transition-colors disabled:opacity-50 disabled:hover:bg-transparent ${
                    pendingReplyFiles.length > 0
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  } disabled:text-muted-foreground/60`}
                >
                  <Paperclip className="size-3.5" strokeWidth={1.5} />
                </button>
              </IconTooltip>
              <IconTooltip label="Record video (coming soon)" side="top">
                <button
                  type="button"
                  aria-label="Record video"
                  disabled
                  className="size-7 flex items-center justify-center text-muted-foreground/60 rounded-full"
                >
                  <Video className="size-3.5" strokeWidth={1.5} />
                </button>
              </IconTooltip>
            </div>

            <button
              type="button"
              onClick={handleSendReply}
              disabled={readOnly || isSendingReply || (!reply.trim() && pendingReplyFiles.length === 0)}
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
  onEditComment,
  onDeleteAttachment,
  onDeleteComment,
  currentUser,
  userRole,
  projectId,
}: CommentsSidebarProps) {
  const [expandedImages, setExpandedImages] = useState<string[]>([currentImageId]);
  const [activeTab, setActiveTab] = useState<'active' | 'resolved'>('active');
  const [openThreadPin, setOpenThreadPin] = useState<Pin | null>(null);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<string | null>(null);

  const canDeleteAttachmentInline = !readOnly && !!onDeleteAttachment;

  const handleInlineAttachmentDelete = async (commentId: string, attachmentId: string) => {
    if (!onDeleteAttachment) return;
    setDeletingAttachmentId(attachmentId);
    try {
      await onDeleteAttachment(commentId, attachmentId);
    } finally {
      setDeletingAttachmentId(null);
    }
  };

  useEffect(() => {
    setExpandedImages(prev =>
      prev.includes(currentImageId) ? prev : [...prev, currentImageId]
    );
  }, [currentImageId]);

  // Close thread if selected pin changes externally
  useEffect(() => {
    if (!selectedPinId) setOpenThreadPin(null);
  }, [selectedPinId]);

  // Keep the open thread's pin object in sync with the latest props
  // so edits to the original comment surface immediately after save.
  useEffect(() => {
    if (!openThreadPin) return;
    const openId = openThreadPin.id;
    for (const img of allImages) {
      const fresh: Pin | undefined = img.pins.find(p => p.id === openId);
      if (fresh && fresh !== openThreadPin) {
        setOpenThreadPin(fresh);
        return;
      }
    }
  }, [allImages, openThreadPin]);

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
                    <div key={a.id} className="relative group/attachment">
                      <a href={a.signedUrl} target="_blank" rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}>
                        <img src={a.signedUrl} alt={a.original_filename}
                          className={`h-8 w-8 rounded object-cover border border-border/40 ${
                            deletingAttachmentId === a.id ? 'opacity-40' : ''
                          }`} />
                      </a>
                      {canDeleteAttachmentInline && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleInlineAttachmentDelete(pin.id, a.id);
                          }}
                          disabled={deletingAttachmentId === a.id}
                          title="Remove attachment"
                          aria-label="Remove attachment"
                          className="absolute -top-1 -right-1 bg-white rounded-full text-gray-500 hover:text-red-600 shadow-sm border border-gray-200 opacity-0 group-hover/attachment:opacity-100 transition-opacity disabled:opacity-100"
                        >
                          <XCircle className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  ))}
              </div>
              {pin.attachments
                .filter(a => a.mime_type === 'application/pdf')
                .map(a => (
                  <div key={a.id} className="group/attachment flex items-center gap-1 text-xs">
                    <a href={a.signedUrl} target="_blank" rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className={`flex items-center gap-1 flex-1 min-w-0 text-muted-foreground hover:text-foreground ${
                        deletingAttachmentId === a.id ? 'opacity-40' : ''
                      }`}>
                      <FileText className="h-3 w-3 shrink-0" />
                      <span className="truncate max-w-40">{a.original_filename}</span>
                    </a>
                    {canDeleteAttachmentInline && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleInlineAttachmentDelete(pin.id, a.id);
                        }}
                        disabled={deletingAttachmentId === a.id}
                        title="Remove attachment"
                        aria-label="Remove attachment"
                        className="shrink-0 text-gray-400 hover:text-red-600 opacity-0 group-hover/attachment:opacity-100 transition-opacity disabled:opacity-100"
                      >
                        <XCircle className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
            </div>
          )}
          {!readOnly && (
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
            onEditComment={onEditComment}
            onDeleteAttachment={onDeleteAttachment}
            onDeleteComment={(id) => {
              const result = onDeleteComment?.(id);
              setOpenThreadPin(null);
              return result ?? Promise.resolve();
            }}
            currentUser={currentUser}
            userRole={userRole}
            projectId={projectId}
          />
        )}
      </div>
    </div>
  );
}