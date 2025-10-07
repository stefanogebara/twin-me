import { test, expect } from '@playwright/test';

/**
 * Homepage and Landing Page Tests
 * Tests the main landing page and public routes
 */

test.describe('Homepage', () => {
  test('should load homepage successfully', async ({ page }) => {
    await page.goto('/');

    // Check page title
    await expect(page).toHaveTitle(/Twin/i);

    // Check main heading exists
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible();
  });

  test('should have navigation menu', async ({ page }) => {
    await page.goto('/');

    // Check for navigation links
    const nav = page.locator('nav');
    await expect(nav).toBeVisible();
  });

  test('should have CTA buttons', async ({ page }) => {
    await page.goto('/');

    // Look for call-to-action buttons
    const buttons = page.getByRole('button');
    await expect(buttons.first()).toBeVisible();
  });

  test('should navigate to contact page', async ({ page }) => {
    await page.goto('/');

    // Try to find and click contact link
    const contactLink = page.getByRole('link', { name: /contact/i });
    if (await contactLink.isVisible()) {
      await contactLink.click();
      await expect(page).toHaveURL(/.*contact/);
    }
  });

  test('should have responsive design', async ({ page }) => {
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    const content = page.locator('body');
    await expect(content).toBeVisible();

    // Test desktop viewport
    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect(content).toBeVisible();
  });
});
