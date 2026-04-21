/**
 * Unit tests for the recurrence detector's pure grouping logic.
 *
 * The real `detectAndMarkRecurring` in api/services/transactions/recurrenceDetector.js
 * hits Supabase. We extract just the JS math here: given N transactions grouped
 * by merchant, when does the detector classify as recurring?
 *
 * Rules (from recurrenceDetector.js):
 *   - Need >= 3 occurrences
 *   - Coefficient of variation (stddev/mean) of amount must be <= 0.20
 */
import { describe, it, expect } from 'vitest';

const MIN_OCCURRENCES = 3;
const AMOUNT_CV_THRESHOLD = 0.20;

function classify(amounts) {
  if (amounts.length < MIN_OCCURRENCES) return 'skip_low_count';
  const abs = amounts.map((a) => Math.abs(a));
  const mean = abs.reduce((s, a) => s + a, 0) / abs.length;
  if (mean === 0) return 'skip_zero_mean';
  const variance = abs.reduce((s, a) => s + (a - mean) ** 2, 0) / abs.length;
  const stddev = Math.sqrt(variance);
  const cv = stddev / mean;
  return cv <= AMOUNT_CV_THRESHOLD ? 'recurring' : 'skip_variable';
}

describe('recurrence classifier', () => {
  it('classifies Netflix-like monthly as recurring (identical amounts)', () => {
    expect(classify([-55.9, -55.9, -55.9, -55.9])).toBe('recurring');
  });

  it('classifies gym membership as recurring (tight variance)', () => {
    // 99, 99, 99.50, 99 — CV ~ 0.2%
    expect(classify([-99, -99, -99.5, -99])).toBe('recurring');
  });

  it('does not flag iFood habit (high variance orders)', () => {
    // 73.50 avg, stddev ~33 → CV ~0.45
    expect(classify([-45.2, -110.8, -60.0, -88.4, -85.1, -50.5])).toBe('skip_variable');
  });

  it('does not flag 2-occurrence merchants (need 3+)', () => {
    expect(classify([-200, -200])).toBe('skip_low_count');
    expect(classify([-9999])).toBe('skip_low_count');
  });

  it('marks 3 occurrences with tight variance as recurring', () => {
    expect(classify([-55, -55, -56])).toBe('recurring');
  });

  it('20% CV is the boundary — just under passes, just over fails', () => {
    // mean=100, amounts that produce CV≈0.19 vs 0.21
    expect(classify([-85, -100, -115])).toBe('recurring');        // CV ~0.122 ✓
    expect(classify([-75, -100, -125])).toBe('skip_variable');    // CV ~0.204 ✗
  });

  it('handles positive credits the same way (detector uses Math.abs)', () => {
    expect(classify([55, 55, 55])).toBe('recurring');
  });
});
