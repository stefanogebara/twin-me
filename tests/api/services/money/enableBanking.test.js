/**
 * enableBanking.toSighting: a Berlin-Group-shaped feed row becomes a bankfeed sighting.
 */
import { describe, it, expect } from 'vitest';
import { toSighting, isConfigured, startAuthorisation } from '../../../../api/services/money/feeds/enableBanking.js';

describe('toSighting', () => {
  it('maps a debit with a creditor name', () => {
    const s = toSighting({ entry_reference: 'E1', transaction_amount: { amount: '12.50', currency: 'EUR' }, credit_debit_indicator: 'DBIT', booking_date: '2026-09-08', value_date: '2026-09-07', creditor: { name: 'MERCADONA MADRID' }, remittance_information: ['COMPRA TARJETA 1234'] }, 'acc-1');
    expect(s).toMatchObject({ source: 'bankfeed', source_ref: 'E1', account_id: 'acc-1', amount: 12.5, currency: 'EUR', direction: 'out', merchant_key: 'mercadona madrid', channel: 'card', parse_confidence: 1 });
    expect(s.occurred_at.slice(0, 10)).toBe('2026-09-07');
  });
  it('maps a credit with a debtor name as an inflow on transfer, and Bizum by remittance', () => {
    const a = toSighting({ transaction_id: 'T2', transaction_amount: { amount: '850.00', currency: 'EUR' }, credit_debit_indicator: 'CRDT', booking_date: '2026-09-01', debtor: { name: 'UNIVERSIDAD' }, remittance_information: ['NOMINA'] }, null);
    expect(a).toMatchObject({ direction: 'in', amount: 850, channel: 'transfer', merchant_key: 'universidad' });
    const b = toSighting({ transaction_amount: { amount: '20', currency: 'EUR' }, credit_debit_indicator: 'DBIT', booking_date: '2026-09-02', remittance_information: ['BIZUM A JUAN'] }, null);
    expect(b.channel).toBe('bizum');
    expect(b.source_ref).toContain('2026-09-02|20|BIZUM A JUAN');
  });
  it('reads a Santander row, which names nobody and writes a sentence instead', () => {
    const s = toSighting({
      entry_reference: 'S9',
      transaction_amount: { amount: '116.76', currency: 'EUR' },
      credit_debit_indicator: 'DBIT',
      booking_date: '2026-09-08',
      value_date: '2026-09-07',
      remittance_information: ['PAGO MOVIL EN EL CORTE INGLES, MADRID ES, TARJ. :*741245'],
    }, 'acc-1');
    expect(s).toMatchObject({
      merchant_raw: 'El Corte Ingles',
      merchant_key: 'el corte ingles',
      channel: 'card',
      card_last4: '1245',
      raw_text: 'PAGO MOVIL EN EL CORTE INGLES, MADRID ES, TARJ. :*741245',
    });
  });

  it('is unconfigured without keys', () => {
    const saved = [process.env.ENABLE_BANKING_APP_ID, process.env.ENABLE_BANKING_PRIVATE_KEY];
    delete process.env.ENABLE_BANKING_APP_ID; delete process.env.ENABLE_BANKING_PRIVATE_KEY;
    expect(isConfigured()).toBe(false);
    if (saved[0]) process.env.ENABLE_BANKING_APP_ID = saved[0];
    if (saved[1]) process.env.ENABLE_BANKING_PRIVATE_KEY = saved[1];
  });
});

/* Enable Banking rejects any ASPSP name it does not list: 'Santander' answers 422
   WRONG_ASPSP_PROVIDED, the listed name is 'Banco Santander'. Verified against the
   production API on 2026-09-08. */
describe('startAuthorisation', () => {
  it('asks the bank by its listed name, Banco Santander, by default', async () => {
    const saved = { fetch: global.fetch, id: process.env.ENABLE_BANKING_APP_ID, key: process.env.ENABLE_BANKING_PRIVATE_KEY, redirect: process.env.ENABLE_BANKING_REDIRECT_URL };
    const { generateKeyPairSync } = await import('node:crypto');
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
    process.env.ENABLE_BANKING_APP_ID = 'test-app';
    process.env.ENABLE_BANKING_PRIVATE_KEY = privateKey;
    process.env.ENABLE_BANKING_REDIRECT_URL = 'https://www.twinme.me/api/money/bank/callback';
    let sent = null;
    global.fetch = async (url, init) => { sent = { url: String(url), body: JSON.parse(init.body) }; return { ok: true, status: 200, text: async () => JSON.stringify({ url: 'https://tilisy.enablebanking.com/ais/start?sessionid=x', authorization_id: 'a1' }) }; };
    try {
      const r = await startAuthorisation({ state: 's1' });
      expect(sent.body.aspsp).toEqual({ name: 'Banco Santander', country: 'ES' });
      expect(sent.body.psu_type).toBe('personal');
      expect(sent.body.redirect_url).toBe('https://www.twinme.me/api/money/bank/callback');
      expect(r.url).toContain('tilisy.enablebanking.com');
    } finally {
      global.fetch = saved.fetch;
      if (saved.id) process.env.ENABLE_BANKING_APP_ID = saved.id; else delete process.env.ENABLE_BANKING_APP_ID;
      if (saved.key) process.env.ENABLE_BANKING_PRIVATE_KEY = saved.key; else delete process.env.ENABLE_BANKING_PRIVATE_KEY;
      if (saved.redirect) process.env.ENABLE_BANKING_REDIRECT_URL = saved.redirect; else delete process.env.ENABLE_BANKING_REDIRECT_URL;
    }
  });
});
