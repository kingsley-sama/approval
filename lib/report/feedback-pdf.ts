/**
 * Builds the downloadable feedback report.
 *
 * One page (or more) per annotated image: the image with its pins and markup
 * burned in, then the numbered comments underneath, replies included. This is
 * the artefact an agency sends a client to sign off, or a developer works
 * through — so pin numbers here must match the numbers on screen exactly.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { AnnotatedImage } from '@/lib/report/annotate-image';

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 48;
const CONTENT_WIDTH = A4.width - MARGIN * 2;

const INK = rgb(0.047, 0.192, 0.2); // #0c3133 — the product's text colour
const MUTED = rgb(0.34, 0.35, 0.41);
const HAIRLINE = rgb(0.85, 0.84, 0.82);
const ACCENT = rgb(1, 0.38, 0.216); // #ff6137
const RESOLVED = rgb(0.392, 0.573, 0.337); // #649256

export interface ReportReply {
  author: string;
  content: string;
  createdAt: string | null;
}

export interface ReportComment {
  number: number;
  author: string;
  createdAt: string | null;
  resolved: boolean;
  content: string;
  replies: ReportReply[];
}

export interface ReportPageInput {
  title: string;
  sourceUrl?: string | null;
  image: AnnotatedImage | null;
  comments: ReportComment[];
}

export interface FeedbackReportInput {
  projectName: string;
  siteUrl?: string | null;
  generatedAt: Date;
  pages: ReportPageInput[];
  /**
   * What a section is, for the cover wording only. A website review's sections
   * are pages of a site, not uploaded images, and calling them "images" in the
   * client's report reads as a mistake.
   */
  kind?: 'image' | 'website';
  /** Sections with no feedback, left out of the body but counted on the cover. */
  skippedCount: number;
}

/**
 * pdf-lib's standard fonts are WinAnsi-only and *throw* on anything outside it
 * — an emoji in one comment would otherwise fail the whole download. Map the
 * typography people actually paste, then drop what still cannot be encoded.
 * German umlauts and other Latin-1 characters pass through untouched.
 */
function sanitize(text: string): string {
  const mapped = (text ?? '')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—―]/g, '-')
    .replace(/…/g, '...')
    .replace(/ /g, ' ')
    .replace(/[•●]/g, '-')
    .replace(/\t/g, '    ')
    .replace(/\r\n?/g, '\n');

  let out = '';
  for (const ch of mapped) {
    const code = ch.codePointAt(0) ?? 0;
    if (ch === '\n') out += ch;
    else if (code >= 0x20 && code <= 0xff) out += ch;
    else out += ''; // emoji and other non-Latin glyphs have no standard-font form
  }
  return out;
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of sanitize(text).split('\n')) {
    if (!paragraph.trim()) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      // A single word longer than the column (a URL, usually) — hard-break it.
      if (font.widthOfTextAtSize(word, size) > maxWidth) {
        let chunk = '';
        for (const ch of word) {
          if (font.widthOfTextAtSize(chunk + ch, size) > maxWidth) {
            lines.push(chunk);
            chunk = ch;
          } else chunk += ch;
        }
        line = chunk;
      } else line = word;
    }
    if (line) lines.push(line);
  }
  return lines;
}

function formatDate(value: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Cursor that flows content down pages, adding new ones as it runs out. */
class Flow {
  page: PDFPage;
  y: number;

  constructor(private doc: PDFDocument) {
    this.page = doc.addPage([A4.width, A4.height]);
    this.y = A4.height - MARGIN;
  }

  newPage() {
    this.page = this.doc.addPage([A4.width, A4.height]);
    this.y = A4.height - MARGIN;
  }

  /** Ensure `needed` points remain; otherwise start a page. */
  reserve(needed: number) {
    if (this.y - needed < MARGIN) this.newPage();
  }
}

export async function buildFeedbackPdf(input: FeedbackReportInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(sanitize(`${input.projectName} — feedback`));
  doc.setProducer('Revision');
  doc.setCreationDate(input.generatedAt);

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const totalComments = input.pages.reduce((s, p) => s + p.comments.length, 0);
  const openComments = input.pages.reduce(
    (s, p) => s + p.comments.filter((c) => !c.resolved).length,
    0
  );

  const flow = new Flow(doc);

  // ── cover ───────────────────────────────────────────────────────────────
  flow.page.drawText('FEEDBACK REPORT', {
    x: MARGIN, y: flow.y - 12, size: 9, font: bold, color: ACCENT,
  });
  flow.y -= 40;

  for (const line of wrap(input.projectName, bold, 24, CONTENT_WIDTH)) {
    flow.page.drawText(line, { x: MARGIN, y: flow.y, size: 24, font: bold, color: INK });
    flow.y -= 30;
  }

  if (input.siteUrl) {
    flow.y -= 2;
    for (const line of wrap(input.siteUrl, regular, 10, CONTENT_WIDTH)) {
      flow.page.drawText(line, { x: MARGIN, y: flow.y, size: 10, font: regular, color: MUTED });
      flow.y -= 14;
    }
  }

  flow.y -= 10;
  flow.page.drawLine({
    start: { x: MARGIN, y: flow.y },
    end: { x: A4.width - MARGIN, y: flow.y },
    thickness: 1,
    color: HAIRLINE,
  });
  flow.y -= 22;

  const unit = input.kind === 'website' ? 'Pages' : 'Images';
  const summary: [string, string][] = [
    ['Generated', formatDate(input.generatedAt.toISOString())],
    [`${unit} with feedback`, String(input.pages.length)],
    ['Comments', String(totalComments)],
    ['Open', String(openComments)],
    ['Resolved', String(totalComments - openComments)],
  ];
  if (input.skippedCount > 0) {
    summary.push([`${unit} without feedback`, `${input.skippedCount} (not shown)`]);
  }

  for (const [label, value] of summary) {
    flow.page.drawText(label, { x: MARGIN, y: flow.y, size: 10, font: regular, color: MUTED });
    flow.page.drawText(value, { x: MARGIN + 170, y: flow.y, size: 10, font: bold, color: INK });
    flow.y -= 17;
  }

  if (input.pages.length === 0) {
    flow.y -= 20;
    flow.page.drawText('No comments have been left on this project yet.', {
      x: MARGIN, y: flow.y, size: 11, font: regular, color: MUTED,
    });
    return doc.save();
  }

  // ── one section per annotated image ─────────────────────────────────────
  for (const item of input.pages) {
    flow.newPage();

    for (const line of wrap(item.title, bold, 14, CONTENT_WIDTH)) {
      flow.page.drawText(line, { x: MARGIN, y: flow.y - 12, size: 14, font: bold, color: INK });
      flow.y -= 19;
    }

    if (item.sourceUrl) {
      for (const line of wrap(item.sourceUrl, regular, 9, CONTENT_WIDTH)) {
        flow.page.drawText(line, { x: MARGIN, y: flow.y - 10, size: 9, font: regular, color: MUTED });
        flow.y -= 12;
      }
    }

    flow.y -= 12;

    if (item.image) {
      try {
        const embedded = await doc.embedJpg(item.image.buffer);
        // Fit the width, and never let a tall page push the comments off.
        const maxHeight = A4.height * 0.52;
        const scale = Math.min(CONTENT_WIDTH / embedded.width, maxHeight / embedded.height);
        const w = embedded.width * scale;
        const h = embedded.height * scale;

        flow.reserve(h + 16);
        flow.page.drawImage(embedded, { x: MARGIN, y: flow.y - h, width: w, height: h });
        flow.page.drawRectangle({
          x: MARGIN, y: flow.y - h, width: w, height: h,
          borderColor: HAIRLINE, borderWidth: 0.5,
        });
        flow.y -= h + 22;
      } catch (err) {
        console.error('[report] could not embed image for', item.title, err);
      }
    }

    for (const comment of item.comments) {
      const bodyLines = wrap(comment.content, regular, 10, CONTENT_WIDTH - 34);
      const replyLines = comment.replies.map((r) => ({
        head: `${sanitize(r.author)}${formatDate(r.createdAt) ? ` · ${formatDate(r.createdAt)}` : ''}`,
        lines: wrap(r.content, regular, 9.5, CONTENT_WIDTH - 48),
      }));
      const height =
        18 + bodyLines.length * 12.5 +
        replyLines.reduce((s, r) => s + 13 + r.lines.length * 12, 0) + 14;

      flow.reserve(height);

      const badgeY = flow.y - 6;
      flow.page.drawCircle({
        x: MARGIN + 9, y: badgeY, size: 9,
        color: comment.resolved ? RESOLVED : ACCENT,
      });
      const label = String(comment.number);
      flow.page.drawText(label, {
        x: MARGIN + 9 - bold.widthOfTextAtSize(label, 9) / 2,
        y: badgeY - 3, size: 9, font: bold, color: rgb(1, 1, 1),
      });

      const meta = [
        sanitize(comment.author) || 'Unknown',
        formatDate(comment.createdAt),
        comment.resolved ? 'Resolved' : 'Open',
      ].filter(Boolean).join('  ·  ');

      flow.page.drawText(meta, {
        x: MARGIN + 26, y: badgeY - 3, size: 8.5, font: bold,
        color: comment.resolved ? RESOLVED : MUTED,
      });
      flow.y -= 18;

      for (const line of bodyLines) {
        flow.reserve(14);
        flow.page.drawText(line, { x: MARGIN + 26, y: flow.y - 8, size: 10, font: regular, color: INK });
        flow.y -= 12.5;
      }

      for (const reply of replyLines) {
        flow.reserve(16);
        flow.page.drawText(reply.head, {
          x: MARGIN + 40, y: flow.y - 9, size: 8, font: bold, color: MUTED,
        });
        flow.y -= 13;
        for (const line of reply.lines) {
          flow.reserve(14);
          flow.page.drawLine({
            start: { x: MARGIN + 32, y: flow.y - 4 },
            end: { x: MARGIN + 32, y: flow.y - 12 },
            thickness: 1, color: HAIRLINE,
          });
          flow.page.drawText(line, { x: MARGIN + 40, y: flow.y - 8, size: 9.5, font: regular, color: MUTED });
          flow.y -= 12;
        }
      }

      flow.y -= 10;
    }
  }

  // ── page numbers ────────────────────────────────────────────────────────
  const pages = doc.getPages();
  pages.forEach((page, i) => {
    const text = `${i + 1} / ${pages.length}`;
    page.drawText(text, {
      x: A4.width - MARGIN - regular.widthOfTextAtSize(text, 8),
      y: MARGIN / 2, size: 8, font: regular, color: MUTED,
    });
  });

  return doc.save();
}
