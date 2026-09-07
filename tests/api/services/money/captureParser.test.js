/**
 * captureParser: a Santander España or Bizum push notification becomes a sighting.
 */
import { describe, it, expect } from 'vitest';
import { parseCapture, parseEuroAmount, merchantKey } from '../../../../api/services/money/captureParser.js';

describe('parseEuroAmount reads Spanish and machine formats', () => {
  it.each([
    ['12,50', 12.5], ['1.234,56', 1234.56], ['8', 8], ['3,2', 3.2], ['1234.56', 1234.56], ['850,00', 850],
  ])('%s → %s', (s, n) => { expect(parseEuroAmount(s)).toBe(n); });
  it('rejects junk', () => { expect(parseEuroAmount('abc')).toBeNull(); expect(parseEuroAmount('')).toBeNull(); });
});

describe('merchantKey is stable across store numbers, cities and casing', () => {
  it('normalises', () => {
    expect(merchantKey('MERCADONA 1234 MADRID')).toBe('mercadona madrid');
    expect(merchantKey('Mercadona, S.A.')).toBe('mercadona');
    expect(merchantKey('CAFETERÍA UNIVERSIDAD')).toBe('cafeteria universidad');
    expect(merchantKey(null)).toBe('unknown');
  });
});

describe('parseCapture: Santander España card notifications', () => {
  it('reads a card purchase with merchant, card and date', () => {
    const s = parseCapture('Compra realizada con tu tarjeta terminada en 1234 por 12,50€ en MERCADONA el 07/09/2026', { receivedAt: '2026-09-07T19:41:00Z' });
    expect(s).toMatchObject({ source: 'phone', amount: 12.5, currency: 'EUR', direction: 'out', channel: 'card', merchant_raw: 'MERCADONA', merchant_key: 'mercadona', card_last4: '1234' });
    expect(s.occurred_at.slice(0, 10)).toBe('2026-09-07');
    expect(s.parse_confidence).toBeGreaterThanOrEqual(0.85);
  });
  it('reads the EUR spelling and a masked card', () => {
    const s = parseCapture('Pago con tarjeta *5678 de 8,40 EUR en CAFETERIA UNIVERSIDAD');
    expect(s).toMatchObject({ amount: 8.4, direction: 'out', channel: 'card', merchant_key: 'cafeteria universidad', card_last4: '5678' });
  });
  it('reads Apple Pay', () => {
    const s = parseCapture('Pago de 3,20 € con Apple Pay en METRO MADRID');
    expect(s).toMatchObject({ amount: 3.2, direction: 'out', channel: 'card', merchant_key: 'metro madrid' });
  });
});

describe('parseCapture: Bizum and inflows', () => {
  it('a Bizum sent is an outflow on the bizum channel', () => {
    const s = parseCapture('Has enviado un Bizum de 20,00€ a Juan Pérez');
    expect(s).toMatchObject({ source: 'bizum', channel: 'bizum', amount: 20, direction: 'out', merchant_raw: 'Juan Pérez', merchant_key: 'juan perez' });
  });
  it('a Bizum received is an inflow', () => {
    const s = parseCapture('Has recibido un Bizum de 15,00€ de Ana López');
    expect(s).toMatchObject({ channel: 'bizum', amount: 15, direction: 'in', merchant_key: 'ana lopez' });
  });
  it('a salary is an inflow on transfer', () => {
    const s = parseCapture('Ingreso de 850,00€ en tu cuenta: Nómina');
    expect(s).toMatchObject({ amount: 850, direction: 'in', channel: 'transfer' });
  });
});

describe('parseCapture: the floor and the ceiling', () => {
  it('keeps a bare amount as a low-confidence sighting so nothing is lost', () => {
    const s = parseCapture('Movimiento de 45,00 € en tu cuenta');
    expect(s.amount).toBe(45);
    expect(s.parse_confidence).toBeLessThan(0.85);
  });
  it('returns null with no amount', () => {
    expect(parseCapture('Tu tarjeta ha sido activada')).toBeNull();
    expect(parseCapture('')).toBeNull();
    expect(parseCapture(null)).toBeNull();
  });
});

describe('parseStructured: the iOS Shortcut Transaction automation', () => {
  it('reads merchant, amount with the euro sign, card and date', async () => {
    const { parseStructured } = await import('../../../../api/services/money/captureParser.js');
    const s = parseStructured({ merchant: 'MERCADONA', amount: '12,50 €', card: 'Santander Débito ···· 1234', date: '2026-09-07T19:41:00Z' });
    expect(s).toMatchObject({ source: 'phone', amount: 12.5, currency: 'EUR', direction: 'out', channel: 'card', merchant_key: 'mercadona', card_last4: '1234', occurred_at: '2026-09-07T19:41:00.000Z', parse_confidence: 0.9 });
  });
  it('accepts a bare number and rejects nothing', async () => {
    const { parseStructured } = await import('../../../../api/services/money/captureParser.js');
    expect(parseStructured({ amount: 3.2 })?.amount).toBe(3.2);
    expect(parseStructured({ amount: 'free' })).toBeNull();
    expect(parseStructured({})).toBeNull();
  });
});
