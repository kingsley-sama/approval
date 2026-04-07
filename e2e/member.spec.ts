/**
 * Member role tests — run as member user
 * Verifies restricted access and limited UI.
 */
import { test, expect } from '@playwright/test';

const TEST_PROJECT_ID = '6bb4acd7-6437-490e-b260-1b1d9c2ca0b7';

test.describe('Member role — sidebar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/projects');
    await expect(page.locator('.animate-spin')).toBeHidden({ timeout: 15_000 });
  });

  test('member does NOT see Team link', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Team' })).toBeHidden({ timeout: 5_000 });
  });

  test('member does NOT see Archive link', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Archive' })).toBeHidden({ timeout: 5_000 });
  });

  test('member sees Projects and Settings links', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Projects' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible();
  });
});

test.describe('Member role — access control', () => {
  test('Team page redirects member to /projects', async ({ page }) => {
    await page.goto('/projects/team');
    await expect(page).toHaveURL(/\/projects$/, { timeout: 10_000 });
  });

  test('Archive page redirects member to /projects', async ({ page }) => {
    await page.goto('/projects/archive');
    await expect(page).toHaveURL(/\/projects$/, { timeout: 10_000 });
  });

  test('Settings page is accessible to member', async ({ page }) => {
    await page.goto('/projects/settings');
    await expect(page).not.toHaveURL(/sign-in/);
    await expect(page.getByText(/settings/i)).toBeVisible({ timeout: 10_000 });
  });

  test('member role badge shows "member"', async ({ page }) => {
    await page.goto('/projects/settings');
    await expect(page.getByText(/member/i)).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Member role — project page', () => {
  test('member can access their shared project', async ({ page }) => {
    await page.goto(`/projects/${TEST_PROJECT_ID}?name=Playwright+Test+Project`);
    await expect(page).toHaveURL(new RegExp(TEST_PROJECT_ID), { timeout: 15_000 });
    await expect(page.getByText('Playwright Test Project')).toBeVisible({ timeout: 10_000 });
  });

  test('member does NOT see Share button', async ({ page }) => {
    await page.goto(`/projects/${TEST_PROJECT_ID}?name=Playwright+Test+Project`);
    await expect(page).toHaveURL(new RegExp(TEST_PROJECT_ID), { timeout: 15_000 });
    // Wait for page to fully load
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: /share/i })).toBeHidden({ timeout: 5_000 });
  });

  test('member can place comments', async ({ page }) => {
    await page.goto(`/projects/${TEST_PROJECT_ID}?name=Playwright+Test+Project`);
    await expect(page).toHaveURL(new RegExp(TEST_PROJECT_ID), { timeout: 15_000 });

    const imgEl = page.locator('img[src*="picsum"]').first();
    await expect(imgEl).toBeVisible({ timeout: 15_000 });

    const pinsBefore = await page.locator('[data-pin]').count();
    const box = await imgEl.boundingBox();
    if (box) {
      await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.55);
    }

    const textarea = page.locator('textarea[placeholder="Add comment..."]');
    await expect(textarea).toBeVisible({ timeout: 8_000 });
    await textarea.fill('Member test comment');
    await page.getByRole('button', { name: /save|submit|post/i }).click();

    await expect(page.locator('[data-pin]')).toHaveCount(pinsBefore + 1, { timeout: 8_000 });
  });
});
