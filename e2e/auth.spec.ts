/**
 * Authentication tests — run as guest (no session)
 */
import { test, expect } from '@playwright/test';

const ADMIN_EMAIL = 'testadmin@revision.test';
const MEMBER_EMAIL = 'testmember@revision.test';
const PASSWORD = 'TestPassword123!';

test.describe('Auth — unauthenticated redirects', () => {
  test('GET /projects redirects to /sign-in', async ({ page }) => {
    await page.goto('/projects');
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test('GET /projects/some-id redirects to /sign-in', async ({ page }) => {
    await page.goto('/projects/00000000-0000-0000-0000-000000000000');
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test('/share/[token] is publicly accessible without login', async ({ page }) => {
    // Invalid token returns 404, but a valid token should not redirect to sign-in
    const res = await page.goto('/share/playwright-test-share-token-abc123');
    // Should NOT redirect to sign-in
    expect(page.url()).not.toMatch(/sign-in/);
  });
});

test.describe('Auth — sign-in page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/sign-in');
  });

  test('renders sign-in form', async ({ page }) => {
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });

  test('shows error with wrong password', async ({ page }) => {
    await page.getByLabel('Email').fill(ADMIN_EMAIL);
    await page.getByLabel('Password').fill('wrongpassword');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/sign-in/);
    await expect(page.locator('.text-destructive, [role="alert"]')).toBeVisible({ timeout: 8_000 });
  });

  test('shows error with unknown email', async ({ page }) => {
    await page.getByLabel('Email').fill('nobody@nowhere.test');
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/sign-in/);
    await expect(page.locator('.text-destructive, [role="alert"]')).toBeVisible({ timeout: 8_000 });
  });

  test('admin sign-in redirects to /projects', async ({ page }) => {
    await page.getByLabel('Email').fill(ADMIN_EMAIL);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/projects/, { timeout: 15_000 });
  });

  test('member sign-in redirects to /projects', async ({ page }) => {
    await page.getByLabel('Email').fill(MEMBER_EMAIL);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/projects/, { timeout: 15_000 });
  });
});

test.describe('Auth — sign-up page', () => {
  test('renders sign-up form', async ({ page }) => {
    await page.goto('/sign-up');
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: /sign up|create|register/i })).toBeVisible();
  });

  test('shows error when signing up with existing email', async ({ page }) => {
    await page.goto('/sign-up');
    await page.getByLabel('Email').fill(ADMIN_EMAIL);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: /sign up|create|register/i }).click();
    await expect(page.locator('.text-destructive, [role="alert"]')).toBeVisible({ timeout: 8_000 });
  });
});

test.describe('Auth — session refresh', () => {
  test('sign-in page redirects logged-in users to /projects', async ({ browser }) => {
    // Create a fresh context, sign in, then verify /sign-in redirects away
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto('/sign-in');
    await page.getByLabel('Email').fill(ADMIN_EMAIL);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/projects/, { timeout: 15_000 });

    // Now revisit sign-in — should bounce back to projects
    await page.goto('/sign-in');
    await expect(page).toHaveURL(/\/projects/);
    await ctx.close();
  });
});
