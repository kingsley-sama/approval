'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Paperclip, Link2, Search, FileText, ImageIcon, XCircle, ExternalLink } from 'lucide-react';
import { getProjectsForMention } from '@/app/actions/projects';
import type { AttachmentRecord } from '@/app/actions/storage';
import CommentBody from './comment-body';

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
}

const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf',
]);
const MAX_BYTES = 20 * 1024 * 1024;
const ELEVATED_ROLES = ['admin', 'pm'];

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
}: CommentModalProps) {
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [modalStyle, setModalStyle] = useState<React.CSSProperties>({});

  // Link picker state
  const [showLinkPicker, setShowLinkPicker] = useState(false);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [projectSearch, setProjectSearch] = useState('');
  const [loadingProjects, setLoadingProjects] = useState(false);

  // Attachment state
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  const modalRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  const canLink = ELEVATED_ROLES.includes(userRole);

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

  // ── file selection ───────────────────────────────────────────────────────────
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAttachmentError(null);
    const files = Array.from(e.target.files ?? []);
    if (fileInputRef.current) fileInputRef.current.value = '';

    const errors: string[] = [];
    const valid: PendingAttachment[] = [];

    for (const file of files) {
      if (!ALLOWED_TYPES.has(file.type)) {
        errors.push(`${file.name}: unsupported type`);
        continue;
      }
      if (file.size > MAX_BYTES) {
        errors.push(`${file.name}: exceeds 20 MB`);
        continue;
      }
      valid.push({ id: crypto.randomUUID(), file });
    }

    if (errors.length) setAttachmentError(errors.join('; '));
    setAttachments(prev => [...prev, ...valid]);
  };

  const removeAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

  const handleEditFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!onAddAttachment || !existingPin) return;
    const files = Array.from(e.target.files ?? []);
    if (editFileInputRef.current) editFileInputRef.current.value = '';
    if (!files.length) return;

    const errors: string[] = [];
    const valid: File[] = [];
    for (const file of files) {
      if (!ALLOWED_TYPES.has(file.type)) { errors.push(`${file.name}: unsupported type`); continue; }
      if (file.size > MAX_BYTES) { errors.push(`${file.name}: exceeds 20 MB`); continue; }
      valid.push(file);
    }
    if (errors.length) setAttachmentError(errors.join('; '));
    if (!valid.length) return;

    setIsUploadingAttachment(true);
    try {
      await onAddAttachment(existingPin.id, valid);
    } finally {
      setIsUploadingAttachment(false);
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
        className="bg-white rounded-md shadow-lg p-2 pointer-events-auto border border-border w-72 transition-all duration-200 ease-out"
        style={modalStyle}
      >
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
          <button
            onClick={onClose}
            className="p-0.5 hover:bg-gray-100 rounded text-gray-600 flex-shrink-0 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* ── Body ── */}
        {existingPin && !isNewPin ? (
          <>
            <div className="text-sm text-gray-700 px-1 py-1 bg-gray-50 rounded border border-gray-200 mb-1.5">
              <CommentBody content={existingPin.content} />
            </div>
            {existingPin.attachments && existingPin.attachments.length > 0 && (
              <div className="mb-1.5 space-y-1">
                <div className="flex flex-wrap gap-1">
                  {existingPin.attachments
                    .filter(a => a.mime_type.startsWith('image/'))
                    .map(a => (
                      <a
                        key={a.id}
                        href={a.signedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="relative group block"
                      >
                        <img
                          src={a.signedUrl}
                          alt={a.original_filename}
                          className="h-14 w-14 rounded object-cover border border-border/40 group-hover:opacity-80 transition-opacity"
                        />
                        <ExternalLink size={10} className="absolute bottom-1 right-1 text-white drop-shadow opacity-0 group-hover:opacity-100 transition-opacity" />
                      </a>
                    ))}
                </div>
                {existingPin.attachments
                  .filter(a => a.mime_type === 'application/pdf')
                  .map(a => (
                    <a
                      key={a.id}
                      href={a.signedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 border border-border rounded text-xs text-muted-foreground hover:text-foreground hover:bg-gray-100 transition-colors"
                    >
                      <FileText size={12} className="text-gray-500 shrink-0" />
                      <span className="flex-1 truncate">{a.original_filename}</span>
                      <ExternalLink size={10} className="shrink-0 opacity-50" />
                    </a>
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
                <button
                  onClick={() => editFileInputRef.current?.click()}
                  disabled={isUploadingAttachment}
                  className="flex items-center gap-1 p-1 rounded text-xs text-muted-foreground hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50 transition-colors"
                  title="Add attachment"
                >
                  <Paperclip size={13} />
                  <span>{isUploadingAttachment ? 'Uploading…' : 'Add attachment'}</span>
                </button>
                {attachmentError && (
                  <p className="text-[10px] text-red-500 flex-1">{attachmentError}</p>
                )}
              </div>
            )}
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
                <button
                  onClick={() => removeAttachment(a.id)}
                  className="shrink-0 text-gray-400 hover:text-red-500 transition-colors"
                >
                  <XCircle size={12} />
                </button>
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
            {canLink && (
              <button
                onClick={() => setShowLinkPicker(v => !v)}
                className={`p-1 rounded transition-colors duration-150 ${
                  showLinkPicker
                    ? 'bg-blue-100 text-blue-600'
                    : 'hover:bg-gray-100 text-gray-600'
                }`}
                title="Reference a project"
              >
                <Link2 size={14} />
              </button>
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
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className={`p-1 rounded transition-colors duration-150 ${
                    attachments.length > 0
                      ? 'bg-blue-100 text-blue-600'
                      : 'hover:bg-gray-100 text-gray-600'
                  }`}
                  title="Attach file (images or PDF, max 20 MB)"
                >
                  <Paperclip size={14} />
                  {attachments.length > 0 && (
                    <span className="sr-only">{attachments.length} attached</span>
                  )}
                </button>
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
