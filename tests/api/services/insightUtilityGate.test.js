/**
 * R3 — utility-gated proactive insight delivery (Simile deep-dive
 * .claude/plans/2026-08-01-simile-research R3; GUM/Gumbo's
 * expected-utility interruption rule, Horvitz CHI'99).
 *
 * Deliver iff E[interrupt] > E[stay silent]:
 *   E[interrupt] = p*B - (1-p)*C_FP
 *   E[silent]    = -p*C_FN
 *   => EV = p*B - (1-p)*C_FP + p*C_FN, deliver iff EV > 0
 *
 * All estimates are LLM-emitted per insight at generation time and stored
 * in proactive_insights.metadata.utility. Legacy rows and chapter nudges
 * have no utility block — they FAIL OPEN (deliver) and rank by an
 * urgency prior on the same scale. A daily token bucket caps total
 * deliveries regardless of EV.
 */
import { describe, it, expect } from 'vitest';

const {
  computeExpectedUtility,
  sanitizeUtility,
  shouldDeliverInsight,
  rankForDelivery,
  applyDailyCap,
  DAILY_DELIVERY_CAP,
  URGENCY_PRIOR,
} = await import('../../../api/services/insightUtilityGate.js');

const withUtility = (utility, over = {}) => ({
  id: Math.random().toString(36).slice(2),
  insight: 'test insight',
  urgency: 'medium',
  metadata: utility ? { utility } : {},
  ...over,
});

describe('computeExpectedUtility — the Gumbo rule', () => {
  it('computes p*B - (1-p)*C_FP + p*C_FN', () => {
    // p=0.8, B=5, C_FP=2, C_FN=3 => 4 - 0.4 + 2.4 = 6
    expect(computeExpectedUtility({ p_useful: 0.8, benefit: 5, cost_fp: 2, cost_fn: 3 }))
      .toBeCloseTo(6, 5);
  });

  it('a likely-useless, annoying interruption scores negative', () => {
    // p=0.1, B=3, C_FP=8, C_FN=1 => 0.3 - 7.2 + 0.1 = -6.8
    expect(computeExpectedUtility({ p_useful: 0.1, benefit: 3, cost_fp: 8, cost_fn: 1 }))
      .toBeLessThan(0);
  });

  it('high miss-cost keeps borderline insights deliverable', () => {
    // p=0.4, B=2, C_FP=3, C_FN=9 => 0.8 - 1.8 + 3.6 = 2.6
    expect(computeExpectedUtility({ p_useful: 0.4, benefit: 2, cost_fp: 3, cost_fn: 9 }))
      .toBeGreaterThan(0);
  });
});

describe('sanitizeUtility', () => {
  it('clamps p into [0,1] and costs into [0,10]', () => {
    const s = sanitizeUtility({ p_useful: 1.7, benefit: 15, cost_fp: -2, cost_fn: 5 });
    expect(s).toEqual({ p_useful: 1, benefit: 10, cost_fp: 0, cost_fn: 5 });
  });

  it('returns null for malformed or missing blocks', () => {
    expect(sanitizeUtility(null)).toBeNull();
    expect(sanitizeUtility({})).toBeNull();
    expect(sanitizeUtility({ p_useful: 'high', benefit: 5, cost_fp: 1, cost_fn: 1 })).toBeNull();
  });
});

describe('shouldDeliverInsight', () => {
  it('gates out negative-EV insights', () => {
    const result = shouldDeliverInsight(
      withUtility({ p_useful: 0.1, benefit: 3, cost_fp: 8, cost_fn: 1 }));
    expect(result.deliver).toBe(false);
    expect(result.ev).toBeLessThan(0);
  });

  it('delivers positive-EV insights', () => {
    const result = shouldDeliverInsight(
      withUtility({ p_useful: 0.8, benefit: 5, cost_fp: 2, cost_fn: 3 }));
    expect(result.deliver).toBe(true);
  });

  it('FAILS OPEN for rows without a utility block (legacy insights, chapter nudges)', () => {
    const result = shouldDeliverInsight(withUtility(null));
    expect(result.deliver).toBe(true);
    expect(result.ev).toBeNull();
  });
});

describe('rankForDelivery', () => {
  it('drops gated-out insights and orders the rest by EV, without mutating input', () => {
    const good = withUtility({ p_useful: 0.9, benefit: 8, cost_fp: 1, cost_fn: 5 }); // EV 11.6
    const ok = withUtility({ p_useful: 0.5, benefit: 4, cost_fp: 2, cost_fn: 2 });   // EV 2
    const bad = withUtility({ p_useful: 0.1, benefit: 2, cost_fp: 9, cost_fn: 0 });  // EV negative
    const input = [bad, ok, good];
    const ranked = rankForDelivery(input);
    expect(ranked.map(r => r.id)).toEqual([good.id, ok.id]);
    expect(input).toHaveLength(3); // no mutation
  });

  it('ranks utility-less rows by urgency prior on the same scale', () => {
    const highUrgency = withUtility(null, { urgency: 'high' });
    const lowUrgency = withUtility(null, { urgency: 'low' });
    const midEv = withUtility({ p_useful: 0.5, benefit: 4, cost_fp: 2, cost_fn: 2 }); // EV 2
    const ranked = rankForDelivery([lowUrgency, midEv, highUrgency]);
    // high prior (3) > EV 2 > low prior (0.5)
    expect(ranked.map(r => r.id)).toEqual([highUrgency.id, midEv.id, lowUrgency.id]);
    expect(URGENCY_PRIOR.high).toBeGreaterThan(2);
  });
});

describe('applyDailyCap — token bucket', () => {
  it('caps the effective limit by deliveries already made today', () => {
    expect(applyDailyCap(3, 0)).toBe(3);
    expect(applyDailyCap(3, DAILY_DELIVERY_CAP - 1)).toBe(1);
    expect(applyDailyCap(3, DAILY_DELIVERY_CAP)).toBe(0);
    expect(applyDailyCap(3, DAILY_DELIVERY_CAP + 5)).toBe(0);
  });

  it('never returns negative and tolerates garbage counts', () => {
    expect(applyDailyCap(3, null)).toBe(3);
    expect(applyDailyCap(3, undefined)).toBe(3);
    expect(applyDailyCap(0, 0)).toBe(0);
  });
});
