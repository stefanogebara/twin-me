/**
 * The figure over the standing charges must say what it counts.
 * A card of six rows adding to 134,12 EUR under a line reading 114,12 EUR is a screen
 * telling a person two different things and leaving them to guess (2026-09-24).
 */
import { describe, it, expect } from 'vitest';
import { monthlyLoad } from '../../src/pages/money/recurringLoad';
import type { MoneyRecurring } from '../../src/services/api/moneyAPI';

const series = (merchant_key: string, typical_amount: number, cadence: string): MoneyRecurring =>
  ({ merchant_key, typical_amount, cadence, occurrences: 3 } as MoneyRecurring);

/* Stefano's own six on the day it was found. */
const real = [
  series('higgsfield', 53.96, 'monthly'),
  series('elevenlabs io', 23.45, 'monthly'),
  series('facebook', 20, 'biweekly'),
  series('fly io', 18.63, 'monthly'),
  series('spotify', 11.99, 'monthly'),
  series('render com', 6.09, 'monthly'),
];

describe('monthlyLoad', () => {
  it('sums the monthly ones and says how many of the rows that is', () => {
    expect(monthlyLoad(real)).toEqual({ amount: 114.12, monthly: 5, total: 6, all: false });
  });

  it('says so when every row is monthly, so the line can drop the count', () => {
    expect(monthlyLoad(real.filter((r) => r.cadence === 'monthly'))).toEqual({ amount: 114.12, monthly: 5, total: 5, all: true });
  });

  it('is zero and complete on nothing at all', () => {
    expect(monthlyLoad([])).toEqual({ amount: 0, monthly: 0, total: 0, all: true });
  });

  it('counts an amount the API sent as a string, and never a negative one', () => {
    const odd = [series('a', 10, 'monthly'), { ...series('b', 0, 'monthly'), typical_amount: '5.50' } as MoneyRecurring, series('c', -3, 'monthly')];
    expect(monthlyLoad(odd).amount).toBe(18.5);
  });

  it('leaves out every rhythm that is not a month', () => {
    const others = [series('a', 9, 'weekly'), series('b', 9, 'biweekly'), series('c', 9, 'quarterly'), series('d', 9, 'yearly')];
    expect(monthlyLoad(others)).toEqual({ amount: 0, monthly: 0, total: 4, all: false });
  });
});
