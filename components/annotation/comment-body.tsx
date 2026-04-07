'use client';

import React from 'react';

interface CommentBodyProps {
  content: string;
  className?: string;
}

const MENTION_RE = /@\[([^\]]+)\]\(([^)]+)\)/g;

export default function CommentBody({ content, className }: CommentBodyProps) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  MENTION_RE.lastIndex = 0;

  while ((m = MENTION_RE.exec(content)) !== null) {
    if (m.index > last) parts.push(content.slice(last, m.index));
    const [, name, id] = m;
    parts.push(
      <a
        key={m.index}
        href={`/projects/${id}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        className="inline-flex items-center px-1.5 py-0.5 rounded bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
      >
        @{name}
      </a>
    );
    last = m.index + m[0].length;
  }

  if (last < content.length) parts.push(content.slice(last));

  return <span className={className}>{parts}</span>;
}
