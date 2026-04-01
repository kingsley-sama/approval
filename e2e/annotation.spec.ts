import { test, expect } from '@playwright/test';

test.describe('Annotation Workspace', () => {
  test('opening a project renders the annotation canvas', async ({ page }) => {
    await page.goto('/projects');
    await expect(page.locator('.animate-spin')).toBeHidden({ timeout: 15_000 });

    // Click on the first project card's "Open" button (visible on hover)
    const firstCard = page.locator('[class*="grid"] > div').first();
    if (!(await firstCard.isVisible().catch(() => false))) {
      test.skip(true, 'No projects available to test');
      return;
    }

    // Hover to reveal the overlay, then click Open
    await firstCard.hover();
    const openButton = firstCard.getByRole('button', { name: /open/i });
    if (await openButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await openButton.click();
    } else {
      // Fallback: click the card itself
      await firstCard.click();
    }

    // Should navigate to /projects/[id]
    await expect(page).toHaveURL(/\/projects\/[a-zA-Z0-9-]+/, { timeout: 15_000 });

    // The image container or image viewer should be present
    const imageContainer = page.locator('[data-annotation-image-container]');
    const imageViewer = page.locator('img').first();
    const hasContainer = await imageContainer.isVisible({ timeout: 10_000 }).catch(() => false);
    const hasImage = await imageViewer.isVisible({ timeout: 5_000 }).catch(() => false);

    expect(hasContainer || hasImage).toBe(true);
  });

  test('clicking on image opens comment modal', async ({ page }) => {
    await page.goto('/projects');
    await expect(page.locator('.animate-spin')).toBeHidden({ timeout: 15_000 });

    const firstCard = page.locator('[class*="grid"] > div').first();
    if (!(await firstCard.isVisible().catch(() => false))) {
      test.skip(true, 'No projects available to test');
      return;
    }

    await firstCard.hover();
    const openButton = firstCard.getByRole('button', { name: /open/i });
    if (await openButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await openButton.click();
    } else {
      await firstCard.click();
    }

    await expect(page).toHaveURL(/\/projects\/[a-zA-Z0-9-]+/, { timeout: 15_000 });

    // Wait for image to load
    const imageContainer = page.locator('[data-annotation-image-container]');
    await expect(imageContainer).toBeVisible({ timeout: 15_000 });

    // Click on the image to place a pin
    const box = await imageContainer.boundingBox();
    if (box) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    }

    // Comment modal should appear
    const modal = page.locator('textarea[placeholder="Add comment..."]');
    await expect(modal).toBeVisible({ timeout: 5_000 });
  });

  test('submitting a comment shows pin (optimistic UI)', async ({ page }) => {
    await page.goto('/projects');
    await expect(page.locator('.animate-spin')).toBeHidden({ timeout: 15_000 });

    const firstCard = page.locator('[class*="grid"] > div').first();
    if (!(await firstCard.isVisible().catch(() => false))) {
      test.skip(true, 'No projects available to test');
      return;
    }

    await firstCard.hover();
    const openButton = firstCard.getByRole('button', { name: /open/i });
    if (await openButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await openButton.click();
    } else {
      await firstCard.click();
    }

    await expect(page).toHaveURL(/\/projects\/[a-zA-Z0-9-]+/, { timeout: 15_000 });

    const imageContainer = page.locator('[data-annotation-image-container]');
    await expect(imageContainer).toBeVisible({ timeout: 15_000 });

    // Count existing pins before
    const pinsBefore = await page.locator('[data-pin]').count();

    // Click to place new pin
    const box = await imageContainer.boundingBox();
    if (box) {
      await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.3);
    }

    // Fill comment and submit
    const textarea = page.locator('textarea[placeholder="Add comment..."]');
    await expect(textarea).toBeVisible({ timeout: 5_000 });
    await textarea.fill('Test comment from Playwright');

    const saveButton = page.getByRole('button', { name: /save/i });
    await saveButton.click();

    // Pin should appear immediately (optimistic UI)
    await expect(page.locator('[data-pin]')).toHaveCount(pinsBefore + 1, { timeout: 5_000 });
  });
});
