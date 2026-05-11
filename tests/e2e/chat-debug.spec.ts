import { test, Page } from "@playwright/test";
import path from "path";

const BASE_URL = process.env.TEST_BASE_URL || "https://twin-ai-learn.vercel.app";
const TOKEN = process.env.TEST_AUTH_TOKEN || "";
const SCREENSHOT_DIR = path.join(process.cwd(), "audit-screenshots");

async function injectAuth(page: Page): Promise<void> {
  // Intercept /api/auth/refresh so AuthContext rehydrate succeeds without an
  // httpOnly cookie. See helpers.ts for the full rationale.
  await page.route('**/api/auth/refresh', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        accessToken: TOKEN,
        user: { id: '167c27b5-a40b-49fb-8d00-deb1b1c57f4d', email: 'stefanogebara@gmail.com', name: 'Test User', first_name: 'Stefano', email_verified: true },
      }),
    });
  });
  await page.addInitScript((token: string) => {
    window.localStorage.setItem("auth_token", token);
  }, TOKEN);
}

// Dev debug spec — hits production by default, depends on stale TEST_AUTH_TOKEN
// and dumps class names for selector hunting. Not a regression test. Skip
// unless explicitly opted in.
test.skip(
  process.env.TWINME_RUN_DEBUG_SPECS !== 'true',
  'chat-debug is a developer selector-hunt tool. Set TWINME_RUN_DEBUG_SPECS=true to opt in.',
);

test("chat deep dive", async ({ page }) => {
  await injectAuth(page);
  await page.goto(BASE_URL + "/talk-to-twin");
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});

  // Get all class names with chat-related keywords
  const classNames: string[] = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll("*"));
    const classes = new Set<string>();
    els.forEach(el => {
      el.classList.forEach(c => {
        if (/message|chat|bubble|turn|response|twin|assistant|role/i.test(c)) {
          classes.add(c);
        }
      });
    });
    return Array.from(classes).slice(0, 50);
  });
  console.log("Message-related CSS classes:", JSON.stringify(classNames));

  // Count all div/li elements matching known patterns
  const counts = await page.evaluate(() => {
    return {
      roleUser: document.querySelectorAll("[data-role=user]").length,
      roleAssistant: document.querySelectorAll("[data-role=assistant]").length,
      dataMessage: document.querySelectorAll("[data-message]").length,
      liElements: document.querySelectorAll("li").length,
      articleElements: document.querySelectorAll("article").length,
      mainChildren: document.querySelector("main")?.children.length || 0,
    };
  });
  console.log("Element counts:", JSON.stringify(counts));

  // Send a message
  const input = page.locator("textarea,input[type=text],[role=textbox]").first();
  await input.fill("Hello");
  await input.press("Enter");
  await page.waitForTimeout(8000);

  // Count again
  const counts2 = await page.evaluate(() => {
    return {
      roleUser: document.querySelectorAll("[data-role=user]").length,
      roleAssistant: document.querySelectorAll("[data-role=assistant]").length,
      dataMessage: document.querySelectorAll("[data-message]").length,
      liElements: document.querySelectorAll("li").length,
      articleElements: document.querySelectorAll("article").length,
    };
  });
  console.log("After send:", JSON.stringify(counts2));

  // Check if there is a loading/thinking indicator
  const thinkingVis = await page.getByText("Thinking", { exact: false }).isVisible().catch(() => false);
  console.log("Thinking indicator visible:", thinkingVis);

  // Get full page text to see if response appeared anywhere
  const bodyText = (await page.locator("body").textContent() || "").slice(0, 2000);
  console.log("Body text snapshot:", bodyText);

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "chat-after-hello.png"), fullPage: true });
});
