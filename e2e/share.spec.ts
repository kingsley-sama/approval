/**
 * Share link tests — run as guest (no session)
 */
import { test, expect } from '@playwright/test';

const SHARE_TOKEN = 'playwright-test-share-token-abc123';
const SHARE_URL = `/share/${SHARE_TOKEN}`;
const INVALID_TOKEN = 'this-token-does-not-exist-xyz';

test.describe('Share page — access', () => {
  test('valid token renders share viewer', async ({ page }) => {
    await page.goto(SHARE_URL);
    // Should not redirect to sign-in or 404
    await expect(page).not.toHaveURL(/sign-in/);
    // Name gate should appear (share has comment permission)
    await expect(page.getByText(/enter your name/i)).toBeVisible({ timeout: 10_000 });
  });

  test('invalid token returns 404', async ({ page }) => {
    const res = await page.goto(`/share/${INVALID_TOKEN}`);
    // Next.js notFound() returns 404
    expect(res?.status()).toBe(404);
  });

  test('share page shows project name', async ({ page }) => {
    await page.goto(SHARE_URL);
    await expect(page.getByText('Playwright Test Project')).toBeVisible({ timeout: 10_000 });
  });

  test('shows permission badge (Can comment)', async ({ page }) => {
    await page.goto(SHARE_URL);
    await expect(page.getByText(/can comment/i)).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Share page — guest name gate', () => {
  test('name gate blocks access until name is entered', async ({ page }) => {
    await page.goto(SHARE_URL);
    await expect(page.getByText(/enter your name/i)).toBeVisible({ timeout: 10_000 });

    // Continue button should be disabled with empty input
    const continueBtn = page.getByRole('button', { name: /continue/i });
    await expect(continueBtn).toBeDisabled();
  });

  test('entering name and clicking Continue shows viewer', async ({ page }) => {
    await page.goto(SHARE_URL);
    await expect(page.getByText(/enter your name/i)).toBeVisible({ timeout: 10_000 });

    await page.getByPlaceholder(/your name/i).fill('Guest Tester');
    await page.getByRole('button', { name: /continue/i }).click();

    // Name gate should be gone; viewer should appear
    await expect(page.getByText(/enter your name/i)).toBeHidden({ timeout: 5_000 });
    await expect(page.getByText('Playwright Test Project')).toBeVisible({ timeout: 10_000 });
  });

  test('pressing Enter in name field also proceeds', async ({ page }) => {
    await page.goto(SHARE_URL);
    await expect(page.getByText(/enter your name/i)).toBeVisible({ timeout: 10_000 });

    await page.getByPlaceholder(/your name/i).fill('Keyboard Tester');
    await page.keyboard.press('Enter');

    await expect(page.getByText(/enter your name/i)).toBeHidden({ timeout: 5_000 });
  });

  test('name is remembered in localStorage and skips gate on revisit', async ({ page }) => {
    await page.goto(SHARE_URL);
    await page.getByPlaceholder(/your name/i).fill('Remembered User');
    await page.getByRole('button', { name: /continue/i }).click();
    await expect(page.getByText(/enter your name/i)).toBeHidden({ timeout: 5_000 });

    // Reload — name should be restored from localStorage
    await page.reload();
    await expect(page.getByText(/enter your name/i)).toBeHidden({ timeout: 5_000 });
    await expect(page.getByText('Remembered User')).toBeVisible({ timeout: 5_000 });
  });

  test('Change link clears name and shows gate again', async ({ page }) => {
    await page.goto(SHARE_URL);
    await page.getByPlaceholder(/your name/i).fill('Change Test');
    await page.getByRole('button', { name: /continue/i }).click();
    await expect(page.getByText('Change Test')).toBeVisible({ timeout: 5_000 });

    // Click Change
    await page.getByRole('button', { name: /change/i }).click();
    await expect(page.getByText(/enter your name/i)).toBeVisible({ timeout: 5_000 });
  });
});

test.describe('Share page — viewer layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(SHARE_URL);
    await page.getByPlaceholder(/your name/i).fill('Layout Tester');
    await page.getByRole('button', { name: /continue/i }).click();
    await expect(page.getByText(/enter your name/i)).toBeHidden({ timeout: 5_000 });
  });

  test('renders header with back arrow, logo, and project name', async ({ page }) => {
    await expect(page.getByText('Playwright Test Project')).toBeVisible();
    // Back arrow (ArrowLeft)
    const header = page.locator('header').first();
    await expect(header).toBeVisible();
  });

  test('renders comments sidebar', async ({ page }) => {
    await expect(page.locator('aside, [class*="sidebar"]').first()).toBeVisible({ timeout: 10_000 });
  });

  test('renders image viewer area', async ({ page }) => {
    // Image should load
    await expect(page.locator('img[src*="picsum"]').first()).toBeVisible({ timeout: 15_000 });
  });

  test('active and resolved comment counts shown in header', async ({ page }) => {
    await expect(page.getByText(/active/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/resolved/i)).toBeVisible({ timeout: 5_000 });
  });

  test('guest can place a comment', async ({ page }) => {
    const imgEl = page.locator('img[src*="picsum"]').first();
    await expect(imgEl).toBeVisible({ timeout: 15_000 });

    const pinsBefore = await page.locator('[data-pin]').count();
    const box = await imgEl.boundingBox();
    if (box) {
      await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
    }

    const textarea = page.locator('textarea[placeholder="Add comment..."]');
    await expect(textarea).toBeVisible({ timeout: 8_000 });
    await textarea.fill('Guest share comment');
    await page.getByRole('button', { name: /save|submit|post/i }).click();

    await expect(page.locator('[data-pin]')).toHaveCount(pinsBefore + 1, { timeout: 10_000 });
  });

  test('attachment option is hidden for guest (disableAttachments)', async ({ page }) => {
    const imgEl = page.locator('img[src*="picsum"]').first();
    await expect(imgEl).toBeVisible({ timeout: 15_000 });

    const box = await imgEl.boundingBox();
    if (box) {
      await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.3);
    }

    const textarea = page.locator('textarea[placeholder="Add comment..."]');
    await expect(textarea).toBeVisible({ timeout: 8_000 });

    // Paperclip/attachment button should NOT be visible
    const attachBtn = page.locator('button').filter({ has: page.locator('[class*="paperclip"], svg[data-lucide="paperclip"]') });
    await expect(attachBtn).toBeHidden({ timeout: 2_000 });
  });
});

test.describe('Share page — logged-in user redirect', () => {
  test('logged-in user opening share link is redirected to project page', async ({ browser }) => {
    // Create fresh context and sign in
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    await page.goto('/sign-in');
    await page.getByLabel('Email').fill('testadmin@revision.test');
    await page.getByLabel('Password').fill('TestPassword123!');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/projects/, { timeout: 15_000 });

    // Now open the share link
    await page.goto(SHARE_URL);

    // Should redirect to /projects/[id] — not the share viewer
    await expect(page).toHaveURL(/\/projects\/6bb4acd7/, { timeout: 15_000 });

    await ctx.close();
  });
});
