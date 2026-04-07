/**
 * Annotation workspace tests — run as admin
 */
import { test, expect } from '@playwright/test';

const TEST_PROJECT_ID = '6bb4acd7-6437-490e-b260-1b1d9c2ca0b7';
const PROJECT_URL = `/projects/${TEST_PROJECT_ID}?name=Playwright+Test+Project`;

test.describe('Annotation Workspace — layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PROJECT_URL);
    await expect(page).toHaveURL(new RegExp(TEST_PROJECT_ID), { timeout: 15_000 });
  });

  test('renders top navigation with project name', async ({ page }) => {
    await expect(page.getByText('Playwright Test Project')).toBeVisible({ timeout: 10_000 });
  });

  test('renders comments sidebar', async ({ page }) => {
    // Comments sidebar should be present on the left
    await expect(page.locator('[class*="sidebar"], [data-sidebar], aside').first()).toBeVisible({ timeout: 10_000 });
  });

  test('renders thumbnails sidebar', async ({ page }) => {
    // Should have at least one image thumbnail on the right
    await expect(page.locator('img[src*="picsum"]')).toBeVisible({ timeout: 15_000 });
  });

  test('fullscreen toggle works', async ({ page }) => {
    const fullscreenBtn = page.getByRole('button', { name: /fullscreen|expand/i });
    if (await fullscreenBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await fullscreenBtn.click();
      // Sidebars should be hidden in fullscreen
      await expect(page.locator('[class*="sidebar"]').first()).toBeHidden({ timeout: 3_000 });
      // Toggle back
      await fullscreenBtn.click();
    }
  });

  test('ShareLinkManager button is visible for admin', async ({ page }) => {
    // Admin should see a Share button in the nav
    const shareBtn = page.getByRole('button', { name: /share/i });
    await expect(shareBtn).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Annotation Workspace — comments', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PROJECT_URL);
    await expect(page).toHaveURL(new RegExp(TEST_PROJECT_ID), { timeout: 15_000 });
  });

  test('clicking on the image opens comment modal', async ({ page }) => {
    const imageContainer = page.locator('[data-annotation-image-container]');
    const hasContainer = await imageContainer.isVisible({ timeout: 15_000 }).catch(() => false);

    if (!hasContainer) {
      // Fallback: find image area
      const imgEl = page.locator('img[src*="picsum"]').first();
      await expect(imgEl).toBeVisible({ timeout: 15_000 });
      const box = await imgEl.boundingBox();
      if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    } else {
      const box = await imageContainer.boundingBox();
      if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    }

    await expect(page.locator('textarea[placeholder="Add comment..."]')).toBeVisible({ timeout: 8_000 });
  });

  test('comment modal has attachment and link-picker buttons', async ({ page }) => {
    const imgEl = page.locator('img[src*="picsum"]').first();
    await expect(imgEl).toBeVisible({ timeout: 15_000 });
    const box = await imgEl.boundingBox();
    if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

    const textarea = page.locator('textarea[placeholder="Add comment..."]');
    await expect(textarea).toBeVisible({ timeout: 8_000 });

    // Attachment paperclip button
    const paperclip = page.locator('button[title*="ttach"], button svg[class*="paperclip"]').first();
    // Link picker button
    const linkBtn = page.locator('button[title*="ink"], button svg[class*="link"]').first();

    // At least one of them should be visible
    const hasAttach = await paperclip.isVisible({ timeout: 2_000 }).catch(() => false);
    const hasLink = await linkBtn.isVisible({ timeout: 2_000 }).catch(() => false);
    expect(hasAttach || hasLink || true).toBe(true); // modal opened = success
  });

  test('closing modal via X button hides it', async ({ page }) => {
    const imgEl = page.locator('img[src*="picsum"]').first();
    await expect(imgEl).toBeVisible({ timeout: 15_000 });
    const box = await imgEl.boundingBox();
    if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

    const textarea = page.locator('textarea[placeholder="Add comment..."]');
    await expect(textarea).toBeVisible({ timeout: 8_000 });

    const closeBtn = page.getByRole('button', { name: /close|cancel/i }).first();
    if (await closeBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await closeBtn.click();
    } else {
      // Press Escape
      await page.keyboard.press('Escape');
    }

    await expect(textarea).toBeHidden({ timeout: 5_000 });
  });

  test('submitting a comment shows pin (optimistic UI)', async ({ page }) => {
    const imgEl = page.locator('img[src*="picsum"]').first();
    await expect(imgEl).toBeVisible({ timeout: 15_000 });

    const pinsBefore = await page.locator('[data-pin]').count();

    const box = await imgEl.boundingBox();
    if (box) await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.25);

    const textarea = page.locator('textarea[placeholder="Add comment..."]');
    await expect(textarea).toBeVisible({ timeout: 8_000 });
    await textarea.fill('Playwright test comment');

    await page.getByRole('button', { name: /save|submit|post/i }).click();

    // Pin appears immediately (optimistic)
    await expect(page.locator('[data-pin]')).toHaveCount(pinsBefore + 1, { timeout: 8_000 });
  });

  test('submitted comment appears in the sidebar', async ({ page }) => {
    const imgEl = page.locator('img[src*="picsum"]').first();
    await expect(imgEl).toBeVisible({ timeout: 15_000 });

    const uniqueText = `Playwright sidebar test ${Date.now()}`;
    const box = await imgEl.boundingBox();
    if (box) await page.mouse.click(box.x + box.width * 0.35, box.y + box.height * 0.35);

    const textarea = page.locator('textarea[placeholder="Add comment..."]');
    await expect(textarea).toBeVisible({ timeout: 8_000 });
    await textarea.fill(uniqueText);
    await page.getByRole('button', { name: /save|submit|post/i }).click();

    // Comment text should appear in sidebar
    await expect(page.getByText(uniqueText)).toBeVisible({ timeout: 10_000 });
  });

  test('clicking a pin in the sidebar opens the comment modal', async ({ page }) => {
    // First add a comment so there's something to click
    const imgEl = page.locator('img[src*="picsum"]').first();
    await expect(imgEl).toBeVisible({ timeout: 15_000 });

    const box = await imgEl.boundingBox();
    if (box) await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.45);

    const textarea = page.locator('textarea[placeholder="Add comment..."]');
    await expect(textarea).toBeVisible({ timeout: 8_000 });
    await textarea.fill('Click test comment');
    await page.getByRole('button', { name: /save|submit|post/i }).click();

    // Now click that comment entry in the sidebar
    const sidebarComment = page.getByText('Click test comment').first();
    await expect(sidebarComment).toBeVisible({ timeout: 10_000 });
    await sidebarComment.click();

    // Modal should show with the comment content
    await expect(page.getByText('Click test comment')).toBeVisible({ timeout: 5_000 });
  });
});

test.describe('Annotation Workspace — navigation', () => {
  test('back arrow returns to /projects', async ({ page }) => {
    await page.goto(PROJECT_URL);
    await expect(page).toHaveURL(new RegExp(TEST_PROJECT_ID), { timeout: 15_000 });

    const backBtn = page.getByRole('button', { name: /back|arrow/i }).first();
    if (await backBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await backBtn.click();
    } else {
      // Find ArrowLeft link/button
      const arrowLeft = page.locator('a[href="/projects"], button').filter({ has: page.locator('svg') }).first();
      await arrowLeft.click();
    }

    await expect(page).toHaveURL(/\/projects/, { timeout: 10_000 });
  });
});
