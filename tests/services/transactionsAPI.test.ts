/**
 * Tests for src/services/api/transactionsAPI.ts.
 *
 * This is the FE client that every money-related page (MoneyPage,
 * MoneyInsightsPage, SettingsBilling) calls into. Bugs here look like
 * "the page shows blank cards" — it has happened in past audits.
 * (Bank-aggregator client functions deleted in replan-2026-06-12 with
 * the Pluggy/Plaid removal; their tests went with them.)
 *
 * Strategy: mock the entire apiBase module so we control authFetch +
 * API_URL deterministically. We then assert on:
 *   1. The URL passed to authFetch (query string, route shape).
 *   2. The method + body + headers.
 *   3. The shape returned to the caller (especially error fallbacks).
 *
 * No DOM, no real fetch, no real env vars.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── shared mock state ─────────────────────────────────────────────────────────
let authFetchCalls: Array<{ url: string; init?: RequestInit }>;
let authFetchImpl: (url: string, init?: RequestInit) => Promise<Response>;

beforeEach(() => {
  authFetchCalls = [];
  // Default: 200 OK with `{ success: true }` so functions that null-on-error
  // can be exercised on the happy path without per-test wiring.
  authFetchImpl = async () =>
    new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
});

vi.mock('../../src/services/api/apiBase', () => ({
  API_URL: 'http://test-api.local/api',
  getAuthHeaders: () => ({ Authorization: 'Bearer test_token' }),
  authFetch: (url: string, init?: RequestInit) => {
    authFetchCalls.push({ url, init });
    return authFetchImpl(url, init);
  },
}));

// Imports must follow the mock so the mock is in place at module load.
// (replan-2026-06-10 Track D: patterns/savings/nudge-stats/risk-forecast
// fetchers and the TrueLayer client were deleted with their UI surfaces.)
const {
  listTransactions,
  getTransactionsSummary,
  retagTransactions,
  setTransactionFeedback,
  getTimelineAnalysis,
  getRecurringSubscriptions,
} = await import('../../src/services/api/transactionsAPI');

/** Helper to mint an ok JSON Response with a given body. */
function ok(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
/** Helper for a non-ok Response with a JSON error body. */
function notOk(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('listTransactions', () => {
  it('omits the query string entirely when no opts are passed', async () => {
    authFetchImpl = async () => ok({ transactions: [] });
    await listTransactions();
    expect(authFetchCalls[0].url).toBe('/transactions');
  });

  it('builds limit/offset/account_type query params when supplied', async () => {
    authFetchImpl = async () => ok({ transactions: [{ id: 'tx1' }] });
    await listTransactions({ limit: 25, offset: 50, accountType: 'credit_card' });
    const url = authFetchCalls[0].url;
    expect(url.startsWith('/transactions?')).toBe(true);
    const qs = new URLSearchParams(url.split('?')[1]);
    expect(qs.get('limit')).toBe('25');
    expect(qs.get('offset')).toBe('50');
    expect(qs.get('account_type')).toBe('credit_card');
  });

  it('returns [] when the response is missing the transactions key', async () => {
    authFetchImpl = async () => ok({}); // server returned success but no transactions
    const result = await listTransactions();
    expect(result).toEqual([]);
  });

  it('throws an Error on non-OK status (caller treats this as page-blocking)', async () => {
    authFetchImpl = async () => notOk(500, { error: 'boom' });
    await expect(listTransactions()).rejects.toThrow(/Failed to load transactions \(500\)/);
  });

  it('passes the saved feedback field through so the toggle can restore prior answers (audit-2026-06-10)', async () => {
    // The GET / route now joins transaction_feedback and returns a `feedback`
    // field (true/false/null). The client must not drop it — MoneyPage feeds
    // tx.feedback into FeedbackToggle's `initial` so the answer survives reload.
    authFetchImpl = async () =>
      ok({
        transactions: [
          { id: 'tx_stress', feedback: true },
          { id: 'tx_not', feedback: false },
          { id: 'tx_blank', feedback: null },
          { id: 'tx_legacy' }, // older payload without the field
        ],
      });
    const result = await listTransactions();
    expect(result[0].feedback).toBe(true);
    expect(result[1].feedback).toBe(false);
    expect(result[2].feedback).toBeNull();
    expect(result[3].feedback).toBeUndefined();
  });
});

describe('getTransactionsSummary — null-on-error pattern with success-envelope unwrap', () => {
  it('strips the success envelope and returns the summary shape', async () => {
    authFetchImpl = async () =>
      ok({ success: true, window_days: 30, transaction_count: 12, total_outflow: 450 });
    const r = await getTransactionsSummary();
    expect(r).toEqual({ window_days: 30, transaction_count: 12, total_outflow: 450 });
    // The unwrap must not leak the success field — callers expect the data shape.
    expect((r as { success?: boolean }).success).toBeUndefined();
  });

  it('returns null on non-OK so the caller can render an empty-state card', async () => {
    authFetchImpl = async () => notOk(503, { error: 'unavailable' });
    const r = await getTransactionsSummary();
    expect(r).toBeNull();
  });

  it('returns null when the server returns 200 but success=false', async () => {
    authFetchImpl = async () => ok({ success: false, error: 'no_data' });
    const r = await getTransactionsSummary();
    expect(r).toBeNull();
  });
});

describe('retagTransactions — POST with JSON body, throws on failure', () => {
  it('POSTs an empty JSON body and returns tagged/errors counts', async () => {
    authFetchImpl = async () => ok({ success: true, tagged: 5, errors: 1 });
    const r = await retagTransactions();
    const call = authFetchCalls[0];
    expect(call.url).toBe('/transactions/retag');
    expect(call.init?.method).toBe('POST');
    expect((call.init?.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(call.init?.body).toBe('{}');
    expect(r).toEqual({ tagged: 5, errors: 1 });
  });

  it('throws when the server returns a non-OK status', async () => {
    authFetchImpl = async () => notOk(429, { error: 'rate_limited' });
    await expect(retagTransactions()).rejects.toThrow(/Retag failed \(429\)/);
  });

  it('defaults tagged/errors to 0 when server omits them', async () => {
    authFetchImpl = async () => ok({ success: true });
    const r = await retagTransactions();
    expect(r).toEqual({ tagged: 0, errors: 0 });
  });
});

describe('getRecurringSubscriptions', () => {
  it('builds limit + minMonthly query params', async () => {
    authFetchImpl = async () =>
      ok({ success: true, count: 2, totalMonthly: 30, currency: 'BRL', synthesis: 'ok',
           stressfulSignupCount: 0, subscriptions: [] });
    await getRecurringSubscriptions({ limit: 10, minMonthly: 5 });
    const url = authFetchCalls[0].url;
    expect(url.startsWith('/transactions/recurring-subscriptions?')).toBe(true);
    const qs = new URLSearchParams(url.split('?')[1]);
    expect(qs.get('limit')).toBe('10');
    expect(qs.get('minMonthly')).toBe('5');
  });

  it('returns a safe empty default shape on !ok (so the UI card never crashes)', async () => {
    authFetchImpl = async () => notOk(500, { error: 'boom' });
    const r = await getRecurringSubscriptions();
    expect(r.success).toBe(false);
    expect(r.count).toBe(0);
    expect(r.subscriptions).toEqual([]);
    expect(typeof r.currency).toBe('string'); // never undefined
    expect(typeof r.synthesis).toBe('string');
  });
});

describe('getTimelineAnalysis — Number coercion of timeline days', () => {
  it('requests a 30-day window so the chart matches its "30 days" labels (replan-2026-06-10)', async () => {
    // The MoneyPage card says "Why you spend · 30 days" and the chart banner
    // says "in the last 30 days", but the backend default window is 90 — the
    // chart silently rendered ~60 days of data under a 30-day label.
    authFetchImpl = async () => ok({ days: [] });
    await getTimelineAnalysis();
    expect(authFetchCalls[0].url).toBe('/transactions/timeline-analysis?window_days=30');
  });

  it('coerces strings to numbers for the chart components', async () => {
    // The server sometimes returns numeric strings (Postgres COUNT()
    // returns text in some clients). The frontend chart libs need
    // real numbers, not strings.
    authFetchImpl = async () =>
      ok({
        days: [
          { day: '2026-05-10', spend: '12.5', stress_avg: '0.5', stress_shop_count: '1', tx_count: '3' },
          { day: '2026-05-11', spend: 0, stress_avg: null, stress_shop_count: 0, tx_count: 0 },
        ],
      });
    const r = await getTimelineAnalysis();
    expect(typeof r[0].spend).toBe('number');
    expect(r[0].spend).toBe(12.5);
    expect(r[0].stress_avg).toBe(0.5);
    expect(typeof r[0].stress_shop_count).toBe('number');
    // null stress_avg must remain null (not coerced to 0).
    expect(r[1].stress_avg).toBeNull();
  });

  it('returns [] on !ok', async () => {
    authFetchImpl = async () => notOk(500, { error: 'boom' });
    expect(await getTimelineAnalysis()).toEqual([]);
  });
});

describe('setTransactionFeedback', () => {
  it('POSTs is_stress_driven in the body to the correct per-id route', async () => {
    authFetchImpl = async () => ok({ success: true });
    const r = await setTransactionFeedback('tx_42', true);
    expect(authFetchCalls[0].url).toBe('/transactions/tx_42/feedback');
    expect(authFetchCalls[0].init?.method).toBe('POST');
    expect(JSON.parse(authFetchCalls[0].init?.body as string)).toEqual({ is_stress_driven: true });
    expect(r).toBe(true);
  });

  it('returns false on non-OK so the UI can keep the user out of an inconsistent state', async () => {
    authFetchImpl = async () => notOk(403, { error: 'forbidden' });
    expect(await setTransactionFeedback('tx_42', false)).toBe(false);
  });
});

describe('Other null-on-error fetchers (smoke)', () => {
  it('getRecurringSubscriptions returns empty fallback shape on !ok', async () => {
    authFetchImpl = async () => notOk(500, { error: 'boom' });
    const r = await getRecurringSubscriptions();
    expect(r.subscriptions).toEqual([]);
  });
});
