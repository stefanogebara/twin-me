import { describe, it, expect } from 'vitest';
import {
  safeToSpend, statedIncome, typicalMonth, eventsToday, allowanceLine, MIN_MONTHS_FOR_TYPICAL,
} from '../../../../api/services/money/allowance.js';

const NOW = new Date('2026-09-09T12:00:00Z');

/** A month with ten days left after today, nothing committed, nothing in the diary. */
function cast(over = {}) {
  return {
    month: '2026-09-01', as_of: NOW.toISOString(), days_left: 10,
    spent: 300, committed: 0, calendar_ahead: 0, calendar_items: [], ...over,
  };
}

describe('what a month is measured against', () => {
  it('takes what the person said comes in, over every source they named', () => {
    expect(statedIncome([
      { kind: 'income', amount: 900 },
      { kind: 'income', amount: -250 },
      { kind: 'commitment', amount: 700 },
    ])).toBe(1150);
  });

  it('says nothing about income when nothing was said', () => {
    expect(statedIncome([{ kind: 'commitment', amount: 700 }])).toBe(null);
  });

  it('falls back to the middle of the complete months behind them', () => {
    const segments = [
      { month: '2026-06-01', spent: 400, complete: true },
      { month: '2026-07-01', spent: 600, complete: true },
      { month: '2026-08-01', spent: 500, complete: true },
      { month: '2026-09-01', spent: 300, complete: false },
    ];
    expect(typicalMonth(segments)).toBe(500);
  });

  it('refuses a typical month on one month of history', () => {
    expect(MIN_MONTHS_FOR_TYPICAL).toBe(2);
    expect(typicalMonth([{ month: '2026-08-01', spent: 500, complete: true }])).toBe(null);
  });

  it('never counts the month in progress as typical', () => {
    expect(typicalMonth([
      { month: '2026-08-01', spent: 500, complete: true },
      { month: '2026-09-01', spent: 300, complete: false },
    ])).toBe(null);
  });
});

describe('safe to spend today', () => {
  it('spreads what is free over the days left, today included', () => {
    const a = safeToSpend({
      cast: cast({ spent: 300, days_left: 9 }),
      facts: [{ kind: 'income', amount: 1000 }],
      now: NOW,
    });
    // 1000 - 300 = 700 free, over ten days including today
    expect(a.amount).toBe(70);
    expect(a.basis).toBe('income');
    expect(a.budget).toBe(1000);
  });

  it('takes off what is committed and what the diary expects', () => {
    const a = safeToSpend({
      cast: cast({ spent: 300, committed: 100, calendar_ahead: 100, days_left: 9 }),
      facts: [{ kind: 'income', amount: 1000 }],
      now: NOW,
    });
    // 1000 - 300 - 100 - 100 = 500 over ten days
    expect(a.amount).toBe(50);
    expect(a.sentence).toContain('100,00\u202F\u20AC still to be charged');
    expect(a.sentence).toContain('100,00\u202F\u20AC the diary expects');
  });

  it("takes today's own events off today's share", () => {
    const a = safeToSpend({
      cast: cast({
        spent: 300, days_left: 9, calendar_ahead: 40,
        calendar_items: [{ title: 'Dinner', day: '2026-09-09', amount: 40 }],
      }),
      facts: [{ kind: 'income', amount: 1000 }],
      now: NOW,
    });
    // free 660 over ten days is 66; tonight already expects 40
    expect(a.amount).toBe(26);
    expect(a.today_events).toEqual([{ title: 'Dinner', amount: 40 }]);
    expect(a.sentence).toContain('Dinner usually costs about 40,00\u202F\u20AC');
  });

  it('leaves tomorrow out of today', () => {
    expect(eventsToday([
      { title: 'Dinner', day: '2026-09-09', amount: 40 },
      { title: 'Match', day: '2026-09-10', amount: 20 },
    ], NOW)).toEqual([{ title: 'Dinner', amount: 40 }]);
  });

  it('says nothing rather than guessing when it knows no budget', () => {
    const a = safeToSpend({ cast: cast(), segments: [], facts: [], now: NOW });
    expect(a.amount).toBe(null);
    expect(a.why).toContain('what comes in');
    expect(a.sentence).toBe(null);
  });

  it('uses the typical month when no income was stated, and says so', () => {
    const a = safeToSpend({
      cast: cast({ spent: 200, days_left: 4 }),
      segments: [
        { month: '2026-07-01', spent: 500, complete: true },
        { month: '2026-08-01', spent: 500, complete: true },
      ],
      now: NOW,
    });
    expect(a.basis).toBe('typical');
    expect(a.amount).toBe(60); // 300 free over five days
    expect(a.sentence).toContain('your usual month of 500,00\u202F\u20AC');
  });

  it('tells the truth when the month is already past its budget', () => {
    const a = safeToSpend({
      cast: cast({ spent: 1200, days_left: 9 }),
      facts: [{ kind: 'income', amount: 1000 }],
      now: NOW,
    });
    expect(a.over).toBe(true);
    expect(a.amount).toBe(0);
    expect(a.free).toBe(-200);
    expect(a.sentence).toContain('200,00\u202F\u20AC past');
    expect(allowanceLine(a)).toContain('nothing');
    expect(allowanceLine(a)).toContain('EUR');
    expect(allowanceLine(a)).not.toContain('\u20AC');
  });

  it('never offers a negative allowance as though it were spendable', () => {
    const a = safeToSpend({
      cast: cast({ spent: 990, days_left: 0, calendar_items: [{ title: 'Dinner', day: '2026-09-09', amount: 40 }], calendar_ahead: 40 }),
      facts: [{ kind: 'income', amount: 1000 }],
      now: NOW,
    });
    expect(a.amount).toBe(0);
  });

  it('counts the last day of the month as one day, not none', () => {
    const a = safeToSpend({
      cast: cast({ spent: 900, days_left: 0 }),
      facts: [{ kind: 'income', amount: 1000 }],
      now: NOW,
    });
    expect(a.amount).toBe(100);
    expect(a.sentence).toContain('today');
  });

  it('says nothing at all without a month', () => {
    const a = safeToSpend({ cast: null, now: NOW });
    expect(a.amount).toBe(null);
    expect(allowanceLine(a)).toBe(null);
  });
});
