/**
 * The analyst says nothing it cannot show receipts for, and says nothing at all
 * before there is enough to see. These tests hold both halves of that.
 */
import { describe, it, expect } from 'vitest';
import { monthSegments, readLedger } from '../../../../api/services/money/analyst.js';

/* es-ES currency puts a non-breaking space before the euro sign; read sentences plainly. */
const plain = (s) => String(s).replace(/\u00a0/g, ' ');

const NOW = new Date('2026-09-08T10:00:00Z');
let seq = 0;
function tx(date, amount, merchant = 'Shop', extra = {}) {
  seq += 1;
  return {
    id: `t${seq}`, occurred_at: `${date}T12:00:00Z`, amount,
    merchant_raw: merchant, merchant_key: merchant.toLowerCase(), channel: 'card', ...extra,
  };
}

describe('monthSegments', () => {
  it('splits money in and out by calendar month, newest first', () => {
    const rows = [tx('2026-09-02', -20, 'A'), tx('2026-09-03', -5, 'B'), tx('2026-09-04', 1000, 'Salary'), tx('2026-08-15', -50, 'C')];
    const segs = monthSegments(rows, NOW);
    expect(segs.map((s) => s.month)).toEqual(['2026-09-01', '2026-08-01']);
    expect(segs[0]).toMatchObject({ spent: 25, received: 1000, lines: 3, complete: false, days_covered: 8, days_in_month: 30 });
    expect(segs[0].biggest).toMatchObject({ merchant: 'A', amount: 20 });
    expect(segs[1]).toMatchObject({ spent: 50, complete: true, days_covered: 31 });
  });

  it('counts a finished month by its own length, not by today', () => {
    const segs = monthSegments([tx('2026-02-10', -10)], NOW);
    expect(segs[0]).toMatchObject({ days_covered: 28, days_in_month: 28, complete: true });
  });
});

describe('readLedger: the pace of the month', () => {
  it('compares the same days of the month before, and names the gap', () => {
    const rows = [
      tx('2026-09-01', -100, 'A'), tx('2026-09-05', -50, 'B'),
      tx('2026-08-02', -30, 'C'), tx('2026-08-06', -20, 'D'), tx('2026-08-20', -400, 'Late'),
    ];
    const { findings } = readLedger({ transactions: rows, now: NOW });
    const pace = findings.find((f) => f.kind === 'month_pace');
    expect(plain(pace.sentence)).toBe('By the 8th you had spent 150,00 €. By the 8th of August it was 50,00 €.');
    expect(plain(pace.detail)).toBe('That is 100,00 € more.');
    expect(pace.numbers).toMatchObject({ spent: 150, previous_spent: 50, gap: 100, day: 8 });
    expect(pace.receipts.map((r) => r.merchant_raw)).toEqual(['A', 'B']);
  });

  it('says nothing about the pace when there is no month before it', () => {
    const { findings } = readLedger({ transactions: [tx('2026-09-01', -100)], now: NOW });
    expect(findings.find((f) => f.kind === 'month_pace')).toBeUndefined();
  });
});

describe('readLedger: what comes back', () => {
  const recurring = [
    { merchant_key: 'spotify', merchant_name: 'Spotify', cadence: 'monthly', typical_amount: 11.99, occurrences: 3, last_seen: '2026-09-04T12:00:00Z' },
    { merchant_key: 'render com', merchant_name: 'RENDER.COM', cadence: 'monthly', typical_amount: 6.09, occurrences: 3, last_seen: '2026-09-01T12:00:00Z' },
    { merchant_key: 'fly io', merchant_name: 'FLY.IO', cadence: 'monthly', typical_amount: 18.63, occurrences: 3, last_seen: '2026-09-01T12:00:00Z' },
  ];
  it('adds the monthly charges up and carries the year', () => {
    /* merchant_key is the machine spelling the reconciler writes: dots and dashes gone. */
    const rows = [
      tx('2026-09-04', -11.99, 'Spotify', { merchant_key: 'spotify' }),
      tx('2026-09-01', -6.09, 'RENDER.COM', { merchant_key: 'render com' }),
      tx('2026-09-01', -18.63, 'FLY.IO', { merchant_key: 'fly io' }),
    ];
    const f = readLedger({ transactions: rows, recurring, now: NOW }).findings.find((x) => x.kind === 'subscriptions');
    expect(plain(f.sentence)).toBe('3 charges come back every month, 36,71 € together.');
    expect(f.numbers).toMatchObject({ count: 3, monthly_total: 36.71, yearly_total: 440.52 });
    expect(f.receipts).toHaveLength(3);
  });

  it('stays quiet on a single subscription', () => {
    const f = readLedger({ transactions: [], recurring: [recurring[0]], now: NOW }).findings.find((x) => x.kind === 'subscriptions');
    expect(f).toBeUndefined();
  });

  it('notices a monthly charge that stopped, once it is well past due', () => {
    const stopped = [{ ...recurring[0], last_seen: '2026-07-01T12:00:00Z' }];
    const f = readLedger({ transactions: [tx('2026-07-01', -11.99, 'Spotify')], recurring: stopped, now: NOW }).findings.find((x) => x.kind === 'dormant_charge');
    expect(plain(f.sentence)).toBe('Spotify came back every month and has not for 69 days.');
    expect(f.numbers).toMatchObject({ days_since: 69, occurrences: 3 });
  });
});

describe('readLedger: small payments', () => {
  it('counts them only once there are enough to be a pattern', () => {
    const few = Array.from({ length: 7 }, (_, i) => tx(`2026-09-0${i + 1}`, -2, 'Vending'));
    expect(readLedger({ transactions: few, now: NOW }).findings.find((f) => f.kind === 'small_payments')).toBeUndefined();

    const many = Array.from({ length: 10 }, (_, i) => tx(`2026-09-0${(i % 8) + 1}`, -2.5, 'Vending')).concat([tx('2026-09-02', -75, 'Rent')]);
    const f = readLedger({ transactions: many, now: NOW }).findings.find((x) => x.kind === 'small_payments');
    expect(plain(f.sentence)).toBe('10 payments under 5,00 € this month, 25,00 € together.');
    expect(f.numbers).toMatchObject({ count: 10, total: 25, share_percent: 25 });
  });
});

describe('readLedger: the biggest line', () => {
  it('speaks when one payment towers over the middle of the window', () => {
    const rows = Array.from({ length: 12 }, (_, i) => tx(`2026-09-0${(i % 8) + 1}`, -10, `S${i}`)).concat([tx('2026-09-07', -116.76, 'El Corte Ingles')]);
    const f = readLedger({ transactions: rows, now: NOW }).findings.find((x) => x.kind === 'biggest_line');
    expect(plain(f.sentence)).toBe('El Corte Ingles at 116,76 € is the largest single payment in 90 days.');
    expect(f.receipts[0].merchant_raw).toBe('El Corte Ingles');
    expect(f.numbers.multiple).toBeGreaterThan(4);
  });

  it('stays quiet when every line is much the same size', () => {
    const rows = Array.from({ length: 14 }, (_, i) => tx(`2026-09-0${(i % 8) + 1}`, -10 - i, `S${i}`));
    expect(readLedger({ transactions: rows, now: NOW }).findings.find((f) => f.kind === 'biggest_line')).toBeUndefined();
  });
});

describe('readLedger: a weekday that costs more', () => {
  it('needs six weeks of payments before it will name a day', () => {
    const thin = [tx('2026-09-01', -60, 'A'), tx('2026-09-08', -60, 'B')];
    expect(readLedger({ transactions: thin, now: NOW }).findings.find((f) => f.kind === 'weekday_shape')).toBeUndefined();
  });

  it('names the day when the difference survives a permutation test', () => {
    const rows = [];
    /* Eight weeks: Saturdays at 60 €, the other days at 5 €. */
    for (let w = 0; w < 8; w += 1) {
      const monday = new Date(Date.UTC(2026, 6, 13) + w * 7 * 86400000);
      for (let d = 0; d < 7; d += 1) {
        const day = new Date(monday.getTime() + d * 86400000);
        const iso = day.toISOString().slice(0, 10);
        rows.push(tx(iso, day.getUTCDay() === 6 ? -60 : -5, day.getUTCDay() === 6 ? 'Weekend' : 'Daily'));
      }
    }
    const f = readLedger({ transactions: rows, now: new Date('2026-09-08T10:00:00Z') }).findings.find((x) => x.kind === 'weekday_shape');
    expect(f.numbers.weekday).toBe(6);
    expect(plain(f.sentence)).toContain('Saturdays cost you');
    expect(f.numbers.p).toBeLessThanOrEqual(0.05);
  });

  it('keeps quiet when the days are all alike', () => {
    const rows = [];
    for (let i = 0; i < 60; i += 1) {
      const day = new Date(Date.UTC(2026, 6, 13) + i * 86400000).toISOString().slice(0, 10);
      rows.push(tx(day, -10, 'Same'));
    }
    expect(readLedger({ transactions: rows, now: new Date('2026-09-08T10:00:00Z') }).findings.find((f) => f.kind === 'weekday_shape')).toBeUndefined();
  });
});

describe('readLedger: somewhere new', () => {
  it('names the new place only against a history of places', () => {
    const history = Array.from({ length: 24 }, (_, i) => tx('2026-08-10', -10, `Old${i}`));
    const known = Array.from({ length: 4 }, (_, i) => tx('2026-09-02', -8, `Old${i}`));
    const rows = history.concat(known, [tx('2026-09-05', -9.5, 'Oakberry Acai'), tx('2026-09-06', -4, 'Oakberry Acai')]);
    const f = readLedger({ transactions: rows, now: NOW }).findings.find((x) => x.kind === 'new_merchant');
    expect(plain(f.sentence)).toBe('Oakberry Acai is new this month.');
    expect(plain(f.detail)).toBe('Oakberry Acai has taken 13,50 € across 2 payments.');
    expect(f.receipts).toHaveLength(2);
  });

  it('says nothing when most of the month is unrecognised, because then the history is what is thin', () => {
    const history = Array.from({ length: 24 }, (_, i) => tx('2026-07-10', -10, `Old${i}`));
    const allNew = Array.from({ length: 10 }, (_, i) => tx('2026-09-03', -12, `Fresh${i}`));
    const f = readLedger({ transactions: history.concat(allNew), now: NOW }).findings.find((x) => x.kind === 'new_merchant');
    expect(f).toBeUndefined();
  });
});

describe('readLedger', () => {
  it('returns nothing at all on an empty ledger, and does not throw', () => {
    const { segments, findings } = readLedger({});
    expect(segments).toEqual([]);
    expect(findings).toEqual([]);
  });

  it('gives every finding a kind, a sentence, numbers and receipts', () => {
    const rows = Array.from({ length: 20 }, (_, i) => tx(`2026-09-0${(i % 8) + 1}`, -3, 'Vending'))
      .concat(Array.from({ length: 12 }, (_, i) => tx('2026-08-05', -20, `Old${i}`)));
    const { findings } = readLedger({ transactions: rows, now: NOW });
    expect(findings.length).toBeGreaterThan(1);
    for (const f of findings) {
      expect(typeof f.kind).toBe('string');
      expect(f.sentence.endsWith('.')).toBe(true);
      expect(f.numbers).toBeTypeOf('object');
      expect(Array.isArray(f.receipts)).toBe(true);
      expect(f.evidence_count).toBeGreaterThan(0);
    }
  });
});
