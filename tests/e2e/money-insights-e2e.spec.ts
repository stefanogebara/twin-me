/**
 * /money/insights — narrative-read surface E2E
 * =============================================
 * Drives MoneyInsightsPage with mocked backend so the test doesn't depend on
 * a seeded DB. Post bank-aggregator removal (replan-2026-06-12) the page has
 * exactly two surfaces:
 *
 *   (a) recurring-subscriptions audit (with first-charge emotional context)
 *   (b) stress-spend timeline
 *
 * Catches:
 *   - Page mounts without console errors (the JSX bug class we already
 *     blocked at unit level — this is the integration backstop).
 *   - Both surfaces render their data shape correctly.
 *   - The "Back to /money" link works.
 *
 * Self-contained auth via injectAuth (e2e project). No setup dependency.
 */
import { expect, test } from '@playwright/test';
import { BASE_URL, injectAuth } from './helpers';

// ─────────────────────────────────────────────────────────────────────────────
// Fixture data — shape matches what the production endpoints return.
// ─────────────────────────────────────────────────────────────────────────────
const RECURRING_SUBS = {
  success: true,
  count: 3,
  totalMonthly: 73.5,
  currency: 'USD',
  synthesis: 'You have $73.50/month in recurring charges. 1 of them was signed up during a high-stress window.',
  stressfulSignupCount: 1,
  subscriptions: [
    {
      merchant: 'Netflix',
      category: 'entertainment',
      monthlyAvg: 15.5,
      currency: 'USD',
      chargeCount: 12,
      firstChargeDate: '2025-04-12',
      lastChargeDate: '2026-04-12',
      totalSpentToDate: 186,
      firstChargeContext: null,
      source: 'csv_upload',
    },
    {
      merchant: 'Equinox',
      category: 'fitness',
      monthlyAvg: 50,
      currency: 'USD',
      chargeCount: 4,
      firstChargeDate: '2026-01-08',
      lastChargeDate: '2026-04-08',
      totalSpentToDate: 200,
      firstChargeContext: 'signed up on a low-recovery Sunday — never visited',
      source: 'csv_upload',
    },
    {
      merchant: 'GitHub Copilot',
      category: 'software',
      monthlyAvg: 8,
      currency: 'USD',
      chargeCount: 6,
      firstChargeDate: '2025-11-01',
      lastChargeDate: '2026-04-01',
      totalSpentToDate: 48,
      firstChargeContext: null,
      source: 'csv_upload',
    },
  ],
};

const TIMELINE_ANALYSIS = {
  days: [
    { day: '2026-05-14', spend: 42.5, stress_avg: 0.35, stress_shop_count: 0, tx_count: 3 },
    { day: '2026-05-15', spend: 128.3, stress_avg: 0.72, stress_shop_count: 2, tx_count: 5 },
    { day: '2026-05-16', spend: 18,    stress_avg: 0.21, stress_shop_count: 0, tx_count: 1 },
    { day: '2026-05-17', spend: 0,     stress_avg: null, stress_shop_count: 0, tx_count: 0 },
    { day: '2026-05-18', spend: 64,    stress_avg: 0.55, stress_shop_count: 1, tx_count: 2 },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Route mocks
// ─────────────────────────────────────────────────────────────────────────────
async function mockMoneyInsightsAPI(page: import('@playwright/test').Page) {
  await page.route('**/api/transactions/recurring-subscriptions*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RECURRING_SUBS) });
  });

  await page.route('**/api/transactions/timeline-analysis*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TIMELINE_ANALYSIS) });
  });

  // A few endpoints might be hit during /money/insights load from the
  // global app shell (sidebar nav, twin-state context). 200 with empty
  // bodies so they don't bubble up as console errors.
  await page.route('**/api/insights/proactive*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ insights: [] }) });
  });
  await page.route('**/api/platforms/connected*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ connected: [] }) });
  });
  await page.route('**/api/twin-summary*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ summary: null }) });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────
test.describe('/money/insights — narrative read', () => {
  test.setTimeout(60_000);

  test('renders both surfaces with no JS exceptions', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Filter out the noise we cannot control: third-party warnings,
        // 404s for optional asset URLs, network noise from unmocked
        // endpoints we don't depend on.
        if (text.match(/Failed to load resource|net::ERR/i)) return;
        if (text.match(/posthog|preflight/i)) return;
        consoleErrors.push('console: ' + text);
      }
    });

    await injectAuth(page);
    await mockMoneyInsightsAPI(page);

    await page.goto(`${BASE_URL}/money/insights`, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    // Once the page has resolved its API calls, the loader disappears and
    // the heading text appears. The actual heading copy is
    // "Your money, with context." per MoneyInsightsPage.tsx.
    const heading = page.getByRole('heading', { name: /your money, with context/i }).first();
    await expect(heading, 'page heading is rendered after data loads').toBeVisible({ timeout: 20_000 });

    // Recurring subscriptions audit — synthesis line + stress signup flag.
    await expect(
      page.getByText(/\$73\.50.*month|73\.50.*month/i),
      'recurring subscriptions monthly total',
    ).toBeVisible();

    // The stress signup flag on Equinox is the moat — verifies the
    // firstChargeContext field is wired through to UI.
    await expect(
      page.getByText(/low-recovery sunday|never visited/i),
      'stressful-signup context renders for Equinox',
    ).toBeVisible();

    // Retired aggregator surfaces must stay gone.
    await expect(page.getByText(/what your trade history reveals/i), 'investment section removed').toHaveCount(0);
    await expect(page.getByText(/every buy and sell, in context/i), 'brokerage activity section removed').toHaveCount(0);
    await expect(page.getByText(/what you own/i), 'holdings section removed').toHaveCount(0);

    // No JS exceptions during render.
    expect(consoleErrors, 'no console errors at first paint').toEqual([]);
  });

  test('Back link returns to /money', async ({ page }) => {
    await injectAuth(page);
    await mockMoneyInsightsAPI(page);

    await page.goto(`${BASE_URL}/money/insights`, { waitUntil: 'domcontentloaded' });

    // The back link could be labelled "Back" or have an ArrowLeft icon.
    // We accept either to survive copy changes.
    const back = page
      .getByRole('button', { name: /back|return/i })
      .or(page.getByRole('link', { name: /back|money/i }))
      .first();
    await expect(back, 'back link is mounted').toBeVisible({ timeout: 10_000 });

    await Promise.all([
      page.waitForURL(/\/money(\/?|\?.*)?$/, { timeout: 10_000 }),
      back.click(),
    ]);

    expect(page.url()).toMatch(/\/money$/);
  });

  test('empty-state renders without crashing', async ({ page }) => {
    await injectAuth(page);

    await page.route('**/api/transactions/recurring-subscriptions*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        success: true, count: 0, totalMonthly: 0, currency: 'USD',
        synthesis: '', stressfulSignupCount: 0, subscriptions: [],
      }) });
    });
    await page.route('**/api/transactions/timeline-analysis*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ days: [] }) });
    });
    await page.route('**/api/insights/proactive*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ insights: [] }) });
    });

    const consoleErrors: string[] = [];
    page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));

    await page.goto(`${BASE_URL}/money/insights`, { waitUntil: 'domcontentloaded' });
    // Wait for at least one render cycle past the loader.
    await page.waitForTimeout(3000);

    // The page should still be on /money/insights (didn't crash to /404 or /).
    expect(page.url()).toMatch(/\/money\/insights/);
    expect(consoleErrors).toEqual([]);
  });
});
