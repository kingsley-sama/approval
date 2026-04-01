import { test, expect } from '@playwright/test';

const TEST_EMAIL = process.env.TEST_USER_EMAIL || 'test@exposeprofi.com';
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD || 'testpassword123';

test.describe('Authentication', () => {
  test.describe('unauthenticated', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test('redirects /projects to /sign-in when not authenticated', async ({ page }) => {
      await page.goto('/projects');
      await expect(page).toHaveURL(/\/sign-in/);
    });

    test('sign-in page renders correctly', async ({ page }) => {
      await page.goto('/sign-in');
      await expect(page.getByText('Welcome back')).toBeVisible();
      await expect(page.getByLabel('Email')).toBeVisible();
      await expect(page.getByLabel('Password')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
    });

    test('login with invalid credentials shows error', async ({ page }) => {
      await page.goto('/sign-in');
      await page.getByLabel('Email').fill('wrong@email.com');
      await page.getByLabel('Password').fill('wrongpassword');
      await page.getByRole('button', { name: 'Sign in' }).click();

      // Should stay on sign-in page and show error
      await expect(page).toHaveURL(/\/sign-in/);
      await expect(page.locator('.text-destructive')).toBeVisible({ timeout: 10_000 });
    });

    test('login with valid credentials redirects to dashboard', async ({ page }) => {
      await page.goto('/sign-in');
      await page.getByLabel('Email').fill(TEST_EMAIL);
      await page.getByLabel('Password').fill(TEST_PASSWORD);
      await page.getByRole('button', { name: 'Sign in' }).click();

      await expect(page).toHaveURL(/\/projects/, { timeout: 15_000 });
    });
  });

  test.describe('authenticated', () => {
    test('logout clears session and redirects', async ({ page }) => {
      await page.goto('/projects');
      await expect(page).toHaveURL(/\/projects/);

      // Find and click the logout button in the sidebar
      const logoutButton = page.getByRole('button', { name: /log\s?out|sign\s?out/i });
      if (await logoutButton.isVisible()) {
        await logoutButton.click();
      } else {
        // Try finding it via the sidebar menu or dropdown
        const sidebarLogout = page.locator('button:has(svg), a:has(svg)').filter({ hasText: /log|sign.*out/i });
        if (await sidebarLogout.first().isVisible()) {
          await sidebarLogout.first().click();
        }
      }

      // After logout, navigating to /projects should redirect to sign-in
      await page.goto('/projects');
      await expect(page).toHaveURL(/\/sign-in/);
    });
  });
});
