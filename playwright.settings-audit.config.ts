import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(import.meta.dirname, ".env.prod.test") });

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "settings-brain-onboarding-audit.spec.ts",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  timeout: 90000,
  reporter: [["list"], ["html", { outputFolder: "playwright-report-settings-audit", open: "never" }]],
  use: {
    baseURL: process.env.TEST_BASE_URL || "https://twin-ai-learn.vercel.app",
    trace: "off",
    screenshot: "off",
    video: "off",
    actionTimeout: 30000,
    navigationTimeout: 45000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
