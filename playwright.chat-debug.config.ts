import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(import.meta.dirname, ".env.prod.test") });
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "chat-debug.spec.ts",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  timeout: 90000,
  reporter: [["list"]],
  use: {
    baseURL: process.env.TEST_BASE_URL || "https://twin-ai-learn.vercel.app",
    actionTimeout: 30000,
    navigationTimeout: 30000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
