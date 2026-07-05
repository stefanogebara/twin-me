/**
 * UnlockProgressCard copy states (audit-2026-07-03, money HIGH-3).
 *
 * The card's unlock math counts a day only when a transaction carries a
 * Whoop recovery_score. A user with plenty of transactions but no synced
 * Whoop sat at "0 of 14 overlap days" under the headline "Connect your
 * bank and wear your Whoop." — the bank half was already done, and nothing
 * said the missing piece was recovery data. These tests pin the
 * conditional copy for each locked state. Unlock MATH is unchanged and
 * covered by tests/services/unlockProgress.test.ts.
 *
 * Rendering: react-dom/server renderToStaticMarkup in pure Node (project
 * has no jsdom/RTL — same approach as MoneyInsightsPage.test.tsx).
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { TimelineDay, Transaction } from '../../src/services/api/transactionsAPI';

// Lucide icons pull a large registry; the card only draws Lock/Activity.
vi.mock('lucide-react', () => {
  const Stub = () => React.createElement('span', null);
  return { Lock: Stub, Activity: Stub };
});

const { UnlockProgressCard } = await import(
  '../../src/pages/components/money/UnlockProgressCard'
);

/** Minimal Transaction fixture — only fields the card/math read. */
function tx(dateIso: string, recovery: number | null): Transaction {
  return {
    id: `tx_${dateIso}_${recovery ?? 'null'}`,
    amount: -50,
    currency: 'BRL',
    merchant_raw: 'Padaria',
    merchant_normalized: null,
    category: null,
    transaction_date: dateIso,
    source_bank: 'santander',
    account_type: 'checking',
    created_at: dateIso,
    emotional_context:
      recovery === null
        ? null
        : {
            hrv_score: null,
            recovery_score: recovery,
            sleep_score: null,
            music_valence: null,
            calendar_load: null,
            computed_stress_score: null,
            is_stress_shop_candidate: null,
            signals_found: 1,
          },
  };
}

const NO_TIMELINE: TimelineDay[] = [];

function render(timeline: TimelineDay[], transactions: Transaction[]): string {
  return renderToStaticMarkup(
    React.createElement(UnlockProgressCard, { timeline, transactions })
  );
}

describe('UnlockProgressCard locked-state copy', () => {
  it('with no data at all, asks for both bank and Whoop', () => {
    const html = render(NO_TIMELINE, []);
    expect(html).toContain('Connect your bank and wear your Whoop.');
  });

  it('with transactions but ZERO Whoop overlap, makes the Whoop dependency explicit', () => {
    // 6 transaction days, none with recovery data — the audit screenshot
    // state ("6 days of transactions · 0 of 14 overlap days").
    const txns = [
      tx('2026-04-02T10:00:00-03:00', null),
      tx('2026-04-05T10:00:00-03:00', null),
      tx('2026-04-08T10:00:00-03:00', null),
      tx('2026-04-09T10:00:00-03:00', null),
      tx('2026-04-13T10:00:00-03:00', null),
      tx('2026-04-27T10:00:00-03:00', null),
    ];
    const html = render(NO_TIMELINE, txns);
    // Headline names the one missing dependency, not the already-done bank step.
    expect(html).toContain('Wear your Whoop to unlock stress-spend patterns.');
    expect(html).not.toContain('Connect your bank and wear your Whoop.');
    // Body says WHY progress is stuck at zero: recovery data is required.
    expect(html).toMatch(/recovery data/i);
    expect(html).toMatch(/transactions are in/i);
  });

  it('with partial overlap, encourages continuing instead of re-asking for setup', () => {
    const txns = [
      tx('2026-04-02T10:00:00-03:00', 65),
      tx('2026-04-05T10:00:00-03:00', 71),
      tx('2026-04-08T10:00:00-03:00', null),
    ];
    const html = render(NO_TIMELINE, txns);
    expect(html).not.toContain('Connect your bank and wear your Whoop.');
    expect(html).toMatch(/keep wearing your whoop/i);
  });

  it('unlocked state is unchanged (math untouched)', () => {
    const txns = Array.from({ length: 14 }, (_, i) =>
      tx(`2026-04-${String(i + 1).padStart(2, '0')}T10:00:00-03:00`, 60 + i)
    );
    const html = render(NO_TIMELINE, txns);
    expect(html).toContain('Pattern analysis running');
    expect(html).toContain('14 days of overlap');
  });
});
