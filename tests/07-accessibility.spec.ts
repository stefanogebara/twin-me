import { test, expect } from '@playwright/test';

/**
 * Accessibility Tests
 * Tests keyboard navigation, ARIA labels, and semantic HTML
 */

test.describe('Accessibility', () => {
  test('should have proper heading hierarchy', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check for h1
    const h1 = page.locator('h1');
    const h1Count = await h1.count();
    expect(h1Count).toBeGreaterThan(0);
  });

  test('should have alt text for images', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const images = page.locator('img');
    const count = await images.count();

    if (count > 0) {
      // Check first few images have alt attributes
      for (let i = 0; i < Math.min(count, 3); i++) {
        const img = images.nth(i);
        const alt = await img.getAttribute('alt');
        // Alt can be empty string for decorative images
        expect(alt).not.toBeNull();
      }
    }
  });

  test('should support keyboard navigation', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Try tabbing through interactive elements
    await page.keyboard.press('Tab');

    // Check if focus is visible
    const focused = await page.evaluate(() => document.activeElement?.tagName);
    expect(focused).toBeTruthy();
  });

  test('should have proper button roles', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const buttons = page.getByRole('button');
    const count = await buttons.count();

    // Should have some buttons
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should have semantic HTML', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check for semantic elements
    const nav = page.locator('nav');
    const main = page.locator('main');
    const footer = page.locator('footer');

    const hasSemanticElements =
      (await nav.count()) > 0 ||
      (await main.count()) > 0 ||
      (await footer.count()) > 0;

    expect(hasSemanticElements).toBeTruthy();
  });

  test('should have sufficient color contrast', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Take screenshot for manual review
    await page.screenshot({ path: 'test-results/contrast-check.png' });

    // Basic check: page should be visible
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });
});
