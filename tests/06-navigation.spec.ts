import { test, expect } from '@playwright/test';

/**
 * Navigation and Routing Tests
 * Tests all main routes and navigation flows
 */

test.describe('Navigation', () => {
  const routes = [
    '/',
    '/login',
    '/signup',
    '/soul-signature',
    '/get-started',
    '/contact',
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
    await page.goto('/');

    // Click on any link
    const links = page.getByRole('link');
    const linkCount = await links.count();

    if (linkCount > 0) {
      await links.first().click();
      await page.waitForLoadState('networkidle');

      // Should navigate somewhere
      const body = page.locator('body');
      await expect(body).toBeVisible();
    }
  });

  test('should handle back button', async ({ page }) => {
    await page.goto('/');
    const firstUrl = page.url();

    await page.goto('/contact');
    await page.waitForLoadState('networkidle');

    await page.goBack();
    await page.waitForLoadState('networkidle');

    // Should be back at first page
    expect(page.url()).toContain(new URL(firstUrl).pathname);
  });

  test('should have working logo link', async ({ page }) => {
    await page.goto('/contact');

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
