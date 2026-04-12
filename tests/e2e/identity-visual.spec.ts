import { test, expect } from '@playwright/test';

const TOKEN = process.env.TEST_AUTH_TOKEN!;

function seedAuth(token: string) {
  localStorage.setItem('auth_token', token);
  localStorage.setItem('auth_user', JSON.stringify({
    id: '167c27b5-a40b-49fb-8d00-deb1b1c57f4d',
    email: 'stefanogebara@gmail.com',
    firstName: 'Stefano',
  }));
  localStorage.setItem('soul_sig_revealed_v2', '1'); // skip first-time reveal overlay
}

test('identity page renders with hero card and key sections', async ({ page }) => {
  await page.addInitScript(seedAuth, TOKEN);

  await page.goto('http://localhost:8086/identity');
  await page.waitForTimeout(5000);
  await page.screenshot({ path: 'test-screenshots/identity-hero.png', fullPage: false });

  // Scroll to rhythms/taste cards
  await page.evaluate(() => window.scrollBy(0, 700));
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test-screenshots/identity-rhythms.png', fullPage: false });

  // Full page
  await page.screenshot({ path: 'test-screenshots/identity-full.png', fullPage: true });
});

test('mobile layout renders content (not blank) on identity page', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.addInitScript(seedAuth, TOKEN);

  await page.goto('http://localhost:8086/identity');
  await page.waitForTimeout(5000);
  await page.screenshot({ path: 'test-screenshots/identity-mobile.png', fullPage: false });

  // Verify some content rendered (not blank black screen)
  const visibleText = await page.evaluate(() => document.body.innerText.trim());
  expect(visibleText.length).toBeGreaterThan(50);
});
