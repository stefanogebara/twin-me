/**
 * TwinMe Settings, Brain/Memories, Onboarding, Navigation Audit
 * Date: 2026-04-19
 * User: stefanogebara@gmail.com
 */
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
      if (
        t.includes("favicon") ||
        t.includes("Extension") ||
        t.includes("chrome-extension") ||
        t.includes("ResizeObserver") ||
        t.includes("Non-Error promise rejection")
      ) return;
      errors.push(t);
    }
  });
  return errors;
}

async function waitForApp(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1000);
}

async function ss(page: Page, name: string): Promise<void> {
  const dest = path.join(SCREENSHOT_DIR, name + ".png");
  await page.screenshot({ path: dest, fullPage: true });
  console.log("Screenshot saved:", dest);
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE 1: SETTINGS
// ─────────────────────────────────────────────────────────────────────────────
test.describe("PAGE 1: Settings (/settings)", () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page);
  });

  test("Q1 — Sections visible + screenshot", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(BASE_URL + "/settings");
    await waitForApp(page);
    await ss(page, "settings-main");

    expect(page.url()).not.toContain("/auth");

    // List all tab/sidebar items
    const navItems = page.locator("nav a, nav button, [role=tab], [role=menuitem], aside a, aside button");
    const navTexts = (await navItems.allTextContents()).map(t => t.trim()).filter(t => t.length > 1 && t.length < 50);
    console.log("Nav/tab items:", navTexts);

    // List all section headings
    const headings = await page.locator("h1,h2,h3,h4,h5").allTextContents();
    console.log("Headings:", headings.map(h => h.trim()).filter(h => h.length > 0 && h.length < 100));

    if (errors.length > 0) console.log("CONSOLE ERRORS:", errors);
  });

  test("Q2 — Settings sections content", async ({ page }) => {
    await page.goto(BASE_URL + "/settings");
    await waitForApp(page);

    const body = await page.locator("body").textContent() || "";

    // Check for key settings sections
    const sections = [
      "Privacy", "Account", "Notification", "Connected", "Platform",
      "Autonomy", "WhatsApp", "Twin", "Intelligence", "Rules",
      "Data", "Export", "Import"
    ];
    const found = sections.filter(s => body.toLowerCase().includes(s.toLowerCase()));
    console.log("Sections found in body:", found);

    // Check for empty/broken states
    const emptyStates = await page.getByText("No data", { exact: false }).count() +
                        await page.getByText("Something went wrong", { exact: false }).count() +
                        await page.getByText("Error loading", { exact: false }).count();
    console.log("Empty/error states:", emptyStates);

    await ss(page, "settings-main");
  });

  test("Q3 — Privacy Spectrum section", async ({ page }) => {
    await page.goto(BASE_URL + "/settings");
    await waitForApp(page);

    const body = await page.locator("body").textContent() || "";
    const privacyKeywords = ["Privacy", "Spectrum", "visibility", "sharing", "public", "private"];
    const found = privacyKeywords.filter(k => body.toLowerCase().includes(k.toLowerCase()));
    console.log("Privacy keywords found:", found);

    // Look for privacy sliders/toggles
    const sliders = await page.locator("input[type=range], [role=slider]").count();
    const toggles = await page.locator("input[type=checkbox],[role=switch]").count();
    console.log("Sliders:", sliders, "| Toggles:", toggles);

    // Try clicking privacy link if present
    for (const label of ["Privacy Spectrum", "Privacy", "privacy"]) {
      const el = page.getByText(label, { exact: false }).first();
      if (await el.isVisible().catch(() => false)) {
        await el.click().catch(() => {});
        await page.waitForTimeout(1500);
        console.log("After privacy click URL:", page.url());
        const newBody = await page.locator("body").textContent() || "";
        const spectrumKw = ["Spectrum", "slider", "range", "visibility", "platform data"];
        console.log("Spectrum kw after click:", spectrumKw.filter(k => newBody.toLowerCase().includes(k.toLowerCase())));
        await ss(page, "settings-privacy");
        break;
      }
    }
  });

  test("Q4 — Account settings (email, name, timezone)", async ({ page }) => {
    await page.goto(BASE_URL + "/settings");
    await waitForApp(page);

    const body = await page.locator("body").textContent() || "";
    const accountKw = ["email", "name", "timezone", "account", "profile"];
    console.log("Account keywords:", accountKw.filter(k => body.toLowerCase().includes(k.toLowerCase())));

    // Check for editable input fields
    const inputs = await page.locator("input[type=text], input[type=email], select").count();
    console.log("Editable input fields:", inputs);

    // Look for timezone field specifically
    const tzEl = page.getByText("timezone", { exact: false }).first();
    if (await tzEl.isVisible().catch(() => false)) {
      const parent = tzEl.locator("xpath=ancestor::div[3]").first();
      const content = (await parent.textContent().catch(() => "")).slice(0, 200);
      console.log("Timezone section:", content);
    } else {
      console.log("Timezone field: NOT FOUND");
    }

    await ss(page, "settings-account");
  });

  test("Q5 — Notification settings", async ({ page }) => {
    await page.goto(BASE_URL + "/settings");
    await waitForApp(page);

    const body = await page.locator("body").textContent() || "";
    const notifKw = ["notification", "alert", "schedule", "morning", "briefing", "push", "email"];
    console.log("Notification keywords:", notifKw.filter(k => body.toLowerCase().includes(k.toLowerCase())));

    // Check for toggle/switch for notifications
    const switches = await page.locator("[role=switch],[data-state=checked],[data-state=unchecked]").count();
    console.log("Switches/toggles:", switches);

    // Try clicking notification section
    const notifEl = page.getByText("Notification", { exact: false }).first();
    if (await notifEl.isVisible().catch(() => false)) {
      await notifEl.click().catch(() => {});
      await page.waitForTimeout(1000);
      await ss(page, "settings-notifications");
    }
  });

  test("Q6 — Connected platforms in settings", async ({ page }) => {
    await page.goto(BASE_URL + "/settings");
    await waitForApp(page);

    const body = await page.locator("body").textContent() || "";
    const platforms = ["Spotify", "YouTube", "Google Calendar", "GitHub", "Discord", "LinkedIn", "Reddit", "Twitch", "Whoop", "Gmail"];
    const found = platforms.filter(p => body.includes(p));
    console.log("Platforms listed in settings:", found);
    console.log("Platform count:", found.length, "/ 10");

    // Check if it's same or different from /connect
    const connectBtn = await page.getByText("Connect", { exact: true }).count();
    const disconnectBtn = await page.getByText("Disconnect", { exact: false }).count();
    console.log("Connect buttons:", connectBtn, "| Disconnect buttons:", disconnectBtn);
    await ss(page, "settings-platforms");
  });

  test("Q7 — Console errors on /settings", async ({ page }) => {
    const errors = collectErrors(page);
    const apiErrors: string[] = [];
    page.on("response", r => {
      if (r.status() >= 400 && r.url().includes("/api/")) {
        apiErrors.push(`HTTP ${r.status()} ${r.url()}`);
      }
    });
    await page.goto(BASE_URL + "/settings");
    await waitForApp(page);
    // Scroll to trigger lazy loaded sections
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(2000);
    console.log("Console errors:", errors.length > 0 ? errors : "NONE");
    console.log("API errors:", apiErrors.length > 0 ? apiErrors : "NONE");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PAGE 2: BRAIN (/brain)
// ─────────────────────────────────────────────────────────────────────────────
test.describe("PAGE 2: Memories / Brain (/brain)", () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page);
  });

  test("Q8 — Brain page sections", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(BASE_URL + "/brain");
    await waitForApp(page);
    await ss(page, "brain-page");

    expect(page.url()).not.toContain("/auth");

    const headings = await page.locator("h1,h2,h3,h4").allTextContents();
    console.log("Headings:", headings.map(h => h.trim()).filter(h => h.length > 0 && h.length < 100));

    const body = await page.locator("body").textContent() || "";
    const sections = ["memory", "reflection", "fact", "platform", "conversation", "search", "filter", "total", "memories", "insights"];
    console.log("Sections found:", sections.filter(s => body.toLowerCase().includes(s)));

    // Count cards/items
    const cards = await page.locator("[class*=card],[class*=Card],[class*=memory],[class*=Memory]").count();
    console.log("Memory/card elements:", cards);

    if (errors.length > 0) console.log("CONSOLE ERRORS:", errors);
  });

  test("Q9 — Memory search: type 'music'", async ({ page }) => {
    await page.goto(BASE_URL + "/brain");
    await waitForApp(page);

    // Look for search input
    const searchInputSelectors = [
      "input[type=search]",
      "input[placeholder*=search i]",
      "input[placeholder*=Search]",
      "input[placeholder*=memory i]",
      "input[placeholder*=Memory]",
      "[role=searchbox]",
      "input[type=text]",
    ];
    let searchInput = null;
    for (const sel of searchInputSelectors) {
      const el = page.locator(sel).first();
      if (await el.isVisible().catch(() => false)) {
        searchInput = el;
        console.log("Search input found with selector:", sel);
        break;
      }
    }

    if (!searchInput) {
      console.log("ISSUE: No search input found on /brain");
    } else {
      await searchInput.fill("music");
      await searchInput.press("Enter");
      await page.waitForTimeout(3000);
      await ss(page, "brain-search");

      const body = await page.locator("body").textContent() || "";
      const hasResults = body.toLowerCase().includes("music") ||
                        body.toLowerCase().includes("spotify") ||
                        body.toLowerCase().includes("result");
      console.log("Search results appear:", hasResults);

      const resultItems = await page.locator("[class*=memory],[class*=Memory],[class*=result],[class*=Result],[class*=card],[class*=Card]").count();
      console.log("Result items count:", resultItems);
    }
  });

  test("Q10 — Memory type filter", async ({ page }) => {
    await page.goto(BASE_URL + "/brain");
    await waitForApp(page);

    const body = await page.locator("body").textContent() || "";
    const filterTypes = ["reflection", "fact", "platform_data", "conversation", "All"];
    console.log("Filter types visible:", filterTypes.filter(t => body.toLowerCase().includes(t.toLowerCase())));

    // Look for filter tabs/buttons/dropdowns
    const filterSelectors = [
      "[role=tab]",
      "[role=option]",
      "button[class*=filter]",
      "select",
      "[data-testid*=filter]",
    ];
    for (const sel of filterSelectors) {
      const count = await page.locator(sel).count();
      if (count > 0) {
        const texts = await page.locator(sel).allTextContents();
        console.log(`Filter (${sel}) texts:`, texts.map(t => t.trim()).filter(t => t));
      }
    }

    // Try clicking "reflection" filter
    for (const label of ["Reflection", "reflection", "Reflections"]) {
      const el = page.getByText(label, { exact: true }).first();
      if (await el.isVisible().catch(() => false)) {
        await el.click().catch(() => {});
        await page.waitForTimeout(2000);
        const afterBody = await page.locator("body").textContent() || "";
        const items = await page.locator("[class*=memory],[class*=Memory],[class*=card],[class*=Card]").count();
        console.log("After filter 'Reflection': items =", items);
        await ss(page, "brain-filter-reflection");
        break;
      }
    }
  });

  test("Q11 — Click a memory card", async ({ page }) => {
    await page.goto(BASE_URL + "/brain");
    await waitForApp(page);

    const memoryCard = page.locator("[class*=memory],[class*=Memory],[class*=card],[class*=Card]").first();
    const isVis = await memoryCard.isVisible().catch(() => false);
    if (!isVis) {
      console.log("No memory cards visible to click");
      return;
    }

    const beforeText = (await memoryCard.textContent().catch(() => "")).slice(0, 100);
    console.log("Card before click:", beforeText);

    await memoryCard.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(2000);

    // Check if expanded or modal appeared
    const modal = page.locator("[role=dialog]").first();
    const expanded = page.locator("[class*=expand],[class*=Expand],[class*=detail],[class*=Detail]").first();
    const modalVis = await modal.isVisible().catch(() => false);
    const expandVis = await expanded.isVisible().catch(() => false);
    console.log("Modal appeared:", modalVis, "| Expanded:", expandVis);

    if (modalVis) {
      console.log("Modal content:", (await modal.textContent().catch(() => "")).slice(0, 400));
    }
    await ss(page, "brain-card-click");
  });

  test("Q12 — Pagination / load more", async ({ page }) => {
    await page.goto(BASE_URL + "/brain");
    await waitForApp(page);

    // Check for pagination
    const loadMore = page.getByText("Load more", { exact: false }).first();
    const nextBtn = page.getByText("Next", { exact: false }).first();
    const pagination = page.locator("[role=navigation][aria-label*=pagination i],[class*=pagination],[class*=Pagination]").first();

    const loadMoreVis = await loadMore.isVisible().catch(() => false);
    const nextVis = await nextBtn.isVisible().catch(() => false);
    const paginationVis = await pagination.isVisible().catch(() => false);

    console.log("Load more:", loadMoreVis, "| Next:", nextVis, "| Pagination:", paginationVis);

    if (loadMoreVis) {
      const beforeCount = await page.locator("[class*=memory],[class*=Memory],[class*=card],[class*=Card]").count();
      await loadMore.click().catch(() => {});
      await page.waitForTimeout(3000);
      const afterCount = await page.locator("[class*=memory],[class*=Memory],[class*=card],[class*=Card]").count();
      console.log("Items before:", beforeCount, "| after load more:", afterCount, "| grew:", afterCount > beforeCount);
      await ss(page, "brain-load-more");
    } else if (nextVis) {
      await nextBtn.click().catch(() => {});
      await page.waitForTimeout(2000);
      console.log("Navigated to next page");
      await ss(page, "brain-next-page");
    } else {
      // scroll to bottom to trigger infinite scroll
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(3000);
      const count = await page.locator("[class*=memory],[class*=Memory],[class*=card],[class*=Card]").count();
      console.log("Items after scroll-to-bottom:", count);
    }
  });

  test("Q13 — Console errors on /brain", async ({ page }) => {
    const errors = collectErrors(page);
    const apiErrors: string[] = [];
    page.on("response", r => {
      if (r.status() >= 400 && r.url().includes("/api/")) {
        apiErrors.push(`HTTP ${r.status()} ${r.url()}`);
      }
    });
    await page.goto(BASE_URL + "/brain");
    await waitForApp(page);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(2000);
    console.log("Console errors:", errors.length > 0 ? errors : "NONE");
    console.log("API errors:", apiErrors.length > 0 ? apiErrors : "NONE");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PAGE 3: ONBOARDING (/get-started)
// ─────────────────────────────────────────────────────────────────────────────
test.describe("PAGE 3: Onboarding (/get-started)", () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page);
  });

  test("Q14 — Get-started page content", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(BASE_URL + "/get-started");
    await waitForApp(page);
    await ss(page, "onboarding-main");

    console.log("Final URL:", page.url());

    const headings = await page.locator("h1,h2,h3,h4").allTextContents();
    console.log("Headings:", headings.map(h => h.trim()).filter(h => h.length > 0 && h.length < 100));

    const body = await page.locator("body").textContent() || "";
    const kw = ["platform", "connect", "soul", "interview", "start", "step", "data"];
    console.log("Keywords:", kw.filter(k => body.toLowerCase().includes(k)));

    if (errors.length > 0) console.log("CONSOLE ERRORS:", errors);
  });

  test("Q15 — Platforms listed on get-started", async ({ page }) => {
    await page.goto(BASE_URL + "/get-started");
    await waitForApp(page);
    await ss(page, "onboarding-platforms");

    const body = await page.locator("body").textContent() || "";
    const platforms = ["Spotify", "YouTube", "Google Calendar", "Gmail", "Discord", "LinkedIn", "GitHub", "Reddit", "Twitch", "Whoop"];
    const found = platforms.filter(p => body.includes(p));
    console.log("Platforms on get-started:", found.length, "/", platforms.length);
    console.log("Found:", found);
    const missing = platforms.filter(p => !body.includes(p));
    console.log("MISSING from get-started:", missing);
  });

  test("Q16 — OAuth connect button click", async ({ page }) => {
    await page.goto(BASE_URL + "/get-started");
    await waitForApp(page);

    // Find a disconnected platform and click Connect
    const connectBtns = page.locator("button").filter({ hasText: /^Connect$/i });
    const count = await connectBtns.count();
    console.log("Connect buttons found:", count);

    if (count === 0) {
      // Try broader search
      const allBtns = await page.locator("button").allTextContents();
      console.log("All buttons:", allBtns.map(t => t.trim()).filter(t => t).slice(0, 20));
      return;
    }

    // Click the first Connect button
    const firstBtn = connectBtns.first();
    const btnText = await firstBtn.textContent().catch(() => "");
    console.log("Clicking connect button:", btnText);

    // Watch for popup or navigation
    const popupPromise = page.waitForEvent("popup", { timeout: 5000 }).catch(() => null);
    await firstBtn.click({ timeout: 5000 }).catch(e => console.log("Click error:", e.message));
    await page.waitForTimeout(3000);

    const popup = await popupPromise;
    if (popup) {
      console.log("OAuth popup opened - URL:", popup.url());
      await popup.close();
    } else {
      console.log("No popup. Current URL:", page.url());
      const modal = page.locator("[role=dialog]").first();
      if (await modal.isVisible().catch(() => false)) {
        console.log("Modal content:", (await modal.textContent().catch(() => "")).slice(0, 200));
      }
    }
    await ss(page, "onboarding-connect-click");
  });

  test("Q17 — Soul Interview link", async ({ page }) => {
    await page.goto(BASE_URL + "/get-started");
    await waitForApp(page);

    const body = await page.locator("body").textContent() || "";
    const interviewKw = ["Soul Interview", "Interview", "soul", "questions", "tell us about"];
    console.log("Interview keywords:", interviewKw.filter(k => body.toLowerCase().includes(k.toLowerCase())));

    // Check for link to /interview
    const interviewLink = page.locator("a[href*=interview], button").filter({ hasText: /interview/i }).first();
    const isVis = await interviewLink.isVisible().catch(() => false);
    console.log("Soul Interview link/button:", isVis);

    if (isVis) {
      await interviewLink.click().catch(() => {});
      await page.waitForTimeout(2000);
      console.log("After interview click, URL:", page.url());
      await ss(page, "onboarding-interview");
    }
  });

  test("Q18 — Console errors on /get-started", async ({ page }) => {
    const errors = collectErrors(page);
    const apiErrors: string[] = [];
    page.on("response", r => {
      if (r.status() >= 400 && r.url().includes("/api/")) {
        apiErrors.push(`HTTP ${r.status()} ${r.url()}`);
      }
    });
    await page.goto(BASE_URL + "/get-started");
    await waitForApp(page);
    console.log("Console errors:", errors.length > 0 ? errors : "NONE");
    console.log("API errors:", apiErrors.length > 0 ? apiErrors : "NONE");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BONUS: Navigation completeness
// ─────────────────────────────────────────────────────────────────────────────
test.describe("BONUS: Navigation & Route Coverage", () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page);
  });

  test("Q19 — All bottom nav routes", async ({ page }) => {
    const routes: Array<{ path: string; name: string }> = [
      { path: "/dashboard", name: "Home" },
      { path: "/talk-to-twin", name: "Twin/Chat" },
      { path: "/connect", name: "Connect" },
      { path: "/identity", name: "You/Me/Identity" },
      { path: "/brain", name: "Memories/Brain" },
      { path: "/knowledge", name: "Knowledge" },
      { path: "/settings", name: "Settings" },
      { path: "/get-started", name: "Get Started" },
      { path: "/goals", name: "Goals" },
      { path: "/discover", name: "Discover" },
      { path: "/privacy-spectrum", name: "Privacy Spectrum" },
      { path: "/wiki", name: "Wiki" },
    ];

    for (const route of routes) {
      const errors: string[] = [];
      page.on("console", msg => {
        if (msg.type() === "error" && !msg.text().includes("favicon") && !msg.text().includes("chrome-extension")) {
          errors.push(msg.text().slice(0, 100));
        }
      });

      await page.goto(BASE_URL + route.path, { timeout: 30000 }).catch(() => {});
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(500);

      const url = page.url();
      const isBlank = (await page.locator("body").textContent() || "").trim().length < 50;
      const is404 = url.includes("/404") || (await page.getByText("404", { exact: false }).isVisible().catch(() => false)) ||
                    (await page.getByText("not found", { exact: false }).isVisible().catch(() => false));
      const isRedirectedToAuth = url.includes("/auth");

      const status = is404 ? "404" :
                    isRedirectedToAuth ? "REDIRECTED_TO_AUTH" :
                    isBlank ? "BLANK_PAGE" : "OK";

      console.log(`${route.name} (${route.path}): ${status} | url=${url.replace(BASE_URL, "")}`);
      if (errors.length > 0) console.log(`  Errors on ${route.path}:`, errors.slice(0, 3));
    }
  });

  test("Q20 — Dashboard heatmap", async ({ page }) => {
    await page.goto(BASE_URL + "/dashboard");
    await waitForApp(page);

    // Scroll to bottom to find heatmap
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(2000);

    const body = await page.locator("body").textContent() || "";
    const heatmapKw = ["heatmap", "Heatmap", "Memory Activity", "90 day", "90-day", "Activity", "streak", "daily"];
    const found = heatmapKw.filter(k => body.toLowerCase().includes(k.toLowerCase()));
    console.log("Heatmap keywords:", found);

    // Look for grid of small squares (the heatmap typically uses many small div elements)
    const svgCount = await page.locator("svg").count();
    const rectCount = await page.locator("rect").count();
    const smallSquares = await page.locator("[style*='width: 10px'],[style*='width:10px'],[class*=cell],[class*=Cell],[class*=square],[class*=Square]").count();
    console.log("SVG:", svgCount, "| rect:", rectCount, "| small squares:", smallSquares);

    // Screenshot around heatmap area
    await ss(page, "dashboard-heatmap");

    // Also screenshot full page scrolled
    await page.evaluate(() => window.scrollTo(0, 2000));
    await page.waitForTimeout(500);
    await ss(page, "dashboard-heatmap-scroll");
  });
});
