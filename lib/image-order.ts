const filenameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Compare file names the way a file manager does: "IMG_2" before "IMG_10". */
export function compareFileNames(a: string, b: string): number {
  return filenameCollator.compare(a, b);
}

/**
 * One-click orderings for a project's images. Each returns the ids in the new
 * order, ready to hand to `reorderThreads`.
 */
export type ImageSortMode = 'name-asc' | 'name-desc' | 'uploaded';

export const IMAGE_SORT_LABELS: Record<ImageSortMode, string> = {
  'name-asc': 'Name (A → Z)',
  'name-desc': 'Name (Z → A)',
  uploaded: 'Upload order',
};

interface SortableImage {
  id: string;
  name: string;
  createdAt?: string | null;
}

export function sortImageIds(images: SortableImage[], mode: ImageSortMode): string[] {
  // Index keeps the sort stable for ties and for images with no timestamp.
  const indexed = images.map((img, index) => ({ img, index }));
  indexed.sort((a, b) => {
    switch (mode) {
      case 'name-asc':
        return compareFileNames(a.img.name, b.img.name) || a.index - b.index;
      case 'name-desc':
        return compareFileNames(b.img.name, a.img.name) || a.index - b.index;
      case 'uploaded': {
        const ta = a.img.createdAt ? Date.parse(a.img.createdAt) : NaN;
        const tb = b.img.createdAt ? Date.parse(b.img.createdAt) : NaN;
        if (Number.isNaN(ta) || Number.isNaN(tb) || ta === tb) return a.index - b.index;
        return ta - tb;
      }
    }
  });
  return indexed.map(({ img }) => img.id);
}

/** Move one id to a 0-based position, clamped to the list. */
export function moveIdTo(order: string[], id: string, position: number): string[] {
  const from = order.indexOf(id);
  if (from === -1) return order;
  const to = Math.max(0, Math.min(order.length - 1, position));
  if (from === to) return order;
  const next = [...order];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}
