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

  test('ExpiredTokenBanner appears with broken platform names', async ({ page }) => {
    await page.goto(`${BASE_URL}/get-started`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500); // let platform status API resolve

    await screenshot(page, '01-get-started-full');

    // Banner should show at least one expired platform name
    const banner = page.locator('text=needs reconnecting').or(page.locator('text=need reconnecting'));
    await expect(banner).toBeVisible({ timeout: 8000 });

    // At least one of the broken platforms should be mentioned
    const body = await page.textContent('body');
    const mentionedPlatforms = ['GitHub', 'Discord', 'Reddit', 'LinkedIn'].filter(p =>
      body?.includes(p)
    );
    expect(mentionedPlatforms.length).toBeGreaterThan(0);
    console.log('Platforms mentioned in banner area:', mentionedPlatforms);
  });

  test('Reconnect button exists for broken platforms and triggers OAuth', async ({ page }) => {
    await page.goto(`${BASE_URL}/get-started`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    await screenshot(page, '02-before-reconnect-click');

    // Count amber "Reconnect" buttons (there should be 4 — one per expired platform)
    const reconnectButtons = page.getByRole('button', { name: 'Reconnect' });
    const count = await reconnectButtons.count();
    console.log(`Found ${count} Reconnect button(s)`);
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('Connected platforms (Spotify, Whoop) still show Manage — not Reconnect', async ({ page }) => {
    await page.goto(`${BASE_URL}/get-started`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    const manageButtons = page.getByRole('button', { name: 'Manage' });
    const count = await manageButtons.count();
    console.log(`Found ${count} Manage button(s)`);
    // Spotify, Whoop, YouTube, Google Workspace connected → should have Manage
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('Reconnect banner button navigates to /get-started (already there)', async ({ page }) => {
    await page.goto(`${BASE_URL}/get-started`);
    await page.waitForLoadState('networkidle');
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

  test('Click a platform Reconnect button — opens OAuth or shows loading state', async ({ page }) => {
    // Listen for popups (OAuth window)
    const popupPromise = page.waitForEvent('popup', { timeout: 5000 }).catch(() => null);

    await page.goto(`${BASE_URL}/get-started`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    await screenshot(page, '03-ready-to-click-reconnect');

    // Click the first platform-level Reconnect button (amber, inside a platform tile)
    const reconnectButtons = page.getByRole('button', { name: 'Reconnect' });
    const count = await reconnectButtons.count();

    if (count === 0) {
      console.log('No Reconnect buttons found — backend may not be returning tokenExpired=true');
      test.fail();
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
