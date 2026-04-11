/**
 * Playwright config for comprehensive E2E suite.
 * Starts/reuses the frontend (8086) and assumes the backend (3004) is already running.
 */
import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(import.meta.dirname, '../../.env.test') });

export default defineConfig({
  testDir: '.',
  testMatch: process.env.TEST_MATCH || 'twinme-comprehensive.spec.ts',
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
    actionTimeout: 45000,
    navigationTimeout: 30000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:8086',
    reuseExistingServer: true,
    timeout: 120 * 1000,
  },
});
