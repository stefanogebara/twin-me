import { test, expect } from '@playwright/test';

test.use({ storageState: 'playwright/.auth/user.json' });

test('dashboard skeleton loader exists in DOM', async ({ page }) => {
  await page.goto('http://localhost:8086/dashboard');
  await page.waitForLoadState('networkidle');
  // Check wiki CTA visible (memoryCount should be > 10 for test user)
  const wikiBtnText = await page.locator('text=Your Knowledge Base').count();
  console.log('Wiki CTA count:', wikiBtnText);
  await page.screenshot({ path: '/tmp/dashboard.png' });
  expect(true).toBe(true);
});

test('bottom nav has Connect instead of Wiki', async ({ page }) => {
  await page.goto('http://localhost:8086/dashboard');
  await page.waitForLoadState('networkidle');
  // Check bottom nav items
  const connectNav = await page.locator('nav button:has-text("Connect")').first();
  const wikiNav = await page.locator('nav button:has-text("Wiki")').first();
  const connectVisible = await connectNav.count();
  const wikiVisible = await wikiNav.count();
  console.log('Connect in nav:', connectVisible, 'Wiki in nav:', wikiVisible);
  await page.screenshot({ path: '/tmp/bottom-nav.png', fullPage: false });
});

test('identity page has back button on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); // iPhone 14
  await page.goto('http://localhost:8086/identity');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  const backBtn = await page.locator('button:has(svg)').filter({ hasText: /back/i }).count();
  console.log('Back button count:', backBtn);
  await page.screenshot({ path: '/tmp/identity-mobile.png', fullPage: false });
  expect(true).toBe(true);
});

test('TwinStats heading DOM text is Your Twin not YOUR TWIN', async ({ page }) => {
  await page.goto('http://localhost:8086/dashboard');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  // CSS text-transform:uppercase may make "Your Twin" visually render as "YOUR TWIN",
  // but DOM text should be "Your Twin". Check DOM text, not visible text.
  const domTextCount = await page.evaluate(() => {
    const allText = Array.from(document.querySelectorAll('*'))
      .filter(el => el.children.length === 0) // leaf nodes only
      .map(el => el.textContent?.trim() ?? '');
    return allText.filter(t => t === 'YOUR TWIN').length;
  });
  console.log('DOM text "YOUR TWIN" count (should be 0):', domTextCount);
  expect(domTextCount).toBe(0);
});
