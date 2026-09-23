/**
 * The ledger's money, said once.
 *
 * It was assumed in forty-one places, so a friend studying in the United States would link a
 * bank and then be told that spending guidance is available for euro accounts only. The
 * assumption is not wrong today; it was simply never written down anywhere it could be
 * changed (2026-09-19).
 */
import { describe, expect, it } from 'vitest';
import { ledgerCurrency, currencyWord, money, ours, LEDGER_CCY } from '../../../../api/services/money/currency.js';
import { withPerson, currentPerson } from '../../../../api/services/money/scope.js';
import { dayIn, currentZone } from '../../../../api/services/money/zone.js';

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

describe("the person's money", () => {
  it('is read from the scope an entry point set, and the deployment\'s stands outside it', async () => {
    expect(ledgerCurrency()).toBe('EUR');
    expect(currentPerson()).toBeNull();
    const inside = await withPerson({ currency: 'USD', timezone: 'America/New_York' }, async () => {
      await new Promise((r) => setTimeout(r, 2));
      return { ccy: ledgerCurrency(), ours: [ours('USD'), ours('EUR'), ours(null)], text: money(1234.56), tz: currentZone(), day: dayIn('2026-09-23T23:30:00Z') };
    });
    expect(inside).toEqual({ ccy: 'USD', ours: [true, false, true], text: '$1,234.56', tz: 'America/New_York', day: '2026-09-23' });
    expect(ledgerCurrency()).toBe('EUR');
    expect(ours('USD')).toBe(false);
    expect(plain(money(1234.56))).toBe('1234,56 €');
    expect(withPerson({ currency: 'xx' }, () => ledgerCurrency())).toBe('EUR');
  });
  it('has a word for the money in each language', () => {
    expect(currencyWord('en')).toBe('euros');
    expect(currencyWord('es', 'USD')).toBe('d\u00f3lares');
    expect(currencyWord('pt-BR', 'BRL')).toBe('reais');
    expect(currencyWord('en', 'PLN')).toBe('PLN');
  });
});
