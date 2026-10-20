/**
 * Lightweight text formatting for comments and replies.
 *
 * Comments are stored as plain text in `markup_comments.content`; formatting is
 * a small markdown-like markup inside that text, so no schema change is needed,
 * every comment written before this existed renders exactly as before, and the
 * API / exports still receive readable text.
 *
 *   **bold**   _italic_   ++underline++   ~~strikethrough~~
 *   "- item"   "1. item"   (one per line)
 *   line breaks and empty lines are kept as typed.
 *
 * Italic uses underscores rather than a single asterisk because brochures use
 * asterisks for footnotes ("Preis*"), and the underscore only counts at a word
 * boundary so snake_case file names stay untouched.
 *
 * Shared by the renderer (components/annotation/comment-body.tsx), the editor
 * toolbar (components/annotation/comment-editor.tsx) and the PDF report.
 */

export type InlineMark = 'bold' | 'italic' | 'underline' | 'strike';

export const MARK_TOKENS: Record<InlineMark, string> = {
  bold: '**',
  italic: '_',
  underline: '++',
  strike: '~~',
};

/** Outermost first; serialising in this order keeps nested marks unambiguous. */
const MARK_ORDER: InlineMark[] = ['bold', 'underline', 'strike', 'italic'];

export interface InlineSegment {
  text: string;
  marks: InlineMark[];
}

// Each alternative requires non-space just inside the markers, so "2 ** 3" or
// a stray "~~" never starts formatting.
const INLINE_RE =
  /\*\*(?=\S)([\s\S]*?\S)\*\*|\+\+(?=\S)([\s\S]*?\S)\+\+|~~(?=\S)([\s\S]*?\S)~~|(?<![\p{L}\p{N}_])_(?=[^\s_])([\s\S]*?[^\s_])_(?![\p{L}\p{N}_])/gu;

const GROUP_MARKS: InlineMark[] = ['bold', 'underline', 'strike', 'italic'];

export function parseInline(text: string, marks: InlineMark[] = []): InlineSegment[] {
  const out: InlineSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE_RE)) {
    const index = m.index ?? 0;
    if (index < last) continue;
    const group = [1, 2, 3, 4].find(g => m[g] !== undefined)!;
    const mark = GROUP_MARKS[group - 1];
    if (index > last) out.push({ text: text.slice(last, index), marks });
    const inner = marks.includes(mark) ? marks : [...marks, mark];
    out.push(...parseInline(m[group], inner));
    last = index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), marks });
  return out;
}

export type CommentBlock =
  | { kind: 'line'; text: string }
  | { kind: 'blank' }
  | { kind: 'bullet'; text: string; indent: number }
  | { kind: 'ordered'; text: string; number: string; indent: number };

export const BULLET_LINE_RE = /^(\s*)[-•]\s+(.*)$/;
export const ORDERED_LINE_RE = /^(\s*)(\d{1,3})[.)]\s+(.*)$/;

export function parseBlocks(content: string): CommentBlock[] {
  return content.replace(/\r\n?/g, '\n').split('\n').map((line): CommentBlock => {
    if (!line.trim()) return { kind: 'blank' };
    const bullet = BULLET_LINE_RE.exec(line);
    if (bullet) return { kind: 'bullet', text: bullet[2], indent: indentLevel(bullet[1]) };
    const ordered = ORDERED_LINE_RE.exec(line);
    if (ordered) {
      return { kind: 'ordered', text: ordered[3], number: ordered[2], indent: indentLevel(ordered[1]) };
    }
    return { kind: 'line', text: line };
  });
}

function indentLevel(whitespace: string): number {
  return Math.min(4, Math.floor(whitespace.replace(/\t/g, '  ').length / 2));
}

/** True when the content needs block layout rather than a single inline run. */
export function hasBlockStructure(content: string): boolean {
  return content.includes('\n') || BULLET_LINE_RE.test(content) || ORDERED_LINE_RE.test(content);
}

const MENTION_RE = /@\[([^\]]+)\]\(([^)]+)\)/g;

/**
 * Plain-text rendering for places that cannot show formatting (PDF report,
 * notifications): markers removed, list bullets as "•", mentions as "@name".
 */
export function stripCommentFormatting(content: string): string {
  return parseBlocks(content)
    .map(block => {
      if (block.kind === 'blank') return '';
      const text = parseInline(block.text).map(s => s.text).join('').replace(MENTION_RE, '@$1');
      if (block.kind === 'bullet') return `${'  '.repeat(block.indent)}• ${text}`;
      if (block.kind === 'ordered') return `${'  '.repeat(block.indent)}${block.number}. ${text}`;
      return text;
    })
    .join('\n');
}

// ─── serialising formatted segments back to markup (used by paste) ───────────

function wrapSegment(segment: InlineSegment): string {
  const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(segment.text)!;
  const [, lead, core, trail] = match;
  if (!core) return segment.text;
  let out = core;
  for (const mark of [...MARK_ORDER].reverse()) {
    if (segment.marks.includes(mark)) out = `${MARK_TOKENS[mark]}${out}${MARK_TOKENS[mark]}`;
  }
  return `${lead}${out}${trail}`;
}

function sameMarks(a: InlineMark[], b: InlineMark[]): boolean {
  return a.length === b.length && a.every(m => b.includes(m));
}

export function serializeSegments(segments: InlineSegment[]): string {
  const merged: InlineSegment[] = [];
  for (const seg of segments) {
    if (!seg.text) continue;
    const prev = merged[merged.length - 1];
    if (prev && sameMarks(prev.marks, seg.marks)) prev.text += seg.text;
    else merged.push({ text: seg.text, marks: [...seg.marks] });
  }
  return merged.map(wrapSegment).join('');
}

// ─── HTML clipboard → markup ─────────────────────────────────────────────────

const BLOCK_TAGS = new Set([
  'P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TR', 'BLOCKQUOTE', 'PRE',
  'UL', 'OL', 'TABLE', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER',
]);
const SKIP_TAGS = new Set(['STYLE', 'SCRIPT', 'HEAD', 'META', 'TITLE', 'XML', 'O:P']);

/**
 * Converts the text/html flavour of a clipboard paste (Word, Google Docs,
 * Pages, web pages) into comment markup, keeping bold / italic / underline /
 * strikethrough, list items, line breaks and empty paragraphs.
 * Returns null when nothing usable came out, so the caller can fall back to
 * the plain-text paste.
 */
export function htmlToCommentMarkup(html: string): string | null {
  if (typeof DOMParser === 'undefined') return null;
  const doc = new DOMParser().parseFromString(html, 'text/html');

  const lines: InlineSegment[][] = [[]];
  let listPrefix: string | null = null;
  const current = () => lines[lines.length - 1];
  const breakLine = () => {
    lines.push([]);
  };
  // Start a new line unless we're already at the start of an empty one.
  const ensureLineStart = () => {
    if (current().length > 0) breakLine();
  };

  const marksFor = (el: HTMLElement, inherited: InlineMark[]): InlineMark[] => {
    const marks = new Set(inherited);
    const tag = el.tagName;
    const style = el.getAttribute('style')?.toLowerCase() ?? '';
    const weight = /font-weight\s*:\s*([a-z0-9]+)/.exec(style)?.[1];

    if (tag === 'B' || tag === 'STRONG' || /^H[1-6]$/.test(tag)) marks.add('bold');
    if (weight) {
      // Google Docs wraps its whole payload in <b style="font-weight:normal">.
      if (weight === 'bold' || weight === 'bolder' || Number(weight) >= 600) marks.add('bold');
      else marks.delete('bold');
    }
    if (tag === 'I' || tag === 'EM' || /font-style\s*:\s*italic/.test(style)) marks.add('italic');
    if (/font-style\s*:\s*normal/.test(style)) marks.delete('italic');
    if (tag === 'U' || tag === 'INS' || /text-decoration[a-z-]*\s*:[^;]*underline/.test(style)) marks.add('underline');
    if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL' || /text-decoration[a-z-]*\s*:[^;]*line-through/.test(style)) {
      marks.add('strike');
    }
    return [...marks];
  };

  const pushText = (text: string, marks: InlineMark[]) => {
    if (!text) return;
    if (listPrefix !== null) {
      current().push({ text: listPrefix, marks: [] });
      listPrefix = null;
    }
    current().push({ text, marks });
  };

  const walk = (node: Node, marks: InlineMark[], pre: boolean) => {
    if (node.nodeType === Node.TEXT_NODE) {
      let text = node.textContent ?? '';
      if (pre) {
        text.split('\n').forEach((part, i) => {
          if (i > 0) breakLine();
          pushText(part, marks);
        });
        return;
      }
      // Source newlines/indentation are layout, not content; non-breaking
      // spaces are deliberate spacing, so they survive as plain spaces.
      text = text.replace(/[\t\n\r ]+/g, ' ').replace(/ /g, ' ');
      // Collapse whitespace at the start of a line the way a browser would.
      if (current().length === 0 && listPrefix === null) text = text.replace(/^ +/, '');
      pushText(text, marks);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toUpperCase();
    if (SKIP_TAGS.has(tag)) return;
    if (tag === 'BR') {
      breakLine();
      return;
    }

    const style = el.getAttribute('style')?.toLowerCase() ?? '';
    // Word renders list bullets/numbers as text in a span marked mso-list:Ignore.
    if (/mso-list\s*:\s*ignore/.test(style)) {
      const glyph = (el.textContent ?? '').replace(/[\s ]+/g, '');
      const num = /^(\d{1,3})[.)]$/.exec(glyph);
      listPrefix = num ? `${num[1]}. ` : '- ';
      return;
    }

    const isBlock = BLOCK_TAGS.has(tag);
    if (isBlock) ensureLineStart();

    if (tag === 'LI') {
      const parent = el.parentElement;
      if (parent?.tagName === 'OL') {
        const start = Number(parent.getAttribute('start') ?? '1') || 1;
        const index = Array.from(parent.children).filter(c => c.tagName === 'LI').indexOf(el);
        listPrefix = `${start + index}. `;
      } else {
        listPrefix = '- ';
      }
    }

    const childMarks = marksFor(el, marks);
    const childPre = pre || tag === 'PRE' || /white-space\s*:\s*pre/.test(style);
    const lineCountBefore = lines.length;
    el.childNodes.forEach(child => walk(child, childMarks, childPre));

    if (isBlock) {
      if (current().length > 0) {
        breakLine();
      } else if (tag === 'P' && lines.length === lineCountBefore) {
        // A paragraph that produced nothing (Word's <p>&nbsp;</p>) is an
        // intentional blank line. A block that merely ended on a fresh line
        // (e.g. <li><p>…</p></li>) must not add another one.
        breakLine();
      }
    }
  };

  doc.body.childNodes.forEach(child => walk(child, [], false));

  const text = lines
    .map(segments => serializeSegments(segments).replace(/\s+$/, ''))
    .join('\n')
    // Paragraph boundaries can produce runs of blank lines; two is plenty.
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+|\n+$/g, '');

  return text.trim() ? text : null;
}
