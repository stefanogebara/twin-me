/**
 * Playwright config for production E2E testing.
 * Points to https://twin-ai-learn.vercel.app — no local server needed.
 */
import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(import.meta.dirname, '../../.env.prod.test') });

export default defineConfig({
  testDir: '.',
  testMatch: process.env.TEST_MATCH || 'twinme-comprehensive.spec.ts',
  fullyParallel: false,
  retries: 1,
  workers: 1,
  timeout: 90000,
  reporter: [
    ['html', { outputFolder: '../../playwright-report-prod', open: 'never' }],
    ['list'],
  ],
  use: {
    baseURL: 'https://twin-ai-learn.vercel.app',
    trace: 'on-first-retry',
    screenshot: 'on',
    video: 'off',
    actionTimeout: 60000,
    navigationTimeout: 45000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // No webServer — prod is already running
});
