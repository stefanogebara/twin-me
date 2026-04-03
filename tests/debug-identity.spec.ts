import { test, expect } from '@playwright/test';
test('debug identity errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate((t) => localStorage.setItem('auth_token', t), process.env.TEST_AUTH_TOKEN!);
  await page.goto('/identity');
  await page.waitForTimeout(5000);
  
  console.log('=== ERRORS ===');
  for (const e of errors.slice(0, 10)) console.log(e.slice(0, 200));
  console.log('=== END ===');
});
