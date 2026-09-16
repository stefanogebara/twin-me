/**
 * Intention: what the person said they want, and the month read against it. Silent
 * without a fact; every line carries the rows that say so.
 */
import { describe, it, expect } from 'vitest';
import { keepAmount, caps, capFindings, keepFinding, intentionFindings } from '../../../../api/services/money/intention.js';
import { safeToSpend } from '../../../../api/services/money/allowance.js';

const NOW = new Date('2026-09-14T12:00:00Z');
const cast = { month: '2026-09-01', days_left: 16, projected_p50: 1150, spent: 500, committed: 0, calendar_ahead: 0, calendar_items: [] };
const t = (id, day, amount, merchant, category) => ({ id, occurred_at: `2026-09-${String(day).padStart(2, '0')}T12:00:00Z`, amount: -amount, merchant_raw: merchant, merchant_key: merchant.toLowerCase(), category });
const rows = [t('a', 3, 48, 'La Tasca', 'eating out'), t('b', 9, 30, 'Bar Pepe', 'eating out'), t('c', 12, 18, 'Cafe Sol', 'coffee'), t('d', 5, 9.9, 'Cabify', 'taxi'), t('e', 30, 40, 'Old', 'eating out')].map((x) => (x.id === 'e' ? { ...x, occurred_at: '2026-08-30T12:00:00Z' } : x));

describe('the facts', () => {
  it('reads a keep and the caps, with plain words for kinds of place', () => {
    expect(keepAmount([{ kind: 'keep', amount: '200' }])).toBe(200);
    expect(keepAmount([])).toBeNull();
    expect(caps([{ kind: 'cap', subject: 'Restaurants', amount: 120 }, { kind: 'cap', subject: 'Cabify', amount: 30 }]))
      /* label_is_category says whose word the label is: the product's for a kind of place,
         theirs for a place they named, which the page must never translate. */
      .toEqual([
        { subject: 'eating out', label: 'Eating out', label_is_category: true, amount: 120 },
        { subject: 'cabify', label: 'Cabify', label_is_category: false, amount: 30 },
      ]);
  });
});

describe('capFindings', () => {
  it('reads each cap against the month, with what is left per day and the receipts', () => {
    const facts = [{ kind: 'cap', subject: 'eating out', amount: 120 }, { kind: 'cap', subject: 'Cabify', amount: 30 }];
    const [eat, cab] = capFindings({ facts, transactions: rows, categoryOf: (x) => x.category, cast, now: NOW });
    expect(eat.sentence).toBe('Eating out: 78,00\u00a0\u20ac of the 120,00\u00a0\u20ac you said, 16 days left.');
    expect(eat.detail).toBe('That leaves 42,00\u00a0\u20ac, 2,47\u00a0\u20ac a day.');
    expect(eat.receipts.map((r) => r.id)).toEqual(['a', 'b']);
    expect(cab.sentence).toBe('Cabify: 9,90\u00a0\u20ac of the 30,00\u00a0\u20ac you said, 16 days left.');
  });
  it('says when a cap is passed, and nothing when none was set', () => {
    const [f] = capFindings({ facts: [{ kind: 'cap', subject: 'eating out', amount: 60 }], transactions: rows, categoryOf: (x) => x.category, cast, now: NOW });
    expect(f.sentence).toBe('Eating out: 78,00\u00a0\u20ac, past the 60,00\u00a0\u20ac you said by 18,00\u00a0\u20ac.');
    expect(f.numbers.over).toBe(true);
    expect(capFindings({ facts: [], transactions: rows, cast, now: NOW })).toEqual([]);
  });
});

describe('keepFinding and the allowance', () => {
  it('measures the forecast against what they want left', () => {
    const facts = [{ kind: 'keep', amount: 200 }, { kind: 'income', amount: 1300 }];
    const f = keepFinding({ facts, cast, income: 1300 });
    expect(f.sentence).toBe('You wanted 200,00\u00a0\u20ac left; at this pace the month ends with 150,00\u00a0\u20ac, 50,00\u00a0\u20ac short.');
    expect(keepFinding({ facts: [{ kind: 'keep', amount: 100 }], cast, income: 1300 }).sentence).toBe('You wanted 100,00\u00a0\u20ac left; at this pace the month ends with 150,00\u00a0\u20ac.');
    expect(keepFinding({ facts, cast, income: null })).toBeNull();
    expect(intentionFindings({ facts: [], transactions: rows, cast, income: null }).length).toBe(0);
  });
  it('takes what they want kept off the top of the day\'s allowance, and says so', () => {
    const facts = [{ kind: 'income', source: 'Family', amount: 1300 }, { kind: 'keep', amount: 200 }];
    const a = safeToSpend({ cast, segments: [], facts, now: NOW });
    expect(a.budget).toBe(1100);
    expect(a.sentence).toMatch(/keeping 200,00/);
    expect(safeToSpend({ cast, segments: [], facts: facts.slice(0, 1), now: NOW }).budget).toBe(1300);
  });
});
