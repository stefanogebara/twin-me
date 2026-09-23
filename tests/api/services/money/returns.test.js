/** The return window a receipt states, as a date; the ones closing this week as a line. */
import { describe, expect, it } from 'vitest';
import { returnWindow, returnsClosing } from '../../../../api/_app/services/money/returns.js';

const bought = '2026-09-10T10:00:00Z';

describe('returnWindow', () => {
  it('reads a count of days from the purchase, in three languages', () => {
    expect(returnWindow('Thanks for your order. You can return items within 30 days of delivery.', bought)).toMatchObject({ until: '2026-10-10', days: 30 });
    expect(returnWindow('Plazo de devolucion: 14 dias desde la compra.', bought)).toMatchObject({ until: '2026-09-24', days: 14 });
    expect(returnWindow('Trocas e devolucoes em ate 30 dias.', bought)).toMatchObject({ until: '2026-10-10', days: 30 });
    expect(returnWindow('Tienes 60 dias para devolverlo.', bought)).toMatchObject({ until: '2026-11-09', days: 60 });
  });
  it('reads a date, this year or the next', () => {
    expect(returnWindow('Devoluciones hasta el 15 de octubre.', bought)).toMatchObject({ until: '2026-10-15', days: 35 });
    expect(returnWindow('Returns accepted until October 15.', bought)).toMatchObject({ until: '2026-10-15' });
    expect(returnWindow('Puedes devolverlo hasta el 15/10/2026.', bought)).toMatchObject({ until: '2026-10-15' });
    expect(returnWindow('Devolucoes ate 5 de janeiro.', '2026-12-20T10:00:00Z')).toMatchObject({ until: '2027-01-05', days: 16 });
  });
  it('reads nothing from a receipt that states no window, a number that is an amount, or a window too long to be one', () => {
    expect(returnWindow('Total charged: 30,00 EUR. Order 12345.', bought)).toBeNull();
    expect(returnWindow('Garantia de 2 anos. Total 30 EUR.', bought)).toBeNull();
    expect(returnWindow('Return within 365 days.', bought)).toBeNull();
    expect(returnWindow('', bought)).toBeNull();
  });
});

describe('returnsClosing', () => {
  const now = new Date('2026-09-21T10:00:00Z');
  const s = (merchant, amount, until, extra = {}) => ({ merchant_raw: merchant, amount: -amount, raw_json: until ? { return_until: until } : {}, transaction_id: 't-' + merchant, ...extra });
  it('lists the windows closing within a week, soonest first, and drops the shut and the far', () => {
    const rows = [s('Zara', 39.95, '2026-09-24'), s('Amazon', 120, '2026-09-21'), s('Fnac', 60, '2026-10-20'), s('Mango', 25, '2026-09-19'), s('Lidl', 3, null)];
    expect(returnsClosing(rows, now)).toEqual([
      { merchant: 'Amazon', amount: 120, until: '2026-09-21', days_left: 0, transaction_id: 't-Amazon' },
      { merchant: 'Zara', amount: 39.95, until: '2026-09-24', days_left: 3, transaction_id: 't-Zara' },
    ]);
    expect(returnsClosing(rows, now, { within: 30 })).toHaveLength(3);
    expect(returnsClosing([], now)).toEqual([]);
  });
});
