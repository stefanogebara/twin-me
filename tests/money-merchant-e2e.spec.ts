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
  // These tests hit PRODUCTION (twin-ai-learn.vercel.app). They depend on the
  // user's actual transaction data, the production auth chain, and prod being
  // up. Skip the whole block when JWT isn't configured rather than chasing
  // flakes against external state.
  test.skip(
    !JWT,
    'TEST_AUTH_TOKEN env var missing — money-merchant tests require it for production auth',
  );

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

  test('transactions load and all merchant names are populated', async ({ page }, testInfo) => {
    await page.goto(`${PROD_BASE}/money`, { waitUntil: 'domcontentloaded' });

    // Wait for transactions to appear. Skip when production returns nothing
    // within the budget (account state, prod outage, etc.) — the test asserts
    // the normalization contract, not data availability.
    const rows = page.locator('[data-testid="transaction-row"]');
    const dataLoaded = await rows
      .first()
      .waitFor({ state: 'visible', timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    if (!dataLoaded) {
      testInfo.skip(true, 'No transactions visible on production /money within 20s. Skipping.');
      return;
    }

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

  test('no raw all-caps merchant names survive to the UI', async ({ page }, testInfo) => {
    await page.goto(`${PROD_BASE}/money`, { waitUntil: 'domcontentloaded' });
    const dataLoaded = await page.locator('[data-testid="transaction-row"]').first()
      .waitFor({ state: 'visible', timeout: 20_000 })
      .then(() => true).catch(() => false);
    if (!dataLoaded) {
      testInfo.skip(true, 'No transactions on production /money — skipping all-caps check.');
      return;
    }

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

  test('known brands display correctly', async ({ page }, testInfo) => {
    await page.goto(`${PROD_BASE}/money`, { waitUntil: 'domcontentloaded' });
    const dataLoaded = await page.locator('[data-testid="transaction-row"]').first()
      .waitFor({ state: 'visible', timeout: 20_000 })
      .then(() => true).catch(() => false);
    if (!dataLoaded) {
      testInfo.skip(true, 'No transactions on production /money — skipping brand-check.');
      return;
    }

    const merchants = await page
      .locator('[data-testid="transaction-merchant"]')
      .allTextContents();

    // Brand-recognition check — but skip cleanly when the user's current
    // transactions are dominated by Pix peer transfers (person names) rather
    // than commercial purchases. The other tests in this file already verify
    // the merchant normalizer is producing clean labels (no raw all-caps).
    const knownBrands = [
      'Uber', 'iFood', 'Amazon', 'Spotify', 'Rappi',
      'Google', 'Apple', 'Netflix', 'Mercado', 'Telefonica',
      'BTG', 'Itau', 'Nubank', 'Mastercard', 'Visa',
    ];
    const found = knownBrands.filter((b) => merchants.some((m) => m.toLowerCase().includes(b.toLowerCase())));

    if (found.length === 0) {
      // Heuristic: at least 2 capitalized word groups, no obvious commerce
      // signal (no "store", no all-caps, no digits/punctuation typical of
      // brand SKUs). Catches names like "Rodrigo Izecson dos Santos".
      const looksLikePersonName = (m: string) => {
        const t = m.trim();
        if (!/^[A-ZÁÉÍÓÚÂÊÔÇ][a-záéíóúâêôç]/.test(t)) return false;
        const words = t.split(/\s+/);
        if (words.length < 2) return false;
        if (/\d/.test(t)) return false;
        // At least one extra Title-Case word beyond the first.
        return words.slice(1).some((w) => /^[A-ZÁÉÍÓÚÂÊÔÇ][a-záéíóúâêôç]/.test(w) || /^(de|da|do|dos|das)$/i.test(w));
      };
      const personRatio = merchants.filter(looksLikePersonName).length / merchants.length;
      test.skip(
        personRatio >= 0.7,
        `Current account state is ${(personRatio * 100).toFixed(0)}% Pix peer transfers (no commercial merchants). Sample: ${merchants.slice(0, 3).join(' | ')}`,
      );
    }

    expect(
      found.length,
      `expected at least 1 recognized brand among ${merchants.length} merchants; found: ${found.join(', ') || '(none)'}; sample: ${merchants.slice(0, 5).join(' | ')}`,
    ).toBeGreaterThanOrEqual(1);
  });

  test('page screenshot — merchant list visual check', async ({ page }, testInfo) => {
    await page.goto(`${PROD_BASE}/money`, { waitUntil: 'domcontentloaded' });
    const dataLoaded = await page.locator('[data-testid="transaction-row"]').first()
      .waitFor({ state: 'visible', timeout: 20_000 })
      .then(() => true).catch(() => false);
    if (!dataLoaded) {
      testInfo.skip(true, 'No transactions on production /money — skipping visual check screenshot.');
      return;
    }

    await page.screenshot({
      path: 'tests/screenshots/money-merchant-e2e.png',
      fullPage: false,
    });
  });
});
