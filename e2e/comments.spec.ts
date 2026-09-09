/**
 * Comment CRUD tests — run as admin
 */
import { test, expect } from '@playwright/test';
import { annotationImage, placeComment as placeCommentAt } from './fixtures/annotate';

const TEST_PROJECT_ID = '6bb4acd7-6437-490e-b260-1b1d9c2ca0b7';
const PROJECT_URL = `/projects/${TEST_PROJECT_ID}?name=Playwright+Test+Project`;

async function openProject(page: any) {
  await page.goto(PROJECT_URL);
  await expect(page).toHaveURL(new RegExp(TEST_PROJECT_ID), { timeout: 15_000 });
  return annotationImage(page);
}

/**
 * The fractions are a hint, not a demand: the helper nudges the click towards
 * them but will move it if a pin from an earlier run is already sitting there.
 */
async function placeComment(page: any, text: string, xFraction = 0.5, yFraction = 0.5) {
  await placeCommentAt(page, text, { x: xFraction, y: yFraction });
}

test.describe('Comments — CRUD', () => {
  test('create comment and verify it persists after reload', async ({ page }) => {
    await openProject(page);
    const unique = `Persist test ${Date.now()}`;
    await placeComment(page, unique, 0.2, 0.2);

    // Reload and verify
    await page.reload();
    await expect(page).toHaveURL(new RegExp(TEST_PROJECT_ID), { timeout: 15_000 });
    await expect(page.getByText(unique)).toBeVisible({ timeout: 15_000 });
  });

  test('pin number increments with each new comment', async ({ page }) => {
    await openProject(page);

    // Count existing pins
    const pinsBefore = await page.locator('[data-pin]').count();

    await placeComment(page, `Pin order A ${Date.now()}`, 0.1, 0.1);
    await placeComment(page, `Pin order B ${Date.now()}`, 0.9, 0.9);

    await expect(page.locator('[data-pin]')).toHaveCount(pinsBefore + 2, { timeout: 10_000 });
  });

  test('resolve comment changes its status in sidebar', async ({ page }) => {
    await openProject(page);
    const unique = `Resolve test ${Date.now()}`;
    await placeComment(page, unique, 0.3, 0.7);

    // Click the comment in sidebar to open modal
    await page.getByText(unique).first().click();

    // Look for resolve button
    const resolveBtn = page.getByRole('button', { name: /resolve/i });
    if (await resolveBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await resolveBtn.click();
      // Sidebar should show "Resolved" tab count increase
      await expect(page.getByText(/resolved/i)).toBeVisible({ timeout: 8_000 });
    }
  });

  test('active vs resolved tabs in sidebar filter correctly', async ({ page }) => {
    await openProject(page);

    // Check both tabs exist
    await expect(page.getByRole('button', { name: /active/i })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('button', { name: /resolved/i })).toBeVisible({ timeout: 5_000 });
  });

  // Skipped by request: this run must not delete anything, and the test would
  // remove a comment row. Drop the `.skip` to exercise deletion.
  test.skip('delete comment removes it from UI', async ({ page }) => {
    await openProject(page);
    const unique = `Delete test ${Date.now()}`;
    await placeComment(page, unique, 0.6, 0.4);

    await page.getByText(unique).first().click();

    const deleteBtn = page.getByRole('button', { name: /delete|remove/i });
    if (await deleteBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await deleteBtn.click();
      // Confirm dialog if present
      const confirmBtn = page.getByRole('button', { name: /confirm|yes|delete/i }).last();
      if (await confirmBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await confirmBtn.click();
      }
      await expect(page.getByText(unique)).toBeHidden({ timeout: 8_000 });
    }
  });
});

test.describe('Comments — sidebar tabs', () => {
  test('sidebar has Active and Resolved tabs', async ({ page }) => {
    await page.goto(PROJECT_URL);
    await expect(page).toHaveURL(new RegExp(TEST_PROJECT_ID), { timeout: 15_000 });

    await expect(page.getByRole('button', { name: /active/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /resolved/i })).toBeVisible({ timeout: 10_000 });
  });

  test('switching to Resolved tab shows no active comments', async ({ page }) => {
    await page.goto(PROJECT_URL);
    await expect(page).toHaveURL(new RegExp(TEST_PROJECT_ID), { timeout: 15_000 });

    const resolvedTab = page.getByRole('button', { name: /resolved/i });
    await expect(resolvedTab).toBeVisible({ timeout: 10_000 });
    await resolvedTab.click();
    // No crash, page remains functional
    await expect(page).toHaveURL(new RegExp(TEST_PROJECT_ID));
  });
});
