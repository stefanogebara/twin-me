/**
 * captureParser: a Santander España or Bizum push notification becomes a sighting.
 */
import { describe, it, expect } from 'vitest';
import { parseCapture, parseEuroAmount, merchantKey, captureFromBody } from '../../../../api/services/money/captureParser.js';

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

/**
 * The phone is a Samsung, not an iPhone, so the capture is the bank's own notification text
 * rather than Apple's structured fields. These are the wordings Santander sends.
 */
describe('parseCapture reads an Android notification', () => {
  const cases = [
    ['Santander: Compra de 4,20 EUR en CAFETERIA UNIVERSIDAD con tarjeta *1234', 4.2, 'out', 'card', 'CAFETERIA UNIVERSIDAD'],
    ['Has realizado una compra de 23,45\u20ac en MERCADONA con tu tarjeta terminada en 1245', 23.45, 'out', 'card', 'MERCADONA'],
    ['Pago de 12,50 EUR en SIMPLY ALCALA el 08/09/2026', 12.5, 'out', 'card', 'SIMPLY ALCALA'],
    ['Bizum enviado de 15,00\u20ac a Juan Perez', 15, 'out', 'bizum', 'Juan Perez'],
    ['Bizum recibido de 20,00\u20ac de Ana Lopez', 20, 'in', 'bizum', 'Ana Lopez'],
    ['Se ha realizado un cargo de 11,99 EUR de SPOTIFY', 11.99, 'out', 'card', 'SPOTIFY'],
  ];
  for (const [text, amount, direction, channel, merchant] of cases) {
    it(`reads "${text.slice(0, 42)}"`, () => {
      expect(parseCapture(text)).toMatchObject({ amount, direction, channel, merchant_raw: merchant });
    });
  }

  it('keeps a shop whose name begins with an article', () => {
    /* The guard that drops "tu tarjeta" was case-insensitive and dropped EL CORTE INGLES
       with it. Spanish notifications write articles in lower case and shops in capitals. */
    expect(parseCapture('Compra en EL CORTE INGLES por 116,76 EUR')).toMatchObject({
      amount: 116.76, merchant_raw: 'EL CORTE INGLES',
    });
    expect(parseCapture('Compra de 9,00 EUR con tu tarjeta terminada en 1245').merchant_raw).toBe(null);
  });

  it('reads an amount even where no merchant is named, rather than dropping the payment', () => {
    expect(parseCapture('Retirada de efectivo de 50,00 EUR en cajero')).toMatchObject({ amount: 50, channel: 'cash' });
  });
});

/* 2026-09-16: the iPhone path is a Wallet automation that sends the transaction's merchant,
   amount and card; the Android path sends the notification text. */
describe('captureFromBody', () => {
  it('reads a Wallet automation by its fields, amount in either decimal style, card by its last four', () => {
    const a = captureFromBody({ receivedAt: '2026-09-16T10:00:00Z', merchant: 'Mercadona', amount: '12,50 \u20ac', card: 'Santander Visa \u2022\u20221234', date: '2026-09-16T10:02:00+02:00', text: 'Mercadona' });
    expect(a.parsed).toMatchObject({ amount: 12.5, merchant_key: 'mercadona', card_last4: '1234', direction: 'out' });
    expect(a.refSeed).toContain('2026-09-16T10:02');
    expect(captureFromBody({ receivedAt: '2026-09-16T10:00:00Z', merchant: 'Cafe', amount: '\u20ac3.20' }).parsed.amount).toBe(3.2);
  });
  it('falls back to the text when the fields came through empty', () => {
    const a = captureFromBody({ receivedAt: '2026-09-16T10:00:00Z', merchant: '', amount: '', text: 'Pago de 3,20 \u20ac con Apple Pay en METRO MADRID' });
    expect(a.parsed).toMatchObject({ amount: 3.2 });
    expect(a.refSeed).toContain('2026-09-16T10:00:00Z');
  });
  it('reads the Android listener by its text, as before', () => {
    const a = captureFromBody({ receivedAt: '2026-09-16T10:00:00Z', text: 'Compra realizada con tu tarjeta terminada en 1234 por 12,50\u20ac en MERCADONA el 07/09/2026' });
    expect(a.parsed).toMatchObject({ amount: 12.5, card_last4: '1234' });
  });
  it('says what is wrong otherwise', () => {
    expect(captureFromBody({ receivedAt: '2026-09-16T10:00:00Z',})).toMatchObject({ status: 400 });
    expect(captureFromBody({ receivedAt: '2026-09-16T10:00:00Z', text: 'Tu tarjeta ha sido activada' })).toMatchObject({ status: 422 });
    expect(captureFromBody({ receivedAt: '2026-09-16T10:00:00Z', text: 'x'.repeat(2001) })).toMatchObject({ status: 400 });
  });
});

/* A tester ran the iPhone shortcut by hand to check it, before tapping any card, and got a
   complaint about what it had not sent. An empty run from the shortcut is a setup check. */
describe('a shortcut run by hand, with nothing to send', () => {
  it('is a setup check, not an error', () => {
    expect(captureFromBody({ receivedAt: '2026-09-16T10:00:00Z', source: 'shortcut', merchant: '', amount: '', card: '', text: '' })).toEqual({ ready: true });
  });
  it('still complains when the sender is not the shortcut', () => {
    expect(captureFromBody({ receivedAt: '2026-09-16T10:00:00Z', merchant: '', amount: '' })).toMatchObject({ status: 400 });
    expect(captureFromBody({ receivedAt: '2026-09-16T10:00:00Z',})).toMatchObject({ status: 400 });
  });
  it('reads a real payment from the shortcut as before', () => {
    expect(captureFromBody({ receivedAt: '2026-09-16T10:00:00Z', source: 'shortcut', merchant: 'Mercadona', amount: '12,50 €' }).parsed).toMatchObject({ amount: 12.5 });
  });
});


describe('capture identity', () => {
  const text = 'Pago de 3,20 EUR con Apple Pay en METRO MADRID';
  it('keeps retries stable and identical payments at different times distinct', () => {
    const event = { text, receivedAt: '2026-09-16T10:00:00Z', eventId: 'notification-1' };
    expect(captureFromBody(event).refSeed).toBe(captureFromBody(event).refSeed);
    expect(captureFromBody({ ...event, eventId: 'notification-2' }).refSeed).not.toBe(captureFromBody(event).refSeed);
    expect(captureFromBody({ text, receivedAt: '2026-09-16T11:00:00Z' }).refSeed).not.toBe(captureFromBody({ text, receivedAt: event.receivedAt }).refSeed);
  });
  it('refuses ambiguous identity and invalid timestamps instead of collapsing payments', () => {
    expect(captureFromBody({ text }).status).toBe(400);
    expect(captureFromBody({ text, receivedAt: 'bad-date' }).status).toBe(400);
  });
});
