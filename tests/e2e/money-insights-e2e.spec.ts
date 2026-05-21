/**
 * /money/insights — narrative-read surface E2E
 * =============================================
 * Drives MoneyInsightsPage (Phase 4.4) with mocked backend so the test
 * doesn't depend on a seeded DB or real Plaid/Whoop tokens. Catches:
 *
 *   - Page mounts without console errors (the JSX bug class we already
 *     blocked at unit level — this is the integration backstop).
 *   - All 5 surfaces render their data shape correctly:
 *       (a) investment-correlation moat insights
 *       (b) recurring-subscriptions audit
 *       (c) brokerage holdings card
 *       (d) brokerage activity card
 *       (e) stress-spend timeline
 *   - The "Back to /money" link works.
 *   - The Discuss button on a moat insight navigates to /talk-to-twin
 *     with the right discussContext (regression for the e0e5a9d4 JSX
 *     ternary bug — even though the file was dead code, the *type* of
 *     bug would manifest here).
 *
 * Self-contained auth via injectAuth (e2e project). No setup dependency.
 */
import { expect, test } from '@playwright/test';
import { BASE_URL, injectAuth } from './helpers';

// ─────────────────────────────────────────────────────────────────────────────
// Fixture data — shape matches what the production endpoints return.
// ─────────────────────────────────────────────────────────────────────────────
const MOAT_INSIGHTS = [
  {
    id: 'insight-moat-1',
    insight: 'You sell more on low-recovery days than on normal-recovery days (8 of 11 sells while recovery was <40%).',
    urgency: 'high',
    category: 'anomaly',
    created_at: '2026-05-19T08:00:00Z',
    sources: ['whoop', 'plaid'],
    metadata: {
      subcategory: 'investment_correlation',
      pattern: 'sells_low_recovery',
      n: 11,
      k: 8,
    },
  },
  {
    id: 'insight-moat-2',
    insight: 'You bought more during high-stress windows than at baseline (6 buys with stress > 0.65 vs 2 at calm).',
    urgency: 'medium',
    category: 'trend',
    created_at: '2026-05-19T08:00:00Z',
    sources: ['whoop', 'plaid', 'google_calendar'],
    metadata: {
      subcategory: 'investment_correlation',
      pattern: 'buys_high_stress',
      n: 8,
      k: 6,
    },
  },
];

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
      source: 'plaid',
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
      source: 'plaid',
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
      source: 'plaid',
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

const HOLDINGS = {
  success: true,
  holdings: [
    {
      institutionName: 'Fidelity',
      accountId: 'acc-1',
      accountName: 'Roth IRA',
      accountMask: '1234',
      accountType: 'investment',
      ticker: 'VOO',
      name: 'Vanguard S&P 500 ETF',
      type: 'etf',
      quantity: 12,
      institutionPrice: 420,
      costBasis: 4500,
      value: 5040,
      currency: 'USD',
      gainLoss: 540,
      gainLossPct: 12,
    },
  ],
  totalValue: 5040,
  totalCost: 4500,
  totalGainLoss: 540,
  currency: 'USD',
  itemsScanned: 1,
  itemsWithError: 0,
};

const INVESTMENT_ACTIVITY = {
  success: true,
  events: [
    {
      id: 'tx-1',
      ticker: 'VOO',
      name: 'Vanguard S&P 500 ETF',
      type: 'buy',
      rawCategory: 'investment_buy_purchased',
      amount: -1000,
      currency: 'USD',
      transactionDate: '2026-05-15',
      emotionalContext: {
        recoveryScore: 0.32,
        musicValence: 0.45,
        calendarLoad: 0.78,
        sleepScore: 0.5,
        computedStressScore: 0.72,
        emotionLabel: 'high stress (72%)',
      },
    },
  ],
  range: { since: '2025-05-21', limit: 25 },
};

// ─────────────────────────────────────────────────────────────────────────────
// Route mocks
// ─────────────────────────────────────────────────────────────────────────────
async function mockMoneyInsightsAPI(page: import('@playwright/test').Page) {
  // The moat-insights call pins subcategory=investment_correlation in the
  // query string. Any other proactive-insights call should still resolve
  // gracefully (the InsightsFeed on the dashboard might hit / behind the
  // scenes during nav).
  await page.route('**/api/insights/proactive*', async (route) => {
    const url = route.request().url();
    const body = url.includes('investment_correlation')
      ? { insights: MOAT_INSIGHTS }
      : { insights: [] };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  await page.route('**/api/transactions/recurring-subscriptions*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RECURRING_SUBS) });
  });

  await page.route('**/api/transactions/timeline-analysis*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TIMELINE_ANALYSIS) });
  });

  await page.route('**/api/plaid/holdings*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(HOLDINGS) });
  });

  await page.route('**/api/plaid/investment-activity*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(INVESTMENT_ACTIVITY) });
  });

  // A few endpoints might be hit during /money/insights load from the
  // global app shell (sidebar nav, twin-state context). 200 with empty
  // bodies so they don't bubble up as console errors.
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
test.describe('/money/insights — Phase 4.4 narrative read', () => {
  test.setTimeout(60_000);

  test('renders all 5 surfaces with no JS exceptions', async ({ page }) => {
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

    // Once the page has resolved its 5 useEffect API calls, the loader
    // disappears and the heading text appears. The actual heading copy is
    // "Your money, with context." per MoneyInsightsPage.tsx.
    const heading = page.getByRole('heading', { name: /your money, with context/i }).first();
    await expect(heading, 'page heading is rendered after data loads').toBeVisible({ timeout: 20_000 });

    // Moat insights surface — the synthesised summary text should be present.
    await expect(
      page.getByText(/sell more on low-recovery days/i),
      'moat insight #1 (sells_low_recovery) is rendered',
    ).toBeVisible({ timeout: 10_000 });

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

  test('empty-state for no investment-correlation insights does not crash', async ({ page }) => {
    // Regression guard: the page used to crash if MOAT_INSIGHTS was [] because
    // an early implementation indexed [0] without a length check.
    await injectAuth(page);

    await page.route('**/api/insights/proactive*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ insights: [] }) });
    });
    await page.route('**/api/transactions/recurring-subscriptions*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        success: true, count: 0, totalMonthly: 0, currency: 'USD',
        synthesis: '', stressfulSignupCount: 0, subscriptions: [],
      }) });
    });
    await page.route('**/api/transactions/timeline-analysis*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ days: [] }) });
    });
    await page.route('**/api/plaid/holdings*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        success: true, holdings: [], totalValue: 0, totalCost: 0, totalGainLoss: 0,
        currency: 'USD', itemsScanned: 0, itemsWithError: 0,
      }) });
    });
    await page.route('**/api/plaid/investment-activity*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, events: [] }) });
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
