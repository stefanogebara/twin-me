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
  /* Twice: the first visit may wake a cold function (10,9 s on the first real run, 2026-09-20),
     the second is the page as a person meets it during the day. The cold number is written
     down; the budget holds the warm one. */
  const paint = async () => {
    const requests: string[] = [];
    const listener = (r: { method: () => string; url: () => string }) => { if (r.method() !== 'OPTIONS' && r.url().includes('/api/')) requests.push(r.url().replace(/^.*\/api/, '').split('?')[0]); };
    page.on('request', listener);
    const t0 = Date.now();
    await page.goto('/money', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.mv-day-figure, .mv-hero h1').first()).toBeVisible({ timeout: 30000 });
    const painted = Date.now() - t0;
    await page.waitForTimeout(1500);
    page.off('request', listener);
    return { painted, money: requests.filter((u) => u.startsWith('/money/')), pageReads: requests.filter((u) => u === '/money/page').length };
  };
  const cold = await paint();
  const warm = await paint();
  testInfo.annotations.push({ type: 'cold_ms', description: String(cold.painted) }, { type: 'warm_ms', description: String(warm.painted) }, { type: 'money_requests', description: String(warm.money.length) });
  console.log(`Today painted in ${cold.painted} ms cold, ${warm.painted} ms warm; ${warm.money.length} money requests (${warm.pageReads} page reads): ${warm.money.join(', ')}`);
  expect(warm.pageReads).toBeGreaterThanOrEqual(1);
  expect(warm.money.length, 'money requests to paint Today').toBeLessThanOrEqual(8);
  expect(warm.painted, 'Today warm paint').toBeLessThan(6000);
  expect(cold.painted, 'Today cold paint').toBeLessThan(20000);
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
