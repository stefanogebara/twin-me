/**
 * The ledger's money, said once.
 *
 * It was assumed in forty-one places, so a friend studying in the United States would link a
 * bank and then be told that spending guidance is available for euro accounts only. The
 * assumption is not wrong today; it was simply never written down anywhere it could be
 * changed (2026-09-19).
 */
import { describe, expect, it } from 'vitest';
import { money, ours, LEDGER_CCY } from '../../../../api/services/money/currency.js';

/* Intl puts a narrow no-break space before the euro sign; these read the words. */
const plain = (s) => String(s).replace(/[  ]/g, ' ');

describe("the ledger's money", () => {
  it('is the euro until something says otherwise', () => {
    expect(LEDGER_CCY).toBe('EUR');
    expect(plain(money(1234.56))).toBe('1234,56 €');
  });
  it('writes a figure the way the country that spends it does', () => {
    expect(money(1234.56, { currency: 'USD' })).toBe('$1,234.56');
    expect(plain(money(1234.56, { currency: 'GBP' }))).toBe('£1,234.56');
    expect(plain(money(1234.56, { currency: 'BRL' }))).toBe('R$ 1.234,56');
  });
  it('rounds where a reading asks it to', () => {
    expect(plain(money(1234.567, { maximumFractionDigits: 0 }))).toBe('1235 €');
  });
  it('counts a row with no currency as its own, because it was written before there was one', () => {
    expect(ours(null)).toBe(true);
    expect(ours('EUR')).toBe(true);
    expect(ours('eur')).toBe(true);
    expect(ours('USD')).toBe(false);
  });
});
