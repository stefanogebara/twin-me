import { test } from '@playwright/test';
test.use({ storageState: 'playwright/.auth/user.json' });

test('screenshot redesigned identity page', async ({ page }) => {
  await page.goto('/identity');
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(3000);
  
  // Dismiss hero overlay
  const btn = page.getByRole('button', { name: 'Explore' });
  if (await btn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await btn.click();
    await page.waitForTimeout(2000);
  }

  // Screenshot 1: Top section after hero
  await page.screenshot({ path: 'screenshots/identity-top.png' });

  // Scroll to score section
  await page.evaluate(() => window.scrollTo(0, 500));
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'screenshots/identity-score.png' });

  // Scroll to insight cards
  await page.evaluate(() => window.scrollTo(0, 1100));
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'screenshots/identity-cards.png' });

  // Scroll to personality DNA
  await page.evaluate(() => window.scrollTo(0, 1700));
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'screenshots/identity-dna.png' });

  // Full page
  await page.screenshot({ path: 'screenshots/identity-full.png', fullPage: true });
});
