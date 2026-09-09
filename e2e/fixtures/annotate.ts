import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Helpers shared by the suites that annotate the seeded fixture image.
 *
 * Two things they exist to solve:
 *
 * 1. The image used to be pulled from picsum.photos, so every annotation test
 *    depended on a third party being reachable. It is now generated and stored
 *    by `e2e/fixtures/seed.mjs`, and is found by its alt text instead.
 *
 * 2. Comments accumulate. Nothing in this suite deletes them, so a fixed click
 *    point works once and then lands on the pin the previous run left behind —
 *    and the viewer treats a click on a pin as "open that thread", not "start a
 *    new one". Every click therefore has to be aimed at a spot that is still
 *    free.
 */

/**
 * The annotation canvas image. Both viewers carry the same hook — the workspace
 * one (components/annotation/image-viewer) and the share one
 * (components/enhanced-image-viewer), whose alt text is the thread name and so
 * cannot be matched by a shared selector.
 */
export const ANNOTATION_IMAGE = '[data-testid="annotation-image"]';

export const COMMENT_TEXTAREA = 'textarea[placeholder="Add comment..."]';

export async function annotationImage(page: Page): Promise<Locator> {
  const image = page.locator(ANNOTATION_IMAGE).first();
  await expect(image).toBeVisible({ timeout: 15_000 });
  return image;
}

/** Clearance kept between a new click and any existing pin, in CSS pixels. */
const PIN_MARGIN = 24;

/**
 * A point inside the image that no pin currently covers.
 *
 * Walks a 5×5 grid and returns the first free intersection, preferring points
 * near `bias` when one is given so tests that care about placement still get
 * roughly what they asked for.
 */
export async function freeSpot(
  page: Page,
  image: Locator,
  bias?: { x: number; y: number }
): Promise<{ x: number; y: number }> {
  const box = await image.boundingBox();
  expect(box, 'annotation image must have a layout box').not.toBeNull();

  const pins = page.locator('[data-pin]');
  const taken: { x: number; y: number; width: number; height: number }[] = [];
  for (let i = 0, n = await pins.count(); i < n; i++) {
    const pinBox = await pins.nth(i).boundingBox();
    if (pinBox) taken.push(pinBox);
  }

  const isClear = (x: number, y: number) =>
    taken.every(
      (p) =>
        x < p.x - PIN_MARGIN ||
        x > p.x + p.width + PIN_MARGIN ||
        y < p.y - PIN_MARGIN ||
        y > p.y + p.height + PIN_MARGIN
    );

  const candidates: { x: number; y: number }[] = [];
  for (let row = 1; row <= 5; row++) {
    for (let col = 1; col <= 5; col++) {
      candidates.push({
        x: box!.x + (box!.width * col) / 6,
        y: box!.y + (box!.height * row) / 6,
      });
    }
  }

  if (bias) {
    const target = { x: box!.x + box!.width * bias.x, y: box!.y + box!.height * bias.y };
    candidates.sort(
      (a, b) => Math.hypot(a.x - target.x, a.y - target.y) - Math.hypot(b.x - target.x, b.y - target.y)
    );
  }

  const spot = candidates.find((c) => isClear(c.x, c.y));
  expect(spot, 'no free spot left on the fixture image — seed a clean project').toBeTruthy();
  return spot!;
}

/** Clicks an empty part of the image and waits for the comment form to open. */
export async function openCommentModal(
  page: Page,
  bias?: { x: number; y: number }
): Promise<Locator> {
  const image = await annotationImage(page);
  const spot = await freeSpot(page, image, bias);
  await page.mouse.click(spot.x, spot.y);

  const textarea = page.locator(COMMENT_TEXTAREA);
  await expect(textarea).toBeVisible({ timeout: 8_000 });
  return textarea;
}

/** Places a comment on a free part of the image and waits for it to render. */
export async function placeComment(
  page: Page,
  text: string,
  bias?: { x: number; y: number }
): Promise<void> {
  const textarea = await openCommentModal(page, bias);
  await textarea.fill(text);
  await page.getByRole('button', { name: /save|submit|post/i }).click();
  await expect(page.getByText(text).first()).toBeVisible({ timeout: 10_000 });
}
