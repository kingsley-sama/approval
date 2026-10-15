'use client';

import React from 'react';

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

export default function CommentBody({ content, className }: CommentBodyProps) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  MENTION_RE.lastIndex = 0;

  while ((m = MENTION_RE.exec(content)) !== null) {
    if (m.index > last) parts.push(...linkify(content.slice(last, m.index), `t${last}`));
    const [, name, id] = m;
    parts.push(
      <a
        key={m.index}
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

  if (last < content.length) parts.push(...linkify(content.slice(last), `t${last}`));

  return <span className={className}>{parts}</span>;
}
