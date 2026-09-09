import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 1,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'admin',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/admin.json',
      },
      dependencies: ['setup'],
      testMatch: /(admin|dashboard|annotation|comments|role-based)\.spec\.ts$/,
    },
    {
      name: 'member',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/member.json',
      },
      dependencies: ['setup'],
      testMatch: /member\.spec\.ts/,
    },
    {
      name: 'guest',
      use: {
        ...devices['Desktop Chrome'],
        storageState: { cookies: [], origins: [] },
      },
      dependencies: ['setup'],
      testMatch: /(auth|share|guest)\.spec\.ts$/,
    },
    {
      // Website review, guest surface. No `setup` dependency on purpose: these
      // paths are the ones a client uses without an account, so they must be
      // runnable in a checkout that has no test users seeded.
      name: 'website',
      use: {
        ...devices['Desktop Chrome'],
        storageState: { cookies: [], origins: [] },
        // These navigations fetch a whole third-party page through the proxy
        // and wait for it to settle. The default 30s is enough against a warm
        // dev server and not enough against a cold one, which showed up as the
        // suite passing alone and failing as part of a full run.
        navigationTimeout: 90_000,
        actionTimeout: 30_000,
      },
      timeout: 150_000,
      testMatch: /website\.spec\.ts/,
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
