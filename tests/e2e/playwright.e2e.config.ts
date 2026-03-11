/**
 * Playwright config for comprehensive E2E suite.
 * Assumes both frontend (8086) and backend (3004) are already running.
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'twinme-comprehensive.spec.ts',
  fullyParallel: false,
  retries: 1,
  workers: 1,
  timeout: 60000,
  reporter: [
    ['html', { outputFolder: '../../playwright-report-e2e', open: 'never' }],
    ['list'],
  ],
  use: {
    baseURL: 'http://localhost:8086',
    trace: 'on-first-retry',
    screenshot: 'on',
    video: 'off',
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Do NOT start a webServer — both servers are already running
});
