import { defineConfig, devices } from '@playwright/test';
/* The money journey against production, as a signed-in person (M3-6, 2026-09-19). Needs
   MONEY_CANARY_TOKEN, an access token for the canary account; without it the spec skips. */
export default defineConfig({
  testDir: './tests/e2e', testMatch: /money-production\.spec\.ts$/, fullyParallel: false,
  forbidOnly: Boolean(process.env.CI), retries: 1, workers: 1, timeout: 60000,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { channel: process.env.CI ? undefined : 'chrome', baseURL: process.env.MONEY_CANARY_URL || 'https://twin-ai-learn.vercel.app', trace: 'retain-on-failure', screenshot: 'only-on-failure', locale: 'en-GB', timezoneId: 'Europe/Madrid' },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } }],
});
