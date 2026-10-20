'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Bold, Italic, Underline, Strikethrough, List, ListOrdered, Maximize2, Minimize2,
} from 'lucide-react';
import { IconTooltip } from '@/components/ui/icon-tooltip';
import {
  BULLET_LINE_RE,
  MARK_TOKENS,
  ORDERED_LINE_RE,
  htmlToCommentMarkup,
  type InlineMark,
} from '@/lib/comment-format';

/**
 * Text area for writing and editing comments, with a formatting toolbar.
 *
 * Formatting is stored as light markup in the comment text (see
 * lib/comment-format.ts) so this stays a plain <textarea>: pasting, undo,
 * spellcheck and mobile keyboards all behave natively. Edits go through
 * document.execCommand('insertText') where available so toolbar actions land
 * on the browser's undo stack.
 *
 * Keys: Enter inserts a line break (continuing a list), Ctrl/Cmd+Enter submits,
 * Ctrl/Cmd+B / I / U toggle bold / italic / underline, Escape cancels.
 */

interface CommentEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  onCancel?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  /** Visible lines before the box starts growing with its content. */
  minRows?: number;
  /** Lets the parent insert text (mentions, emoji) at the caret. */
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  className?: string;
}

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = IS_MAC ? '⌘' : 'Ctrl';

/** Replace [start, end) with `text`, preferring the undo-friendly path. */
function replaceRange(
  textarea: HTMLTextAreaElement,
  start: number,
  end: number,
  text: string,
  onChange: (value: string) => void,
  selectStart: number,
  selectEnd: number,
) {
  textarea.focus();
  textarea.setSelectionRange(start, end);
  const before = textarea.value;
  const expected = before.slice(0, start) + text + before.slice(end);
  try {
    // Deprecated but still the only way to edit a textarea while keeping
    // native undo. insertText with '' is a no-op, so deletions use 'delete'.
    if (text) document.execCommand('insertText', false, text);
    else if (start !== end) document.execCommand('delete');
  } catch {
    // fall through to the controlled update below
  }
  if (textarea.value === expected) {
    // Native edit landed (and fired onChange); place the caret right away so
    // fast typing after a shortcut can't race a deferred update.
    textarea.setSelectionRange(selectStart, selectEnd);
    return;
  }
  onChange(expected);
  // React re-renders the controlled value and resets the caret; restore it after.
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(selectStart, selectEnd);
  });
}

function toggleMark(
  textarea: HTMLTextAreaElement,
  mark: InlineMark,
  onChange: (value: string) => void,
) {
  const token = MARK_TOKENS[mark];
  const value = textarea.value;
  let { selectionStart: start, selectionEnd: end } = textarea;

  // Markers must hug the text, so leave surrounding spaces outside them.
  while (start < end && /\s/.test(value[start])) start++;
  while (end > start && /\s/.test(value[end - 1])) end--;

  if (start === end) {
    replaceRange(textarea, start, end, token + token, onChange, start + token.length, start + token.length);
    return;
  }

  // Already wrapped (markers just outside the selection) → unwrap.
  if (
    value.slice(start - token.length, start) === token &&
    value.slice(end, end + token.length) === token
  ) {
    const inner = value.slice(start, end);
    replaceRange(
      textarea, start - token.length, end + token.length, inner, onChange,
      start - token.length, end - token.length,
    );
    return;
  }

  // Formatting is parsed per line, so wrap each non-empty line separately.
  const selected = value.slice(start, end);
  const wrapped = selected
    .split('\n')
    .map(line => {
      const m = /^(\s*)(.*?)(\s*)$/.exec(line)!;
      return m[2] ? `${m[1]}${token}${m[2]}${token}${m[3]}` : line;
    })
    .join('\n');
  // Select the text inside the markers, so pressing the button again unwraps.
  const singleLine = !selected.includes('\n');
  replaceRange(
    textarea, start, end, wrapped, onChange,
    singleLine ? start + token.length : start,
    singleLine ? start + wrapped.length - token.length : start + wrapped.length,
  );
}

function toggleList(
  textarea: HTMLTextAreaElement,
  kind: 'bullet' | 'ordered',
  onChange: (value: string) => void,
) {
  const value = textarea.value;
  const lineStart = value.lastIndexOf('\n', textarea.selectionStart - 1) + 1;
  let lineEnd = value.indexOf('\n', textarea.selectionEnd);
  if (lineEnd === -1) lineEnd = value.length;

  const lines = value.slice(lineStart, lineEnd).split('\n');
  const re = kind === 'bullet' ? BULLET_LINE_RE : ORDERED_LINE_RE;
  const allListed = lines.every(line => !line.trim() || re.test(line));

  let n = 0;
  const next = lines
    .map(line => {
      if (!line.trim()) return line;
      if (allListed) {
        const m = re.exec(line)!;
        return m[1] + (kind === 'bullet' ? m[2] : m[3]);
      }
      // Swap the other list style for this one rather than stacking prefixes.
      const bare = line.replace(BULLET_LINE_RE, '$1$2').replace(ORDERED_LINE_RE, '$1$3');
      const indent = /^\s*/.exec(bare)![0];
      n += 1;
      return `${indent}${kind === 'bullet' ? '- ' : `${n}. `}${bare.slice(indent.length)}`;
    })
    .join('\n');

  replaceRange(textarea, lineStart, lineEnd, next, onChange, lineStart, lineStart + next.length);
}

/**
 * Enter inside a list item continues the list; Enter on an empty item ends it.
 * Returns true when it handled the key.
 */
function continueList(textarea: HTMLTextAreaElement, onChange: (value: string) => void): boolean {
  const { selectionStart: pos, selectionEnd, value } = textarea;
  if (pos !== selectionEnd) return false;
  const lineStart = value.lastIndexOf('\n', pos - 1) + 1;
  const line = value.slice(lineStart, pos);

  const bullet = BULLET_LINE_RE.exec(line);
  const ordered = bullet ? null : ORDERED_LINE_RE.exec(line);
  if (!bullet && !ordered) return false;

  const itemText = bullet ? bullet[2] : ordered![3];
  if (!itemText.trim()) {
    // Enter on an empty item: drop its marker and leave the list.
    replaceRange(textarea, lineStart, pos, '', onChange, lineStart, lineStart);
    return true;
  }

  const indent = (bullet ?? ordered)![1];
  const prefix = bullet ? '- ' : `${Number(ordered![2]) + 1}. `;
  const insert = `\n${indent}${prefix}`;
  replaceRange(textarea, pos, pos, insert, onChange, pos + insert.length, pos + insert.length);
  return true;
}

function useAutoGrow(
  ref: React.RefObject<HTMLTextAreaElement | null>,
  value: string,
  enabled: boolean,
) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [ref, value, enabled]);
}

interface SurfaceProps extends CommentEditorProps {
  expanded: boolean;
  onToggleExpanded: () => void;
}

function EditorSurface({
  value,
  onChange,
  onSubmit,
  onCancel,
  placeholder,
  autoFocus,
  disabled,
  minRows = 5,
  textareaRef,
  expanded,
  onToggleExpanded,
}: SurfaceProps) {
  const localRef = useRef<HTMLTextAreaElement | null>(null);
  const setRef = useCallback(
    (el: HTMLTextAreaElement | null) => {
      localRef.current = el;
      if (textareaRef) textareaRef.current = el;
    },
    [textareaRef],
  );

  useAutoGrow(localRef, value, !expanded);

  useEffect(() => {
    if (!autoFocus) return;
    const el = localRef.current;
    if (!el) return;
    el.focus();
    const end = el.value.length;
    el.setSelectionRange(end, end);
    // Mount-only: re-running on every keystroke would steal the caret.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = (fn: (el: HTMLTextAreaElement) => void) => {
    const el = localRef.current;
    if (el && !disabled) fn(el);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Keep typing inside the editor from reaching page-level shortcuts.
    e.stopPropagation();
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === 'Enter' && mod) {
      e.preventDefault();
      onSubmit?.();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.altKey) {
      if (continueList(e.currentTarget, onChange)) e.preventDefault();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (expanded) onToggleExpanded();
      else onCancel?.();
      return;
    }
    if (mod && !e.shiftKey && !e.altKey) {
      const key = e.key.toLowerCase();
      const mark: InlineMark | null =
        key === 'b' ? 'bold' : key === 'i' ? 'italic' : key === 'u' ? 'underline' : null;
      if (mark) {
        e.preventDefault();
        toggleMark(e.currentTarget, mark, onChange);
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const html = e.clipboardData.getData('text/html');
    if (!html) return; // plain text: the native paste already keeps line breaks
    const markup = htmlToCommentMarkup(html);
    if (!markup) return;
    e.preventDefault();
    const el = e.currentTarget;
    const { selectionStart: start, selectionEnd: end } = el;
    replaceRange(el, start, end, markup, onChange, start + markup.length, start + markup.length);
  };

  const tools: { label: string; icon: React.ReactNode; action: () => void }[] = [
    { label: `Bold (${MOD}+B)`, icon: <Bold size={14} />, action: () => run(el => toggleMark(el, 'bold', onChange)) },
    { label: `Italic (${MOD}+I)`, icon: <Italic size={14} />, action: () => run(el => toggleMark(el, 'italic', onChange)) },
    { label: `Underline (${MOD}+U)`, icon: <Underline size={14} />, action: () => run(el => toggleMark(el, 'underline', onChange)) },
    { label: 'Strikethrough', icon: <Strikethrough size={14} />, action: () => run(el => toggleMark(el, 'strike', onChange)) },
    { label: 'Bulleted list', icon: <List size={14} />, action: () => run(el => toggleList(el, 'bullet', onChange)) },
    { label: 'Numbered list', icon: <ListOrdered size={14} />, action: () => run(el => toggleList(el, 'ordered', onChange)) },
  ];

  return (
    <div
      className={`flex flex-col rounded-md border border-border bg-white text-foreground focus-within:ring-1 focus-within:ring-blue-500 ${
        expanded ? 'h-full' : ''
      } ${disabled ? 'opacity-60' : ''}`}
    >
      <div className="flex items-center gap-0.5 border-b border-border/70 px-1 py-0.5" data-comment-editor-toolbar>
        {tools.map(tool => (
          <IconTooltip key={tool.label} label={tool.label}>
            <button
              type="button"
              aria-label={tool.label}
              // Keep focus (and the selection) in the textarea.
              onMouseDown={e => e.preventDefault()}
              onClick={tool.action}
              disabled={disabled}
              className="p-1 rounded text-gray-600 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-40 transition-colors"
            >
              {tool.icon}
            </button>
          </IconTooltip>
        ))}
        <span className="ml-auto hidden sm:inline text-[10px] text-gray-400 px-1 select-none">
          {onSubmit ? `${MOD}+Enter to save` : ''}
        </span>
        <IconTooltip label={expanded ? 'Shrink editor' : 'Expand editor'}>
          <button
            type="button"
            aria-label={expanded ? 'Shrink editor' : 'Expand editor'}
            onMouseDown={e => e.preventDefault()}
            onClick={onToggleExpanded}
            className="p-1 rounded text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
          >
            {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </IconTooltip>
      </div>
      <textarea
        ref={setRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        placeholder={placeholder}
        disabled={disabled}
        rows={minRows}
        className={`w-full px-3 py-2 text-[15px] leading-relaxed bg-transparent rounded-b-md focus:outline-none ${
          expanded ? 'flex-1 resize-none' : 'resize-y max-h-[55vh] overflow-y-auto'
        }`}
      />
    </div>
  );
}

export default function CommentEditor(props: CommentEditorProps) {
  const [expanded, setExpanded] = useState(false);
  const toggle = () => setExpanded(v => !v);

  return (
    <div className={props.className}>
      <EditorSurface {...props} expanded={false} onToggleExpanded={toggle} />
      {expanded &&
        createPortal(
          // Portalled to <body>: the floating comment modal is positioned with a
          // CSS transform, which would otherwise trap position:fixed inside it.
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
            onMouseDown={e => {
              e.stopPropagation();
              if (e.target === e.currentTarget) setExpanded(false);
            }}
            onClick={e => e.stopPropagation()}
            onPointerDown={e => e.stopPropagation()}
          >
            <div className="flex h-[85vh] w-full max-w-4xl flex-col gap-2 rounded-lg bg-white p-3 shadow-2xl">
              <div className="min-h-0 flex-1">
                <EditorSurface
                  {...props}
                  autoFocus
                  textareaRef={undefined}
                  expanded
                  onToggleExpanded={toggle}
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  className="px-3 py-1.5 text-sm rounded text-gray-700 hover:bg-gray-100"
                >
                  Back
                </button>
                {props.onSubmit && (
                  <button
                    type="button"
                    disabled={props.disabled || !props.value.trim()}
                    onClick={() => {
                      setExpanded(false);
                      props.onSubmit?.();
                    }}
                    className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
                  >
                    Save
                  </button>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
