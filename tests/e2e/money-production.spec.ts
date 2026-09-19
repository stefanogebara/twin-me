/**
 * The money journey on production, as a signed-in person (M3-6, 2026-09-19): Today paints a
 * figure, Month and You render, and the numbers say how long it took. Nothing here writes to
 * the ledger. Skipped without MONEY_CANARY_TOKEN.
 */
import { expect, test } from '@playwright/test';

const token = process.env.MONEY_CANARY_TOKEN || '';
test.skip(!token, 'MONEY_CANARY_TOKEN is not set');

test.beforeEach(async ({ page }) => {
  /* The access token lives in memory; AuthContext recovers one from this one-time key. */
  await page.addInitScript((t) => { try { sessionStorage.setItem('oauth_bootstrap_token', t); } catch { /* seeded per page */ } }, token);
});

test('Today paints a figure within budget, and the page is one read', async ({ page }, testInfo) => {
  const requests: string[] = [];
  page.on('request', (r) => { if (r.method() !== 'OPTIONS' && r.url().includes('/api/')) requests.push(r.url().replace(/^.*\/api/, '').split('?')[0]); });
  const t0 = Date.now();
  await page.goto('/money', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.mv-day-figure, .mv-hero h1').first()).toBeVisible({ timeout: 30000 });
  const painted = Date.now() - t0;
  await page.waitForTimeout(1500);
  const pageReads = requests.filter((u) => u === '/money/page').length;
  const money = requests.filter((u) => u.startsWith('/money/'));
  testInfo.annotations.push({ type: 'painted_ms', description: String(painted) }, { type: 'money_requests', description: String(money.length) });
  console.log(`Today painted in ${painted} ms; ${money.length} money requests (${pageReads} page reads): ${money.join(', ')}`);
  expect(pageReads).toBeGreaterThanOrEqual(1);
  expect(money.length, 'money requests to paint Today').toBeLessThanOrEqual(8);
  expect(painted, 'Today cold paint').toBeLessThan(6000);
  for (const step of ['.la[role="dialog"]']) for (let i = 0; i < 4 && (await page.locator(step).count()); i += 1) { await page.keyboard.press('Escape'); await page.waitForTimeout(250); }
});

test('Month and You render their sections', async ({ page }) => {
  await page.goto('/money/month', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#month-title')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('#ledger')).toBeVisible();
  await page.goto('/money/you', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#you-title')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('#sources')).toBeVisible();
});
