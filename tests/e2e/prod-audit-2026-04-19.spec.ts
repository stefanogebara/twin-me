import { test, expect, Page, ConsoleMessage } from "@playwright/test";
import path from "path";
import fs from "fs";

const BASE_URL = process.env.TEST_BASE_URL || "https://twin-ai-learn.vercel.app";
const TOKEN = process.env.TEST_AUTH_TOKEN || "";
const SCREENSHOT_DIR = path.join(process.cwd(), "audit-screenshots");
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function injectAuth(page: Page): Promise<void> {
  await page.addInitScript((token: string) => {
    window.localStorage.setItem("auth_token", token);
  }, TOKEN);
}
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error") {
      const t = msg.text();
      if (t.includes("favicon") || t.includes("Extension") ||
          t.includes("chrome-extension") || t.includes("ResizeObserver")) return;
      errors.push(t);
    }
  });
  return errors;
}
async function waitForAppReady(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
}
async function ss(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, name + ".png"), fullPage: true });
  console.log("Screenshot:", name);
}

test.describe("PAGE 1: Dashboard", () => {
  test.beforeEach(async ({ page }) => { await injectAuth(page); });

  test("1. Full page load", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(BASE_URL + "/dashboard");
    await waitForAppReady(page);
    await ss(page, "dashboard-full");
    console.log("Title:", await page.title());
    const h = await page.locator("h1,h2,h3,h4").allTextContents();
    console.log("Headings:", h.map(x => x.trim()).filter(x => x.length > 0 && x.length < 100));
    const body = await page.locator("body").textContent() || "";
    const kw = ["Morning","Insight","briefing","Heatmap","Readiness","Soul Score","Soul Richness",
      "Memory","Activity","twin noticed","AI TEAM","Approve","Discuss","View all"];
    console.log("Keywords found:", kw.filter(s => body.includes(s)));
    expect(page.url()).not.toContain("/auth");
    if (errors.length > 0) console.log("ERRORS:", errors);
  });

  test("2. Proactive insights panel", async ({ page }) => {
    await page.goto(BASE_URL + "/dashboard");
    await waitForAppReady(page);
    const noticedEl = page.getByText("What your twin noticed").first();
    const vis = await noticedEl.isVisible().catch(() => false);
    console.log("noticed section visible:", vis);
    if (vis) {
      const approveCount = await page.locator("button").filter({ hasText: "Approve" }).count();
      const discussCount = await page.locator("button").filter({ hasText: "Discuss with twin" }).count();
      console.log("Approve:", approveCount, "| Discuss:", discussCount);
      const c = noticedEl.locator("xpath=ancestor::div[4]").first();
      console.log("Section:", (await c.textContent().catch(() => "")).slice(0, 600));
    }
    await ss(page, "dashboard-insights");
  });

  test("3. Morning briefing", async ({ page }) => {
    await page.goto(BASE_URL + "/dashboard");
    await waitForAppReady(page);
    for (const g of ["Good morning","Good afternoon","Good evening"]) {
      const el = page.getByText(g, { exact: false }).first();
      if (await el.isVisible().catch(() => false)) {
        console.log("Greeting:", await el.textContent()); break;
      }
    }
    const aiTeam = page.getByText("YOUR AI TEAM", { exact: false }).first();
    const aiVis = await aiTeam.isVisible().catch(() => false);
    console.log("YOUR AI TEAM visible:", aiVis);
    if (aiVis) {
      const c = aiTeam.locator("xpath=ancestor::div[2]").first();
      console.log("AI Team:", (await c.textContent().catch(() => "")).slice(0, 400));
    }
  });

  test("4. Soul Score", async ({ page }) => {
    await page.goto(BASE_URL + "/dashboard");
    await waitForAppReady(page);
    const body = await page.locator("body").textContent() || "";
    for (const t of ["Twin Readiness","Soul Score","Soul Richness","Readiness","Richness"]) {
      if (body.includes(t)) {
        const el = page.getByText(t, { exact: false }).first();
        if (await el.isVisible().catch(() => false)) {
          const p = el.locator("xpath=ancestor::div[2]").first();
          console.log("Score [" + t + "]:", (await p.textContent().catch(() => "")).slice(0, 200));
          return;
        }
      }
    }
    console.log("Soul Score / Readiness: NOT FOUND");
  });

  test("5. Quick actions", async ({ page }) => {
    await page.goto(BASE_URL + "/dashboard");
    await waitForAppReady(page);
    const discuss = page.getByText("Discuss with twin", { exact: false }).first();
    const vis = await discuss.isVisible().catch(() => false);
    console.log("Discuss with twin:", vis);
    if (vis) {
      await discuss.click();
      await page.waitForTimeout(2000);
      console.log("URL after click:", page.url());
      await ss(page, "dashboard-discuss-click");
      await page.goBack().catch(() => {});
      await waitForAppReady(page);
    }
    const viewAll = page.getByText("View all", { exact: false }).first();
    if (await viewAll.isVisible().catch(() => false)) {
      console.log("View all href:", await viewAll.getAttribute("href"));
    }
  });

  test("6. Memory heatmap", async ({ page }) => {
    await page.goto(BASE_URL + "/dashboard");
    await waitForAppReady(page);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);
    const body = await page.locator("body").textContent() || "";
    const kw = ["heatmap","Heatmap","Memory Activity","90 day","90-day","Activity"];
    console.log("Heatmap kw:", kw.filter(k => body.includes(k)));
    console.log("SVG:", await page.locator("svg").count(), "| Canvas:", await page.locator("canvas").count());
    await ss(page, "dashboard-full-scroll");
  });

  test("7. Error states", async ({ page }) => {
    await page.goto(BASE_URL + "/dashboard");
    await waitForAppReady(page);
    const errC = await page.locator("[class*=error],[class*=Error]").count();
    const retryC = await page.locator("button").filter({ hasText: "Retry" }).count();
    const failC = await page.getByText("Failed", { exact: false }).count();
    console.log("Error-class:", errC, "| Retry:", retryC, "| Failed:", failC);
  });

  test("8. Mobile 390x844", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(BASE_URL + "/dashboard");
    await waitForAppReady(page);
    await ss(page, "dashboard-mobile");
    const sw = await page.evaluate(() => document.body.scrollWidth);
    console.log("Overflow:", sw > 420, "| scrollWidth:", sw);
    console.log("Nav:", await page.locator("nav,[role=navigation]").first().isVisible().catch(() => false));
  });
});

test.describe("PAGE 2: Chat", () => {
  test.beforeEach(async ({ page }) => { await injectAuth(page); });

  test("9. Page load", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(BASE_URL + "/talk-to-twin");
    await waitForAppReady(page);
    await ss(page, "chat-initial");
    expect(page.url()).not.toContain("/auth");
    console.log("Messages:", await page.locator("[class*=message],[class*=Message]").count());
    console.log("Input:", await page.locator("textarea,input[type=text],[role=textbox]").first().isVisible().catch(() => false));
    if (errors.length > 0) console.log("ERRORS:", errors);
  });

  test("10. Send message", async ({ page }) => {
    await page.goto(BASE_URL + "/talk-to-twin");
    await waitForAppReady(page);
    const input = page.locator("textarea,input[type=text],[role=textbox]").first();
    if (!await input.isVisible().catch(() => false)) { console.log("CRITICAL: No input"); return; }
    const before = await page.locator("[class*=message],[class*=Message]").count();
    await input.fill("What are my top 3 personality traits based on my data?");
    const t0 = Date.now();
    await input.press("Enter");
    let responseTime = -1;
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(2000);
      if (await page.locator("[class*=message],[class*=Message]").count() > before) {
        responseTime = Date.now() - t0; break;
      }
    }
    console.log("Response time:", responseTime, "ms");
    await ss(page, "chat-response");
    const msgs = await page.locator("[class*=message],[class*=Message]").allTextContents();
    console.log("Total msgs:", msgs.length);
    if (msgs.length > 0) console.log("Last msg:", msgs[msgs.length-1].slice(0, 400));
  });

  test("11. Streaming", async ({ page }) => {
    await page.goto(BASE_URL + "/talk-to-twin");
    await waitForAppReady(page);
    const input = page.locator("textarea,input[type=text],[role=textbox]").first();
    if (!await input.isVisible().catch(() => false)) { console.log("SKIP"); return; }
    const before = await page.locator("[class*=message],[class*=Message]").count();
    await input.fill("In one sentence, what is my main hobby?");
    await input.press("Enter");
    const snaps: string[] = [];
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(500);
      try {
        const msgs = await page.locator("[class*=message],[class*=Message]").allTextContents();
        if (msgs.length > before) {
          const last = msgs[msgs.length-1].trim().replace(/\s+/g, " ").slice(0, 60);
          if (last && !snaps.includes(last)) snaps.push(last);
        }
      } catch {}
    }
    console.log("Streaming:", snaps.length > 3, "| Snaps:", snaps.length);
    console.log("Sample:", snaps.slice(0, 5));
  });

  test("12. Insights in chat", async ({ page }) => {
    await page.goto(BASE_URL + "/talk-to-twin");
    await waitForAppReady(page);
    const body = await page.locator("body").textContent() || "";
    const terms = ["I noticed","noticed something","Something I noticed"];
    console.log("Insight terms:", terms.filter(t => body.includes(t)).length > 0 ? terms.filter(t => body.includes(t)) : "NONE");
  });

  test("13. Suggestion chips", async ({ page }) => {
    await page.goto(BASE_URL + "/talk-to-twin");
    await waitForAppReady(page);
    const chips = page.locator("[class*=suggestion],[class*=Suggestion],[class*=chip],[class*=Chip]");
    const count = await chips.count();
    console.log("Chips:", count);
    if (count > 0) console.log("Labels:", (await chips.allTextContents()).map(t => t.trim()).filter(t => t));
  });

  test("14. Conversation grows", async ({ page }) => {
    await page.goto(BASE_URL + "/talk-to-twin");
    await waitForAppReady(page);
    const input = page.locator("textarea,input[type=text],[role=textbox]").first();
    if (!await input.isVisible().catch(() => false)) { console.log("SKIP"); return; }
    const before = await page.locator("[class*=message],[class*=Message]").count();
    await input.fill("Tell me about my music taste.");
    await input.press("Enter");
    await page.waitForTimeout(15000);
    const after1 = await page.locator("[class*=message],[class*=Message]").count();
    console.log("Before:", before, "| After1:", after1, "| Grew:", after1 > before);
    await input.fill("Tell me something surprising about myself.");
    await input.press("Enter");
    await page.waitForTimeout(15000);
    const after2 = await page.locator("[class*=message],[class*=Message]").count();
    console.log("After2:", after2, "| Grew:", after2 > after1);
    await ss(page, "chat-two-messages");
  });

  test("15. Mobile 390x844", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(BASE_URL + "/talk-to-twin");
    await waitForAppReady(page);
    await ss(page, "chat-mobile");
    const input = page.locator("textarea,input[type=text],[role=textbox]").first();
    const vis = await input.isVisible().catch(() => false);
    console.log("Input visible:", vis);
    if (vis) {
      const box = await input.boundingBox();
      console.log("Box:", JSON.stringify(box));
      if (box) console.log("Near bottom:", box.y > 400);
    }
    const sw = await page.evaluate(() => document.body.scrollWidth);
    console.log("Overflow:", sw > 420, sw);
  });

  test("16. New convo button", async ({ page }) => {
    await page.goto(BASE_URL + "/talk-to-twin");
    await waitForAppReady(page);
    console.log("New btn:", await page.locator("button").filter({ hasText: "New" }).first().isVisible().catch(() => false));
    console.log("Clear btn:", await page.locator("button").filter({ hasText: "Clear" }).first().isVisible().catch(() => false));
    console.log("History panel:", await page.locator("[class*=history],[class*=History],[class*=ConversationList]").first().isVisible().catch(() => false));
    await ss(page, "chat-sidebar");
  });
});

test.describe("PAGE 3: Connect", () => {
  test.beforeEach(async ({ page }) => { await injectAuth(page); });

  test("17. Platform grid", async ({ page }) => {
    const apiErr: string[] = [];
    page.on("response", r => {
      if (r.status() >= 400 && r.url().includes("/api/")) apiErr.push(r.status() + " " + r.url());
    });
    const ce = collectErrors(page);
    await page.goto(BASE_URL + "/connect");
    await waitForAppReady(page);
    await ss(page, "connect-grid");
    expect(page.url()).not.toContain("/auth");
    for (const p of ["Spotify","YouTube","Google Calendar","Gmail","Discord","LinkedIn","GitHub","Reddit","Twitch","Whoop"]) {
      const el = page.getByText(p, { exact: true }).first();
      const vis = await el.isVisible().catch(() => false);
      if (!vis) { console.log(p + ": NOT VISIBLE"); continue; }
      let st = "";
      try { st = await el.locator("xpath=ancestor::div[4]").first().textContent({ timeout: 2000 }) || ""; } catch {}
      const lo = st.toLowerCase();
      const state = lo.includes("disconnect") || lo.includes("re-sync") ? "CONNECTED" :
                    lo.includes("error") || lo.includes("expired") ? "ERROR" :
                    lo.includes("connect") ? "DISCONNECTED" : "VISIBLE_UNKNOWN";
      console.log(p + ": " + state);
    }
    console.log("Console errors:", ce.length ? ce : "None");
    console.log("API errors:", apiErr.length ? apiErr : "None");
  });

  test("18. Click platform card", async ({ page }) => {
    await page.goto(BASE_URL + "/connect");
    await waitForAppReady(page);
    for (const p of ["Spotify","Google Calendar","YouTube","GitHub","Gmail"]) {
      const el = page.getByText(p, { exact: true }).first();
      if (!await el.isVisible().catch(() => false)) continue;
      const card = el.locator("xpath=ancestor::div[3]").first();
      await card.click({ timeout: 5000 }).catch(() => el.click());
      await page.waitForTimeout(2000);
      const modal = page.locator("[role=dialog]").first();
      const mv = await modal.isVisible().catch(() => false);
      console.log("Clicked:", p, "| URL:", page.url(), "| Modal:", mv);
      if (mv) console.log("Modal:", (await modal.textContent())?.slice(0, 300));
      await ss(page, "connect-click-platform");
      break;
    }
  });

  test("19. OAuth flow", async ({ page }) => {
    await page.goto(BASE_URL + "/connect");
    await waitForAppReady(page);
    for (const p of ["Discord","Twitch","Reddit","LinkedIn"]) {
      const el = page.getByText(p, { exact: true }).first();
      if (!await el.isVisible().catch(() => false)) continue;
      const card = el.locator("xpath=ancestor::div[3]").first();
      const ct = (await card.textContent({ timeout: 2000 }).catch(() => "")).toLowerCase();
      if (ct.includes("disconnect") || ct.includes("re-sync")) { console.log(p, "connected, skip"); continue; }
      console.log("Testing:", p);
      const pp = page.waitForEvent("popup", { timeout: 6000 }).catch(() => null);
      await card.click({ timeout: 5000 }).catch(() => el.click());
      await page.waitForTimeout(3000);
      const popup = await pp;
      if (popup) {
        console.log("Popup URL:", popup.url());
        await popup.close();
      } else {
        console.log("No popup. URL:", page.url());
        const modal = page.locator("[role=dialog]").first();
        if (await modal.isVisible().catch(() => false)) console.log("Modal:", (await modal.textContent())?.slice(0, 200));
      }
      await ss(page, "connect-oauth");
      return;
    }
    console.log("No disconnected platform found");
  });

  test("20. Errors", async ({ page }) => {
    const apiErr: string[] = [];
    page.on("response", r => {
      if (r.status() >= 400 && r.url().includes("/api/")) apiErr.push("HTTP " + r.status() + " " + r.url());
    });
    const ce = collectErrors(page);
    await page.goto(BASE_URL + "/connect");
    await waitForAppReady(page);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(2000);
    console.log("Console errors:", ce.length ? ce : "None");
    console.log("API errors:", apiErr.length ? apiErr : "None");
  });
});
