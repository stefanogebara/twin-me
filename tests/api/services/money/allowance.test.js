import { describe, it, expect } from 'vitest';
import { safeToSpend, statedIncome, typicalMonth, eventsToday, allowanceLine, MIN_MONTHS_FOR_TYPICAL, weekdayShare, SHAPE_LIMIT, freshBalance, nextInflow, SHAPE_MIN_WEEKDAYS } from '../../../../api/services/money/allowance.js';

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

describe('the day gets its share of the week', () => {
  /* Sunday first. This person's Fridays and Saturdays carry the week. */
  const week = [4, 6, 6, 6, 8, 30, 24];

  it('gives a loud day more than an even split and a quiet day less', () => {
    const friday = weekdayShare(week, new Date('2026-09-18T12:00:00Z'), 7);
    const tuesday = weekdayShare(week, new Date('2026-09-15T12:00:00Z'), 7);
    expect(friday.ratio).toBeGreaterThan(1.2);
    expect(tuesday.ratio).toBeLessThan(0.9);
    /* The shares of a whole week come to the whole. */
    const all = [0, 1, 2, 3, 4, 5, 6].map((i) => weekdayShare(week, new Date(`2026-09-${13 + i}T12:00:00Z`), 7 - i));
    expect(all[0].share).toBeCloseTo(4 / 84, 5);
  });

  it('says nothing when there is no week to read', () => {
    expect(weekdayShare(null, new Date(), 7)).toBeNull();
    expect(weekdayShare([0, 0, 0, 0, 0, 0, 0], new Date(), 7)).toBeNull();
    expect(weekdayShare([1, 2, 3], new Date(), 7)).toBeNull();
  });

  it('moves the number but never by more than a third', () => {
    const cast = { month: '2026-09-01', spent: 0, committed: 0, days_left: 6, calendar_ahead: 0, calendar_items: [], weekday_baseline: week };
    const facts = [{ kind: 'income', amount: 700 }];
    /* 700 over seven days is 100 a day evenly; a Friday of theirs is worth more than that. */
    const friday = safeToSpend({ cast, facts, now: new Date('2026-09-18T12:00:00Z') });
    const tuesday = safeToSpend({ cast, facts, now: new Date('2026-09-15T12:00:00Z') });
    expect(friday.amount).toBeGreaterThan(100);
    expect(tuesday.amount).toBeLessThan(100);
    expect(friday.amount).toBeLessThanOrEqual(100 * (1 + SHAPE_LIMIT));
    expect(tuesday.amount).toBeGreaterThanOrEqual(100 * (1 - SHAPE_LIMIT));
    /* The shape travels with the number, so the screen can say why it moved. */
    expect(friday.shape).toMatchObject({ weekday: 5 });
    expect(friday.shape.ratio).toBeGreaterThan(1);
    /* A week with no shape leaves the number where it was. */
    const flat = safeToSpend({ cast: { ...cast, weekday_baseline: undefined }, facts, now: new Date('2026-09-18T12:00:00Z') });
    expect(flat.amount).toBe(100);
    expect(flat.shape).toBeNull();
  });
});

describe('the day rests on the balance when the bank has said one', () => {
  const account = (balance, over = {}) => ({ balance, balance_at: '2026-09-09T10:00:00Z', balance_type: 'CLBD', bank_name: 'Santander', ...over });

  it('reads a fresh balance and ignores a stale one or a credit line', () => {
    expect(freshBalance([account(447.98)], NOW)).toMatchObject({ amount: 447.98, banks: ['Santander'] });
    expect(freshBalance([account(447.98, { balance_at: '2026-09-01T10:00:00Z' })], NOW)).toBeNull();
    expect(freshBalance([account(2000, { balance_type: 'OTHR/credit' })], NOW)).toBeNull();
    expect(freshBalance([account(400), account(50, { bank_name: 'Revolut' })], NOW)).toMatchObject({ amount: 450, banks: ['Santander', 'Revolut'] });
  });

  it('spreads what is in the account, less what is spoken for, over the days until the next money', () => {
    /* 1,97 EUR for the day over 447,98 EUR in the bank was the screen on 2026-09-16, because
       the day was spreading what was left of a stated 1750. */
    const c = cast({ days_left: 14, committed: 97.41, committed_items: [{ merchant_key: 'vercel', typical_amount: 97.41, next_expected: '2026-09-20' }] });
    const a = safeToSpend({ cast: c, facts: [{ kind: 'income', amount: 1750 }], accounts: [account(447.98)], now: NOW });
    expect(a.basis).toBe('balance');
    expect(a.base).toBe(447.98);
    expect(a.free).toBe(350.57);
    expect(a.amount).toBe(23.37);
    expect(a.horizon).toEqual({ day: null, days: 15, source: null });
    /* The stated income still frames the month, so the screen can draw it. */
    expect(a.income).toBe(1750);
    expect(a.sentence).toBe('From the 447,98\u202f\u20ac in Santander, after 97,41\u202f\u20ac still to be charged, over 15 days.');
  });

  it('runs to the next money in when the forecast expects one', () => {
    const c = cast({ days_left: 20, committed: 0, income_items: [{ source: 'family', amount: 900, due_on: '2026-09-14' }] });
    expect(nextInflow(c, NOW)).toEqual({ day: '2026-09-14', days: 5, source: 'family' });
    const a = safeToSpend({ cast: c, facts: [], accounts: [account(200)], now: NOW });
    expect(a.horizon.days).toBe(5);
    expect(a.amount).toBe(40);
    expect(a.sentence).toContain('over the 5 days until family arrives.');
    /* Money expected after the month's end is the month's end. */
    expect(nextInflow(cast({ days_left: 3, income_items: [{ source: 'x', amount: 1, due_on: '2026-10-02' }] }), NOW)).toEqual({ day: null, days: 4, source: null });
  });

  it('only counts what lands before the next money', () => {
    const c = cast({ days_left: 20, committed: 150, committed_items: [
      { merchant_key: 'a', typical_amount: 50, next_expected: '2026-09-12' },
      { merchant_key: 'b', typical_amount: 100, next_expected: '2026-09-25' },
    ], income_items: [{ source: 'beca', amount: 500, due_on: '2026-09-14' }] });
    const a = safeToSpend({ cast: c, facts: [], accounts: [account(300)], now: NOW });
    expect(a.committed).toBe(50);
    expect(a.free).toBe(250);
  });

  it('says it is over when what is spoken for exceeds the account', () => {
    const a = safeToSpend({ cast: cast({ days_left: 10, committed: 500 }), facts: [], accounts: [account(300)], now: NOW });
    expect(a.over).toBe(true);
    expect(a.amount).toBe(0);
    expect(a.sentence).toMatch(/^That is 200,00/);
  });

  it('falls back to the budget without a fresh balance, unchanged', () => {
    const a = safeToSpend({ cast: cast(), facts: [{ kind: 'income', amount: 1000 }], accounts: [account(447.98, { balance_at: '2026-08-01T10:00:00Z' })], now: NOW });
    expect(a.basis).toBe('income');
    expect(a.balance).toBeNull();
  });
});

describe('the week has to be a week before it shapes a day', () => {
  it('says nothing about a week of mostly zeros', () => {
    /* Stefano's own baseline on 2026-09-16: two card days a week read as a shape, and a
       Wednesday with a zero median fell to the floor with the weekday blamed. */
    expect(SHAPE_MIN_WEEKDAYS).toBe(4);
    expect(weekdayShare([0, 0, 0, 0, 8.75, 0, 2.75], new Date('2026-09-16T12:00:00Z'), 15)).toBeNull();
    expect(weekdayShare([4, 6, 6, 0, 8, 30, 0], new Date('2026-09-16T12:00:00Z'), 15)).not.toBeNull();
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
    /* The sentence names the total the diary expects; the event itself is data the screen
       says in the reader's own language, so it is not repeated in English here. */
    expect(a.sentence).toContain('40,00\u202F\u20AC the diary expects');
    expect(a.sentence).not.toContain('Dinner');
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

describe('a student month before the ledger has two of its own', () => {
  it('reads against a typical student month on top of the rent, and says so', () => {
    const cast = { spent: 300, committed: 0, days_left: 15, calendar_ahead: 0, calendar_items: [] };
    const facts = [{ kind: 'commitment', subject: 'Habitacion', amount: 600 }];
    const a = safeToSpend({ cast, segments: [], facts, now: new Date('2026-09-15T12:00:00Z') });
    expect(a.basis).toBe('student_prior');
    expect(a.budget).toBe(1100);
    expect(a.amount).toBe(50);
    expect(a.sentence).toMatch(/typical student month in Madrid on top of your rent/);
  });
  it('still says nothing when the rent is unknown', () => {
    const cast = { spent: 300, committed: 0, days_left: 15, calendar_ahead: 0, calendar_items: [] };
    expect(safeToSpend({ cast, segments: [], facts: [], now: new Date('2026-09-15T12:00:00Z') }).amount).toBeNull();
  });
});

describe('the base the budget rests on', () => {
  it('is what they said comes in, with the keep beside it', async () => {
    const { safeToSpend } = await import('../../../../api/services/money/allowance.js');
    const cast = { spent: 800, committed: 100, calendar_ahead: 0, calendar_items: [], days_left: 10, month: '2026-09-01', projected_p50: 1200 };
    const a = safeToSpend({ cast, segments: [], facts: [{ kind: 'income', amount: 1750 }, { kind: 'keep', amount: 200 }], now: new Date('2026-09-20T12:00:00Z') });
    expect(a).toMatchObject({ basis: 'income', base: 1750, keep: 200, budget: 1550 });
  });
});

describe('which account today is read from', () => {
  const at = '2026-09-09T10:00:00Z';
  const acc = (id, balance, over = {}) => ({ id, balance, balance_at: at, balance_type: 'CLBD', bank_name: 'Santander', ...over });

  it('counts every account until the person says which ones they spend from', () => {
    const accounts = [acc('a1', 400), acc('a2', 2000, { bank_name: 'Revolut' })];
    expect(freshBalance(accounts, NOW).amount).toBe(2400);
    /* Once one is ruled out, a savings balance stops being money for today. */
    const said = [{ kind: 'spend_account', subject: 'a1', value: 'yes' }, { kind: 'spend_account', subject: 'a2', value: 'no' }];
    expect(freshBalance(accounts, NOW, said).amount).toBe(400);
    /* An account nobody has been asked about yet still counts. */
    const partly = [{ kind: 'spend_account', subject: 'a2', value: 'no' }];
    expect(freshBalance(accounts, NOW, partly).amount).toBe(400);
  });

  it('says nothing when every account is ruled out', () => {
    const accounts = [acc('a1', 400)];
    expect(freshBalance(accounts, NOW, [{ kind: 'spend_account', subject: 'a1', value: 'no' }])).toBeNull();
  });
});
