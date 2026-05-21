'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Paperclip, Link2, Search, FileText, ImageIcon, XCircle, ExternalLink, Send, Smile, Pencil, Check, Trash2 } from 'lucide-react';
import { getProjectsForMention } from '@/app/actions/projects';
import type { AttachmentRecord } from '@/app/actions/storage';
import CommentBody from './comment-body';
import { getRepliesForComment, createReply, type CommentReply } from '@/app/actions/replies';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { IconTooltip } from '@/components/ui/icon-tooltip';

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

interface ProjectOption {
  id: string;
  name: string;
}

interface PendingAttachment {
  id: string;
  file: File;
}

interface CommentModalProps {
  position: { x: number; y: number };
  onClose: () => void;
  onSubmit: (text: string, attachments: File[]) => Promise<void>;
  existingPin?: Pin;
  currentUser: string;
  userRole: string;
  isNewPin: boolean;
  isFullscreen?: boolean;
  disableAttachments?: boolean;
  onAddAttachment?: (commentId: string, files: File[]) => Promise<void>;
  onDeleteAttachment?: (commentId: string, attachmentId: string) => Promise<void>;
  onEditComment?: (commentId: string, newText: string) => Promise<{ success: boolean; error?: string }>;
  onResolve?: (commentId: string) => void;
  onDeleteComment?: (commentId: string) => Promise<void>;
  onUndoShape?: () => void;
  canUndoShape?: boolean;
}

const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf',
]);
const MAX_BYTES = 20 * 1024 * 1024;
const ELEVATED_ROLES = ['admin', 'pm'];
const EMOJI_OPTIONS = [
  '😀', '😁', '😂', '😊', '😍', '😎', '🤔', '🙌',
  '👏', '👍', '👎', '🔥', '💯', '🎉', '❤️', '✅',
] as const;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function CommentModal({
  position,
  onClose,
  onSubmit,
  existingPin,
  currentUser,
  userRole,
  isNewPin,
  isFullscreen,
  disableAttachments = false,
  onAddAttachment,
  onDeleteAttachment,
  onEditComment,
  onResolve,
  onDeleteComment,
  onUndoShape,
  canUndoShape = false,
}: CommentModalProps) {
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<string | null>(null);

  const handleDeleteAttachmentClick = async (attachmentId: string) => {
    if (!existingPin || !onDeleteAttachment) return;
    setDeletingAttachmentId(attachmentId);
    try {
      await onDeleteAttachment(existingPin.id, attachmentId);
    } finally {
      setDeletingAttachmentId(null);
    }
  };
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [modalStyle, setModalStyle] = useState<React.CSSProperties>({});

  // Edit mode (existing pin only)
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Reply state
  const [replies, setReplies] = useState<CommentReply[]>([]);
  const [replyText, setReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const repliesEndRef = useRef<HTMLDivElement>(null);

  // Link picker state
  const [showLinkPicker, setShowLinkPicker] = useState(false);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [projectSearch, setProjectSearch] = useState('');
  const [loadingProjects, setLoadingProjects] = useState(false);

  // Attachment state
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const dragDepthRef = useRef(0);

  const modalRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  const canLink = ELEVATED_ROLES.includes(userRole);

  // ── load replies when an existing pin is opened ─────────────────────────────
  useEffect(() => {
    if (!existingPin || isNewPin) return;
    getRepliesForComment(existingPin.id).then(setReplies);
  }, [existingPin?.id, isNewPin]);

  // Reset edit state whenever the open pin changes
  useEffect(() => {
    setIsEditing(false);
    setEditText(existingPin?.content ?? '');
    setEditError(null);
  }, [existingPin?.id, existingPin?.content]);

  const canEditExisting =
    !!existingPin &&
    !!onEditComment &&
    (ELEVATED_ROLES.includes(userRole) ||
      (existingPin.author?.trim().toLowerCase() === currentUser.trim().toLowerCase()));

  const canDeleteExisting =
    !!existingPin &&
    !isNewPin &&
    !!onDeleteComment &&
    (ELEVATED_ROLES.includes(userRole) ||
      (existingPin.author?.trim().toLowerCase() === currentUser.trim().toLowerCase()));

  const handleStartEdit = () => {
    if (!existingPin) return;
    setEditText(existingPin.content);
    setEditError(null);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditText(existingPin?.content ?? '');
    setEditError(null);
  };

  const handleSaveEdit = async () => {
    if (!existingPin || !onEditComment) return;
    const trimmed = editText.trim();
    if (!trimmed) {
      setEditError('Comment cannot be empty');
      return;
    }
    if (trimmed === existingPin.content.trim()) {
      setIsEditing(false);
      return;
    }
    setIsSavingEdit(true);
    setEditError(null);
    const result = await onEditComment(existingPin.id, trimmed);
    setIsSavingEdit(false);
    if (result.success) {
      setIsEditing(false);
    } else {
      setEditError(result.error ?? 'Failed to save changes');
    }
  };

  // ── scroll replies to bottom when new ones arrive ───────────────────────────
  useEffect(() => {
    repliesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [replies.length]);

  const handleSendReply = async () => {
    if (!replyText.trim() || !existingPin) return;
    setIsSendingReply(true);
    // Optimistic update
    const optimistic: CommentReply = {
      id: `opt_${Date.now()}`,
      comment_id: existingPin.id,
      user_name: currentUser,
      content: replyText.trim(),
      created_at: new Date().toISOString(),
    };
    setReplies(prev => [...prev, optimistic]);
    setReplyText('');
    const result = await createReply(existingPin.id, optimistic.content, currentUser);
    if (result.success && result.reply) {
      setReplies(prev => prev.map(r => r.id === optimistic.id ? result.reply! : r));
    } else {
      // Roll back
      setReplies(prev => prev.filter(r => r.id !== optimistic.id));
      setReplyText(optimistic.content);
    }
    setIsSendingReply(false);
  };

  // ── position modal relative to pin ──────────────────────────────────────────
  useEffect(() => {
    const updatePosition = () => {
      if (!modalRef.current) return;
      const imageContainer = (
        document.querySelector('[data-annotation-image-container]') ||
        document.querySelector('[data-pin]')?.closest('.relative')
      ) as HTMLElement | null;
      if (!imageContainer) return;

      const containerRect = imageContainer.getBoundingClientRect();
      const pinPixelX = (position.x / 100) * containerRect.width;
      const pinPixelY = (position.y / 100) * containerRect.height;

      const gap = 8;
      let top = containerRect.top + pinPixelY + gap;
      let left = containerRect.left + pinPixelX;

      const modalWidth = 280;
      const modalHeight = 240;
      const padding = 15;

      if (left - modalWidth / 2 < padding) left = modalWidth / 2 + padding;
      else if (left + modalWidth / 2 > window.innerWidth - padding)
        left = window.innerWidth - modalWidth / 2 - padding;

      if (top + modalHeight > window.innerHeight - padding)
        top = containerRect.top + pinPixelY - modalHeight - gap;

      setModalStyle({
        position: 'fixed',
        left: `${left}px`,
        top: `${top}px`,
        transform: 'translateX(-50%)',
      });
    };

    updatePosition();
    window.addEventListener('scroll', updatePosition);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition);
      window.removeEventListener('resize', updatePosition);
    };
  }, [position, isFullscreen, attachments.length]);

  // ── load projects when link picker opens ────────────────────────────────────
  useEffect(() => {
    if (!showLinkPicker) return;
    setLoadingProjects(true);
    getProjectsForMention()
      .then(setProjects)
      .finally(() => setLoadingProjects(false));
    setTimeout(() => searchRef.current?.focus(), 50);
  }, [showLinkPicker]);

  const hasStartedTyping = comment.length > 0;

  useEffect(() => {
    if (!hasStartedTyping) {
      setShowEmojiPicker(false);
    }
  }, [hasStartedTyping]);

  // ── submit ───────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!comment.trim() || !isNewPin) return;
    setIsSubmitting(true);
    try {
      await onSubmit(comment, attachments.map(a => a.file));
      setComment('');
      setAttachments([]);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleSubmit();
    if (e.key === 'Escape') onClose();
  };

  // ── project mention insertion ────────────────────────────────────────────────
  const insertProjectMention = (project: ProjectOption) => {
    const mention = `@[${project.name}](${project.id})`;
    const textarea = textareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const prefix = start > 0 && comment[start - 1] !== ' ' ? ' ' : '';
      const newValue = comment.slice(0, start) + prefix + mention + ' ' + comment.slice(end);
      setComment(newValue);
      setTimeout(() => {
        textarea.focus();
        const cursor = start + prefix.length + mention.length + 1;
        textarea.setSelectionRange(cursor, cursor);
      }, 0);
    } else {
      setComment(prev => `${prev}${mention} `);
    }
    setShowLinkPicker(false);
    setProjectSearch('');
  };

  const insertEmoji = (emoji: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setComment(prev => `${prev}${emoji}`);
      setShowEmojiPicker(false);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newValue = comment.slice(0, start) + emoji + comment.slice(end);
    setComment(newValue);
    setShowEmojiPicker(false);

    requestAnimationFrame(() => {
      textarea.focus();
      const nextCursor = start + emoji.length;
      textarea.setSelectionRange(nextCursor, nextCursor);
    });
  };

  // ── file selection ───────────────────────────────────────────────────────────
  const validateFiles = (files: File[]): { valid: File[]; errors: string[] } => {
    const errors: string[] = [];
    const valid: File[] = [];
    for (const file of files) {
      if (!ALLOWED_TYPES.has(file.type)) {
        errors.push(`${file.name}: unsupported type`);
        continue;
      }
      if (file.size > MAX_BYTES) {
        errors.push(`${file.name}: exceeds 20 MB`);
        continue;
      }
      valid.push(file);
    }
    return { valid, errors };
  };

  const addPendingAttachments = (files: File[]) => {
    setAttachmentError(null);
    const { valid, errors } = validateFiles(files);
    if (errors.length) setAttachmentError(errors.join('; '));
    if (!valid.length) return;
    setAttachments(prev => [
      ...prev,
      ...valid.map(file => ({ id: crypto.randomUUID(), file })),
    ]);
  };

  const uploadEditAttachments = async (files: File[]) => {
    if (!onAddAttachment || !existingPin) return;
    setAttachmentError(null);
    const { valid, errors } = validateFiles(files);
    if (errors.length) setAttachmentError(errors.join('; '));
    if (!valid.length) return;

    setIsUploadingAttachment(true);
    try {
      await onAddAttachment(existingPin.id, valid);
    } finally {
      setIsUploadingAttachment(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (fileInputRef.current) fileInputRef.current.value = '';
    addPendingAttachments(files);
  };

  const removeAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

  const handleEditFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (editFileInputRef.current) editFileInputRef.current.value = '';
    if (!files.length) return;
    await uploadEditAttachments(files);
  };

  // ── drag & drop ──────────────────────────────────────────────────────────────
  const dropEnabled =
    (isNewPin && !disableAttachments) ||
    (!!existingPin && !isNewPin && !!onAddAttachment);

  const handleDragEnter = (e: React.DragEvent) => {
    if (!dropEnabled) return;
    if (!Array.from(e.dataTransfer.types || []).includes('Files')) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current += 1;
    setIsDraggingFile(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!dropEnabled) return;
    if (!Array.from(e.dataTransfer.types || []).includes('Files')) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!dropEnabled) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDraggingFile(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!dropEnabled) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = 0;
    setIsDraggingFile(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    if (!files.length) return;
    if (isNewPin) {
      addPendingAttachments(files);
    } else if (existingPin && onAddAttachment) {
      void uploadEditAttachments(files);
    }
  };

  const filteredProjects = projects.filter(p =>
    p.name.toLowerCase().includes(projectSearch.toLowerCase())
  );

  const isImage = (file: File) => file.type.startsWith('image/');

  return (
    <div className="z-50 pointer-events-none">
      <div
        ref={modalRef}
        className={`relative bg-white rounded-md shadow-lg p-2 pointer-events-auto border w-72 transition-all duration-200 ease-out ${
          isDraggingFile
            ? 'border-blue-500 ring-2 ring-blue-300/60'
            : 'border-border'
        }`}
        style={modalStyle}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDraggingFile && dropEnabled && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md bg-blue-50/85 border-2 border-dashed border-blue-400">
            <div className="flex items-center gap-1.5 text-xs font-medium text-blue-700">
              <Paperclip size={13} />
              Drop files to attach
            </div>
          </div>
        )}
        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-2 mb-1.5">
          {existingPin ? (
            <div className="flex items-center gap-2 flex-1">
              <div
                className={`flex items-center justify-center w-5 h-5 rounded-full text-white text-xs font-bold ${
                  existingPin.status === 'resolved' ? 'bg-green-600' : 'bg-blue-600'
                }`}
              >
                {existingPin.number}
              </div>
              <div className="text-xs text-gray-600 flex-1">
                <div className="font-semibold leading-tight">{existingPin.author}</div>
                <div className="text-gray-500">{existingPin.timestamp}</div>
              </div>
            </div>
          ) : (
            <div className="text-xs font-semibold text-gray-700 flex-1">New comment</div>
          )}
          <div className="flex items-center gap-0.5 shrink-0">
            {existingPin && !isNewPin && onResolve && (
              <IconTooltip label={existingPin.status === 'resolved' ? 'Mark active' : 'Mark resolved'}>
                <button
                  onClick={() => onResolve(existingPin.id)}
                  aria-label={existingPin.status === 'resolved' ? 'Mark active' : 'Mark resolved'}
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
                    existingPin.status === 'resolved'
                      ? 'bg-green-100 text-green-700 hover:bg-green-200'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <Check size={12} strokeWidth={2} />
                  <span>{existingPin.status === 'resolved' ? 'Resolved' : 'Resolve'}</span>
                </button>
              </IconTooltip>
            )}
            {canDeleteExisting && (
              <IconTooltip label="Delete comment">
                <button
                  onClick={() => existingPin && onDeleteComment?.(existingPin.id)}
                  aria-label="Delete comment"
                  className="p-1 rounded text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              </IconTooltip>
            )}
            <IconTooltip label="Close">
              <button
                onClick={onClose}
                aria-label="Close"
                className="p-0.5 hover:bg-gray-100 rounded text-gray-600 transition-colors"
              >
                <X size={14} />
              </button>
            </IconTooltip>
          </div>
        </div>

        {/* ── Body ── */}
        {existingPin && !isNewPin ? (
          <>
            {isEditing ? (
              <div className="mb-1.5">
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
                  className="w-full px-2 py-1.5 border border-border rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white resize-none"
                  rows={3}
                />
                {editError && (
                  <p className="text-[10px] text-red-500 mt-1 px-1">{editError}</p>
                )}
                <div className="flex items-center justify-end gap-1 mt-1">
                  <button
                    onClick={handleCancelEdit}
                    disabled={isSavingEdit}
                    className="px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    disabled={isSavingEdit || !editText.trim()}
                    className="px-2.5 py-0.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {isSavingEdit ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="group relative text-sm text-gray-700 px-1 py-1 bg-gray-50 rounded border border-gray-200 mb-1.5">
                <CommentBody content={existingPin.content} />
                {canEditExisting && (
                  <IconTooltip label="Edit comment">
                    <button
                      onClick={handleStartEdit}
                      aria-label="Edit comment"
                      className="absolute top-1 right-1 p-0.5 rounded text-gray-400 hover:text-gray-700 hover:bg-white opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Pencil size={11} />
                    </button>
                  </IconTooltip>
                )}
              </div>
            )}
            {existingPin.attachments && existingPin.attachments.length > 0 && (
              <div className="mb-1.5 space-y-1">
                <div className="flex flex-wrap gap-1">
                  {existingPin.attachments
                    .filter(a => a.mime_type.startsWith('image/'))
                    .map(a => (
                      <div key={a.id} className="relative group">
                        <a
                          href={a.signedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block"
                        >
                          <img
                            src={a.signedUrl}
                            alt={a.original_filename}
                            className={`h-14 w-14 rounded object-cover border border-border/40 group-hover:opacity-80 transition-opacity ${
                              deletingAttachmentId === a.id ? 'opacity-40' : ''
                            }`}
                          />
                          <ExternalLink size={10} className="absolute bottom-1 right-1 text-white drop-shadow opacity-0 group-hover:opacity-100 transition-opacity" />
                        </a>
                        {onDeleteAttachment && (
                          <IconTooltip label="Remove attachment">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleDeleteAttachmentClick(a.id);
                              }}
                              disabled={deletingAttachmentId === a.id}
                              aria-label="Remove attachment"
                              className="absolute -top-1 -right-1 bg-white rounded-full text-gray-500 hover:text-red-600 shadow-sm border border-gray-200 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-100"
                            >
                              <XCircle size={14} />
                            </button>
                          </IconTooltip>
                        )}
                      </div>
                    ))}
                </div>
                {existingPin.attachments
                  .filter(a => a.mime_type === 'application/pdf')
                  .map(a => (
                    <div key={a.id} className="group flex items-center gap-1.5 px-2 py-1 bg-gray-50 border border-border rounded text-xs">
                      <a
                        href={a.signedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`flex items-center gap-1.5 flex-1 min-w-0 text-muted-foreground hover:text-foreground transition-colors ${
                          deletingAttachmentId === a.id ? 'opacity-40' : ''
                        }`}
                      >
                        <FileText size={12} className="text-gray-500 shrink-0" />
                        <span className="flex-1 truncate">{a.original_filename}</span>
                        <ExternalLink size={10} className="shrink-0 opacity-50" />
                      </a>
                      {onDeleteAttachment && (
                        <IconTooltip label="Remove attachment">
                          <button
                            type="button"
                            onClick={() => handleDeleteAttachmentClick(a.id)}
                            disabled={deletingAttachmentId === a.id}
                            aria-label="Remove attachment"
                            className="shrink-0 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-100"
                          >
                            <XCircle size={12} />
                          </button>
                        </IconTooltip>
                      )}
                    </div>
                  ))}
              </div>
            )}
            {onAddAttachment && (
              <div className="flex items-center gap-1.5 mt-1">
                <input
                  ref={editFileInputRef}
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
                  className="hidden"
                  onChange={handleEditFileSelect}
                />
                <IconTooltip label="Add attachment">
                  <button
                    onClick={() => editFileInputRef.current?.click()}
                    disabled={isUploadingAttachment}
                    aria-label="Add attachment"
                    className="flex items-center gap-1 p-1 rounded text-xs text-muted-foreground hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50 transition-colors"
                  >
                    <Paperclip size={13} />
                    <span>{isUploadingAttachment ? 'Uploading…' : 'Add attachment'}</span>
                  </button>
                </IconTooltip>
                {attachmentError && (
                  <p className="text-[10px] text-red-500 flex-1">{attachmentError}</p>
                )}
              </div>
            )}

            {/* ── Reply thread ── */}
            <div className="mt-2 border-t border-gray-100 pt-2">
              {replies.length > 0 && (
                <div className="max-h-36 overflow-y-auto space-y-2 mb-2 pr-0.5">
                  {replies.map(reply => (
                    <div key={reply.id} className="flex gap-1.5">
                      <div className="shrink-0 w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[9px] font-bold text-primary uppercase">
                        {reply.user_name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-[11px] font-semibold text-gray-800 truncate">{reply.user_name}</span>
                          <span className="text-[9px] text-gray-400 shrink-0">
                            {new Date(reply.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className={`text-[11px] text-gray-700 leading-snug wrap-break-word ${reply.id.startsWith('opt_') ? 'opacity-60' : ''}`}>
                          {reply.content}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div ref={repliesEndRef} />
                </div>
              )}

              {/* Reply input */}
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  placeholder="Reply…"
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendReply(); }
                    if (e.key === 'Escape') onClose();
                  }}
                  disabled={isSendingReply}
                  className="flex-1 px-2 py-1 text-[11px] border border-border rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                />
                <IconTooltip label="Send reply">
                  <button
                    onClick={handleSendReply}
                    disabled={!replyText.trim() || isSendingReply}
                    aria-label="Send reply"
                    className="p-1.5 rounded bg-primary text-white hover:bg-primary/90 disabled:opacity-40 transition-colors"
                  >
                    <Send size={11} />
                  </button>
                </IconTooltip>
              </div>
            </div>
          </>
        ) : (
          <div className="mb-1.5">
            <textarea
              ref={textareaRef}
              placeholder="Add comment..."
              value={comment}
              onChange={e => setComment(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
              className="w-full px-2 py-1.5 border border-border rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white resize-none transition-shadow duration-200"
              rows={2}
            />
          </div>
        )}

        {/* ── Pending attachments ── */}
        {attachments.length > 0 && (
          <div className="mb-1.5 space-y-1">
            {attachments.map(a => (
              <div
                key={a.id}
                className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 border border-border rounded text-xs"
              >
                {isImage(a.file)
                  ? <ImageIcon size={12} className="text-blue-500 shrink-0" />
                  : <FileText size={12} className="text-gray-500 shrink-0" />
                }
                <span className="flex-1 truncate text-gray-700">{a.file.name}</span>
                <span className="text-gray-400 shrink-0">{formatBytes(a.file.size)}</span>
                <IconTooltip label="Remove attachment">
                  <button
                    onClick={() => removeAttachment(a.id)}
                    aria-label="Remove attachment"
                    className="shrink-0 text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <XCircle size={12} />
                  </button>
                </IconTooltip>
              </div>
            ))}
          </div>
        )}

        {/* ── Attachment error ── */}
        {attachmentError && (
          <p className="text-[10px] text-red-500 mb-1.5 px-1">{attachmentError}</p>
        )}

        {/* ── Project link picker ── */}
        {showLinkPicker && canLink && (
          <div className="mb-1.5 border border-border rounded overflow-hidden">
            <div className="flex items-center gap-1 px-2 py-1 border-b border-border bg-gray-50">
              <Search size={11} className="text-gray-400 shrink-0" />
              <input
                ref={searchRef}
                value={projectSearch}
                onChange={e => setProjectSearch(e.target.value)}
                placeholder="Search projects..."
                className="w-full text-xs bg-transparent outline-none text-gray-700 placeholder:text-gray-400"
                onKeyDown={e => e.key === 'Escape' && setShowLinkPicker(false)}
              />
            </div>
            <div className="max-h-28 overflow-y-auto">
              {loadingProjects ? (
                <div className="px-3 py-2 text-xs text-gray-400">Loading…</div>
              ) : filteredProjects.length === 0 ? (
                <div className="px-3 py-2 text-xs text-gray-400">No projects found</div>
              ) : (
                filteredProjects.map(p => (
                  <button
                    key={p.id}
                    onClick={() => insertProjectMention(p)}
                    className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors truncate"
                  >
                    {p.name}
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* ── Toolbar ── */}
        <div className="flex gap-0.5 items-center justify-between">
          <div className="flex gap-0.5">
            {isNewPin && onUndoShape && (
              <IconTooltip label="Undo last drawing (Ctrl+Z)">
                <button
                  type="button"
                  onClick={onUndoShape}
                  disabled={!canUndoShape}
                  aria-label="Undo last drawing"
                  className={`p-1 rounded transition-colors duration-150 ${
                    canUndoShape
                      ? 'hover:bg-gray-100 text-gray-600'
                      : 'text-gray-300 cursor-not-allowed'
                  }`}
                >
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                    <path d="M9 14L4 9l5-5" />
                    <path d="M4 9h7a5 5 0 015 5v2" />
                  </svg>
                </button>
              </IconTooltip>
            )}
            {isNewPin && hasStartedTyping && (
              <Popover
                open={showEmojiPicker}
                onOpenChange={(open) => {
                  setShowEmojiPicker(open);
                  if (open) setShowLinkPicker(false);
                }}
              >
                <PopoverTrigger asChild>
                  <IconTooltip label="Add emoji">
                    <button
                      className={`p-1 rounded transition-colors duration-150 ${
                        showEmojiPicker
                          ? 'bg-blue-100 text-blue-600'
                          : 'hover:bg-gray-100 text-gray-600'
                      }`}
                      aria-label="Add emoji"
                      type="button"
                    >
                      <Smile size={14} />
                    </button>
                  </IconTooltip>
                </PopoverTrigger>
                <PopoverContent align="start" side="top" className="w-52 p-2">
                  <div className="grid grid-cols-8 gap-1">
                    {EMOJI_OPTIONS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => insertEmoji(emoji)}
                        className="h-7 w-7 rounded text-base leading-none hover:bg-gray-100 transition-colors"
                        title={`Insert ${emoji}`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            )}
            {canLink && (
              <IconTooltip label="Reference a project">
                <button
                  onClick={() => setShowLinkPicker(v => !v)}
                  aria-label="Reference a project"
                  className={`p-1 rounded transition-colors duration-150 ${
                    showLinkPicker
                      ? 'bg-blue-100 text-blue-600'
                      : 'hover:bg-gray-100 text-gray-600'
                  }`}
                >
                  <Link2 size={14} />
                </button>
              </IconTooltip>
            )}
            {isNewPin && !disableAttachments && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <IconTooltip label="Attach file (images or PDF, max 20 MB)">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    aria-label="Attach file"
                    className={`p-1 rounded transition-colors duration-150 ${
                      attachments.length > 0
                        ? 'bg-blue-100 text-blue-600'
                        : 'hover:bg-gray-100 text-gray-600'
                    }`}
                  >
                    <Paperclip size={14} />
                    {attachments.length > 0 && (
                      <span className="sr-only">{attachments.length} attached</span>
                    )}
                  </button>
                </IconTooltip>
              </>
            )}
          </div>
          {isNewPin && (
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || !comment.trim()}
              className="px-2.5 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 transition-colors duration-150 disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : 'Save'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
