import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(import.meta.dirname, ".env.prod.test") });

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "prod-audit-2026-04-19.spec.ts",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  timeout: 120000,
  reporter: [["list"], ["html", { outputFolder: "playwright-report-audit", open: "never" }]],
  use: {
    baseURL: process.env.TEST_BASE_URL || "https://twin-ai-learn.vercel.app",
    trace: "off",
    screenshot: "off",
    video: "off",
    actionTimeout: 45000,
    navigationTimeout: 45000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
