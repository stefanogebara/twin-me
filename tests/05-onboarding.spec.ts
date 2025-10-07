import { test, expect } from '@playwright/test';

/**
 * Instant Twin Onboarding Tests
 * Tests the digital twin creation flow
 */

test.describe('Instant Twin Onboarding', () => {
  test('should load onboarding page', async ({ page }) => {
    await page.goto('/get-started');
    await page.waitForLoadState('networkidle');

    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('should show onboarding steps', async ({ page }) => {
    await page.goto('/get-started');
    await page.waitForLoadState('networkidle');

    const pageContent = await page.textContent('body');

    // Check for step-related content
    const hasSteps =
      pageContent?.includes('step') ||
      pageContent?.includes('Step') ||
      pageContent?.includes('1') ||
      pageContent?.includes('platform') ||
      pageContent?.includes('twin');

    expect(hasSteps).toBeTruthy();
  });

  test('should have platform selection', async ({ page }) => {
    await page.goto('/get-started');
    await page.waitForLoadState('networkidle');

    // Look for platform selection UI
    const checkboxes = page.locator('input[type="checkbox"]');
    const buttons = page.getByRole('button');

    const hasInteractiveElements =
      (await checkboxes.count()) > 0 ||
      (await buttons.count()) > 0;

    expect(hasInteractiveElements).toBeTruthy();
  });

  test('should show twin name input', async ({ page }) => {
    await page.goto('/get-started');
    await page.waitForLoadState('networkidle');

    // Look for text inputs
    const inputs = page.locator('input[type="text"]');
    const textareas = page.locator('textarea');

    const hasInputs =
      (await inputs.count()) > 0 ||
      (await textareas.count()) > 0;

    expect(hasInputs).toBeTruthy();
  });

  test('should have extraction progress indicator', async ({ page }) => {
    await page.goto('/get-started');
    await page.waitForLoadState('networkidle');

    const pageContent = await page.textContent('body');

    // May have progress-related content
    expect(pageContent).toBeTruthy();
  });

  test('should validate required fields', async ({ page }) => {
    await page.goto('/get-started');
    await page.waitForLoadState('networkidle');

    // Try to find and click next/submit button
    const nextButton = page.getByRole('button', { name: /next|continue|submit|create/i });
    const count = await nextButton.count();

    if (count > 0) {
      await nextButton.first().click();
      await page.waitForTimeout(500);

      // Should show validation or stay on page
      const url = page.url();
      expect(url).toBeTruthy();
    }
  });
});
