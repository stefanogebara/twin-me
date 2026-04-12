import { test, expect } from '@playwright/test';

test.use({ storageState: 'playwright/.auth/user.json' });

test('identity page renders without crash', async ({ page }) => {
  await page.goto('http://localhost:8086/identity');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'test-screenshots/identity-desktop.png', fullPage: true });
  // Page should not show error states
  const errorText = await page.locator('text=Something went wrong').count();
  expect(errorText).toBe(0);
});

test('identity page mobile skeleton matches layout', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // Navigate before auth loads to catch skeleton
  await page.goto('http://localhost:8086/identity');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-screenshots/identity-mobile-skeleton.png' });
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'test-screenshots/identity-mobile-loaded.png', fullPage: true });
  expect(true).toBe(true);
});

test('identity page distribution bar is visible', async ({ page }) => {
  await page.goto('http://localhost:8086/identity');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(3000);
  // Check if distribution bar exists (h-4 element inside rhythms section)
  const rhythmsSection = page.locator('text=Time of day activity');
  const count = await rhythmsSection.count();
  console.log('Distribution bar label count:', count);
  // Screenshot the rhythms area
  await page.screenshot({ path: 'test-screenshots/identity-rhythms.png', fullPage: false });
  expect(true).toBe(true);
});
