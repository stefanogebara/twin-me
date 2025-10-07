import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Configuration for Twin AI Learn
 * Tests the entire Soul Signature platform with authentication support
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',

  use: {
    baseURL: 'http://localhost:8086',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    // Setup project - runs authentication before tests
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },

    // Chromium tests with authentication
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Use authenticated state from setup
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:8086',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
