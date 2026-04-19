import { test, Page } from "@playwright/test";
import path from "path";

const BASE_URL = process.env.TEST_BASE_URL || "https://twin-ai-learn.vercel.app";
const TOKEN = process.env.TEST_AUTH_TOKEN || "";
const SCREENSHOT_DIR = path.join(process.cwd(), "audit-screenshots");

async function injectAuth(page: Page) {
  await page.addInitScript((token: string) => {
    window.localStorage.setItem("auth_token", token);
  }, TOKEN);
}

test("connect page deep dive", async ({ page }) => {
  await injectAuth(page);
  await page.goto(BASE_URL + "/connect");
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});

  // Get full page text to see what platforms exist
  const body = await page.locator("body").textContent() || "";
  const platforms = ["Spotify","YouTube","Google Calendar","Gmail","Discord","LinkedIn",
    "GitHub","Reddit","Twitch","Whoop","Strava","Oura","Fitbit","Garmin",
    "Google Workspace","Outlook","Browser Extension"];
  const found = platforms.filter(p => body.includes(p));
  console.log("Platforms in page text:", JSON.stringify(found));

  // Check connected platforms
  for (const p of found) {
    const el = page.getByText(p, { exact: true }).first();
    const vis = await el.isVisible().catch(() => false);
    if (!vis) { console.log(p, "in text but NOT visible"); continue; }

    // Check nearby text for status
    let status = "unknown";
    try {
      const grandparent = el.locator("xpath=ancestor::div[4]").first();
      const t = await grandparent.textContent({ timeout: 2000 }) || "";
      if (t.toLowerCase().includes("manage")) status = "CONNECTED (has Manage btn)";
      else if (t.toLowerCase().includes("connect")) status = "DISCONNECTED (has Connect btn)";
      else status = "present, status unclear";
    } catch { status = "error reading status"; }
    console.log(p + ":", status);
  }

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "connect-full-detail.png"), fullPage: true });
});
