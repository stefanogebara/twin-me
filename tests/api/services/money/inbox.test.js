/**
 * The receipts inbox: the signature is checked the way Svix signs, and a number the email
 * does not contain never reaches the ledger.
 */
import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { verifySvix, gateReceipt, amountsIn, messageText, receiptToSighting } from '../../../../api/services/money/inbox.js';

describe('verifySvix', () => {
  const secret = `whsec_${Buffer.from('a-test-secret-of-some-length-xx').toString('base64')}`;
  const sign = (id, ts, body) => {
    const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
    return `v1,${crypto.createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64')}`;
  };
  const body = '{"type":"email.received","data":{"email_id":"e1"}}';
  const now = 1_800_000_000;

  it('accepts a fresh, correctly signed body', () => {
    const headers = { 'svix-id': 'msg_1', 'svix-timestamp': String(now - 10), 'svix-signature': sign('msg_1', now - 10, body) };
    expect(verifySvix({ rawBody: body, headers, secret, now })).toBe(true);
  });
  it('accepts when one of several signatures matches', () => {
    const headers = { 'svix-id': 'msg_1', 'svix-timestamp': String(now), 'svix-signature': `v1,AAAA ${sign('msg_1', now, body)}` };
    expect(verifySvix({ rawBody: body, headers, secret, now })).toBe(true);
  });
  it('refuses a changed body, a wrong secret, and an old timestamp', () => {
    const headers = { 'svix-id': 'msg_1', 'svix-timestamp': String(now), 'svix-signature': sign('msg_1', now, body) };
    expect(verifySvix({ rawBody: body + ' ', headers, secret, now })).toBe(false);
    expect(verifySvix({ rawBody: body, headers, secret: `whsec_${Buffer.from('another-secret-entirely').toString('base64')}`, now })).toBe(false);
    expect(verifySvix({ rawBody: body, headers, secret, now: now + 3600 })).toBe(false);
    expect(verifySvix({ rawBody: body, headers: {}, secret, now })).toBe(false);
  });
});

describe('the reading, held to the email', () => {
  const text = 'Your Spotify Premium receipt\nSpotify Premium Individual 11,99 EUR\nTotal 11,99 EUR\nNext billing date 4 Oct 2026\nOrder 8834-22';
  it('finds every number the email contains, in either decimal style', () => {
    const found = amountsIn('Total 1.234,56 EUR and 9.90 and 12');
    expect(found.has(1234.56)).toBe(true);
    expect(found.has(9.9)).toBe(true);
    expect(found.has(12)).toBe(true);
  });
  it('keeps a receipt whose amount is in the email', () => {
    const r = gateReceipt({ kind: 'renewal', merchant: 'Spotify', amount: 11.99, currency: 'EUR', date: '2026-09-04', items: [{ label: 'Premium Individual', amount: 11.99 }], next_charge_at: '2026-10-04', confidence: 0.9 }, text);
    expect(r).toMatchObject({ kind: 'renewal', merchant: 'Spotify', amount: 11.99, currency: 'EUR' });
    expect(r.items).toHaveLength(1);
    expect(r.next_charge_at).toContain('2026-10-04');
  });
  it('throws away an amount the email never says, and a kind it does not know', () => {
    expect(gateReceipt({ kind: 'receipt', merchant: 'Spotify', amount: 12.99, currency: 'EUR' }, text)).toBe(null);
    expect(gateReceipt({ kind: 'newsletter', merchant: 'Spotify', amount: 11.99 }, text)).toBe(null);
    expect(gateReceipt({ kind: 'none' }, text)).toBe(null);
    expect(gateReceipt(null, text)).toBe(null);
  });
  it('drops an invented line item and keeps the real ones', () => {
    const r = gateReceipt({ kind: 'receipt', merchant: 'Spotify', amount: 11.99, items: [{ label: 'Premium', amount: 11.99 }, { label: 'Made up', amount: 3.5 }] }, text);
    expect(r.items.map((i) => i.label)).toEqual(['Premium']);
  });
  it('reads html when there is no text part', () => {
    const t = messageText({ subject: 'Invoice', html: '<div><p>Total <b>24,50</b>&nbsp;&euro;</p><style>p{}</style></div>' });
    expect(t).toContain('Invoice');
    expect(t).toContain('Total 24,50 EUR');
    expect(t).not.toContain('<b>');
  });
});

describe('receiptToSighting', () => {
  it('is the ledger\'s own shape, keyed so the same email is never read twice', () => {
    const r = gateReceipt({ kind: 'invoice', merchant: 'Fly.io', amount: 18.63, currency: 'USD', date: '2026-09-01', order_ref: 'INV-9' }, 'Fly.io invoice INV-9 total $18.63 on 2026-09-01');
    const s = receiptToSighting(r, { emailId: 'e-1', from: 'billing@fly.io', subject: 'Your Fly.io invoice', receivedAt: '2026-09-02T00:00:00Z' });
    expect(s.source).toBe('email');
    expect(s.source_ref).toMatch(/^email:[0-9a-f]{32}$/);
    expect(s.amount).toBe(18.63);
    expect(s.direction).toBe('out');
    expect(s.merchant_key).toBeTruthy();
    expect(s.occurred_at).toContain('2026-09-01');
    expect(s.raw_json.order_ref).toBe('INV-9');
    const again = receiptToSighting(r, { emailId: 'e-1', from: 'billing@fly.io', subject: 'x' });
    expect(again.source_ref).toBe(s.source_ref);
  });
  it('falls back to the sender domain when the reading names no shop', () => {
    const r = gateReceipt({ kind: 'receipt', amount: 5, currency: 'EUR' }, 'total 5,00');
    const s = receiptToSighting(r, { emailId: 'e-2', from: 'Cabify <receipts@cabify.com>', subject: 'Trip' });
    expect(s.merchant_raw).toBe('cabify');
  });
});
