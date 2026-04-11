/**
 * Wiki Visual Audit -- Critical UI/UX screenshots at multiple viewports
 */
import { test } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'https://twin-ai-learn.vercel.app';
const JWT = process.env.TEST_AUTH_TOKEN || '';

test('wiki visual audit -- desktop + mobile + scroll', async ({ browser }) => {
  test.skip(!JWT, 'TEST_AUTH_TOKEN not set');

  const context = await browser.newContext();
  const page = await context.newPage();

  // Auth
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.evaluate((token) => {
    localStorage.setItem('auth_token', token);
    localStorage.setItem('token', token);
  }, JWT);

  // Desktop viewport
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE_URL}/wiki`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(4000);

  // Screenshot 1: Desktop hero (top of page)
  await page.screenshot({ path: 'test-screenshots/wiki-desktop-top.png' });

  // Screenshot 2: Desktop full page
  await page.screenshot({ path: 'test-screenshots/wiki-desktop-full.png', fullPage: true });

  // Screenshot 3: First card close-up
  const firstCard = page.locator('[class*="rounded-"]').first();
  if (await firstCard.isVisible()) {
    await firstCard.screenshot({ path: 'test-screenshots/wiki-card-closeup.png' });
  }

  // Screenshot 4: Scroll to middle
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.4));
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-screenshots/wiki-desktop-mid.png' });

  // Screenshot 5: Mobile viewport
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${BASE_URL}/wiki`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'test-screenshots/wiki-mobile-top.png' });
  await page.screenshot({ path: 'test-screenshots/wiki-mobile-full.png', fullPage: true });

  // Screenshot 6: Tablet viewport
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto(`${BASE_URL}/wiki`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'test-screenshots/wiki-tablet.png' });

  // Log page structure for analysis
  const bodyText = await page.textContent('body') || '';
  console.log('Page length:', bodyText.length, 'chars');
  console.log('Has Knowledge Base heading:', bodyText.includes('Knowledge Base'));

  // Count domain sections
  for (const d of ['Personality Profile', 'Lifestyle Patterns', 'Cultural Identity', 'Social Dynamics', 'Motivation']) {
    console.log(`  ${bodyText.includes(d) ? 'Y' : 'N'} ${d}`);
  }

  // Count cross-ref buttons
  const crossRefs = page.locator('button:has-text("Personality"), button:has-text("Lifestyle"), button:has-text("Cultural"), button:has-text("Social"), button:has-text("Motivation")');
  console.log('Cross-ref buttons:', await crossRefs.count());

  await context.close();
});
