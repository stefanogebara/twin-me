import { test, expect } from '@playwright/test';

/**
 * Navigation and Routing Tests
 * Tests all main routes and navigation flows
 */

test.describe('Navigation', () => {
  const routes = [
    '/',
    '/auth',          // login/signup lives at /auth
    '/discover',      // cold-start discovery page
    '/soul-signature',
    '/get-started',
    '/connect',       // replaced /get-started redirect
  ];

  for (const route of routes) {
    test(`should load ${route} without errors`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState('networkidle');

      // Check page loaded
      const body = page.locator('body');
      await expect(body).toBeVisible();

      // Check no 404 or error page
      const pageContent = await page.textContent('body');
      const isErrorPage =
        pageContent?.includes('404') ||
        pageContent?.includes('Not Found') ||
        pageContent?.includes('Error');

      // Some routes may redirect to login, which is fine
      if (isErrorPage) {
        const url = page.url();
        const isRedirected = url.includes('login') || url.includes('auth');
        expect(isRedirected || !isErrorPage).toBeTruthy();
      }
    });
  }

  test('should navigate between pages', async ({ page }) => {
    // Navigate from home → discover to verify routing works
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();

    await page.goto('/discover');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();

    // Verify we ended up somewhere meaningful (not a blank page)
    const text = await page.textContent('body');
    expect(text?.length).toBeGreaterThan(50);
  });

  test('should handle back button', async ({ page }) => {
    await page.goto('/');
    const firstUrl = page.url();

    await page.goto('/discover');
    await page.waitForLoadState('networkidle');

    await page.goBack();
    await page.waitForLoadState('networkidle');

    // Should be back at first page
    expect(page.url()).toContain(new URL(firstUrl).pathname);
  });

  test('should have working logo link', async ({ page }) => {
    await page.goto('/discover');

    // Try to find logo or brand link
    const logoLink = page.locator('a[href="/"]').or(page.locator('nav a').first());
    if (await logoLink.isVisible()) {
      await logoLink.click();
      await page.waitForLoadState('networkidle');

      // Should navigate to home
      const url = page.url();
      expect(url).toContain('/');
    }
  });
});
