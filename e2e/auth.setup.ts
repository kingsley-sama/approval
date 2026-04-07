import { test as setup, expect } from '@playwright/test';
import path from 'path';

const ADMIN_EMAIL = 'testadmin@revision.test';
const MEMBER_EMAIL = 'testmember@revision.test';
const PASSWORD = 'TestPassword123!';

async function signIn(page: any, email: string, password: string, storePath: string) {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  // Auth action redirects to '/' which middleware then bounces to '/projects'
  await expect(page).toHaveURL(/\/(projects)?$/, { timeout: 15_000 });
  // Ensure we land on /projects (follow any secondary redirect)
  if (!page.url().includes('/projects')) {
    await page.goto('/projects');
    await expect(page).toHaveURL(/\/projects/, { timeout: 10_000 });
  }
  await page.context().storageState({ path: storePath });
}

setup('authenticate as admin', async ({ page }) => {
  await signIn(page, ADMIN_EMAIL, PASSWORD, 'e2e/.auth/admin.json');
});

setup('authenticate as member', async ({ page }) => {
  await signIn(page, MEMBER_EMAIL, PASSWORD, 'e2e/.auth/member.json');
});
