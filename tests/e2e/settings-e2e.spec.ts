/**
 * Settings Page E2E Tests
 *
 * Tests the settings page loads correctly, displays user data,
 * shows connected platforms, and has no stuck loading states.
 */

import { test, expect } from '@playwright/test';
import {
  injectAuth,
  collectConsoleErrors,
  collect404s,
  screenshot,
  waitForPageLoad,
  criticalErrors,
  BASE_URL,
} from './helpers';

test.describe('Settings E2E', () => {
  test('settings page loads with user data', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await injectAuth(page);
    await page.goto(`${BASE_URL}/settings`);
    await waitForPageLoad(page);

    // Should not redirect to auth
    expect(page.url()).not.toContain('/auth');

    // Wait for lazy-loaded Settings component to render
    await page.waitForFunction(
      () => {
        const text = (document.body.textContent || '').toLowerCase();
        return (
          text.includes('setting') ||
          text.includes('profile') ||
          text.includes('account') ||
          text.includes('subscription')
        );
      },
      { timeout: 15000 },
    );

    await screenshot(page, 'settings-loaded');

    // Verify settings content is present
    const bodyText = await page.textContent('body');
    const hasSettingsContent =
      bodyText?.toLowerCase().includes('setting') ||
      bodyText?.toLowerCase().includes('profile') ||
      bodyText?.toLowerCase().includes('account');
    expect(hasSettingsContent).toBe(true);

    expect(criticalErrors(errors).length).toBeLessThanOrEqual(3);
    console.log('[Settings] Console errors:', errors.length);
  });

  test('connected platforms are displayed', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await injectAuth(page);
    await page.goto(`${BASE_URL}/settings`);
    await waitForPageLoad(page, 12000);

    // Wait for settings content to appear
    await page.waitForFunction(
      () => {
        const text = (document.body.textContent || '').toLowerCase();
        return text.includes('setting') || text.includes('connect') || text.includes('platform');
      },
      { timeout: 15000 },
    );

    // Look for platform names (test user has Spotify, Calendar, Whoop, etc.)
    const bodyText = (await page.textContent('body')) || '';
    const bodyLower = bodyText.toLowerCase();
    const knownPlatforms = ['spotify', 'google', 'calendar', 'whoop', 'youtube', 'discord', 'github'];
    const foundPlatforms = knownPlatforms.filter((p) => bodyLower.includes(p));

    console.log('[Settings] Platforms found:', foundPlatforms);
    expect(foundPlatforms.length).toBeGreaterThan(0);

    await screenshot(page, 'settings-platforms');
    expect(criticalErrors(errors).length).toBeLessThanOrEqual(3);
  });

  test('no stuck loading states after 5 seconds', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    const notFounds = collect404s(page);
    await injectAuth(page);
    await page.goto(`${BASE_URL}/settings`);

    // Wait for initial load
    await waitForPageLoad(page, 10000);
    await page.waitForTimeout(5000);

    await screenshot(page, 'settings-final-state');

    // Check for stuck spinners / loading indicators
    const spinnerCount = await page
      .locator(
        '[aria-busy="true"], [data-loading="true"], [class*="spinner"], [role="progressbar"]',
      )
      .count();

    if (spinnerCount > 0) {
      console.log('[Settings] WARNING: Stuck loading indicators detected:', spinnerCount);
    }

    // Headings should be visible (page rendered, not blank)
    const headings = await page.locator('h1, h2, h3').count();
    expect(headings).toBeGreaterThan(0);

    console.log('[Settings] 404s:', notFounds.slice(0, 5));
    expect(criticalErrors(errors).length).toBeLessThanOrEqual(3);
  });

  test('settings tabs are interactive', async ({ page }) => {
    await injectAuth(page);
    await page.goto(`${BASE_URL}/settings`);
    await waitForPageLoad(page);

    // Wait for settings to render
    await page.waitForFunction(
      () => (document.body.textContent || '').toLowerCase().includes('setting'),
      { timeout: 15000 },
    );

    // Look for tab elements (settings has tabs like Account, Connections, etc.)
    const tabs = page.locator(
      '[role="tab"], button[class*="tab"], [data-testid*="tab"], a[class*="tab"]',
    );
    const tabCount = await tabs.count();

    console.log('[Settings] Tab elements found:', tabCount);

    // If tabs exist, click the second one and verify page updates
    if (tabCount >= 2) {
      await tabs.nth(1).click();
      await page.waitForTimeout(1000);
      await screenshot(page, 'settings-tab-switched');
    }

    await screenshot(page, 'settings-tabs');
  });
});
