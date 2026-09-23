/**
 * Borrowed strength: other people's ledgers lean on a thin profile as aggregates only,
 * and a student whose rent is known has a typical month before their own has shown.
 */
import { describe, it, expect } from 'vitest';
import { poolMerchantPriors, shrink, applyPriors, studentMonth, PHI, LIVING_BEYOND_RENT } from '../../../../api/_app/services/money/priors.js';

const row = (user_id, merchant_key, times, typical_amount, median_gap_days) => ({ user_id, merchant_key, times, typical_amount, median_gap_days });

describe('poolMerchantPriors', () => {
  it('pools a merchant only once two other people have it, as medians and counts', () => {
    const priors = poolMerchantPriors([
      row('u2', 'metro de madrid', 20, 1.5, 2), row('u3', 'metro de madrid', 8, 1.7, 3), row('u4', 'metro de madrid', 3, 1.7, 9),
      row('u2', 'gym', 5, 30, 30),
    ]);
    expect(priors.get('metro de madrid')).toEqual({ users: 3, times: 31, typical_amount: 1.7, median_gap_days: 3 });
    expect(priors.has('gym')).toBe(false);
  });
});

describe('shrink', () => {
  it('leans on the pool in proportion to how little the person has seen', () => {
    expect(shrink(10, 0, 20)).toBe(20);
    expect(shrink(10, PHI, 20)).toBe(15);
    expect(shrink(10, 1000, 20)).toBeCloseTo(10, 1);
    expect(shrink(10, 3, null)).toBe(10);
    expect(shrink(null, 3, 20)).toBe(20);
  });
});

describe('applyPriors', () => {
  const priors = poolMerchantPriors([row('u2', 'cafe', 10, 2, 7), row('u3', 'cafe', 10, 2, 7)]);
  it('moves a thin profile toward the pool and says what it borrowed', () => {
    const [p] = applyPriors([{ merchant_key: 'cafe', times: 3, typical_amount: 4, median_gap_days: 3 }], priors);
    expect(p.typical_amount).toBeCloseTo(4 * (3 / 7) + 2 * (4 / 7), 2);
    expect(p.median_gap_days).toBeCloseTo(3 * (2 / 6) + 7 * (4 / 6), 1);
    expect(p.prior).toEqual({ users: 2, weight: 0.57 });
  });
  it('leaves a merchant nobody else has, and a person alone, exactly as they were', () => {
    const own = [{ merchant_key: 'my corner shop', times: 3, typical_amount: 4, median_gap_days: 3 }];
    expect(applyPriors(own, priors)).toEqual(own);
    expect(applyPriors(own, new Map())).toBe(own);
  });
});

describe('studentMonth', () => {
  it('speaks only once a rent is known, on top of that rent, and names itself as typical', () => {
    expect(studentMonth([])).toBeNull();
    expect(studentMonth([{ kind: 'home_area', value: 'Chamberi' }])).toBeNull();
    const m = studentMonth([{ kind: 'commitment', subject: 'Habitacion Chamberi', amount: 600 }]);
    expect(m).toMatchObject({ amount: 600 + LIVING_BEYOND_RENT.amount, low: 1000, high: 1250, rent: 600, basis: 'student_prior' });
    expect(m.label).toMatch(/typical student month/);
  });
  it('reads a rent-sized commitment as rent even without the word', () => {
    expect(studentMonth([{ kind: 'commitment', subject: 'Maria Dolores', amount: 200 }]).rent).toBe(200);
    expect(studentMonth([{ kind: 'commitment', subject: 'Gym', amount: 30 }])).toBeNull();
  });
});
