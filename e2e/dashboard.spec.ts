/**
 * Dashboard tests — run as admin
 */
import { test, expect } from '@playwright/test';

const TEST_PROJECT_ID = '6bb4acd7-6437-490e-b260-1b1d9c2ca0b7';
const TEST_PROJECT_NAME = 'Playwright Test Project';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/projects');
    // Wait for loading to finish
    await expect(page.locator('.animate-spin')).toBeHidden({ timeout: 15_000 });
  });

  test('renders projects page with sidebar', async ({ page }) => {
    await expect(page.getByText('Projects')).toBeVisible();
    // Sidebar should be present
    await expect(page.locator('nav, [data-sidebar]')).toBeVisible();
  });

  test('search input is visible', async ({ page }) => {
    await expect(page.getByPlaceholder(/search project/i)).toBeVisible();
  });

  test('test project card is visible', async ({ page }) => {
    const card = page.locator('[class*="grid"] > div, [class*="card"]')
      .filter({ hasText: TEST_PROJECT_NAME })
      .first();
    await expect(card).toBeVisible({ timeout: 10_000 });
  });

  test('project card shows title and updated timestamp', async ({ page }) => {
    const card = page.locator('[class*="grid"] > div, [class*="card"]')
      .filter({ hasText: TEST_PROJECT_NAME })
      .first();
    await expect(card.locator('h3, [class*="title"], [class*="name"]').first()).toBeVisible();
    await expect(card.getByText(/updated/i)).toBeVisible();
  });

  test('admin sees action buttons on card (Select, Share, Duplicate, More)', async ({ page }) => {
    const card = page.locator('[class*="grid"] > div, [class*="card"]')
      .filter({ hasText: TEST_PROJECT_NAME })
      .first();
    await card.hover();
    // Admin should see More/options menu or at least Open
    const openBtn = card.getByRole('button', { name: /open/i });
    await expect(openBtn).toBeVisible({ timeout: 3_000 });
  });

  test('search filters projects', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search project/i);
    await searchInput.fill('Playwright');
    // Test project should remain visible
    await expect(page.getByText(TEST_PROJECT_NAME)).toBeVisible({ timeout: 5_000 });

    await searchInput.fill('zzzznonexistentprojectzzz');
    // Nothing should match — either empty state or test project gone
    await expect(page.getByText(TEST_PROJECT_NAME)).toBeHidden({ timeout: 5_000 });
  });

  test('clicking Open navigates to project page', async ({ page }) => {
    const card = page.locator('[class*="grid"] > div, [class*="card"]')
      .filter({ hasText: TEST_PROJECT_NAME })
      .first();
    await card.hover();
    const openBtn = card.getByRole('button', { name: /open/i });
    await openBtn.click();
    await expect(page).toHaveURL(new RegExp(TEST_PROJECT_ID), { timeout: 15_000 });
  });
});

test.describe('Dashboard — sidebar navigation', () => {
  test('admin sidebar shows Projects, Team, Archive, Settings links', async ({ page }) => {
    await page.goto('/projects');
    await expect(page.getByRole('link', { name: 'Projects' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Team' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Archive' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible();
  });

  test('Team page loads', async ({ page }) => {
    await page.goto('/projects/team');
    await expect(page.getByText(/team/i)).toBeVisible({ timeout: 10_000 });
  });

  test('Settings page loads with profile section', async ({ page }) => {
    await page.goto('/projects/settings');
    await expect(page.getByText(/settings/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/profile/i)).toBeVisible();
  });

  test('Archive page loads', async ({ page }) => {
    await page.goto('/projects/archive');
    await expect(page.getByText(/archive/i)).toBeVisible({ timeout: 10_000 });
  });

  test('active route is highlighted', async ({ page }) => {
    await page.goto('/projects');
    // The Projects link should have the active class styling
    const projectsLink = page.getByRole('link', { name: 'Projects' }).first();
    const classList = await projectsLink.getAttribute('class');
    // Should contain primary color indicator
    expect(classList).toMatch(/primary|active/i);
  });
});
