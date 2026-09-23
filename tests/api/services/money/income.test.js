/**
 * Income as dated events: the stated incomes on the day and amount their arrivals
 * support, with a confidence, and a stated income that has not come when it usually does.
 */
import { describe, it, expect } from 'vitest';
import { incomeSeries, incomeEvents, incomeFindings, INCOME_LATE, SAID_CONFIDENCE } from '../../../../api/services/money/income.js';

const NOW = new Date('2026-09-14T12:00:00Z');
const inflow = (id, day, amount, name, channel = 'transfer') => ({ id, occurred_at: `${day}T09:00:00Z`, amount, merchant_raw: name, merchant_key: name.toLowerCase(), channel });
/* Family money on the 3rd, 5th and 2nd of the last three months; a Bizum back that is a settlement. */
const family = [inflow('f1', '2026-06-03', 400, 'MAUAD GEBARA'), inflow('f2', '2026-07-05', 400, 'MAUAD GEBARA'), inflow('f3', '2026-08-02', 420, 'MAUAD GEBARA')];
const settlement = inflow('s1', '2026-09-11', 15.6, 'Ana Lopez', 'bizum');
const isIncome = (t) => t.id !== 's1';

describe('incomeSeries', () => {
  it('reads each sender as a rhythm: usual day, usual amount, how often on time', () => {
    const [s] = incomeSeries([...family, settlement], { isIncome, now: NOW });
    expect(s).toMatchObject({ key: 'mauad gebara', name: 'Mauad G.', times: 3, typical_amount: 400, typical_day: 3, on_time: 1, months: 3 });
    expect(incomeSeries([...family, settlement], { isIncome, now: NOW })).toHaveLength(1);
  });
});

describe('incomeEvents', () => {
  it('dates a stated income from its arrivals, with the confidence they earned', () => {
    const facts = [{ kind: 'income', subject: 'family', subject_label: 'Family', amount: 350, day: 1 }];
    const [e] = incomeEvents({ facts, transactions: family, isIncome, now: NOW });
    expect(e).toMatchObject({ source: 'Family', amount: 400, due_on: '2026-10-03', day: 3, confidence: 1, basis: 'seen 3 times, usually the 3rd', said: true, last_arrived_on: '2026-08-02' });
  });
  it('believes a stated income with nothing behind it at half, on the day they said', () => {
    const facts = [{ kind: 'income', subject: 'grant', subject_label: 'The grant', amount: 600, day: 20 }];
    const [e] = incomeEvents({ facts, transactions: [], now: NOW });
    expect(e).toMatchObject({ source: 'The grant', amount: 600, due_on: '2026-09-20', confidence: SAID_CONFIDENCE, basis: 'said', times: 0 });
  });
  it('says back a regular sender nobody mentioned, as seen and not said', () => {
    const [e] = incomeEvents({ facts: [], transactions: family, isIncome, now: NOW });
    expect(e).toMatchObject({ source: 'Mauad G.', amount: 400, said: false, basis: 'seen 3 times, not said', confidence: 1 });
    /* Two arrivals are not yet a sender worth mentioning unasked. */
    expect(incomeEvents({ facts: [], transactions: family.slice(0, 2), isIncome, now: NOW })).toEqual([]);
  });
  it('keeps the horizon and matches by amount when the name says nothing', () => {
    const facts = [{ kind: 'income', subject: 'home', subject_label: 'From home', amount: 410, day: 15 }];
    const [e] = incomeEvents({ facts, transactions: family, isIncome, now: NOW });
    expect(e.due_on).toBe('2026-10-03');
    expect(incomeEvents({ facts, transactions: family, isIncome, now: NOW, horizonDays: 10 })).toEqual([]);
  });
});

describe('incomeFindings', () => {
  const facts = [{ kind: 'income', subject: 'family', subject_label: 'Family', amount: 400, day: 3 }];
  it('says a stated income has not come once its usual day and the margin have passed', () => {
    const [f] = incomeFindings({ facts, transactions: family, isIncome, now: NOW });
    expect(f.kind).toBe(INCOME_LATE);
    expect(f.sentence).toBe('Family, usually about 400,00\u00a0\u20ac on the 3rd, has not come this month.');
    expect(f.detail).toBe('The last 3 came on the 2nd, 5th, 3rd.');
    expect(f.receipts.map((r) => r.id)).toEqual(['f3', 'f2', 'f1']);
    expect(f.numbers).toMatchObject({ typical_day: 3, days_late: 11 });
  });
  it('is quiet once it arrived, before the margin, and without a rhythm to hold it to', () => {
    expect(incomeFindings({ facts, transactions: [...family, inflow('f4', '2026-09-04', 400, 'MAUAD GEBARA')], isIncome, now: NOW })).toEqual([]);
    expect(incomeFindings({ facts, transactions: family, isIncome, now: new Date('2026-09-05T12:00:00Z') })).toEqual([]);
    expect(incomeFindings({ facts, transactions: family.slice(0, 1), isIncome, now: NOW })).toEqual([]);
  });
});

describe('a stated income said once', async () => {
  const { incomeEvents } = await import('../../../../api/services/money/income.js');
  it('lands in its month only, and a plain stated income every month', () => {
    const now = new Date('2026-09-21T10:00:00Z');
    const once = { kind: 'income', subject: 'vercel', subject_label: 'Vercel', amount: 150, day: 21, value: 'once:2026-09' };
    const later = { kind: 'income', subject: 'vercel', subject_label: 'Vercel', amount: 150, day: 21, value: 'once:2026-08' };
    const monthly = { kind: 'income', subject: 'parents', subject_label: 'Parents', amount: 1750, day: 1 };
    const evs = incomeEvents({ facts: [once, later, monthly], transactions: [], now, horizonDays: 40 });
    expect(evs.map((e) => `${e.source} ${e.amount} ${e.due_on} ${e.basis}`)).toEqual(['Vercel 150 2026-09-21 said, once', 'Parents 1750 2026-10-01 said']);
  });
});

describe('one sender, two kinds of money (2026-09-23)', () => {
  /* The father sends 1750 on the first and 100 now and then; the owner named him as family
     and said "Family, on the 1st, 1750". */
  const father = [
    inflow('a1', '2026-06-25', 100, 'Mauad Gebara Christian'), inflow('a2', '2026-07-10', 100, 'Mauad Gebara Christian'),
    inflow('a3', '2026-07-23', 100, 'Mauad Gebara Christian'), inflow('a4', '2026-07-29', 100, 'Mauad Gebara Christian'),
    inflow('a5', '2026-08-17', 100, 'Mauad Gebara Christian'), inflow('a6', '2026-08-26', 1750, 'Mauad Gebara Christian'),
    inflow('a7', '2026-07-01', 1750, 'Mauad Gebara Christian'),
  ];
  const facts = [
    { kind: 'person', subject: 'mauad gebara christian', value: 'family' },
    { kind: 'income', subject: 'family', subject_label: 'Family', amount: 1750, day: 1 },
  ];
  it('the stated income is dated from the arrivals of its own size, and the gifts make no event', () => {
    const events = incomeEvents({ facts, transactions: father, now: NOW });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ source: 'Family', amount: 1750, said: true, times: 2 });
    expect(events[0].basis).toMatch(/^seen 2 times/);
  });
  it('a named person who sends now and then never becomes an arrival to count on', () => {
    const gifts = father.filter((t) => t.amount === 100);
    const only = [{ kind: 'person', subject: 'mauad gebara christian', value: 'family' }];
    expect(incomeEvents({ facts: only, transactions: gifts, now: NOW })).toEqual([]);
    /* And by the bank's short form of the same name. */
    const short = gifts.map((t) => ({ ...t, merchant_raw: 'Mauad G.', merchant_key: 'mauad g' }));
    expect(incomeEvents({ facts: only, transactions: short, now: NOW })).toEqual([]);
  });
  it('a stranger who lands near the same day less than most of the time has no usual day', () => {
    const loose = [inflow('l1', '2026-06-02', 300, 'Acme Pay'), inflow('l2', '2026-07-19', 300, 'Acme Pay'), inflow('l3', '2026-08-28', 300, 'Acme Pay')];
    expect(incomeEvents({ facts: [], transactions: loose, now: NOW })).toEqual([]);
    const tight = [inflow('t1', '2026-06-02', 300, 'Acme Pay'), inflow('t2', '2026-07-03', 300, 'Acme Pay'), inflow('t3', '2026-08-02', 300, 'Acme Pay')];
    expect(incomeEvents({ facts: [], transactions: tight, now: NOW })).toHaveLength(1);
  });
});
