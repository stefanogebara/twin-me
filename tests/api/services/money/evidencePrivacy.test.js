import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('../../../../api/_app/services/database.js', () => ({ supabaseAdmin: db, serverDb: {} }));
vi.mock('../../../../api/_app/services/logger.js', () => ({ createLogger: () => ({ warn() {}, info() {}, error() {}, debug() {} }) }));
const { sightingsFor } = await import('../../../../api/_app/services/money/store.js');

// Synthetic numbers only: these are fixture identifiers, never a person's card.
function fixture(raw_text) {
  return Object.freeze({ id: 'sighting-1', source: 'bank', raw_text, amount: -12.5, currency: 'EUR', occurred_at: '2026-09-24T12:00:00Z', parse_confidence: 1 });
}

let query;
function returning(rows) {
  query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockResolvedValue({ data: rows, error: null }) };
  db.from.mockReturnValue(query);
}
beforeEach(() => { vi.clearAllMocks(); });

describe('payment evidence presentation', () => {
  it.each([
    ['COMPRA Cafe, TARJETA 4111111111111111, COMISION 0,00', 'COMPRA Cafe, TARJETA ****1111, COMISION 0,00'],
    ['PAGO MOVIL Cafe, TARJ. :*554444', 'PAGO MOVIL Cafe, TARJ. :****4444'],
    ['Card number: 4111 1111 1111 1111', 'Card number: ****1111'],
    ['debit card # 4111-1111-1111-1111', 'debit card # ****1111'],
    ['credit card 3782 822463 10005', 'credit card ****0005'],
    ['Cartão: 4111111111111111', 'Cartão: ****1111'],
    ['TARJETA 1234567890123456789', 'TARJETA ****6789'],
    ['TARJETA 4111 **** **** 1111', 'TARJETA ****1111'],
    ['TARJETA 4111111111111111; CARD 5555555555554444', 'TARJETA ****1111; CARD ****4444'],
    ['24/09/2026 Cafe 12,50 EUR TARJETA 4111111111111111 REF 9988776655443322', '24/09/2026 Cafe 12,50 EUR TARJETA ****1111 REF 9988776655443322'],
  ])('masks only the card identifier in %s', async (raw, expected) => {
    const original = fixture(raw);
    returning(Object.freeze([original]));
    const result = await sightingsFor('owner', 'payment');
    expect(result).toEqual([{ ...original, raw_text: expected }]);
    expect(original.raw_text).toBe(raw);
    expect(result[0]).not.toBe(original);
    expect(db.from).toHaveBeenCalledExactlyOnceWith('money_sightings');
    expect(query.eq.mock.calls).toEqual([['user_id', 'owner'], ['transaction_id', 'payment']]);
  });

  it.each([
    null,
    '',
    'TARJETA ****1111',
    'card ending in 1111',
    'Card 1111',
    'Cafe 24/09/2026 12,50 EUR REF 4111111111111111',
    'LIQUIDACION DEL CONTRATO 0018909 300',
    'Gift card 25 EUR on 24/09/2026',
    'Postcard 4111111111111111',
  ])('preserves non-card content and already hidden cards: %s', async (raw) => {
    returning([fixture(raw)]);
    expect((await sightingsFor('owner', 'payment'))[0].raw_text).toBe(raw);
  });

  it('returns no evidence when the scoped query finds none', async () => {
    returning([]);
    expect(await sightingsFor('owner', 'missing-payment')).toEqual([]);
  });

  it('rejects a failed database read instead of calling it empty evidence', async () => {
    returning([]);
    query.order.mockResolvedValue({ data: null, error: { message: 'database unavailable' } });
    await expect(sightingsFor('owner', 'payment')).rejects.toThrow('Could not read payment evidence');
  });

  it('does not progressively change evidence shown more than once', async () => {
    returning([fixture('TARJ. :*554444')]);
    const once = await sightingsFor('owner', 'payment');
    returning(once);
    expect(await sightingsFor('owner', 'payment')).toEqual(once);
  });
});
