/**
 * Characterization tests for computeRiskForecast — the pre-transaction "before
 * it happens" nudge. It correlates today's biology with the user's historical
 * stress-day discretionary spend. The DB is mocked (repo idiom) so the pure
 * decision logic is pinned end-to-end: stress-profile classification, the
 * 3-stress/3-normal-day gate, lift>0 -> high_risk, and currency formatting.
 *
 * The two internal DB reads hit different tables, so the mock returns a result
 * keyed by table name (set per test via setTableResult).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// The two internal reads hit different tables (user_platform_data for biology,
// user_transactions for the baseline), so the mock resolves a result keyed by
// table name. Test helpers live on globalThis because the vi.mock factory is
// hoisted above imports and cannot close over module-scope variables.
vi.mock('../../../api/services/database.js', () => {
  const results = globalThis.__frf_results ?? (globalThis.__frf_results = new Map());
  globalThis.__frf_setTableResult = (table, r) => results.set(table, r);
  globalThis.__frf_reset = () => results.clear();
  function makeChain(table) {
    const result = results.get(table) ?? { data: null, error: null };
    const chain = {};
    const methods = ['select', 'eq', 'in', 'gte', 'lt', 'lte', 'gt', 'order', 'not', 'neq'];
    for (const m of methods) chain[m] = () => chain;
    chain.limit = () => chain;
    chain.single = () => Promise.resolve(result);
    chain.maybeSingle = () => Promise.resolve(result);
    chain.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
    return chain;
  }
  return { supabaseAdmin: { from: (table) => makeChain(table) } };
});

import { computeRiskForecast } from '../../../api/services/transactions/financialRiskForecast.js';

const PLATFORM = 'user_platform_data';
const TX = 'user_transactions';

/** Build `days` worth of transaction rows on distinct dates with a biometric tag. */
function txRows(specs) {
  // specs: [{ date, amount, category, recovery, sleep, currency }]
  return specs.map((s) => ({
    amount: s.amount,
    category: s.category,
    transaction_date: s.date,
    currency: s.currency || 'BRL',
    emotional_context: { recovery_score: s.recovery ?? null, sleep_score: s.sleep ?? null },
  }));
}

beforeEach(() => {
  globalThis.__frf_reset?.();
});

describe('computeRiskForecast — insufficient inputs', () => {
  it('returns no_history when there are no transactions', () => {
    globalThis.__frf_setTableResult(TX, { data: [], error: null });
    globalThis.__frf_setTableResult(PLATFORM, { data: null, error: null });
    return computeRiskForecast('u1').then((r) => {
      expect(r.status).toBe('no_history');
    });
  });

  it('returns no_biology when history exists but no recent Whoop/Oura row', async () => {
    // Enough stress + normal days in history, but biology row is null.
    const rows = txRows([
      { date: '2026-06-01', amount: -100, category: 'shopping', recovery: 30 }, // stress
      { date: '2026-06-02', amount: -100, category: 'shopping', recovery: 30 },
      { date: '2026-06-03', amount: -100, category: 'shopping', recovery: 30 },
      { date: '2026-06-04', amount: -50, category: 'shopping', recovery: 80 },  // normal
      { date: '2026-06-05', amount: -50, category: 'shopping', recovery: 80 },
      { date: '2026-06-06', amount: -50, category: 'shopping', recovery: 80 },
    ]);
    globalThis.__frf_setTableResult(TX, { data: rows, error: null });
    globalThis.__frf_setTableResult(PLATFORM, { data: null, error: null });
    const r = await computeRiskForecast('u1');
    expect(r.status).toBe('no_biology');
    expect(r.baseline).toBeDefined();
  });

  it('returns insufficient_data when fewer than 3 stress OR 3 normal days', async () => {
    const rows = txRows([
      { date: '2026-06-01', amount: -100, category: 'shopping', recovery: 30 }, // 2 stress only
      { date: '2026-06-02', amount: -100, category: 'shopping', recovery: 30 },
      { date: '2026-06-04', amount: -50, category: 'shopping', recovery: 80 },
      { date: '2026-06-05', amount: -50, category: 'shopping', recovery: 80 },
      { date: '2026-06-06', amount: -50, category: 'shopping', recovery: 80 },
    ]);
    globalThis.__frf_setTableResult(TX, { data: rows, error: null });
    globalThis.__frf_setTableResult(PLATFORM, {
      data: { raw_data: { recovery: 35 }, extracted_at: new Date().toISOString(), platform: 'whoop' },
      error: null,
    });
    const r = await computeRiskForecast('u1');
    expect(r.status).toBe('insufficient_data');
    expect(r.baseline.stress_days).toBe(2);
  });
});

describe('computeRiskForecast — decision', () => {
  const bigHistory = txRows([
    // 3 stress days with HIGH discretionary spend
    { date: '2026-06-01', amount: -300, category: 'shopping', recovery: 30 },
    { date: '2026-06-02', amount: -300, category: 'food_delivery', recovery: 30 },
    { date: '2026-06-03', amount: -300, category: 'entertainment', recovery: 30 },
    // 3 normal days with LOW discretionary spend
    { date: '2026-06-10', amount: -50, category: 'shopping', recovery: 85 },
    { date: '2026-06-11', amount: -50, category: 'food_delivery', recovery: 85 },
    { date: '2026-06-12', amount: -50, category: 'entertainment', recovery: 85 },
  ]);

  it('flags high_risk when today matches the stress profile and stress-day spend is higher', async () => {
    globalThis.__frf_setTableResult(TX, { data: bigHistory, error: null });
    globalThis.__frf_setTableResult(PLATFORM, {
      data: { raw_data: { recovery: 35 }, extracted_at: new Date().toISOString(), platform: 'whoop' },
      error: null,
    });
    const r = await computeRiskForecast('u1');
    expect(r.status).toBe('high_risk');
    expect(r.expected_extra).toBe(250); // 300 - 50
    expect(r.headline).toBe('Dia de atenção');
    expect(r.detail).toMatch(/R\$/); // BRL formatted
    expect(r.current_biology.recovery).toBe(35);
  });

  it('returns low_risk when today does NOT match the stress profile', async () => {
    globalThis.__frf_setTableResult(TX, { data: bigHistory, error: null });
    globalThis.__frf_setTableResult(PLATFORM, {
      data: { raw_data: { recovery: 90 }, extracted_at: new Date().toISOString(), platform: 'whoop' },
      error: null,
    });
    const r = await computeRiskForecast('u1');
    expect(r.status).toBe('low_risk');
    expect(r.headline).toBe('Dia tranquilo');
  });

  it('classifies a stress day by low sleep even when recovery is fine', async () => {
    // Today: recovery healthy (80) but sleep low (55) -> stress profile true.
    const history = txRows([
      { date: '2026-06-01', amount: -400, category: 'shopping', sleep: 40 },
      { date: '2026-06-02', amount: -400, category: 'food_delivery', sleep: 40 },
      { date: '2026-06-03', amount: -400, category: 'entertainment', sleep: 40 },
      { date: '2026-06-10', amount: -20, category: 'shopping', sleep: 90 },
      { date: '2026-06-11', amount: -20, category: 'food_delivery', sleep: 90 },
      { date: '2026-06-12', amount: -20, category: 'entertainment', sleep: 90 },
    ]);
    globalThis.__frf_setTableResult(TX, { data: history, error: null });
    globalThis.__frf_setTableResult(PLATFORM, {
      data: { raw_data: { recovery: 80, sleep_score: 55 }, extracted_at: new Date().toISOString(), platform: 'oura' },
      error: null,
    });
    const r = await computeRiskForecast('u1');
    expect(r.status).toBe('high_risk');
  });
});
