/**
 * The ledger replayed, one day at a time.
 * ========================================
 * Every pure piece of the money brain is run the way the cron runs it, on a synthetic
 * student ledger, from day sixty to day one hundred and fifty: the day is forecast, the
 * next day scores it, the band learns, the merchants are learned, the next charges dated,
 * the deltas and the intention read. The test holds the invariants that no single-module
 * test can: nothing it says ever contains a NaN, an undefined or an Infinity; a dated
 * charge is never in the past; the band's coverage over ninety scored days sits near what
 * it promised; a habit's silence is read as a silence.
 */
import { describe, it, expect } from 'vitest';
import { dayForecast, calibrate, ALPHA } from '../../../../api/services/money/calibration.js';
import { predictionsFrom, scoreOne } from '../../../../api/services/money/predictions.js';
import { learnMerchants, predictNext } from '../../../../api/services/money/brain.js';
import { deltaFindings } from '../../../../api/services/money/deltas.js';
import { intentionFindings } from '../../../../api/services/money/intention.js';
import { projectMonth } from '../../../../api/services/money/projection.js';
import { safeToSpend } from '../../../../api/services/money/allowance.js';
import { nudgeFindings } from '../../../../api/services/money/nudges.js';

const DAY = 86400000;
const END = new Date('2026-09-14T22:00:00Z');
const DAYS = 150;
const CATEGORY = { 'cafe sol': 'coffee', 'renfe cercanias': 'transport', mercadona: 'groceries', 'la tasca': 'eating out', 'bar pepe': 'eating out', spotify: 'software', 'piso calle mayor': 'home' };
const categoryOf = (t) => CATEGORY[t.merchant_key] || null;

/** A seeded generator, so the ledger is the same every run. */
function rng(seed) { let s = seed; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; }

/** A student's five months: coffee on weekdays, the train three times a week, the shop on
    Saturdays, dinners at the weekend, Spotify on the 5th, rent on the 1st, family on the
    3rd, a four-day trip with nothing bought, and a dear last week eating out. */
function ledger() {
  const rand = rng(7);
  const rows = [];
  let id = 0;
  const add = (dayIndex, hour, amount, name, channel = 'card', extra = {}) => {
    const t = new Date(END.getTime() - (DAYS - 1 - dayIndex) * DAY);
    const at = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), hour));
    rows.push({ id: `t${id += 1}`, occurred_at: at.toISOString(), amount, merchant_raw: name, merchant_key: name.toLowerCase(), channel, ...extra });
  };
  for (let i = 0; i < DAYS; i += 1) {
    const d = new Date(END.getTime() - (DAYS - 1 - i) * DAY);
    const wd = d.getUTCDay(); const dom = d.getUTCDate();
    const away = i >= 100 && i < 104;
    if (dom === 1) add(i, 7, -550, 'Piso Calle Mayor', 'transfer');
    if (dom === 3) add(i, 9, 400, 'MAUAD GEBARA', 'transfer');
    if (dom === 5) add(i, 3, -9.99, 'Spotify', 'card', { is_recurring: true });
    if (away) continue;
    if (wd >= 1 && wd <= 5 && rand() < 0.8) add(i, 8, -2.2, 'Cafe Sol');
    if ([1, 3, 5].includes(wd)) add(i, 8, -1.7, 'Renfe Cercanias');
    if (wd === 6) add(i, 11, -(25 + Math.round(rand() * 20)), 'Mercadona');
    if ((wd === 5 || wd === 6) && rand() < 0.7) add(i, 21, -(18 + Math.round(rand() * 22)), rand() < 0.5 ? 'La Tasca' : 'Bar Pepe');
    if (i >= DAYS - 6) add(i, 21, -(30 + Math.round(rand() * 20)), 'La Tasca');
  }
  return rows;
}

const FACTS = [
  { kind: 'income', subject: 'family', subject_label: 'Family', amount: 400, day: 3 },
  { kind: 'commitment', subject: 'piso calle mayor', subject_label: 'Rent', amount: 550, day: 1, value: 'rent' },
  { kind: 'keep', subject: '', amount: 200 },
  { kind: 'cap', subject: 'eating out', amount: 120 },
];
const isSpending = () => true;
const BAD = /NaN|undefined|Infinity|null|\[object/;
const text = (f) => `${f.sentence || ''} ${f.detail || ''}`;

describe('the ledger replayed day by day', () => {
  const rows = ledger();
  const said = [];
  const figures = [];
  const dated = [];
  let band = null;
  let silenceSeen = false;
  const days = [];

  for (let i = 60; i < DAYS; i += 1) {
    const now = new Date(END.getTime() - (DAYS - 1 - i) * DAY);
    const today = now.toISOString().slice(0, 10);
    const known = rows.filter((t) => new Date(t.occurred_at) <= now);
    /* Score yesterday's figure, then write today's for tomorrow. */
    for (const f of figures) {
      if (f.scored_at) continue;
      const s = scoreOne(f, known, isSpending, now);
      if (s) Object.assign(f, s, { scored_at: now.toISOString() });
    }
    band = calibrate(figures.filter((f) => f.scored_at && f.kind === 'day_total'));
    const cast = projectMonth({ transactions: known, recurring: [], commitments: FACTS.filter((f) => f.kind === 'commitment'), income: FACTS.filter((f) => f.kind === 'income'), shareOf: () => 1, isSpending, isIncome: () => true, now, widen: band.widen });
    const allowance = safeToSpend({ cast, segments: [], facts: FACTS, now });
    const dayCast = dayForecast(known, new Date(now.getTime() + DAY), { isSpending });
    for (const r of predictionsFrom({ cast, allowance, day: dayCast, now })) figures.push({ ...r, scored_at: null });
    const profiles = learnMerchants(known, { now, categoryOf });
    for (const p of predictNext(profiles, { now })) dated.push({ today, ...p });
    const findings = [
      ...deltaFindings({ transactions: known, profiles, categoryOf, isSpending, now }),
      ...intentionFindings({ facts: FACTS, transactions: known, categoryOf, cast, now, isSpending, income: 400 }),
      ...nudgeFindings({ cast, allowance, now }),
    ];
    if (findings.some((f) => f.kind === 'delta_silence')) silenceSeen = true;
    said.push(...findings.map((f) => ({ today, kind: f.kind, text: text(f) })));
    days.push({ today, cast, allowance, band, findings: findings.length });
  }

  it('never says a number that is not a number', () => {
    const broken = said.filter((s) => BAD.test(s.text));
    expect(broken).toEqual([]);
    expect(said.length).toBeGreaterThan(30);
    for (const d of days) {
      expect(Number.isFinite(d.cast.projected_p50)).toBe(true);
      expect(d.cast.projected_p10 <= d.cast.projected_p50 && d.cast.projected_p50 <= d.cast.projected_p90).toBe(true);
    }
  });

  it('never dates a charge in the past, and reads the trip as a silence it can name', () => {
    expect(dated.length).toBeGreaterThan(20);
    expect(dated.filter((p) => p.expected_on < p.today)).toEqual([]);
    expect(dated.every((p) => p.confidence >= 0 && p.confidence <= 1)).toBe(true);
    expect(silenceSeen).toBe(true);
  });

  it('keeps the band near the coverage it promised, once it has learned', () => {
    const scored = figures.filter((f) => f.kind === 'day_total' && f.scored_at);
    expect(scored.length).toBeGreaterThan(80);
    expect(scored.every((f) => typeof f.hit === 'boolean' && Number.isFinite(f.actual))).toBe(true);
    expect(band.days).toBe(scored.length);
    expect(Number.isFinite(band.widen) && band.widen >= 0).toBe(true);
    /* Over ninety days a p10..p90 band should hold about four days in five. */
    expect(band.coverage).toBeGreaterThan(1 - ALPHA - 0.15);
    expect(band.coverage).toBeLessThanOrEqual(1);
  });

  it('reads the intention against the month every day, and the dear week as a change', () => {
    const caps = said.filter((s) => s.kind === 'cap_month');
    expect(caps.length).toBe(DAYS - 60);
    expect(caps[caps.length - 1].text).toMatch(/^Eating out: \d+,\d\d EUR/);
    const lastWeek = said.filter((s) => s.today >= '2026-09-13' && (s.kind === 'delta_category' || s.kind === 'delta_pace'));
    expect(lastWeek.length).toBeGreaterThan(0);
  });
});
