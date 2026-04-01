import { test as setup, expect } from '@playwright/test';

/**
 * Global auth setup — signs in once and saves browser state for all tests.
 *
 * Prerequisites:
 *   A test user must exist in the database with these credentials.
 *   Set TEST_USER_EMAIL and TEST_USER_PASSWORD env vars, or the defaults below are used.
 */
const TEST_EMAIL = process.env.TEST_USER_EMAIL || 'test@exposeprofi.com';
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD || 'testpassword123';

setup('authenticate', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(TEST_EMAIL);
  await page.getByLabel('Password').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Wait for redirect to /projects (dashboard)
  await expect(page).toHaveURL(/\/projects/, { timeout: 15_000 });

  // Save signed-in state
  await page.context().storageState({ path: 'e2e/.auth/user.json' });
});
