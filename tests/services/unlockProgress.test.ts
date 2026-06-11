/**
 * Tests for src/pages/components/money/unlockProgress.ts — the pure logic
 * behind the Money page's single "unlock" progress card (replan-2026-06-10
 * Track D). The card replaced four permanently-empty promise surfaces, so
 * its counts must be honest: distinct days, real overlap (transaction days
 * that also carry a Whoop recovery signal), clamped percentage.
 */
import { describe, it, expect } from 'vitest';
import { computeUnlockProgress } from '../../src/pages/components/money/unlockProgress';
import type { TimelineDay, Transaction } from '../../src/services/api/transactionsAPI';

function day(d: string, txCount: number): TimelineDay {
  return { day: d, spend: 10, stress_avg: null, stress_shop_count: 0, tx_count: txCount };
}

function tx(date: string, recovery: number | null, withContext = true): Transaction {
  return {
    id: `tx-${date}-${recovery ?? 'null'}-${Math.random()}`,
    amount: -10,
    currency: 'BRL',
    merchant_raw: 'M',
    merchant_normalized: null,
    category: null,
    transaction_date: date,
    source_bank: 'nubank',
    account_type: 'checking',
    created_at: `${date}T12:00:00Z`,
    emotional_context: withContext
      ? {
          hrv_score: null,
          recovery_score: recovery,
          sleep_score: null,
          music_valence: null,
          calendar_load: null,
          computed_stress_score: null,
          is_stress_shop_candidate: null,
          signals_found: recovery !== null ? 1 : 0,
        }
      : null,
  };
}

describe('computeUnlockProgress', () => {
  it('returns zeros for a brand-new user (no data at all)', () => {
    const p = computeUnlockProgress([], []);
    expect(p.transactionDays).toBe(0);
    expect(p.overlapDays).toBe(0);
    expect(p.targetDays).toBe(14);
    expect(p.pct).toBe(0);
    expect(p.unlocked).toBe(false);
  });

  it('counts distinct transaction days across timeline and list (union, no double-count)', () => {
    const timeline = [day('2026-06-01', 2), day('2026-06-02', 1), day('2026-06-03', 0)];
    const transactions = [tx('2026-06-02', null), tx('2026-06-04', null)];
    const p = computeUnlockProgress(timeline, transactions);
    // 06-01 (timeline), 06-02 (both, once), 06-04 (list only); 06-03 has tx_count 0.
    expect(p.transactionDays).toBe(3);
  });

  it('overlap counts only distinct days where a recovery signal exists', () => {
    const transactions = [
      tx('2026-06-01', 55),
      tx('2026-06-01', 60), // same day — must not double-count
      tx('2026-06-02', null), // no recovery → not overlap
      tx('2026-06-03', 0), // recovery 0 is a real signal
      tx('2026-06-04', null, false), // no emotional context at all
    ];
    const p = computeUnlockProgress([], transactions);
    expect(p.overlapDays).toBe(2);
    expect(p.unlocked).toBe(false);
  });

  it('handles full ISO timestamps in transaction_date (day-level dedupe)', () => {
    const transactions = [
      tx('2026-06-01T09:30:00Z', 70),
      tx('2026-06-01', 80),
    ];
    const p = computeUnlockProgress([], transactions);
    expect(p.overlapDays).toBe(1);
    expect(p.transactionDays).toBe(1);
  });

  it('pct is proportional to overlap vs target and clamps at 100', () => {
    const seven = Array.from({ length: 7 }, (_, i) =>
      tx(`2026-06-${String(i + 1).padStart(2, '0')}`, 50),
    );
    expect(computeUnlockProgress([], seven).pct).toBe(50);

    const twenty = Array.from({ length: 20 }, (_, i) =>
      tx(`2026-06-${String(i + 1).padStart(2, '0')}`, 50),
    );
    const p = computeUnlockProgress([], twenty);
    expect(p.pct).toBe(100);
    expect(p.unlocked).toBe(true);
  });

  it('respects a custom target and guards against target < 1', () => {
    const txs = [tx('2026-06-01', 50), tx('2026-06-02', 50)];
    expect(computeUnlockProgress([], txs, 2).unlocked).toBe(true);
    // Degenerate target never divides by zero.
    const p = computeUnlockProgress([], txs, 0);
    expect(p.targetDays).toBe(1);
    expect(p.pct).toBe(100);
  });
});
