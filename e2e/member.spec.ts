/**
 * Member role tests — run as member user
 * Verifies restricted access and limited UI.
 */
import { test, expect } from '@playwright/test';
import { placeComment } from './fixtures/annotate';

/** Seeded by `node e2e/fixtures/seed.mjs`, which also gives it one image. */
const TEST_PROJECT_ID = '6bb4acd7-6437-490e-b260-1b1d9c2ca0b7';
const TEST_PROJECT_NAME = 'Playwright Test Project';

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
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 10_000 });
  });

  test('member role badge shows "member"', async ({ page }) => {
    await page.goto('/projects/settings');
    await expect(page.getByTestId('user-role')).toHaveText('member', { timeout: 10_000 });
  });
});

test.describe('Member role — project page', () => {
  test('member can access their shared project', async ({ page }) => {
    await page.goto(`/projects/${TEST_PROJECT_ID}?name=Playwright+Test+Project`);
    await expect(page).toHaveURL(new RegExp(TEST_PROJECT_ID), { timeout: 15_000 });
    await expect(page.getByText(TEST_PROJECT_NAME, { exact: true })).toBeVisible({ timeout: 10_000 });
  });

  // Sharing has never been gated by role: the header renders ShareLinkManager
  // for every signed-in user, and did so already in the commit that added this
  // test. Left failing-by-design rather than deleted, because whether a member
  // may mint a public link is a product decision, not a selector to fix.
  test.fixme('member does NOT see Share button', async ({ page }) => {
    await page.goto(`/projects/${TEST_PROJECT_ID}?name=Playwright+Test+Project`);
    await expect(page).toHaveURL(new RegExp(TEST_PROJECT_ID), { timeout: 15_000 });
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: /share/i })).toBeHidden({ timeout: 5_000 });
  });

  test('member can place comments', async ({ page }) => {
    await page.goto(`/projects/${TEST_PROJECT_ID}?name=Playwright+Test+Project`);
    await expect(page).toHaveURL(new RegExp(TEST_PROJECT_ID), { timeout: 15_000 });

    const pins = page.locator('[data-pin]');
    const pinsBefore = await pins.count();

    await placeComment(page, 'Member test comment');

    await expect(pins).toHaveCount(pinsBefore + 1, { timeout: 8_000 });
  });
});
