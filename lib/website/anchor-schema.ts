import { z } from 'zod';

/**
 * Where a website comment is attached, stored in `markup_comments.anchor`.
 *
 * A pin used to be only a percentage of the whole document, and documents do
 * not hold still: they grow as images and fonts arrive, differ by screen
 * width, and reflow on phones. An anchor records the *element* under the pin
 * and where within it, which survives all of that. The pixel fields are the
 * fallback when the element can no longer be found, and x/y percentages on
 * the row remain the fallback of last resort (and what the PDF export reads).
 *
 * Same column the embed script writes; its fields are a subset of these.
 */
export const PIN_DEVICES = ['desktop', 'tablet', 'mobile'] as const;
export type PinDevice = (typeof PIN_DEVICES)[number];

/**
 * Where a comment's drawing was made. Kept apart from the pin's own anchor
 * because a pin is often dragged aside precisely to uncover its markup — the
 * markup must stay on what it marks, not follow the pin.
 */
const ShapeFrameSchema = z.object({
  selector: z.string().max(2000).optional(),
  xPct: z.number().min(0).max(100).optional(),
  yPct: z.number().min(0).max(100).optional(),
  fixed: z.boolean().optional(),
  pageX: z.number(),
  pageY: z.number(),
  docWidth: z.number().positive(),
  docHeight: z.number().positive(),
});

export const PinAnchorSchema = z.object({
  selector: z.string().max(2000).optional(),
  /** Offset within the anchored element, 0..100 — the embed script's scale. */
  xPct: z.number().min(0).max(100).optional(),
  yPct: z.number().min(0).max(100).optional(),
  elementText: z.string().max(300).optional(),
  /** The element sits in a fixed or sticky container (a header, a banner). */
  fixed: z.boolean().optional(),
  /** Document-pixel position and the document size at the time, for fallback. */
  pageX: z.number().optional(),
  pageY: z.number().optional(),
  docWidth: z.number().positive().optional(),
  docHeight: z.number().positive().optional(),
  viewportWidth: z.number().positive().optional(),
  device: z.enum(PIN_DEVICES).optional(),
  pageUrl: z.string().max(2000).optional(),
  /** Set once a pin has been dragged away from where its drawing was made. */
  shapes: ShapeFrameSchema.optional(),
  // Embed/snapshot fields, carried through untouched.
  rv: z.number().int().optional(),
  snapshotVersion: z.number().int().optional(),
});

export type PinAnchor = z.infer<typeof PinAnchorSchema>;

/** Validates untrusted input; anything malformed is dropped rather than stored. */
export function parsePinAnchor(value: unknown): PinAnchor | null {
  if (value == null) return null;
  const parsed = PinAnchorSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
