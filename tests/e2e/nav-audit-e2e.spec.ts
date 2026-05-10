/**
 * Nav Audit E2E Tests
 * Tests: Goals page removed, Connect sidebar item, correct nav items, /get-started page loads
 */
import { test, expect } from '@playwright/test';
import { injectAuth, screenshot, SCREENSHOT_DIR } from './helpers';

test.describe('Nav Audit', () => {
  test('Test 1: /goals route loads (re-added after goal-tracking redesign)', async ({ page }) => {
    await injectAuth(page);
    await page.goto('/goals', { waitUntil: 'load' });
    await page.waitForTimeout(1500);

    const url = page.url();
    await screenshot(page, 'test1-goals-route');

    // /goals is a real route (App.tsx). Either stays on /goals (logged-in) or redirects to /auth.
    // The earlier "must redirect away from /goals" expectation was from the 2026-03 window when
    // the route was temporarily removed.
    const isAcceptable = url.includes('/goals') || url.includes('/auth');
    expect(isAcceptable, `Expected /goals or /auth, got: ${url}`).toBe(true);
  });

  test('Test 2: Sidebar Connect item navigates to /connect (primary) or /get-started (legacy)', async ({ page }) => {
    await injectAuth(page);
    await page.goto('/dashboard', { waitUntil: 'load' });
    // Wait for sidebar to render (auth API resolves, then sidebar mounts)
    await page.locator('button[title="Home"]').waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForTimeout(500);

    await screenshot(page, 'test2a-dashboard-sidebar');

    // Find the Connect nav button in sidebar
    const connectBtn = page.locator('button[title="Connect"]');
    await expect(connectBtn, 'Connect button should be visible in sidebar').toBeVisible({ timeout: 8000 });

    // Click it
    await connectBtn.click();
    await page.waitForTimeout(1500);

    const url = page.url();
    await screenshot(page, 'test2b-after-connect-click');

    // App.tsx mounts the same Connect page on BOTH /connect (primary nav) and /get-started (legacy alias).
    const isConnectRoute = url.includes('/connect') || url.includes('/get-started');
    expect(isConnectRoute, `Clicking Connect should navigate to /connect or /get-started but got: ${url}`).toBe(true);
  });

  test('Test 3: Sidebar has exactly the correct nav items with no Goals item', async ({ page }) => {
    await injectAuth(page);
    await page.goto('/dashboard', { waitUntil: 'load' });
    await page.waitForTimeout(1500);

    await screenshot(page, 'test3-sidebar-nav-items');

    const expectedItems = [
      { label: 'Talk to Twin', title: 'Talk to Twin' },
      { label: 'Home', title: 'Home' },
      { label: 'You', title: 'You' },
      { label: 'Departments', title: 'Departments' },
      { label: 'Connect', title: 'Connect' },
      { label: 'Settings', title: 'Settings' },
    ];

    // Check all expected items exist
    for (const item of expectedItems) {
      const btn = page.locator(`button[title="${item.title}"]`);
      await expect(btn, `"${item.label}" nav item should be in sidebar`).toBeVisible({ timeout: 5000 });
    }

    // Goals must NOT exist
    const goalsBtn = page.locator('button[title="Goals"]');
    const goalsCount = await goalsBtn.count();
    expect(goalsCount, '"Goals" nav item should NOT be in sidebar').toBe(0);
  });

  test('Test 4: /get-started page loads without error', async ({ page }) => {
    await injectAuth(page);
    await page.goto('/get-started', { waitUntil: 'load' });
    await page.waitForTimeout(1500);

    const url = page.url();
    await screenshot(page, 'test4-get-started');

    // Should remain on /get-started (not redirected to /auth)
    expect(url, '/get-started should load and not redirect to /auth').toContain('/get-started');

    // Page should have visible content
    const bodyText = await page.locator('body').innerText().catch(() => '');
    expect(bodyText.trim().length, '/get-started should have visible content').toBeGreaterThan(20);
  });
});
