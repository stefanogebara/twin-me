import { test } from '@playwright/test';
const TOKEN = process.env.TEST_AUTH_TOKEN!;
test('departments detail', async ({ page }) => {
  await page.addInitScript((t) => {
    localStorage.setItem('auth_token', t);
    localStorage.setItem('auth_user', JSON.stringify({ id: '167c27b5-a40b-49fb-8d00-deb1b1c57f4d', email: 'stefanogebara@gmail.com', firstName: 'Stefano' }));
  }, TOKEN);
  await page.goto('http://localhost:8086/departments');
  await page.waitForTimeout(6000);
  // Top section
  await page.screenshot({ path: 'test-screenshots/dept-top.png', fullPage: false });
  // Scroll to proposals
  await page.evaluate(() => window.scrollBy(0, 500));
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-screenshots/dept-proposals.png', fullPage: false });
});
