import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', testMatch: /money-beta\.spec\.ts$/, fullyParallel: false,
  forbidOnly: Boolean(process.env.CI), retries: 0, workers: 2, timeout: 30000,
  reporter: process.env.CI ? [['github'],['html',{open:'never'}]] : 'list',
  use: { channel: process.env.CI ? undefined : 'chrome', baseURL:'http://127.0.0.1:4188',trace:'retain-on-failure',screenshot:'only-on-failure',locale:'en-GB',timezoneId:'Europe/Madrid' },
  projects: [
    {name:'desktop',use:{...devices['Desktop Chrome'],viewport:{width:1440,height:1000}}},
    {name:'phone',use:{...devices['iPhone 13'],defaultBrowserType:'chromium'}},
  ],
  webServer: {command:'npm run preview -- --host 127.0.0.1 --port 4188 --strictPort',url:'http://127.0.0.1:4188',reuseExistingServer:!process.env.CI,timeout:60000},
});
