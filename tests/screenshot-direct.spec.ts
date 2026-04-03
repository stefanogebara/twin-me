import { test } from '@playwright/test';

test('screenshot identity with inline auth', async ({ page }) => {
  // Go to app first to init localStorage
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  
  // Inject token
  await page.evaluate((token) => {
    localStorage.setItem('auth_token', token);
  }, 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjE2N2MyN2I1LWE0MGItNDlmYi04ZDAwLWRlYjFiMWM1N2Y0ZCIsImVtYWlsIjoic3RlZmFub2dlYmFyYUBnbWFpbC5jb20iLCJpYXQiOjE3NzQ2MjExNTIsImV4cCI6MTc3NDYyODM1Mn0.d80hD7ONsPGoCB2MHaVl_5R8Naqg8ErCBkWijsKwWJU');
  
  // Navigate to identity
  await page.goto('/identity');
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(3000);
  
  // Dismiss hero
  const btn = page.getByRole('button', { name: 'Explore' });
  if (await btn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await btn.click();
    await page.waitForTimeout(2000);
  }

  // Screenshots
  await page.screenshot({ path: 'screenshots/id-top.png' });
  
  await page.evaluate(() => window.scrollTo(0, 500));
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'screenshots/id-score.png' });
  
  await page.evaluate(() => window.scrollTo(0, 1100));
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'screenshots/id-cards.png' });
  
  await page.evaluate(() => window.scrollTo(0, 1700));
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'screenshots/id-dna.png' });
  
  await page.screenshot({ path: 'screenshots/id-full.png', fullPage: true });
});
