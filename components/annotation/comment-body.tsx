'use client';

import React from 'react';
import { hasBlockStructure, parseBlocks, parseInline } from '@/lib/comment-format';

interface CommentBodyProps {
  content: string;
  className?: string;
}

const MENTION_RE = /@\[([^\]]+)\]\(([^)]+)\)/g;
// http(s) URLs and bare www. hosts. Trailing punctuation is trimmed below so
// "see https://example.com." doesn't swallow the full stop.
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;
const TRAILING_PUNCT_RE = /[.,;:!?)\]}'"]+$/;

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

function linkify(text: string, keyPrefix: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  URL_RE.lastIndex = 0;

  while ((m = URL_RE.exec(text)) !== null) {
    let url = m[0];
    const trailing = url.match(TRAILING_PUNCT_RE)?.[0] ?? '';
    if (trailing) url = url.slice(0, url.length - trailing.length);
    if (!url) continue;

    if (m.index > last) out.push(text.slice(last, m.index));
    const href = url.startsWith('www.') ? `https://${url}` : url;
    out.push(
      <a
        key={`${keyPrefix}-${m.index}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={stop}
        onMouseDown={stop}
        onPointerDown={stop}
        className="text-primary underline underline-offset-2 break-all hover:opacity-80"
      >
        {url}
      </a>
    );
    last = m.index + url.length;
  }

  if (last < text.length) out.push(text.slice(last));
  return out;
}

function renderMentionsAndLinks(content: string, keyPrefix: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  MENTION_RE.lastIndex = 0;

  while ((m = MENTION_RE.exec(content)) !== null) {
    if (m.index > last) parts.push(...linkify(content.slice(last, m.index), `${keyPrefix}t${last}`));
    const [, name, id] = m;
    parts.push(
      <a
        key={`${keyPrefix}m${m.index}`}
        href={`/projects/${id}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={stop}
        className="inline-flex items-center px-1.5 py-0.5 rounded bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
      >
        @{name}
      </a>
    );
    last = m.index + m[0].length;
  }

  if (last < content.length) parts.push(...linkify(content.slice(last), `${keyPrefix}t${last}`));
  return parts;
}

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  return parseInline(text).map((segment, i) => {
    const key = `${keyPrefix}s${i}`;
    let node: React.ReactNode = renderMentionsAndLinks(segment.text, key);
    if (segment.marks.includes('italic')) node = <em>{node}</em>;
    if (segment.marks.includes('strike')) node = <s>{node}</s>;
    if (segment.marks.includes('underline')) node = <u>{node}</u>;
    if (segment.marks.includes('bold')) node = <strong className="font-semibold">{node}</strong>;
    return <React.Fragment key={key}>{node}</React.Fragment>;
  });
}

export default function CommentBody({ content, className }: CommentBodyProps) {
  // Single-line comments (almost all of them) keep their original inline
  // layout; only multi-line or list content switches to block rendering.
  if (!hasBlockStructure(content)) {
    return <span className={className}>{renderInline(content, 'l0')}</span>;
  }

  // Spans styled as blocks rather than <div>/<ul>, because callers render this
  // inside <p>, where block elements are invalid.
  return (
    <span className={`block whitespace-pre-wrap wrap-break-word ${className ?? ''}`}>
      {parseBlocks(content).map((block, i) => {
        const key = `b${i}`;
        if (block.kind === 'blank') return <span key={key} className="block">{'\u00a0'}</span>;
        if (block.kind === 'line') return <span key={key} className="block">{renderInline(block.text, key)}</span>;
        const marker = block.kind === 'bullet' ? '•' : `${block.number}.`;
        return (
          <span key={key} className="flex" style={{ paddingLeft: `${block.indent * 1.25}em` }}>
            <span className="shrink-0 w-[1.5em] select-none">{marker}</span>
            <span className="min-w-0 flex-1">{renderInline(block.text, key)}</span>
          </span>
        );
      })}
    </span>
  );
}
