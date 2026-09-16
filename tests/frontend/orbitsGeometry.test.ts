/**
 * The Month orbits' geometry: the rings a month is divided into, and where a day sits.
 */
import { describe, expect, it } from 'vitest';
import { angleOf, keyFor, kindsByMerchant, kindsOf, markRadius, ringKeyOf, ringsOf } from '../../src/pages/money/figures/orbitsGeometry';
import type { MoneyCategoryGroup } from '../../src/services/api/moneyAPI';

const g = (category: string, spent: number, share: number, lines = 3): MoneyCategoryGroup => ({ category, known: true, spent, lines, share, merchants: [] });
const MONTH = [g('transfers', 376, 31), g('groceries', 333, 28), g('taxi', 116, 10), g('software', 50, 4), g('sport', 18, 1)];

describe('kindsOf', () => {
  it('keeps the big kinds and folds the small ones into one, biggest first', () => {
    const k = kindsOf(MONTH);
    expect(k.map((x) => x.key)).toEqual(['transfers', 'groceries', 'taxi', 'rest']);
    expect(k[3]).toMatchObject({ spent: 68, lines: 6 });
  });
  it('drops kinds nothing went to', () => {
    expect(kindsOf([g('taxi', 0, 0)])).toEqual([]);
  });
});

describe('keyFor', () => {
  const kinds = kindsOf(MONTH);
  it('sends a payment to its own ring, and everything else to the rest', () => {
    expect(keyFor('groceries', kinds)).toBe('groceries');
    expect(keyFor('software', kinds)).toBe('rest');
    expect(keyFor(null, kinds)).toBe('rest');
  });
});

describe('ringsOf', () => {
  it('puts the biggest kind on the outside and spaces the rings evenly', () => {
    const rings = ringsOf(kindsOf(MONTH), 400, 100);
    expect(rings[0]).toMatchObject({ R: 400 });
    expect(rings[rings.length - 1]).toMatchObject({ R: 100 });
    expect(rings[0].kind.key).toBe('transfers');
  });
  it('survives a month with one kind', () => {
    expect(ringsOf(kindsOf([g('taxi', 10, 100)]), 400, 100)[0].R).toBe(400);
  });
});

describe('angleOf', () => {
  it('puts today at the front of the ellipse, and the ends of the month at the back', () => {
    expect(angleOf(15, 15, 30)).toBeCloseTo(Math.PI / 2, 6);
    expect(Math.sin(angleOf(15, 15, 30))).toBeCloseTo(1, 6);
    expect(Math.sin(angleOf(30, 15, 30))).toBeCloseTo(-1, 6);
  });
  it('runs clockwise: tomorrow is past the front, yesterday before it', () => {
    expect(angleOf(16, 15, 30)).toBeGreaterThan(angleOf(15, 15, 30));
    expect(angleOf(14, 15, 30)).toBeLessThan(angleOf(15, 15, 30));
  });
});

describe('markRadius', () => {
  it('grows with the amount and shrinks towards the back', () => {
    expect(markRadius(100, 100, 0)).toBeGreaterThan(markRadius(10, 100, 0));
    expect(markRadius(100, 100, 1)).toBeLessThan(markRadius(100, 100, 0));
    expect(markRadius(0, 100, 0)).toBeGreaterThan(0);
  });
});

/* 2026-09-16: a ring opened an empty list because ledger rows carry no category of their
   own; the month's summary is what knows which shop is which kind of place. */
describe('ringKeyOf', () => {
  const groups = [
    { category: 'groceries', known: true, spent: 333, lines: 5, share: 28, merchants: [{ name: 'El Corte Ingles', merchant_key: 'el corte ingles', spent: 251 }] },
    { category: 'taxi', known: true, spent: 116, lines: 4, share: 10, merchants: [{ name: 'Cabify', merchant_key: 'cabify', spent: 60 }] },
    { category: 'software', known: true, spent: 50, lines: 4, share: 4, merchants: [{ name: 'Fly.io', merchant_key: 'fly io', spent: 18 }] },
  ];
  const kinds = kindsOf(groups);
  const by = kindsByMerchant(groups);
  it('uses the row\'s own category when it has one', () => {
    expect(ringKeyOf({ category: 'taxi', merchant_key: 'whatever' }, kinds, by)).toBe('taxi');
  });
  it('falls back to the shop, by key or by name', () => {
    expect(ringKeyOf({ category: null, merchant_key: 'el corte ingles' }, kinds, by)).toBe('groceries');
    expect(ringKeyOf({ category: null, merchant_key: null, merchant_name: 'Cabify' }, kinds, by)).toBe('taxi');
  });
  it('sends a small kind and an unknown shop to the ring of the rest', () => {
    expect(ringKeyOf({ category: null, merchant_key: 'fly io' }, kinds, by)).toBe('rest');
    expect(ringKeyOf({ category: null, merchant_key: 'nobody knows' }, kinds, by)).toBe('rest');
  });
});
