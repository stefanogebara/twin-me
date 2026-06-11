/**
 * unlockProgress — pure logic for the Money page's single "unlock" card
 * (replan-2026-06-10 Track D).
 *
 * The four permanently-empty promise surfaces (patterns, risk forecast,
 * nudges & wins, savings hero) were collapsed into ONE progress card that
 * tells the user exactly what to do: connect a bank and wear the Whoop.
 * Stress-spend patterns need days where transaction data and body
 * (recovery) data OVERLAP — this computes that overlap from data the page
 * already fetches (timeline + transaction list), no extra endpoints.
 */

import type { TimelineDay, Transaction } from '@/services/api/transactionsAPI';

export interface UnlockProgress {
  /** Distinct calendar days with at least one transaction (timeline + list union). */
  transactionDays: number;
  /** Distinct transaction days that also carried a Whoop recovery signal. */
  overlapDays: number;
  /** Days of overlap required before patterns unlock. */
  targetDays: number;
  /** 0–100, overlapDays vs targetDays, clamped. */
  pct: number;
  unlocked: boolean;
}

const dayKey = (iso: string): string => iso.slice(0, 10);

export function computeUnlockProgress(
  timeline: TimelineDay[],
  transactions: Transaction[],
  targetDays = 14,
): UnlockProgress {
  const txDays = new Set<string>();
  for (const d of timeline) {
    if (d.day && d.tx_count > 0) txDays.add(dayKey(d.day));
  }
  for (const t of transactions) {
    if (t.transaction_date) txDays.add(dayKey(t.transaction_date));
  }

  const overlap = new Set<string>();
  for (const t of transactions) {
    if (
      t.transaction_date &&
      t.emotional_context &&
      t.emotional_context.recovery_score !== null &&
      t.emotional_context.recovery_score !== undefined
    ) {
      overlap.add(dayKey(t.transaction_date));
    }
  }

  const target = Math.max(1, Math.floor(targetDays));
  const pct = Math.min(100, Math.round((overlap.size / target) * 100));

  return {
    transactionDays: txDays.size,
    overlapDays: overlap.size,
    targetDays: target,
    pct,
    unlocked: overlap.size >= target,
  };
}
