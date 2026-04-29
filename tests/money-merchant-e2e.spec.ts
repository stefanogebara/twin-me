/**
 * E2E: /money page — merchant normalization visible in the UI.
 *
 * Signs in as stefanogebara@gmail.com via JWT injection (bypasses Google
 * OAuth entirely — same technique as auth.setup.ts). Navigates to the
 * production /money page and asserts:
 *
 *   1. Transactions load (at least one row visible)
 *   2. Every visible merchant name is populated (no nulls shown as "(sem descrição)")
 *   3. No merchant name is raw all-caps  (normalization is working end-to-end)
 *   4. Known brands resolve correctly (Uber, iFood, Amazon, Spotify, Rappi)
 *
 * Run:
 *   npx playwright test tests/money-merchant-e2e.spec.ts \
 *     --project=chromium \
 *     --config=playwright.config.ts \
 *     --reporter=list
 *
 * Requires TEST_AUTH_TOKEN in .env.test (already set — valid until 2026-05-11).
 */
import { test, expect } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env.test') });
dotenv.config({ path: path.resolve(__dirname, '../.env.production') });

const PROD_BASE = 'https://twin-ai-learn.vercel.app';
const JWT = process.env.TEST_AUTH_TOKEN;

// Synthetic user returned by the mocked refresh endpoint.
// AuthContext stores this in localStorage as auth_user and then calls
// /api/auth/verify which succeeds because JWT is signed with the real JWT_SECRET.
const TEST_USER = {
  id: '167c27b5-a40b-49fb-8d00-deb1b1c57f4d',
  email: 'stefanogebara@gmail.com',
  firstName: 'Stefano',
  lastName: 'Gebara',
};

test.describe('MoneyPage — merchant normalization E2E', () => {
  test.setTimeout(60_000);

  test.beforeEach(async ({ page }) => {
    // The app uses in-memory access tokens + httpOnly refresh cookie.
    // Intercept /api/auth/refresh before the first navigation so AuthContext
    // thinks the session is valid and skips the → /auth redirect.
    // checkAuth() will then call /api/auth/verify with the Bearer JWT, which
    // succeeds on production because the JWT is signed with the real JWT_SECRET.
    await page.route('**/api/auth/refresh', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, accessToken: JWT, user: TEST_USER }),
      });
    });
  });

  test('transactions load and all merchant names are populated', async ({ page }) => {
    await page.goto(`${PROD_BASE}/money`, { waitUntil: 'domcontentloaded' });

    // Wait for at least one transaction row to appear
    const rows = page.locator('[data-testid="transaction-row"]');
    await expect(rows.first()).toBeVisible({ timeout: 20_000 });

    const count = await rows.count();
    expect(count).toBeGreaterThan(0);

    // Every row must have a merchant name — no "(sem descrição)" placeholders
    const noDescCount = await page.locator('[data-testid="transaction-merchant"]', {
      hasText: '(sem descrição)',
    }).count();
    expect(noDescCount).toBe(0);

    // Every data-merchant attribute must be non-empty
    const allMerchants = await rows.evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-merchant'))
    );
    for (const m of allMerchants) {
      expect(m, `empty merchant attr on a row`).toBeTruthy();
    }
  });

  test('no raw all-caps merchant names survive to the UI', async ({ page }) => {
    await page.goto(`${PROD_BASE}/money`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-testid="transaction-row"]').first()).toBeVisible({ timeout: 20_000 });

    const merchants = await page
      .locator('[data-testid="transaction-merchant"]')
      .allTextContents();

    for (const name of merchants) {
      // A raw all-caps name would be ALL CAPS WITH SPACES AND NO LOWER CASE.
      // After normalizeMerchant, names are title-cased or known-brand cased.
      const isAllCaps = name === name.toUpperCase() && /[A-Z]{4,}/.test(name);
      expect(isAllCaps, `"${name}" looks like an un-normalized all-caps raw merchant`).toBe(false);
    }
  });

  test('known brands display correctly', async ({ page }) => {
    await page.goto(`${PROD_BASE}/money`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-testid="transaction-row"]').first()).toBeVisible({ timeout: 20_000 });

    const merchants = await page
      .locator('[data-testid="transaction-merchant"]')
      .allTextContents();

    // At least some of these are expected in stefano's account from the API check
    const knownBrands = ['Uber', 'iFood', 'Amazon', 'Spotify', 'Rappi'];
    const found = knownBrands.filter((b) => merchants.some((m) => m.includes(b)));

    expect(found.length, `expected at least 2 known brands, found: ${found.join(', ')}`).toBeGreaterThanOrEqual(2);
  });

  test('page screenshot — merchant list visual check', async ({ page }) => {
    await page.goto(`${PROD_BASE}/money`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-testid="transaction-row"]').first()).toBeVisible({ timeout: 20_000 });

    await page.screenshot({
      path: 'tests/screenshots/money-merchant-e2e.png',
      fullPage: false,
    });
  });
});
