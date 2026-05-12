/**
 * /money page — comprehensive quality audit
 * ==========================================
 *
 * The page lives at src/pages/MoneyPage.tsx and exercises 7 GET endpoints
 * under /api/transactions plus uploads, retag, and feedback POST routes.
 *
 * STANDARDS — every assertion below maps to one of these IDs.
 *
 * B — Backend Contract
 *   B-1   GET /transactions       → array (empty array OK, never 4xx for new users)
 *   B-2   GET /transactions/summary → { window_days, transaction_count, total_outflow, ... }
 *   B-3   GET /transactions/patterns → { hasData, patterns[], txCount?, minRequired? }
 *   B-4   GET /transactions/savings → { window_days, total_saved, waited_count, biggest_save }
 *   B-5   GET /transactions/nudge-stats → { window_days, total_sent, followed_count, follow_rate }
 *   B-6   GET /transactions/risk-forecast → { status }; backend may envelope under `forecast`
 *   B-7   GET /transactions/timeline-analysis → { days: [] }
 *   B-8   All routes return 401 for missing/invalid auth
 *
 * F — Page Flow
 *   F-1   Unauthenticated → redirect to /auth
 *   F-2   Authenticated, zero tx → empty state + upload zone
 *   F-3   Authenticated, with tx → summary bar + tx list + re-tag button
 *   F-4   Tab Gastos ↔ Nudges switches the rendered subtree
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
 * X — UX
 *   X-2   Inline nudge card has role=button + tabIndex=0
 *
 * C — CX / Content
 *   C-1   Tagline "Seu dinheiro tem sentimentos. A gente traduz." present
 *   C-2   Empty state shows "Nada por aqui ainda" + upload guidance
 *   C-3   Footer hint mentions "Nubank → Perfil → Exportar" in empty state
 *   C-4   Insufficient-data patterns state names exact additional-tx count
 *   C-7   Multi-currency triggers "multi-moeda" chip
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
// { success: true, ...fields }, risk-forecast nests as { forecast: {...} },
// list returns { transactions: [] }, timeline returns { days: [] }).
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

const PATTERNS = {
  hasData: true,
  patterns: [{ headline: 'Você gasta 3x mais em delivery em dias de stress alto.', detail: 'Quando seu HRV cai abaixo de 50 e o calendário fica cheio.', pattern_type: 'stress_food' }],
  txCount: 90, minRequired: 14, minTransactionsReached: true,
};

const SAVINGS = { window_days: 30, total_saved: 420.00, waited_count: 5, biggest_save: 180.00 };
const NUDGE_STATS = {
  window_days: 30, total_sent: 8, followed_count: 5, follow_rate: 0.625, est_saved: 420.00, dominant_currency: 'BRL',
  recent: [{ id: 'nudge-1', title: 'Pausa antes do iFood?', body: 'HRV baixo.', merchant: 'iFood', category: 'food_delivery', amount: 85.00, stress_score: 0.78, followed: true, checked: true, created_at: '2026-05-10T20:25:00Z' }],
};
const FORECAST = { status: 'high_risk', headline: 'Hoje tem risco alto de gasto por stress.', detail: 'Seu sono foi curto.' };
const TIMELINE = [
  { day: '2026-05-08', spend: 50, stress_avg: 0.4, stress_shop_count: 0, tx_count: 1 },
  { day: '2026-05-09', spend: 45, stress_avg: 0.25, stress_shop_count: 0, tx_count: 1 },
  { day: '2026-05-10', spend: 150.50, stress_avg: 0.78, stress_shop_count: 1, tx_count: 1 },
];

const EMPTY_SUMMARY = { window_days: 30, transaction_count: 0, total_outflow: 0, total_inflow: 0, stress_shop_count: 0, stress_shop_total: 0, high_stress_outflow: 0, emotional_spend_ratio: null, currencies: [] };
const EMPTY_PATTERNS = { hasData: false, patterns: [], txCount: 3, minRequired: 14, minTransactionsReached: false };
const EMPTY_SAVINGS = { window_days: 30, total_saved: 0, waited_count: 0, biggest_save: 0 };
const EMPTY_NUDGE_STATS = { window_days: 30, total_sent: 0, followed_count: 0, follow_rate: null, est_saved: 0, dominant_currency: 'BRL', recent: [] };
const NEUTRAL_FORECAST = { status: 'no_history' };

// ─────────────────────────────────────────────────────────────────────────────
// Mock helpers (string globs — regex caused Vite dynamic-import starvation)
// ─────────────────────────────────────────────────────────────────────────────

interface MockState {
  transactions: unknown[];
  summary: unknown;
  patterns: unknown;
  savings: unknown;
  nudgeStats: unknown;
  forecast: unknown;
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
    patterns: state.patterns ?? PATTERNS,
    savings: state.savings ?? SAVINGS,
    nudgeStats: state.nudgeStats ?? NUDGE_STATS,
    forecast: state.forecast ?? FORECAST,
    timeline: state.timeline ?? TIMELINE,
  };
  // Specific endpoints first (Playwright matches in registration order).
  await jsonRoute(page, '**/api/transactions/summary*', 200, { success: true, ...(f.summary as object) });
  await jsonRoute(page, '**/api/transactions/patterns*', 200, { success: true, ...(f.patterns as object) });
  await jsonRoute(page, '**/api/transactions/savings*', 200, { success: true, ...(f.savings as object) });
  await jsonRoute(page, '**/api/transactions/nudge-stats*', 200, { success: true, ...(f.nudgeStats as object) });
  await jsonRoute(page, '**/api/transactions/risk-forecast*', 200, { success: true, forecast: f.forecast });
  await jsonRoute(page, '**/api/transactions/timeline-analysis*', 200, { days: f.timeline });
  await jsonRoute(page, '**/api/transactions/pluggy/connections*', 200, { connections: [] });
  await jsonRoute(page, '**/api/truelayer/connections*', 200, { connections: [] });
  // Bare list — must come last among /transactions matchers.
  await jsonRoute(page, '**/api/transactions?*', 200, { transactions: f.transactions });
}

async function mockEndpoints500(page: Page): Promise<void> {
  const err = { success: false, error: 'simulated server error' };
  await jsonRoute(page, '**/api/transactions/summary*', 500, err);
  await jsonRoute(page, '**/api/transactions/patterns*', 500, err);
  await jsonRoute(page, '**/api/transactions/savings*', 500, err);
  await jsonRoute(page, '**/api/transactions/nudge-stats*', 500, err);
  await jsonRoute(page, '**/api/transactions/risk-forecast*', 500, err);
  await jsonRoute(page, '**/api/transactions/timeline-analysis*', 500, err);
  await jsonRoute(page, '**/api/transactions/pluggy/connections*', 500, err);
  await jsonRoute(page, '**/api/truelayer/connections*', 500, err);
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
  const BENIGN = ['PostHog', 'posthog', 'favicon', 'ERR_BLOCKED_BY_CLIENT', 'analytics'];
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
      '/transactions', '/transactions/summary', '/transactions/patterns',
      '/transactions/savings', '/transactions/nudge-stats',
      '/transactions/risk-forecast', '/transactions/timeline-analysis',
    ];
    for (const p of paths) {
      const res = await request.get(`${API_URL}${p}`);
      expect(res.status(), `${p} unauth status`).toBe(401);
    }
  });

  test('B-1…B-7: authenticated calls return well-shaped JSON', async ({ request }) => {
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

    const pat = await (await request.get(`${API_URL}/transactions/patterns`, { headers })).json();
    expect(pat, 'B-3 hasData').toHaveProperty('hasData');
    expect(Array.isArray(pat.patterns), 'B-3 patterns array').toBe(true);

    const sav = await (await request.get(`${API_URL}/transactions/savings`, { headers })).json();
    expect(sav, 'B-4 total_saved').toHaveProperty('total_saved');

    const nudge = await (await request.get(`${API_URL}/transactions/nudge-stats`, { headers })).json();
    expect(nudge, 'B-5 total_sent').toHaveProperty('total_sent');
    expect(nudge, 'B-5 followed_count').toHaveProperty('followed_count');

    const fcJson = await (await request.get(`${API_URL}/transactions/risk-forecast`, { headers })).json();
    const fc = fcJson.forecast ?? fcJson;
    expect(fc, 'B-6 status').toHaveProperty('status');
    expect(
      ['high_risk', 'low_risk', 'neutral', 'no_history', 'no_biology', 'insufficient_data'],
      'B-6 status enum',
    ).toContain(fc.status);

    const tl = await (await request.get(`${API_URL}/transactions/timeline-analysis`, { headers })).json();
    const tlArr = Array.isArray(tl) ? tl : (tl.days ?? []);
    expect(Array.isArray(tlArr), 'B-7 days array').toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. Authenticated UI — with data
// ═════════════════════════════════════════════════════════════════════════════

test.describe('/money — authenticated UI with data', () => {
  test('F-3, U-*, X-*, C-*: renders full state correctly', async ({ page }) => {
    const sink = attachQuietConsoleListener(page);
    await injectAuth(page);
    await mockMoneyAPIs(page);

    await page.goto(`${BASE_URL}/money`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    const h1 = page.getByRole('heading', { name: 'Money', level: 1 });
    await expect(h1, 'F-3 H1').toBeVisible();

    await expect(page.getByText('Seu dinheiro tem sentimentos. A gente traduz.'), 'C-1 tagline').toBeVisible();

    const rows = page.locator('[data-testid="transaction-row"]');
    await expect(rows, 'F-3 tx rows count').toHaveCount(TX.length);
    await expect(rows.first().locator('[data-testid="transaction-merchant"]'), 'F-3 first merchant').toHaveText(/iFood/);

    const retag = page.getByRole('button', { name: /Re-tag/i });
    await expect(retag, 'F-3 re-tag visible').toBeVisible();
    const retagRadius = parseFloat(await retag.evaluate((el) => getComputedStyle(el).borderTopLeftRadius));
    expect(retagRadius, 'U-4 re-tag pill ≥ 100px').toBeGreaterThanOrEqual(100);

    // F-4: tab switch. The tab and inline-card both match "Nudges & Wins" — use .first() (tab is first in DOM).
    const nudgesTab = page.getByRole('button', { name: /Nudges & Wins/i }).first();
    await nudgesTab.click();
    await page.waitForTimeout(300);
    await expect(page.getByText('pausas').first(), 'F-4 after switch').toBeVisible();

    const gastosTab = page.getByRole('button', { name: /^Gastos$/i });
    await gastosTab.click();
    await page.waitForTimeout(300);
    await expect(rows.first(), 'F-4 back to gastos').toBeVisible();

    // X-2: inline nudge card accessibility
    const inlineNudge = page.locator('[role="button"][tabindex="0"]').filter({ hasText: /Nudges & Wins/ });
    if (await inlineNudge.count() > 0) {
      const attrs = await inlineNudge.first().evaluate((el) => ({
        role: el.getAttribute('role'),
        tabIndex: el.getAttribute('tabindex'),
      }));
      expect(attrs.role, 'X-2 role').toBe('button');
      expect(attrs.tabIndex, 'X-2 tabIndex').toBe('0');
    }

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
    await expect(page.getByText('multi-moeda'), 'C-7 chip').toBeVisible();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. Empty state
// ═════════════════════════════════════════════════════════════════════════════

test.describe('/money — empty state', () => {
  test('F-2, C-2, C-3, C-4: empty state shows guidance', async ({ page }) => {
    const sink = attachQuietConsoleListener(page);
    await injectAuth(page);
    await mockMoneyAPIs(page, {
      transactions: [], summary: EMPTY_SUMMARY, patterns: EMPTY_PATTERNS,
      savings: EMPTY_SAVINGS, nudgeStats: EMPTY_NUDGE_STATS,
      forecast: NEUTRAL_FORECAST, timeline: [],
    });
    await page.goto(`${BASE_URL}/money`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    await expect(page.getByText('Nada por aqui ainda'), 'F-2/C-2 headline').toBeVisible();
    await expect(page.getByText(/Solta um extrato CSV ou OFX/i), 'C-2 upload prompt').toBeVisible();
    await expect(page.getByText(/Nubank.*Perfil.*Exportar/i), 'C-3 Nubank steps').toBeVisible();
    await expect(page.getByText(/Preciso de \d+ transaç/i), 'C-4 patterns insufficient').toBeVisible();

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

    // The error text could be either the PT-BR fallback or the English thrown
    // message from listTransactions (it throws "Failed to load transactions (500)"
    // when res.ok is false). Either is acceptable evidence the error path fired.
    const errorBanner = page.getByText(/Falha ao carregar|Failed to load transactions|simulated server error/i).first();
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
