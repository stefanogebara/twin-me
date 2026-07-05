/**
 * Characterization tests for getSpendingPatterns — the "why you spend" engine.
 * Zero LLM: pure SQL aggregation + threshold tests. The DB read is mocked so the
 * four pattern detectors (category×stress, weekday, biology×impulse, music×mood),
 * their sample/ratio thresholds, and the impact-score ranking + top-N slice are
 * pinned deterministically.
 *
 * Thresholds pinned (from the module): MIN_TRANSACTIONS_FOR_PATTERNS=14,
 * MIN_SAMPLES_PER_BIN=4, MIN_RATIO_TO_SURFACE=1.5, STRESS_HIGH=0.6, STRESS_LOW=0.4.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../api/services/database.js', () => {
  const holder = globalThis.__sps_holder ?? (globalThis.__sps_holder = { result: { data: [], error: null } });
  globalThis.__sps_set = (r) => { holder.result = r; };
  const chain = {};
  const methods = ['select', 'eq', 'gte', 'lt', 'lte', 'gt', 'order', 'in', 'not', 'neq'];
  for (const m of methods) chain[m] = () => chain;
  chain.limit = () => chain;
  chain.single = () => Promise.resolve(holder.result);
  chain.maybeSingle = () => Promise.resolve(holder.result);
  chain.then = (resolve, reject) => Promise.resolve(holder.result).then(resolve, reject);
  return { supabaseAdmin: { from: () => chain } };
});

import { getSpendingPatterns } from '../../../api/services/transactions/spendingPatternService.js';

/** One discretionary transaction row with an emotional_context tag. */
function tx({ amount = -100, category = 'shopping', date = '2026-06-15', stress = null, recovery = null, hrv = null, valence = null, stressShop = false }) {
  return {
    amount,
    category,
    transaction_date: date,
    emotional_context: {
      computed_stress_score: stress,
      is_stress_shop_candidate: stressShop,
      recovery_score: recovery,
      hrv_score: hrv,
      music_valence: valence,
    },
  };
}

beforeEach(() => {
  globalThis.__sps_set?.({ data: [], error: null });
});

describe('getSpendingPatterns — data gating', () => {
  it('reports not-enough-data below MIN_TRANSACTIONS_FOR_PATTERNS (14)', async () => {
    globalThis.__sps_set({ data: Array.from({ length: 10 }, () => tx({})), error: null });
    const r = await getSpendingPatterns('u1');
    expect(r.hasData).toBe(false);
    expect(r.minTransactionsReached).toBe(false);
    expect(r.txCount).toBe(10);
    expect(r.minRequired).toBe(14);
  });

  it('returns hasData:false with empty patterns on a DB error', async () => {
    globalThis.__sps_set({ data: null, error: { message: 'boom' } });
    const r = await getSpendingPatterns('u1');
    expect(r).toEqual({ hasData: false, patterns: [] });
  });

  it('returns hasData:true but no patterns when nothing clears the ratio bar', async () => {
    // 16 flat-spend shopping txns, half high-stress half low-stress, same amount
    // -> ratio 1.0 < 1.5 -> no category_stress pattern; no other signal set.
    const rows = [
      ...Array.from({ length: 8 }, (_, i) => tx({ amount: -100, category: 'shopping', stress: 0.7, date: `2026-06-0${(i % 9) + 1}` })),
      ...Array.from({ length: 8 }, (_, i) => tx({ amount: -100, category: 'shopping', stress: 0.2, date: `2026-06-1${i}` })),
    ];
    globalThis.__sps_set({ data: rows, error: null });
    const r = await getSpendingPatterns('u1');
    expect(r.hasData).toBe(true);
    expect(r.minTransactionsReached).toBe(true);
    expect(r.patterns).toEqual([]);
  });
});

describe('getSpendingPatterns — category × stress', () => {
  it('surfaces a category where stress-day spend is >= 1.5x low-stress spend', async () => {
    // 5 high-stress shopping @ 300, 5 low-stress shopping @ 100 -> ratio 3.0
    const rows = [
      ...Array.from({ length: 5 }, (_, i) => tx({ amount: -300, category: 'shopping', stress: 0.8, date: `2026-06-0${i + 1}` })),
      ...Array.from({ length: 5 }, (_, i) => tx({ amount: -100, category: 'shopping', stress: 0.2, date: `2026-06-1${i}` })),
      // padding to clear the 14-txn minimum without adding another surfaced bin
      ...Array.from({ length: 6 }, (_, i) => tx({ amount: -10, category: 'groceries', stress: 0.5, date: `2026-06-2${i}` })),
    ];
    globalThis.__sps_set({ data: rows, error: null });
    const r = await getSpendingPatterns('u1');
    const cat = r.patterns.find((p) => p.kind === 'category_stress');
    expect(cat).toBeDefined();
    expect(cat.category).toBe('shopping');
    expect(cat.ratio).toBe(3);
    expect(cat.high_avg).toBe(300);
    expect(cat.low_avg).toBe(100);
    expect(cat.high_n).toBe(5);
    expect(cat.low_n).toBe(5);
    expect(cat.headline).toMatch(/3x mais em compras online/);
  });

  it('requires MIN_SAMPLES_PER_BIN (4) in BOTH bins', async () => {
    // Only 3 high-stress -> below the 4-sample floor -> no pattern.
    const rows = [
      ...Array.from({ length: 3 }, (_, i) => tx({ amount: -300, category: 'shopping', stress: 0.8, date: `2026-06-0${i + 1}` })),
      ...Array.from({ length: 5 }, (_, i) => tx({ amount: -100, category: 'shopping', stress: 0.2, date: `2026-06-1${i}` })),
      ...Array.from({ length: 8 }, (_, i) => tx({ amount: -10, category: 'groceries', stress: 0.5, date: `2026-07-0${i + 1}` })),
    ];
    globalThis.__sps_set({ data: rows, error: null });
    const r = await getSpendingPatterns('u1');
    expect(r.patterns.find((p) => p.kind === 'category_stress')).toBeUndefined();
  });

  it('ignores transactions in the moderate stress band (0.4-0.6) and positive amounts', async () => {
    const rows = [
      // all moderate stress -> neither high nor low bin fills
      ...Array.from({ length: 16 }, (_, i) => tx({ amount: -200, category: 'shopping', stress: 0.5, date: `2026-06-${String((i % 28) + 1).padStart(2, '0')}` })),
      // a positive amount (refund) must be skipped
      tx({ amount: 500, category: 'shopping', stress: 0.9, date: '2026-06-15' }),
    ];
    globalThis.__sps_set({ data: rows, error: null });
    const r = await getSpendingPatterns('u1');
    expect(r.patterns.find((p) => p.kind === 'category_stress')).toBeUndefined();
  });
});

describe('getSpendingPatterns — biology × impulse', () => {
  it('flags an elevated impulse rate on low-biology days', async () => {
    // Low-bio days: recovery 40 (<50) with 80% stress-shop; high-bio: recovery 80 with 0%.
    const rows = [
      ...Array.from({ length: 5 }, (_, i) => tx({ amount: -100, category: 'shopping', recovery: 40, stressShop: true, date: `2026-06-0${i + 1}` })),
      tx({ amount: -100, category: 'shopping', recovery: 40, stressShop: false, date: '2026-06-06' }),
      ...Array.from({ length: 6 }, (_, i) => tx({ amount: -100, category: 'shopping', recovery: 80, stressShop: false, date: `2026-06-1${i}` })),
      // padding
      ...Array.from({ length: 4 }, (_, i) => tx({ amount: -10, category: 'groceries', recovery: 60, date: `2026-07-0${i + 1}` })),
    ];
    globalThis.__sps_set({ data: rows, error: null });
    const r = await getSpendingPatterns('u1');
    const bio = r.patterns.find((p) => p.kind === 'biology_impulse');
    expect(bio).toBeDefined();
    expect(bio.low_bio_rate).toBeCloseTo(0.83, 2); // 5/6
    expect(bio.high_bio_rate).toBe(0);
    expect(bio.low_bio_total).toBe(6);
  });
});

describe('getSpendingPatterns — ranking', () => {
  it('sorts patterns by impact_score desc and caps at topN', async () => {
    // Build a strong category_stress (high impact) + a weekday pattern; request topN=1.
    const rows = [
      // shopping: 5 stress @ 500, 5 calm @ 100 -> ratio 5x, big impact
      ...Array.from({ length: 5 }, (_, i) => tx({ amount: -500, category: 'shopping', stress: 0.8, date: `2026-06-0${i + 1}` })),
      ...Array.from({ length: 5 }, (_, i) => tx({ amount: -100, category: 'shopping', stress: 0.2, date: `2026-06-1${i}` })),
      // food_delivery: 5 stress @ 120, 5 calm @ 60 -> ratio 2x, smaller impact
      ...Array.from({ length: 5 }, (_, i) => tx({ amount: -120, category: 'food_delivery', stress: 0.8, date: `2026-07-0${i + 1}` })),
      ...Array.from({ length: 5 }, (_, i) => tx({ amount: -60, category: 'food_delivery', stress: 0.2, date: `2026-07-1${i}` })),
    ];
    globalThis.__sps_set({ data: rows, error: null });

    const top1 = await getSpendingPatterns('u1', { topN: 1 });
    expect(top1.patterns).toHaveLength(1);
    expect(top1.patterns[0].category).toBe('shopping'); // highest impact wins

    const all = await getSpendingPatterns('u1', { topN: 3 });
    // impact scores strictly decreasing across the returned set
    const impacts = all.patterns.map((p) => p.impact_score);
    for (let i = 1; i < impacts.length; i++) {
      expect(impacts[i - 1]).toBeGreaterThanOrEqual(impacts[i]);
    }
  });
});
