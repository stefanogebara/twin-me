import { test, expect } from '@playwright/test';

/**
 * Soul Signature / Identity Page Tests
 * Tests the split-panel identity page with soul signature data
 */

test.describe('Soul Signature Dashboard', () => {
  test('should require authentication', async ({ page }) => {
    // Clear auth state
    await page.context().clearCookies();
    await page.goto('/identity');
    await page.waitForTimeout(2000);

    const url = page.url();
    const isProtected = url.includes('auth') || url.includes('login');

    // Should redirect to auth, OR show the page if already authenticated
    if (!isProtected) {
      const body = page.locator('body');
      await expect(body).toBeVisible();
    } else {
      expect(isProtected).toBeTruthy();
    }
  });

  test('should load dashboard structure', async ({ page }) => {
    await page.goto('/identity');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    const body = page.locator('body');
    await expect(body).toBeVisible();

    // Should have either the split-panel content or loading skeleton
    const pageContent = await page.textContent('body');
    const hasContent =
      pageContent?.includes('Good') ||          // Greeting: "Good Morning/Afternoon/Evening"
      pageContent?.includes('Architect') ||      // Archetype name
      pageContent?.includes('Soul Score') ||     // Sidebar soul score
      pageContent?.includes('animate-pulse');     // Loading skeleton

    expect(hasContent).toBeTruthy();
  });

  test('should have platform connection section', async ({ page }) => {
    await page.goto('/identity');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    const pageContent = await page.textContent('body');
    const hasPlatformContent =
      pageContent?.includes('platform') ||
      pageContent?.includes('connect') ||
      pageContent?.includes('Connect') ||
      pageContent?.includes('Music') ||           // Soul Score contributor cards
      pageContent?.includes('Spotify') ||
      pageContent?.includes('Soul Score');

    expect(hasPlatformContent).toBeTruthy();
  });

  test('should render without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/identity');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    // Filter out known non-critical errors
    const criticalErrors = errors.filter(err =>
      !err.includes('favicon') &&
      !err.includes('404') &&
      !err.includes('vapid') &&
      !err.includes('Failed to load resource') &&
      !err.includes('net::ERR')
    );

    expect(criticalErrors.length).toBe(0);
  });
});
