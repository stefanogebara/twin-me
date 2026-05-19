/**
 * Unit tests for investmentCorrelationInsights — the deterministic moat
 * insight generator. Pattern math is pure-function and easy to lock in.
 *
 * Coverage:
 *   - fractionUnderRecovery counts only events with a recovery score
 *   - fractionOverStress counts only events with a stress score
 *   - partitionByDirection splits sells (positive amount) from buys (negative)
 *   - detectPatterns surfaces insights only when bias threshold met
 *   - detectPatterns combines multiple patterns when each independently qualifies
 *   - thresholds enforced (must have N >= MIN_TRADES_FOR_PATTERN)
 */
import { describe, it, expect } from 'vitest';

const {
  fractionUnderRecovery,
  fractionOverStress,
  partitionByDirection,
  detectPatterns,
} = await import('../../../api/services/investmentCorrelationInsights.js');

/** Helper to build a fake event for testing. */
function ev({ recovery = null, stress = null, type = 'sell', amount = null } = {}) {
  return {
    id: Math.random().toString(36).slice(2),
    amount: amount ?? (type === 'sell' ? 100 : -100),
    transaction_date: '2026-05-10',
    category: `investment_${type}`,
    merchant_normalized: 'AAPL',
    emotional_context: (recovery == null && stress == null) ? null : {
      recovery_score: recovery,
      computed_stress_score: stress,
      calendar_load: null,
      music_valence: null,
    },
  };
}

describe('fractionUnderRecovery — only counts events with a recovery score', () => {
  it('returns 0/0 when no event has a recovery score', () => {
    const r = fractionUnderRecovery([ev({ stress: 0.8 }), ev({ stress: 0.9 })], 0.5);
    expect(r).toEqual({ fraction: 0, n: 0, k: 0 });
  });

  it('thresholds at recovery * 100 (Whoop stores 0-100, threshold expressed as 0-1)', () => {
    // 3 events with recovery scores 30, 45, 60 — threshold 0.5 (= 50%)
    const r = fractionUnderRecovery([
      ev({ recovery: 30 }), ev({ recovery: 45 }), ev({ recovery: 60 }),
    ], 0.5);
    expect(r.n).toBe(3);
    expect(r.k).toBe(2);   // 30 and 45 are below 50
    expect(r.fraction).toBeCloseTo(2 / 3);
  });

  it('excludes events without a recovery score from both numerator and denominator', () => {
    const r = fractionUnderRecovery([
      ev({ recovery: 30 }), ev({ recovery: 40 }), ev({ stress: 0.9 }), ev({ stress: 0.5 }),
    ], 0.5);
    expect(r.n).toBe(2);
    expect(r.k).toBe(2);
    expect(r.fraction).toBe(1);
  });
});

describe('fractionOverStress — only counts events with a stress score', () => {
  it('returns 0/0 when no event has stress', () => {
    const r = fractionOverStress([ev({ recovery: 80 })], 0.65);
    expect(r).toEqual({ fraction: 0, n: 0, k: 0 });
  });

  it('counts events with stress >= threshold', () => {
    const r = fractionOverStress([
      ev({ stress: 0.5 }), ev({ stress: 0.7 }), ev({ stress: 0.65 }), ev({ stress: 0.4 }),
    ], 0.65);
    expect(r.n).toBe(4);
    expect(r.k).toBe(2);   // 0.7 and 0.65
    expect(r.fraction).toBe(0.5);
  });
});

describe('partitionByDirection — sells positive, buys negative', () => {
  it('groups by sign and matching investment_ category prefix', () => {
    const events = [
      { amount: 100, category: 'investment_sell' },
      { amount: -100, category: 'investment_buy' },
      { amount: 50, category: 'investment_sell_short' },
      { amount: -50, category: 'investment_buy_market' },
      { amount: 25, category: 'investment_dividend' },     // not a sell — category doesn't match
      { amount: -25, category: 'investment_fee' },         // not a buy
    ];
    const { sells, buys } = partitionByDirection(events);
    expect(sells.length).toBe(2);
    expect(buys.length).toBe(2);
  });
});

describe('detectPatterns — only surfaces when bias threshold met', () => {
  it('returns no insights when both cohorts are too small', () => {
    const insights = detectPatterns({
      sells: [ev({ recovery: 20 }), ev({ recovery: 30 })],   // only 2 sells — below MIN_TRADES_FOR_PATTERN=3
      buys: [ev({ stress: 0.9, type: 'buy', amount: -100 })],
    });
    expect(insights).toEqual([]);
  });

  it('surfaces "sells_low_recovery" when >= 60% of >=3 sells are below 50% recovery', () => {
    const insights = detectPatterns({
      sells: [
        ev({ recovery: 30 }), ev({ recovery: 40 }), ev({ recovery: 35 }), ev({ recovery: 80 }),
      ],
      buys: [],
    });
    // 3 of 4 sells under 50% → fraction = 0.75, n = 4, threshold met
    const pattern = insights.find(i => i.metadata.pattern === 'sells_low_recovery');
    expect(pattern).toBeDefined();
    expect(pattern.metadata.n).toBe(4);
    expect(pattern.metadata.k).toBe(3);
    expect(pattern.insight).toMatch(/3 of your 4 sells/);
    expect(pattern.metadata.subcategory).toBe('investment_correlation');
    expect(pattern.category).toBe('trend');
    expect(pattern.department).toBe('finance');
  });

  it('surfaces "buys_high_stress" when >= 60% of >=3 buys are at stress >= 65%', () => {
    const insights = detectPatterns({
      sells: [],
      buys: [
        ev({ stress: 0.7, type: 'buy', amount: -100 }),
        ev({ stress: 0.8, type: 'buy', amount: -100 }),
        ev({ stress: 0.9, type: 'buy', amount: -100 }),
        ev({ stress: 0.3, type: 'buy', amount: -100 }),
      ],
    });
    const pattern = insights.find(i => i.metadata.pattern === 'buys_high_stress');
    expect(pattern).toBeDefined();
    expect(pattern.metadata.n).toBe(4);
    expect(pattern.metadata.k).toBe(3);
  });

  it('surfaces "recovery_direction_gap" when buy/sell recovery cohorts differ by >= 15 points', () => {
    const insights = detectPatterns({
      sells: [ev({ recovery: 30 }), ev({ recovery: 40 }), ev({ recovery: 35 })],
      buys: [
        ev({ recovery: 75, type: 'buy', amount: -100 }),
        ev({ recovery: 80, type: 'buy', amount: -100 }),
        ev({ recovery: 85, type: 'buy', amount: -100 }),
      ],
    });
    const pattern = insights.find(i => i.metadata.pattern === 'recovery_direction_gap');
    expect(pattern).toBeDefined();
    expect(pattern.metadata.buy_avg).toBe(80);
    expect(pattern.metadata.sell_avg).toBe(35);
    expect(pattern.metadata.gap).toBe(45);
    expect(pattern.insight).toMatch(/buy on higher-recovery days/);
  });

  it('does NOT surface a pattern when bias is below 60% threshold', () => {
    const insights = detectPatterns({
      sells: [
        ev({ recovery: 30 }), ev({ recovery: 60 }), ev({ recovery: 70 }), ev({ recovery: 80 }),
      ],   // only 1 of 4 under 50%
      buys: [],
    });
    expect(insights.find(i => i.metadata.pattern === 'sells_low_recovery')).toBeUndefined();
  });

  it('can surface multiple patterns when each independently qualifies', () => {
    const insights = detectPatterns({
      sells: [ev({ recovery: 25 }), ev({ recovery: 30 }), ev({ recovery: 35 })],
      buys: [
        ev({ stress: 0.7, recovery: 80, type: 'buy', amount: -100 }),
        ev({ stress: 0.8, recovery: 85, type: 'buy', amount: -100 }),
        ev({ stress: 0.9, recovery: 90, type: 'buy', amount: -100 }),
      ],
    });
    const patterns = insights.map(i => i.metadata.pattern);
    expect(patterns).toContain('sells_low_recovery');
    expect(patterns).toContain('buys_high_stress');
    expect(patterns).toContain('recovery_direction_gap');
  });
});
