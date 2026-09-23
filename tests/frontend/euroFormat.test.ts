import { describe, it, expect, afterEach } from 'vitest';
import { euro, ownCurrency, setLedgerCurrency, ledgerCurrency } from '../../src/services/api/moneyAPI';

const plain = (x: string) => x.replace(/[\u00a0\u202f]/g, ' ');

describe("the page's own currency", () => {
  afterEach(() => setLedgerCurrency('EUR'));
  it('is the euro until the page has heard, then the person\'s, and every figure and filter follows', () => {
    expect(ledgerCurrency()).toBe('EUR');
    expect(plain(euro(1234.5))).toBe('1234,50 €');
    expect(ownCurrency(null)).toBe(true);
    expect(ownCurrency('USD')).toBe(false);
    setLedgerCurrency('brl');
    expect(ledgerCurrency()).toBe('BRL');
    expect(plain(euro(1234.5))).toBe('R$ 1.234,50');
    expect(ownCurrency('BRL')).toBe(true);
    expect(ownCurrency('EUR')).toBe(false);
    expect(plain(euro(12, 'EUR'))).toBe('12,00 €');
    setLedgerCurrency('nonsense');
    expect(ledgerCurrency()).toBe('BRL');
  });
});
