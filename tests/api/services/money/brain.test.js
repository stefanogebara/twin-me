/**
 * The brain learns from money and nothing else, so these tests hand it money and
 * nothing else. Two halves, as everywhere in this module: what it says when the
 * evidence is there, and the silence when it is not.
 *
 * The fixtures are the shapes a real Santander feed makes: Renfe Cercanias at 1,70
 * eight times on weekdays, Simply Alcala on Sundays, Spotify at 11,99 on the 4th,
 * El Corte Ingles at 116,76 against its own 12 EUR usual, and a metro ride that is
 * always followed by the same building an hour later.
 */
import { describe, it, expect } from 'vitest';
import {
  merchantProfile, learnMerchants, predictNext, learnPatterns, describeForTwin,
  MAX_PATTERNS, MAX_PREDICTIONS, MAX_TWIN_LINES,
} from '../../../../api/services/money/brain.js';

/* es-ES currency puts a non-breaking space before the euro sign; read sentences plainly. */
const plain = (s) => String(s).replace(/\u00a0/g, ' ');

const NOW = new Date('2026-09-08T12:00:00Z');

let seq = 0;
function tx(when, amount, merchant = 'Shop', extra = {}) {
  seq += 1;
  return {
    id: `t${seq}`,
    occurred_at: when.includes('T') ? when : `${when}T12:00:00Z`,
    amount: -Math.abs(amount),
    merchant_raw: merchant,
    merchant_key: merchant.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(),
    merchant_city: null,
    channel: 'card',
    is_recurring: false,
    verdict: null,
    ...extra,
  };
}

/* ------------------------------------------------------------------- fixtures */

/** 1,70 EUR, eight times, never on a weekend, never the same price twice over. */
const RENFE_DATES = ['2026-06-22', '2026-07-01', '2026-07-14', '2026-07-23', '2026-08-05', '2026-08-13', '2026-08-26', '2026-09-03'];
const renfe = () => RENFE_DATES.map((d) => tx(`${d}T08:10:00Z`, 1.7, 'Renfe Cercanias', { merchant_city: 'Madrid', category: 'transport' }));

/** Four Sundays and one Tuesday, at a price that moves every time. */
const SIMPLY = [['2026-08-09', 22.4], ['2026-08-16', 41.05], ['2026-08-23', 18.9], ['2026-08-30', 35.15], ['2026-09-01', 27.3]];
const simply = () => SIMPLY.map(([d, a]) => tx(d, a, 'Simply Alcala', { merchant_city: 'Alcala de Henares', category: 'groceries' }));

/** The 4th of the month, to the cent, four months running. */
const spotify = () => ['2026-06-04', '2026-07-04', '2026-08-04', '2026-09-04']
  .map((d) => tx(d, 11.99, 'Spotify', { is_recurring: true, channel: 'card', category: 'software' }));

/** Four ordinary afternoons and one that was not. */
const corte = () => [
  tx('2026-06-10', 11, 'El Corte Ingles', { merchant_city: 'Madrid', category: 'groceries' }),
  tx('2026-06-27', 12, 'El Corte Ingles', { merchant_city: 'Madrid', category: 'groceries' }),
  tx('2026-07-19', 12, 'El Corte Ingles', { merchant_city: 'Madrid', category: 'groceries' }),
  tx('2026-08-14', 13, 'El Corte Ingles', { merchant_city: 'Madrid', category: 'groceries' }),
  tx('2026-09-07', 116.76, 'El Corte Ingles', { merchant_city: 'Madrid', category: 'groceries' }),
];

/** A metro ride, and the same building forty-five minutes later, three mornings. */
const commute = () => ['2026-09-01', '2026-09-03', '2026-09-07'].flatMap((d) => [
  tx(`${d}T08:05:00Z`, 1.5, 'Metro de Madrid', { merchant_city: 'Madrid', category: 'transport' }),
  tx(`${d}T08:50:00Z`, 3.4, 'Torre IE', { merchant_city: 'Madrid', category: 'coffee' }),
]);

const ledger = () => [...renfe(), ...simply(), ...spotify(), ...corte(), ...commute()];
const categoryOf = (t) => t.category || null;

/* ------------------------------------------------------------------- profiles */

describe('merchantProfile: what the ledger knows about one place', () => {
  it('reads the whole of a merchant off its own rows', () => {
    const p = merchantProfile(renfe(), 'renfe cercanias', { now: NOW });
    expect(p).toMatchObject({
      merchant_key: 'renfe cercanias',
      name: 'Renfe Cercanias',
      city: 'Madrid',
      category: 'transport',
      channel: 'card',
      times: 8,
      typical_amount: 1.7,
      amount_low: 1.7,
      amount_high: 1.7,
      amount_is_fixed: true,
      usual_weekday: null,
      median_gap_days: 9,
      last_gap_days: 8,
      days_since_last: 5,
      is_overdue: false,
    });
    expect(p.total).toBe(13.6);
    expect(p.first_seen).toBe('2026-06-22T08:10:00Z');
    expect(p.last_seen).toBe('2026-09-03T08:10:00Z');
    /* Monday to Thursday, never a Saturday or a Sunday. */
    expect(p.weekday_counts).toEqual([0, 1, 1, 3, 3, 0, 0]);
  });

  it('takes the median, not the mean, so one large afternoon does not move the usual', () => {
    const rows = corte();
    const mean = rows.reduce((s, t) => s + Math.abs(t.amount), 0) / rows.length;
    const p = merchantProfile(rows, 'el corte ingles', { now: NOW });
    expect(p.typical_amount).toBe(12);
    expect(Math.round(mean)).toBe(33);
    expect(p.amount_high).toBe(116.76);
    expect(p.amount_is_fixed).toBe(false);
  });

  it('calls a price fixed only when its whole range sits inside 5% of the middle', () => {
    expect(merchantProfile(spotify(), 'spotify', { now: NOW }).amount_is_fixed).toBe(true);
    expect(merchantProfile(simply(), 'simply alcala', { now: NOW }).amount_is_fixed).toBe(false);
  });

  it('gives a merchant a weekday only when one day holds half of four or more visits', () => {
    const p = merchantProfile(simply(), 'simply alcala', { now: NOW });
    expect(p.usual_weekday).toBe(0);
    expect(p.weekday_counts[0]).toBe(4);

    /* Three Sundays are three Sundays, not a Sunday habit. */
    const three = SIMPLY.slice(0, 3).map(([d, a]) => tx(d, a, 'Simply Alcala'));
    expect(merchantProfile(three, 'simply alcala', { now: NOW }).usual_weekday).toBeNull();
  });

  it('keeps a day of the month only while the charges keep it', () => {
    expect(merchantProfile(spotify(), 'spotify', { now: NOW })).toMatchObject({
      usual_day_of_month: 4,
      cadence: 'monthly',
    });
    expect(merchantProfile(simply(), 'simply alcala', { now: NOW }).usual_day_of_month).toBeNull();
  });

  it('calls a merchant overdue past half again its usual gap, and not before', () => {
    const weekly = ['2026-07-06', '2026-07-13', '2026-07-20', '2026-07-27'].map((d) => tx(d, 9, 'Gym'));
    const p = merchantProfile(weekly, 'gym', { now: NOW });
    expect(p.median_gap_days).toBe(7);
    expect(p.days_since_last).toBe(43);
    expect(p.is_overdue).toBe(true);

    /* Six days into a seven-day gap is between visits, not late. */
    const fresh = ['2026-08-18', '2026-08-25', '2026-09-01'].map((d) => tx(d, 9, 'Gym'));
    expect(merchantProfile(fresh, 'gym', { now: NOW }).is_overdue).toBe(false);

    /* Two visits give one gap, which has no middle to be late against. */
    const twice = ['2026-06-01', '2026-06-08'].map((d) => tx(d, 9, 'Gym'));
    expect(merchantProfile(twice, 'gym', { now: NOW }).is_overdue).toBe(false);
  });

  it('reads spending only, and nothing at all for a merchant it has never seen', () => {
    const rows = [...renfe(), { ...tx('2026-09-01', 1, 'Renfe Cercanias'), amount: 2000 }];
    expect(merchantProfile(rows, 'renfe cercanias', { now: NOW }).times).toBe(8);
    expect(merchantProfile(rows, 'nowhere', { now: NOW })).toBeNull();
  });
});

describe('learnMerchants', () => {
  it('returns every merchant, dearest first', () => {
    const profiles = learnMerchants(ledger(), { now: NOW, categoryOf });
    expect(profiles.map((p) => p.merchant_key)).toEqual([
      'el corte ingles', 'simply alcala', 'spotify', 'renfe cercanias', 'torre ie', 'metro de madrid',
    ]);
    const totals = profiles.map((p) => p.total);
    expect([...totals].sort((a, b) => b - a)).toEqual(totals);
  });
});

/* ---------------------------------------------------------------- predictions */

describe('predictNext: what the ledger expects, from cadence alone', () => {
  it('dates the next visit from the last one plus the middle gap', () => {
    const profiles = learnMerchants(renfe(), { now: NOW });
    const [next] = predictNext(profiles, { now: NOW, days: 14 });
    expect(next).toMatchObject({ merchant_key: 'renfe cercanias', name: 'Renfe Cercanias', expected_on: '2026-09-12', typical_amount: 1.7 });
    expect(next.confidence).toBeGreaterThan(0.5);
    expect(next.confidence).toBeLessThanOrEqual(1);
  });

  it('keeps the horizon: a monthly charge is not expected inside a fortnight', () => {
    const profiles = learnMerchants(spotify(), { now: NOW });
    expect(predictNext(profiles, { now: NOW, days: 14 })).toEqual([]);
    expect(predictNext(profiles, { now: NOW, days: 40 })[0]).toMatchObject({ merchant_key: 'spotify', expected_on: '2026-10-05' });
  });

  it('rolls an overdue merchant forward rather than printing a day that has passed', () => {
    const weekly = ['2026-08-03', '2026-08-10', '2026-08-17'].map((d) => tx(d, 9, 'Gym'));
    const [next] = predictNext(learnMerchants(weekly, { now: NOW }), { now: NOW, days: 14 });
    expect(next.expected_on).toBe('2026-09-14');
  });

  it('says nothing under three visits, and nothing when the gaps do not hold', () => {
    const twice = ['2026-08-25', '2026-09-01'].map((d) => tx(d, 9, 'Gym'));
    expect(predictNext(learnMerchants(twice, { now: NOW }), { now: NOW })).toEqual([]);

    /* 2, 30 and 3 days apart is not a rhythm, and a date from it would be invented. */
    const wobble = ['2026-08-01', '2026-08-03', '2026-09-02', '2026-09-05'].map((d) => tx(d, 9, 'Cafe'));
    expect(predictNext(learnMerchants(wobble, { now: NOW }), { now: NOW, days: 60 })).toEqual([]);
  });

  it('caps the list and sorts it by date', () => {
    const rows = [];
    for (let i = 0; i < 12; i += 1) {
      for (const day of ['2026-08-14', '2026-08-21', '2026-08-28', '2026-09-04']) rows.push(tx(day, 5 + i, `Place ${i}`));
    }
    const out = predictNext(learnMerchants(rows, { now: NOW }), { now: NOW, days: 14 });
    expect(out).toHaveLength(MAX_PREDICTIONS);
    const dates = out.map((p) => p.expected_on);
    expect([...dates].sort()).toEqual(dates);
  });
});

/* -------------------------------------------------------------------- patterns */

const FINDING_KEYS = ['kind', 'month', 'sentence', 'detail', 'numbers', 'receipts', 'evidence_count'];
const find = (rows, kind, extra = {}) => learnPatterns({ transactions: rows, now: NOW, ...extra }).find((f) => f.kind === kind);

describe('learnPatterns: price_point', () => {
  it('names a price that never moves, and counts how long it has not', () => {
    const f = find(renfe(), 'price_point');
    expect(plain(f.sentence)).toBe('Renfe Cercanias is always 1,70 \u20ac, 8 times since June.');
    expect(f.detail).toBe('Every one of them the same to the cent.');
    expect(f.numbers).toMatchObject({ typical_amount: 1.7, times: 8, amount_low: 1.7, amount_high: 1.7 });
    expect(f.receipts).toHaveLength(3);
    expect(f.evidence_count).toBe(8);
  });

  it('stays quiet on two payments, however equal they are', () => {
    expect(find(renfe().slice(0, 2), 'price_point')).toBeUndefined();
  });

  it('stays quiet on a price that moves', () => {
    expect(find(simply(), 'price_point')).toBeUndefined();
  });
});

describe('learnPatterns: weekday_habit', () => {
  it('names the day a place belongs to', () => {
    const f = find(simply(), 'weekday_habit');
    expect(f.sentence).toBe('You pay Simply Alcala on Sundays, 4 of 5 times.');
    expect(plain(f.detail)).toBe('Since 9 August, at 27,30 \u20ac a time.');
    expect(f.numbers).toMatchObject({ weekday: 0, on_day: 4, times: 5 });
    expect(f.evidence_count).toBe(5);
  });

  it('stays quiet on three visits, even when all three fall on the same day', () => {
    expect(find(SIMPLY.slice(0, 3).map(([d, a]) => tx(d, a, 'Simply Alcala')), 'weekday_habit')).toBeUndefined();
  });
});

describe('learnPatterns: month_shape', () => {
  /** Three whole months whose money lands in the first ten days. */
  const frontLoaded = () => {
    const rows = [];
    for (const month of ['2026-06', '2026-07', '2026-08']) {
      for (const day of [2, 4, 6, 8, 10]) rows.push(tx(`${month}-${String(day).padStart(2, '0')}`, 60, `Front ${day}`));
      for (const day of [12, 14, 16, 18, 20, 22, 24, 26, 28]) rows.push(tx(`${month}-${day}`, 3, `Tail ${day}`));
    }
    return rows;
  };

  it('names the part of the month the money lands in, with a p value behind it', () => {
    const f = find(frontLoaded(), 'month_shape');
    expect(f.sentence).toBe('92% of what you spend lands in the first third of the month.');
    expect(f.numbers).toMatchObject({ third: 0, share_percent: 92, months: 3 });
    expect(f.numbers.p).toBeLessThanOrEqual(0.05);
    expect(f.evidence_count).toBe(42);
  });

  it('stays quiet on one complete month', () => {
    const rows = frontLoaded().filter((t) => t.occurred_at.startsWith('2026-08'));
    expect(find(rows, 'month_shape')).toBeUndefined();
  });

  it('stays quiet when the month is flat', () => {
    const rows = [];
    for (const month of ['2026-06', '2026-07', '2026-08']) {
      for (let day = 1; day <= 28; day += 1) rows.push(tx(`${month}-${String(day).padStart(2, '0')}`, 20, `Flat ${day}`));
    }
    expect(find(rows, 'month_shape')).toBeUndefined();
  });
});

describe('learnPatterns: place_habit', () => {
  const placed = (madrid, elsewhere) => {
    const rows = [];
    for (let i = 0; i < madrid; i += 1) rows.push(tx('2026-09-0' + ((i % 7) + 1), 10, `M${i}`, { merchant_city: 'Madrid' }));
    for (let i = 0; i < elsewhere; i += 1) rows.push(tx('2026-08-0' + ((i % 7) + 1), 10, `B${i}`, { merchant_city: 'Barcelona' }));
    return rows;
  };

  it('names the city the card lives in', () => {
    const f = find(placed(8, 4), 'place_habit');
    expect(f.sentence).toBe('67% of your card payments happen in Madrid: 8 of 12.');
    expect(plain(f.detail)).toBe('80,00 \u20ac of 120,00 \u20ac, across 2 cities.');
    expect(f.numbers).toMatchObject({ city: 'Madrid', count: 8, placed: 12, share_percent: 67, cities: 2 });
  });

  it('stays quiet under ten placed payments', () => {
    expect(find(placed(6, 3), 'place_habit')).toBeUndefined();
  });

  it('stays quiet when no city holds a majority', () => {
    expect(find(placed(6, 6), 'place_habit')).toBeUndefined();
  });
});

describe('learnPatterns: pairing', () => {
  it('names two places that keep happening together', () => {
    const f = find(commute(), 'pairing');
    expect(f.sentence).toBe('Metro de Madrid and Torre IE go together, 3 times.');
    expect(f.detail).toBe('Torre IE follows Metro de Madrid by about 45 minutes.');
    expect(f.numbers).toMatchObject({ first: 'metro de madrid', second: 'torre ie', times: 3, median_gap_minutes: 45 });
    expect(f.receipts).toHaveLength(4);
  });

  it('stays quiet on two mornings', () => {
    const rows = commute().filter((t) => !t.occurred_at.startsWith('2026-09-07'));
    expect(find(rows, 'pairing')).toBeUndefined();
  });

  it('stays quiet when the two are hours apart', () => {
    const rows = ['2026-09-01', '2026-09-03', '2026-09-07'].flatMap((d) => [
      tx(`${d}T08:05:00Z`, 1.5, 'Metro de Madrid'),
      tx(`${d}T19:00:00Z`, 3.4, 'Torre IE'),
    ]);
    expect(find(rows, 'pairing')).toBeUndefined();
  });
});

describe('learnPatterns: amount_outlier', () => {
  it('measures a payment against the merchant it was made at', () => {
    const f = find(corte(), 'amount_outlier');
    expect(plain(f.sentence)).toBe('El Corte Ingles usually takes 12,00 \u20ac; on 7 September it took 116,76 \u20ac.');
    expect(f.detail).toBe('That is 9.7 times its usual, across 5 payments there.');
    expect(f.numbers).toMatchObject({ typical_amount: 12, amount: 116.76, multiple: 9.7 });
    expect(f.month).toBe('2026-09-01');
    /* One receipt, and it is the afternoon in question. */
    expect(f.receipts).toHaveLength(1);
    expect(Math.abs(f.receipts[0].amount)).toBe(116.76);
  });

  it('stays quiet before four payments have said what usual is', () => {
    /* Two ordinary afternoons behind it is not enough to know what ordinary was. */
    const thin = corte().filter((t) => Math.abs(t.amount) > 100 || t.occurred_at < '2026-07-01');
    expect(find(thin, 'amount_outlier')).toBeUndefined();
  });

  it('stays quiet when the large payment is not large for that merchant', () => {
    const even = corte().map((t) => ({ ...t, amount: -12 }));
    expect(find(even, 'amount_outlier')).toBeUndefined();
  });
});

describe('learnPatterns: category_rhythm', () => {
  /** Eating out every Saturday and Sunday, and a small Wednesday coffee habit beside it. */
  const weekendEating = () => {
    const rows = [];
    for (let ms = Date.UTC(2026, 5, 1); ms <= Date.UTC(2026, 8, 7); ms += 86400000) {
      const d = new Date(ms);
      const date = d.toISOString().slice(0, 10);
      const wd = d.getUTCDay();
      if (wd === 0 || wd === 6) rows.push(tx(date, 30, 'Bar', { category: 'eating out' }));
      else if (wd === 3) rows.push(tx(date, 6, 'Bar', { category: 'eating out' }));
    }
    return rows;
  };

  it('names a category that belongs to the weekend, with a p value behind it', () => {
    const f = find(weekendEating(), 'category_rhythm', { categoryOf });
    expect(plain(f.sentence)).toBe('Your eating out spending lands at weekends: 24,71 \u20ac a weekend day against 0,97 \u20ac a weekday.');
    expect(f.numbers).toMatchObject({ category: 'eating out' });
    expect(f.numbers.p).toBeLessThanOrEqual(0.05);
    expect(f.numbers.ratio).toBeGreaterThan(1.5);
  });

  it('stays quiet without a category accessor, and under eight payments', () => {
    expect(find(weekendEating(), 'category_rhythm')).toBeUndefined();
    const thin = weekendEating().slice(0, 6);
    expect(find(thin, 'category_rhythm', { categoryOf })).toBeUndefined();
  });

  it('stays quiet when the week is even', () => {
    const rows = [];
    for (let ms = Date.UTC(2026, 5, 1); ms <= Date.UTC(2026, 8, 7); ms += 86400000) {
      rows.push(tx(new Date(ms).toISOString().slice(0, 10), 20, 'Bar', { category: 'eating out' }));
    }
    expect(find(rows, 'category_rhythm', { categoryOf })).toBeUndefined();
  });
});

describe('learnPatterns: the shape of the output', () => {
  it('gives at most five findings, strongest first, each in the analyst shape', () => {
    const findings = learnPatterns({ transactions: ledger(), categoryOf, now: NOW });
    expect(findings.length).toBeLessThanOrEqual(MAX_PATTERNS);
    expect(findings[0].kind).toBe('weekday_habit');
    for (const f of findings) {
      expect(Object.keys(f).sort()).toEqual([...FINDING_KEYS].sort());
      expect(typeof f.sentence).toBe('string');
      expect(f.sentence.length).toBeGreaterThan(0);
      expect(Array.isArray(f.receipts)).toBe(true);
      expect(f.evidence_count).toBeGreaterThan(0);
      expect(f.numbers).toBeTypeOf('object');
    }
  });

  it('says nothing at all about an empty ledger', () => {
    expect(learnPatterns({ transactions: [], now: NOW })).toEqual([]);
  });

  it('accepts profiles it was given rather than recomputing them', () => {
    const profiles = learnMerchants(renfe(), { now: NOW });
    const findings = learnPatterns({ transactions: renfe(), profiles, now: NOW });
    expect(findings.map((f) => f.kind)).toContain('price_point');
  });
});

/* ------------------------------------------------------------------------ twin */

describe('describeForTwin', () => {
  const block = (rows, opts = {}) => {
    const profiles = learnMerchants(rows, { now: NOW, categoryOf });
    const predictions = predictNext(profiles, { now: NOW });
    const patterns = learnPatterns({ transactions: rows, profiles, categoryOf, now: NOW });
    return describeForTwin({ profiles, patterns, predictions, now: NOW, ...opts });
  };

  it('writes the Renfe fixture as one recallable line', () => {
    const lines = block(renfe()).split('\n');
    expect(lines[0]).toBe('Money, read on 8 September.');
    expect(lines[1]).toBe('Renfe Cercanias: 8 times since 22 June, always 1,70 EUR, weekdays. Next expected around 12 September.');
  });

  it('names the day when a merchant has one, and the lateness when it has none', () => {
    expect(block(simply())).toContain('Simply Alcala: 5 times since 9 August, usually 27,30 EUR, mostly Sundays.');
    /* Gaps of 2 days and then 42 are no rhythm to predict from, so the line has a
       lateness to report instead of a date. */
    const gym = ['2026-06-01', '2026-06-03', '2026-07-15'].map((d) => tx(d, 9, 'Gym'));
    expect(block(gym)).toContain('Last seen 55 days ago, past its usual 22 days.');
  });

  it('never runs past twelve lines', () => {
    const lines = block(ledger()).split('\n');
    expect(lines.length).toBeLessThanOrEqual(MAX_TWIN_LINES);
    for (const line of lines) expect(line.trim()).toBe(line);
  });

  it('spells the currency and carries no glyph a prompt would rather not hold', () => {
    const text = block(ledger());
    expect(text).toContain('EUR');
    expect(text).not.toMatch(/[^\x20-\x7e\n]/);
  });

  it('states numbers and no adjectives', () => {
    const text = block(ledger()).toLowerCase();
    for (const word of ['huge', 'massive', 'a lot', 'heavy', 'significant', 'impressive', 'expensive', 'cheap', 'unusual', 'often']) {
      expect(text).not.toContain(word);
    }
    expect(text).toMatch(/\d/);
  });

  it('says nothing at all when there is nothing learned', () => {
    expect(describeForTwin({ profiles: [], patterns: [], predictions: [], now: NOW })).toBe('');
  });
});

/* Two truthfulness rules found by reading the engine's own output on a real ledger. */
describe('what the engine will and will not claim', () => {
  const NOW3 = new Date('2026-09-08T10:00:00Z');

  it('says "about" for a price that moved, and keeps "always" for one that never did', () => {
    /* Higgsfield charged 52,80 / 53,96 / 54,04: inside the fixed band, but not identical,
       and "always 53,96" beside a range of 52,80 to 54,04 contradicts itself. */
    const moved = [
      tx('2026-06-22', -52.8, 'higgsfield'), tx('2026-07-22', -53.96, 'higgsfield'), tx('2026-08-22', -54.04, 'higgsfield'),
    ];
    const movedProfiles = learnMerchants(moved, { now: NOW3 });
    const movedPattern = learnPatterns({ transactions: moved, profiles: movedProfiles, now: NOW3 })
      .find((f) => f.kind === 'price_point');
    expect(plain(movedPattern.sentence)).toContain('about 53,96');
    expect(plain(movedPattern.sentence)).not.toContain('always');

    const same = [
      tx('2026-06-04', -11.99, 'spotify'), tx('2026-07-04', -11.99, 'spotify'), tx('2026-08-04', -11.99, 'spotify'),
    ];
    const sameProfiles = learnMerchants(same, { now: NOW3 });
    const samePattern = learnPatterns({ transactions: same, profiles: sameProfiles, now: NOW3 })
      .find((f) => f.kind === 'price_point');
    expect(plain(samePattern.sentence)).toContain('always 11,99');
  });

  it('keeps a half-believed date out of the twin block, because conversation cannot carry a confidence', () => {
    const predictions = [
      { merchant_key: 'sure', name: 'Sure Thing', expected_on: '2026-09-14', typical_amount: 20, confidence: 0.64 },
      { merchant_key: 'shaky', name: 'Shaky Guess', expected_on: '2026-09-09', typical_amount: 6, confidence: 0.17 },
    ];
    const block = describeForTwin({ profiles: [], patterns: [], predictions, now: NOW3 });
    expect(block).toContain('Sure Thing');
    expect(block).not.toContain('Shaky Guess');
  });
});
