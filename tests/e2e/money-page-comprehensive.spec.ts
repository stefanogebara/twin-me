/**
 * /money page — comprehensive quality audit
 * ==========================================
 *
 * The page lives at src/pages/MoneyPage.tsx. Honest-MVP shape
 * (replan-2026-06-10 Track D): header + tagline, connect row (Pluggy BR +
 * CSV/OFX upload), spending timeline (30d), summary bar, transaction list
 * with category chips + Re-tag, and ONE unlock progress card. The old
 * patterns / savings / nudges / risk-forecast surfaces and the TrueLayer
 * rail were removed; Plaid brokerage surfaces are parked behind the
 * `money_plaid` feature flag (default off).
 *
 * STANDARDS — every assertion below maps to one of these IDs.
 *
 * B — Backend Contract
 *   B-1   GET /transactions       → array (empty array OK, never 4xx for new users)
 *   B-2   GET /transactions/summary → { window_days, transaction_count, total_outflow, ... }
 *   B-7   GET /transactions/timeline-analysis → { days: [] }
 *   B-8   All routes return 401 for missing/invalid auth
 *
 * F — Page Flow
 *   F-1   Unauthenticated → redirect to /auth
 *   F-2   Authenticated, zero tx → empty state + upload zone
 *   F-3   Authenticated, with tx → summary bar + tx list + re-tag button
 *   F-5   Unlock progress card renders exactly once (the ONE promise surface)
 *
 * E — Error & Loading
 *   E-1   500 on the page's GET endpoints → page still renders, error visible
 *   E-3   Page render leaves no unfiltered console.error
 *   E-4   Page render leaves no pageerror
 *
 * U — UI Tokens
 *   U-1   --background = #13121a
 *   U-2   H1 "Money" uses Instrument Serif, ≥ 32px
 *   U-3   At least one element with computed backdrop-filter blur ≥ 16px
 *   U-4   Re-tag pill border-radius ≥ 100px
 *   U-6   Zero navy surfaces ≥ 80×80px
 *   U-7   Page container max-width 720px
 *   U-8   Upload label htmlFor links to hidden input#money-upload
 *
 * C — CX / Content
 *   C-1   Tagline "Your money has feelings. We translate them." present
 *   C-2   Empty state shows "Nothing here yet" + upload guidance
 *   C-3   Footer hint mentions "Nubank → Profile → Export" in empty state
 *   C-7   Multi-currency triggers "multi-currency" chip
 *
 * Opt-in: TWINME_RUN_MONEY_AUDIT=true
 */

import { test, expect, Page, Route } from '@playwright/test';
import { BASE_URL, API_URL, injectAuth, mintTestToken } from './helpers';

test.skip(
  process.env.TWINME_RUN_MONEY_AUDIT !== 'true',
  'Money audit is heavy. Set TWINME_RUN_MONEY_AUDIT=true to opt in.',
);

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures (wrap responses per service contract — most endpoints unwrap
// { success: true, ...fields }, list returns { transactions: [] }, timeline
// returns { days: [] }).
// ─────────────────────────────────────────────────────────────────────────────

const TX = [
  {
    id: 'tx-1',
    amount: -150.50, currency: 'BRL',
    merchant_raw: 'IFOOD * RESTAURANTE X', merchant_normalized: 'iFood',
    category: 'food_delivery',
    transaction_date: '2026-05-10', source_bank: 'nubank', account_type: 'credit_card',
    is_recurring: false, created_at: '2026-05-10T20:30:00Z',
    emotional_context: {
      hrv_score: 42, recovery_score: 35, sleep_score: 60,
      music_valence: 0.25, calendar_load: 0.85,
      computed_stress_score: 0.78, is_stress_shop_candidate: true,
      signals_found: 4,
    },
  },
  {
    id: 'tx-2',
    amount: -45.00, currency: 'BRL',
    merchant_raw: 'UBER TRIP', merchant_normalized: 'Uber',
    category: 'transport',
    transaction_date: '2026-05-09', source_bank: 'nubank', account_type: 'credit_card',
    is_recurring: false, created_at: '2026-05-09T18:15:00Z',
    emotional_context: {
      hrv_score: 65, recovery_score: 70, sleep_score: 75,
      music_valence: 0.65, calendar_load: 0.30,
      computed_stress_score: 0.25, is_stress_shop_candidate: false,
      signals_found: 4,
    },
  },
];

const SUMMARY = {
  window_days: 30, transaction_count: 2, total_outflow: 195.50, total_inflow: 0,
  stress_shop_count: 1, stress_shop_total: 150.50, high_stress_outflow: 150.50,
  emotional_spend_ratio: 0.67,
  currencies: [{ currency: 'BRL', outflow: 195.50, inflow: 0, count: 2, stress_shop_total: 150.50 }],
};

const TIMELINE = [
  { day: '2026-05-08', spend: 50, stress_avg: 0.4, stress_shop_count: 0, tx_count: 1 },
  { day: '2026-05-09', spend: 45, stress_avg: 0.25, stress_shop_count: 0, tx_count: 1 },
  { day: '2026-05-10', spend: 150.50, stress_avg: 0.78, stress_shop_count: 1, tx_count: 1 },
];

const EMPTY_SUMMARY = { window_days: 30, transaction_count: 0, total_outflow: 0, total_inflow: 0, stress_shop_count: 0, stress_shop_total: 0, high_stress_outflow: 0, emotional_spend_ratio: null, currencies: [] };

// ─────────────────────────────────────────────────────────────────────────────
// Mock helpers (string globs — regex caused Vite dynamic-import starvation)
// ─────────────────────────────────────────────────────────────────────────────

interface MockState {
  transactions: unknown[];
  summary: unknown;
  timeline: unknown[];
}

async function jsonRoute(page: Page, glob: string, status: number, body: unknown): Promise<void> {
  await page.route(glob, async (route: Route) => {
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

async function mockMoneyAPIs(page: Page, state: Partial<MockState> = {}): Promise<void> {
  const f: MockState = {
    transactions: state.transactions ?? TX,
    summary: state.summary ?? SUMMARY,
    timeline: state.timeline ?? TIMELINE,
  };
  // Specific endpoints first (Playwright matches in registration order).
  await jsonRoute(page, '**/api/transactions/summary*', 200, { success: true, ...(f.summary as object) });
  await jsonRoute(page, '**/api/transactions/timeline-analysis*', 200, { days: f.timeline });
  await jsonRoute(page, '**/api/transactions/pluggy/connections*', 200, { connections: [] });
  // money_plaid stays OFF — the page must not mount brokerage surfaces.
  await jsonRoute(page, '**/api/feature-flags*', 200, { success: true, flags: {} });
  // Bare list — must come last among /transactions matchers.
  await jsonRoute(page, '**/api/transactions?*', 200, { transactions: f.transactions });
}

async function mockEndpoints500(page: Page): Promise<void> {
  const err = { success: false, error: 'simulated server error' };
  await jsonRoute(page, '**/api/transactions/summary*', 500, err);
  await jsonRoute(page, '**/api/transactions/timeline-analysis*', 500, err);
  await jsonRoute(page, '**/api/transactions/pluggy/connections*', 500, err);
  await jsonRoute(page, '**/api/feature-flags*', 500, err);
  await jsonRoute(page, '**/api/transactions?*', 500, err);
}

// ─────────────────────────────────────────────────────────────────────────────
// Token extraction helper
// ─────────────────────────────────────────────────────────────────────────────

async function extractMoneyTokens(page: Page) {
  return await page.evaluate(() => {
    const html = document.documentElement;
    const htmlStyles = getComputedStyle(html);
    const h1 = document.querySelector('h1');
    const h1Styles = h1 ? getComputedStyle(h1) : null;

    let glassCount = 0;
    let navyLeaks = 0;
    const all = document.querySelectorAll('*');
    for (let i = 0; i < Math.min(all.length, 1500); i++) {
      const el = all[i] as HTMLElement;
      const cs = getComputedStyle(el);
      const filter = cs.backdropFilter || (cs as unknown as { webkitBackdropFilter?: string }).webkitBackdropFilter || '';
      const blurM = filter.match(/blur\((\d+(?:\.\d+)?)px\)/);
      if (blurM && parseFloat(blurM[1]) >= 16) glassCount++;
      const bg = cs.backgroundColor;
      const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (m) {
        const r = +m[1], g = +m[2], b = +m[3];
        if (b > 100 && b > r * 1.5 && b > g * 1.3 && r < 80) {
          const rect = el.getBoundingClientRect();
          if (rect.width >= 80 && rect.height >= 80) navyLeaks++;
        }
      }
    }
    return {
      cssBackground: htmlStyles.getPropertyValue('--background').trim(),
      h1Text: h1?.textContent?.trim() ?? null,
      h1FontFamily: h1Styles?.fontFamily ?? null,
      h1FontSize: h1Styles?.fontSize ?? null,
      glassCount,
      navyLeaks,
    };
  });
}

function attachQuietConsoleListener(page: Page): { errors: string[]; pageErrors: string[] } {
  const errors: string[] = [];
  const pageErrors: string[] = [];
  // 429 noise from back-to-back audit-all runs on a real backend — treat as benign.
  const BENIGN = ['PostHog', 'posthog', 'favicon', 'ERR_BLOCKED_BY_CLIENT', 'analytics', '429', 'Too Many Requests'];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (BENIGN.some((b) => text.includes(b))) return;
    errors.push(text);
  });
  page.on('pageerror', (err) => {
    pageErrors.push(err.message);
  });
  return { errors, pageErrors };
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. Backend contract — real API
// ═════════════════════════════════════════════════════════════════════════════

test.describe('/money — backend contract', () => {
  test('B-8: all endpoints return 401 without auth', async ({ request }) => {
    const paths = [
      '/transactions', '/transactions/summary', '/transactions/timeline-analysis',
    ];
    for (const p of paths) {
      const res = await request.get(`${API_URL}${p}`);
      expect(res.status(), `${p} unauth status`).toBe(401);
    }
  });

  test('B-1, B-2, B-7: authenticated calls return well-shaped JSON', async ({ request }) => {
    const token = mintTestToken();
    const headers = { Authorization: `Bearer ${token}` };

    const txnsRes = await request.get(`${API_URL}/transactions?limit=10`, { headers });
    expect(txnsRes.status(), 'B-1 status').toBe(200);
    const txnsBody = await txnsRes.json();
    const txns = Array.isArray(txnsBody) ? txnsBody : (txnsBody.transactions ?? []);
    expect(Array.isArray(txns), 'B-1 array').toBe(true);

    const sum = await (await request.get(`${API_URL}/transactions/summary`, { headers })).json();
    const sumBody = sum.summary ?? sum;
    expect(sumBody, 'B-2 window_days').toHaveProperty('window_days');
    expect(sumBody, 'B-2 transaction_count').toHaveProperty('transaction_count');
    expect(sumBody, 'B-2 total_outflow').toHaveProperty('total_outflow');

    const tl = await (await request.get(`${API_URL}/transactions/timeline-analysis`, { headers })).json();
    const tlArr = Array.isArray(tl) ? tl : (tl.days ?? []);
    expect(Array.isArray(tlArr), 'B-7 days array').toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. Authenticated UI — with data
// ═════════════════════════════════════════════════════════════════════════════

test.describe('/money — authenticated UI with data', () => {
  test('F-3, F-5, U-*, C-1: renders full state correctly', async ({ page }) => {
    const sink = attachQuietConsoleListener(page);
    await injectAuth(page);
    await mockMoneyAPIs(page);

    await page.goto(`${BASE_URL}/money`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    const h1 = page.getByRole('heading', { name: 'Money', level: 1 });
    await expect(h1, 'F-3 H1').toBeVisible();

    await expect(page.getByText('Your money has feelings. We translate them.'), 'C-1 tagline').toBeVisible();

    const rows = page.locator('[data-testid="transaction-row"]');
    await expect(rows, 'F-3 tx rows count').toHaveCount(TX.length);
    await expect(rows.first().locator('[data-testid="transaction-merchant"]'), 'F-3 first merchant').toHaveText(/iFood/);

    const retag = page.getByRole('button', { name: /Re-tag/i });
    await expect(retag, 'F-3 re-tag visible').toBeVisible();
    const retagRadius = parseFloat(await retag.evaluate((el) => getComputedStyle(el).borderTopLeftRadius));
    expect(retagRadius, 'U-4 re-tag pill ≥ 100px').toBeGreaterThanOrEqual(100);

    // F-5: exactly ONE unlock progress card — the consolidated promise surface.
    const unlockCard = page.locator('[data-testid="unlock-progress-card"]');
    await expect(unlockCard, 'F-5 unlock card').toHaveCount(1);
    await expect(unlockCard, 'F-5 unlock card visible').toBeVisible();

    // Parked surfaces must NOT render with money_plaid off.
    await expect(page.getByRole('button', { name: /Connect US bank/i }), 'parked Plaid button').toHaveCount(0);
    await expect(page.locator('[data-testid="brokerage-activity-card"]'), 'parked activity card').toHaveCount(0);
    // Removed promise surfaces must stay gone.
    await expect(page.getByText(/Nudges & Wins/i), 'nudges surface removed').toHaveCount(0);
    await expect(page.getByRole('button', { name: /Connect EU\/UK bank/i }), 'TrueLayer removed').toHaveCount(0);

    // U-8: upload label htmlFor links to hidden input
    await expect(page.locator('label[for="money-upload"]'), 'U-8 label').toBeVisible();
    expect(await page.locator('input#money-upload').count(), 'U-8 hidden input').toBe(1);

    // Design tokens
    const tokens = await extractMoneyTokens(page);
    expect(tokens.cssBackground, 'U-1 --background').toBe('#13121a');
    expect(tokens.h1Text, 'U-2 h1 text').toBe('Money');
    expect(tokens.h1FontFamily, 'U-2 h1 family').toMatch(/Instrument Serif/);
    expect(parseFloat(tokens.h1FontSize || '0'), 'U-2 ≥ 32px').toBeGreaterThanOrEqual(32);
    expect(tokens.glassCount, 'U-3 glass surfaces').toBeGreaterThanOrEqual(3);
    expect(tokens.navyLeaks, 'U-6 zero navy').toBe(0);

    // U-7: container max-width 720px (walk up from h1)
    const maxW = await h1.evaluate((el) => {
      let cur: HTMLElement | null = el as HTMLElement;
      while (cur) {
        const mw = getComputedStyle(cur).maxWidth;
        if (mw && mw !== 'none' && parseFloat(mw) > 0) return parseFloat(mw);
        cur = cur.parentElement;
      }
      return 0;
    });
    expect(maxW, 'U-7 max-width 720').toBe(720);

    expect(sink.errors, 'E-3 console errors').toHaveLength(0);
    expect(sink.pageErrors, 'E-4 page errors').toHaveLength(0);
  });

  test('C-7: multi-currency triggers chip', async ({ page }) => {
    await injectAuth(page);
    const multiTx = [{ ...TX[0] }, { ...TX[1], currency: 'EUR', amount: -12.5 }];
    const multiSummary = {
      ...SUMMARY,
      currencies: [
        { currency: 'BRL', outflow: 150.50, inflow: 0, count: 1, stress_shop_total: 150.50 },
        { currency: 'EUR', outflow: 12.5, inflow: 0, count: 1, stress_shop_total: 0 },
      ],
    };
    await mockMoneyAPIs(page, { transactions: multiTx, summary: multiSummary });
    await page.goto(`${BASE_URL}/money`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    await expect(page.getByText('multi-currency'), 'C-7 chip').toBeVisible();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. Empty state
// ═════════════════════════════════════════════════════════════════════════════

test.describe('/money — empty state', () => {
  test('F-2, C-2, C-3, F-5: empty state shows guidance + unlock meter at zero', async ({ page }) => {
    const sink = attachQuietConsoleListener(page);
    await injectAuth(page);
    await mockMoneyAPIs(page, {
      transactions: [], summary: EMPTY_SUMMARY, timeline: [],
    });
    await page.goto(`${BASE_URL}/money`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    await expect(page.getByText('Nothing here yet'), 'F-2/C-2 headline').toBeVisible();
    await expect(page.getByText(/Drop a CSV or OFX statement/i), 'C-2 upload prompt').toBeVisible();
    await expect(page.getByText(/Nubank.*Profile.*Export/i), 'C-3 Nubank steps').toBeVisible();

    // F-5: unlock card still renders for brand-new users with honest zeros.
    await expect(page.locator('[data-testid="unlock-progress-card"]'), 'F-5 unlock card').toBeVisible();
    await expect(page.getByText(/Connect your bank and wear your Whoop/i), 'F-5 unlock copy').toBeVisible();

    await expect(page.getByRole('button', { name: /Re-tag/i }), 'F-3 no re-tag in empty').not.toBeVisible();

    expect(sink.errors, 'E-3 empty errors').toHaveLength(0);
    expect(sink.pageErrors, 'E-4 empty pageerrors').toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. Error handling
// ═════════════════════════════════════════════════════════════════════════════

test.describe('/money — error handling', () => {
  test('E-1: 500 from API endpoints surfaces error banner without ErrorBoundary crash', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => { pageErrors.push(err.message); });

    await injectAuth(page);
    await mockEndpoints500(page);

    await page.goto(`${BASE_URL}/money`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('load');
    await page.waitForTimeout(3000);

    // Did the global ErrorBoundary catch a throw? That's a regression we want surfaced.
    const boundaryCaught = await page.getByText('Something went wrong').isVisible().catch(() => false);
    if (boundaryCaught) {
      const detailBtn = page.getByText('Error Details (Development)').first();
      let detailText = '';
      if (await detailBtn.isVisible().catch(() => false)) {
        await detailBtn.click();
        await page.waitForTimeout(200);
        detailText = (await page.locator('details').first().textContent().catch(() => '')) ?? '';
      }
      throw new Error(
        'E-1 ErrorBoundary caught an unhandled throw — MoneyPage should never crash to global boundary on API 500s. ' +
        'pageerrors: ' + (pageErrors.join(' | ') || '(none)') +
        ' | boundary detail: ' + detailText.slice(0, 400),
      );
    }

    // Header still renders. Page should show its own error banner.
    await expect(
      page.getByRole('heading', { name: 'Money', level: 1 }),
      'E-1 header rendered',
    ).toBeVisible({ timeout: 10000 });

    // The error text could be either the fallback or the English thrown
    // message from listTransactions (it throws "Failed to load transactions (500)"
    // when res.ok is false). Either is acceptable evidence the error path fired.
    const errorBanner = page.getByText(/Failed to load transactions|simulated server error/i).first();
    await expect(errorBanner, 'E-1 visible error banner').toBeVisible({ timeout: 5000 });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. Unauthenticated
// ═════════════════════════════════════════════════════════════════════════════

test.describe('/money — unauthenticated', () => {
  test('F-1: redirects to /auth', async ({ page, context }) => {
    await context.clearCookies();
    await page.goto(`${BASE_URL}/money`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const url = page.url();
    expect(url, 'F-1 not on /money').not.toMatch(/\/money$/);
    expect(url, 'F-1 lands on /auth').toMatch(/\/auth/);
  });
});
