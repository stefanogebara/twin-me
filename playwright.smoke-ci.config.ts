import { defineConfig, devices } from '@playwright/test';

/**
 * CI smoke config — frontend-only, backend-free, deterministic.
 *
 * Serves the PRODUCTION BUILD via `vite preview` (fast static serve, no Vite
 * dev on-demand compile) and runs only tests/e2e/smoke-ci.spec.ts. No `setup`
 * project, no storageState, no API server — this config intentionally boots
 * nothing but the built frontend so it stays green without secrets or a DB.
 *
 * The full local smoke (smoke-core-loop.spec.ts, backend + auth) still runs via
 * the default playwright.config.ts; it is NOT part of this CI gate.
 *
 * Run: npm run test:smoke:ci  (assumes `npm run build` already produced dist/)
 */
const PORT = 4173;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /smoke-ci\.spec\.ts$/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,

  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [{ name: 'smoke-ci', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    // Serve the existing build; the CI job runs `npm run build` beforehand.
    command: `npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60 * 1000,
  },
});
