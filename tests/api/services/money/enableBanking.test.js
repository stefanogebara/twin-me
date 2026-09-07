/**
 * enableBanking.toSighting: a Berlin-Group-shaped feed row becomes a bankfeed sighting.
 */
import { describe, it, expect } from 'vitest';
import { toSighting, isConfigured } from '../../../../api/services/money/feeds/enableBanking.js';

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
  it('is unconfigured without keys', () => {
    const saved = [process.env.ENABLE_BANKING_APP_ID, process.env.ENABLE_BANKING_PRIVATE_KEY];
    delete process.env.ENABLE_BANKING_APP_ID; delete process.env.ENABLE_BANKING_PRIVATE_KEY;
    expect(isConfigured()).toBe(false);
    if (saved[0]) process.env.ENABLE_BANKING_APP_ID = saved[0];
    if (saved[1]) process.env.ENABLE_BANKING_PRIVATE_KEY = saved[1];
  });
});
