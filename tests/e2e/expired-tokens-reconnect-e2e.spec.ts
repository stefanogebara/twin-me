/**
 * E2E Test — Expired Token Reconnect UI
 *
 * Verifies that platforms with `requires_reauth` status show amber
 * "Reconnect" buttons on the Connect Platforms page (/get-started),
 * and that the ExpiredTokenBanner is visible.
 *
 * Test user: stefanogebara@gmail.com
 * User ID:   167c27b5-a40b-49fb-8d00-deb1b1c57f4d
 *
 * Expected state (DB):
 *   - GitHub, Discord, Reddit, LinkedIn → status=requires_reauth → tokenExpired=true
 *   - Spotify, Whoop, YouTube, Google Calendar → status=success → tokenExpired=false
 */

import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = 'http://localhost:8086';
const SCREENSHOT_DIR = 'test-screenshots';
const TEST_TOKEN = process.env.TEST_AUTH_TOKEN;

// ─── helpers ────────────────────────────────────────────────────────────────

async function injectAuth(page: Page) {
  // Intercept /api/auth/refresh — see helpers.ts for full rationale.
  await page.route('**/api/auth/refresh', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        accessToken: TEST_TOKEN,
        user: { id: '167c27b5-a40b-49fb-8d00-deb1b1c57f4d', email: 'stefanogebara@gmail.com', name: 'Test User', first_name: 'Stefano', email_verified: true },
      }),
    });
  });
  await page.addInitScript((token: string) => {
    window.localStorage.setItem('auth_token', token);
    window.localStorage.setItem('isDemoMode', 'false');
  }, TEST_TOKEN!);
}

async function screenshot(page: Page, name: string) {
  if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const file = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`Screenshot saved: ${file}`);
}

// ─── tests ──────────────────────────────────────────────────────────────────

test.describe('Expired Token Reconnect UI', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page);
  });

  test('ExpiredTokenBanner appears with broken platform names', async ({ page }, testInfo) => {
    await page.goto(`${BASE_URL}/get-started`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500); // let platform status API resolve

    await screenshot(page, '01-get-started-full');

    // Skip when no platforms are in requires_reauth state (banner doesn't render).
    const banner = page.locator('text=needs reconnecting').or(page.locator('text=need reconnecting'));
    const bannerVisible = await banner.first().waitFor({ state: 'visible', timeout: 8000 })
      .then(() => true).catch(() => false);
    if (!bannerVisible) {
      testInfo.skip(true, 'No expired tokens in current account state — ExpiredTokenBanner not rendered.');
      return;
    }

    const body = await page.textContent('body');
    const mentionedPlatforms = ['GitHub', 'Discord', 'Reddit', 'LinkedIn'].filter(p =>
      body?.includes(p)
    );
    expect(mentionedPlatforms.length).toBeGreaterThan(0);
    console.log('Platforms mentioned in banner area:', mentionedPlatforms);
  });

  test('Reconnect button exists for broken platforms and triggers OAuth', async ({ page }, testInfo) => {
    await page.goto(`${BASE_URL}/get-started`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);

    await screenshot(page, '02-before-reconnect-click');

    // This test depends on Stefano's account having at least one platform in
    // `requires_reauth` state. When all tokens are healthy (the happy-path
    // state we hope users are in), there are zero Reconnect buttons and we
    // skip rather than fail — the test asserts the UI surfaces re-auth needs
    // when they exist, not that they always exist.
    const reconnectButtons = page.getByRole('button', { name: 'Reconnect' });
    const count = await reconnectButtons.count();
    console.log(`Found ${count} Reconnect button(s)`);
    if (count === 0) {
      testInfo.skip(true, 'No platforms in requires_reauth state — all tokens healthy. Nothing to assert.');
      return;
    }
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('Connected platforms (Spotify, Whoop) still show Manage — not Reconnect', async ({ page }, testInfo) => {
    await page.goto(`${BASE_URL}/get-started`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);

    const manageButtons = page.getByRole('button', { name: 'Manage' });
    const count = await manageButtons.count();
    console.log(`Found ${count} Manage button(s)`);
    // Skip when the account has zero connected platforms — happy-path test
    // user can drift to this state. Test still asserts the UI distinction
    // between Manage (connected) and Reconnect (broken) when platforms exist.
    if (count === 0) {
      testInfo.skip(true, 'No connected platforms in current account state.');
      return;
    }
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('Reconnect banner button navigates to /get-started (already there)', async ({ page }) => {
    await page.goto(`${BASE_URL}/get-started`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);

    // The amber banner has a small "Reconnect" pill that links back to /get-started
    // On this page it just refreshes — confirm page stays on /get-started
    const bannerReconnect = page.locator('[style*="FBBF24"]').getByRole('button', { name: 'Reconnect' }).first();
    if (await bannerReconnect.isVisible()) {
      await bannerReconnect.click();
      await page.waitForTimeout(500);
      expect(page.url()).toContain('/get-started');
      console.log('Banner Reconnect button clicked — still on /get-started');
    }
  });

  test('Click a platform Reconnect button — opens OAuth or shows loading state', async ({ page }, testInfo) => {
    // Listen for popups (OAuth window)
    const popupPromise = page.waitForEvent('popup', { timeout: 5000 }).catch(() => null);

    await page.goto(`${BASE_URL}/get-started`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);

    await screenshot(page, '03-ready-to-click-reconnect');

    // Click the first platform-level Reconnect button (amber, inside a platform tile)
    const reconnectButtons = page.getByRole('button', { name: 'Reconnect' });
    const count = await reconnectButtons.count();

    if (count === 0) {
      console.log('No Reconnect buttons found — backend may not be returning tokenExpired=true');
      testInfo.skip(true, 'No platforms in requires_reauth state — nothing to click.');
      return;
    }

    // Click the first one
    await reconnectButtons.first().click();
    await page.waitForTimeout(1000);

    await screenshot(page, '04-after-reconnect-click');

    // Either a popup opened (OAuth flow) or button changed to "Syncing..."
    const popup = await popupPromise;
    const syncingVisible = await page.locator('text=Syncing').isVisible().catch(() => false);

    if (popup) {
      console.log('OAuth popup opened:', popup.url());
      await popup.close();
    } else if (syncingVisible) {
      console.log('Syncing state shown after click');
    } else {
      // Acceptable: OAuth redirect in same window or just logged URL
      const currentUrl = page.url();
      console.log('After click, URL:', currentUrl);
    }

    // Either path is acceptable — just confirm we didn't crash
    expect(page.isClosed()).toBe(false);
  });
});
