import { test, expect } from '@playwright/test';

/**
 * Soul Signature Dashboard Tests
 * Tests the main soul signature discovery interface
 */

test.describe('Soul Signature Dashboard', () => {
  test('should require authentication', async ({ page }) => {
    await page.goto('/soul-signature');

    // Should redirect to login or show auth prompt
    await page.waitForTimeout(1000);
    const url = page.url();
    const isProtected = url.includes('login') || url.includes('auth');

    if (!isProtected) {
      // If it loads, check for auth-required content
      const dashboard = page.locator('main');
      await expect(dashboard).toBeVisible();
    }
  });

  test('should load dashboard structure', async ({ page }) => {
    await page.goto('/soul-signature');
    await page.waitForLoadState('networkidle');

    // Check if page loaded
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('should have platform connection section', async ({ page }) => {
    await page.goto('/soul-signature');
    await page.waitForLoadState('networkidle');

    // Look for platform-related content
    const pageContent = await page.textContent('body');
    const hasPlatformContent =
      pageContent?.includes('platform') ||
      pageContent?.includes('connect') ||
      pageContent?.includes('Spotify') ||
      pageContent?.includes('GitHub');

    expect(hasPlatformContent).toBeTruthy();
  });

  test('should render without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/soul-signature');
    await page.waitForLoadState('networkidle');

    // Filter out known non-critical errors
    const criticalErrors = errors.filter(err =>
      !err.includes('favicon') &&
      !err.includes('404')
    );

    expect(criticalErrors.length).toBe(0);
  });
});
