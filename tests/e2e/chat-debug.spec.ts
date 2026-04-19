import { test, Page } from "@playwright/test";
import path from "path";

const BASE_URL = process.env.TEST_BASE_URL || "https://twin-ai-learn.vercel.app";
const TOKEN = process.env.TEST_AUTH_TOKEN || "";
const SCREENSHOT_DIR = path.join(process.cwd(), "audit-screenshots");

async function injectAuth(page: Page): Promise<void> {
  await page.addInitScript((token: string) => {
    window.localStorage.setItem("auth_token", token);
  }, TOKEN);
}

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
