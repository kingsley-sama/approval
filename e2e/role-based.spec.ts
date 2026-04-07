/**
 * Role-based UI tests — run as admin
 * Verifies that admin-only features are present for admin users.
 */
import { test, expect } from '@playwright/test';

const TEST_PROJECT_ID = '6bb4acd7-6437-490e-b260-1b1d9c2ca0b7';

test.describe('Admin role — dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/projects');
    await expect(page.locator('.animate-spin')).toBeHidden({ timeout: 15_000 });
  });

  test('admin sees Team link in sidebar', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Team' })).toBeVisible();
  });

  test('admin sees Archive link in sidebar', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Archive' })).toBeVisible();
  });

  test('admin project card shows More / action menu', async ({ page }) => {
    const card = page.locator('[class*="grid"] > div, [class*="card"]')
      .filter({ hasText: 'Playwright Test Project' })
      .first();
    await card.hover();
    // Admin should see extra controls (not just "Open")
    const moreBtn = card.locator('button').filter({ hasNotText: /^Open$/i }).first();
    await expect(moreBtn).toBeVisible({ timeout: 3_000 });
  });

  test('Team page is accessible to admin', async ({ page }) => {
    await page.goto('/projects/team');
    await expect(page).not.toHaveURL(/sign-in/);
    await expect(page.getByText(/team/i)).toBeVisible({ timeout: 10_000 });
  });

  test('Team page shows member list', async ({ page }) => {
    await page.goto('/projects/team');
    // Should show at least the test users
    await expect(page.getByText(/@revision\.test|testadmin|testmember/i)).toBeVisible({ timeout: 10_000 });
  });

  test('Archive page is accessible to admin', async ({ page }) => {
    await page.goto('/projects/archive');
    await expect(page).not.toHaveURL(/sign-in/);
    await expect(page.getByText(/archive/i)).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Admin role — project page', () => {
  test('admin sees Share button in project nav', async ({ page }) => {
    await page.goto(`/projects/${TEST_PROJECT_ID}?name=Playwright+Test+Project`);
    await expect(page).toHaveURL(new RegExp(TEST_PROJECT_ID), { timeout: 15_000 });
    await expect(page.getByRole('button', { name: /share/i })).toBeVisible({ timeout: 10_000 });
  });

  test('admin can open ShareLinkManager', async ({ page }) => {
    await page.goto(`/projects/${TEST_PROJECT_ID}?name=Playwright+Test+Project`);
    await expect(page).toHaveURL(new RegExp(TEST_PROJECT_ID), { timeout: 15_000 });

    const shareBtn = page.getByRole('button', { name: /share/i });
    await expect(shareBtn).toBeVisible({ timeout: 10_000 });
    await shareBtn.click();

    // Dialog/popover should open
    await expect(page.getByText(/link|permission|copy/i)).toBeVisible({ timeout: 5_000 });
  });
});

test.describe('Settings page', () => {
  test('profile section shows name and email', async ({ page }) => {
    await page.goto('/projects/settings');
    await expect(page.getByText(/profile/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByPlaceholder(/your name/i)).toBeVisible();
    // Email should show testadmin
    await expect(page.locator('input[disabled]')).toBeVisible();
  });

  test('role badge shows "admin"', async ({ page }) => {
    await page.goto('/projects/settings');
    await expect(page.getByText(/admin/i)).toBeVisible({ timeout: 10_000 });
  });

  test('security tab renders password fields', async ({ page }) => {
    await page.goto('/projects/settings');
    await page.getByRole('button', { name: /security/i }).click();
    await expect(page.getByPlaceholder('••••••••')).toBeVisible({ timeout: 5_000 });
  });

  test('notifications tab renders checkboxes', async ({ page }) => {
    await page.goto('/projects/settings');
    await page.getByRole('button', { name: /notifications/i }).click();
    await expect(page.locator('input[type="checkbox"]')).toBeVisible({ timeout: 5_000 });
  });

  test('appearance tab renders theme options', async ({ page }) => {
    await page.goto('/projects/settings');
    await page.getByRole('button', { name: /appearance/i }).click();
    await expect(page.getByText(/light/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/dark/i)).toBeVisible({ timeout: 5_000 });
  });
});
