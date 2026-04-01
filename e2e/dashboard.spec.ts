import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test('renders the projects page', async ({ page }) => {
    await page.goto('/projects');
    await expect(page.getByText('Projects')).toBeVisible();
  });

  test('shows project list or empty state', async ({ page }) => {
    await page.goto('/projects');

    // Wait for loading to finish (spinner disappears)
    await expect(page.locator('.animate-spin')).toBeHidden({ timeout: 15_000 });

    // Either project cards are visible or the empty state is
    const projectCards = page.locator('[class*="grid"] > div');
    const emptyState = page.getByText(/no projects/i);

    const hasProjects = await projectCards.first().isVisible().catch(() => false);
    const hasEmptyState = await emptyState.isVisible().catch(() => false);

    expect(hasProjects || hasEmptyState).toBe(true);
  });

  test('project cards show title and stats', async ({ page }) => {
    await page.goto('/projects');
    await expect(page.locator('.animate-spin')).toBeHidden({ timeout: 15_000 });

    const firstCard = page.locator('[class*="grid"] > div').first();
    if (await firstCard.isVisible().catch(() => false)) {
      // Card should have a title (h3)
      await expect(firstCard.locator('h3')).toBeVisible();
      // Card should have "Updated" timestamp
      await expect(firstCard.getByText(/updated/i)).toBeVisible();
    }
  });

  test('search input is visible', async ({ page }) => {
    await page.goto('/projects');
    await expect(page.getByPlaceholder(/search project/i)).toBeVisible();
  });
});
