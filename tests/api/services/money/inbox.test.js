/**
 * The receipts inbox: the signature is checked the way Svix signs, and a number the email
 * does not contain never reaches the ledger.
 */
import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { verifySvix, gateReceipt, amountsIn, messageText, receiptToSighting, bankAlertSighting, forwardingConfirmation } from '../../../../api/services/money/inbox.js';

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
    const r = gateReceipt({ kind: 'invoice', merchant: 'Fly.io', amount: 18.63, currency: 'USD', date: '2026-09-01', order_ref: 'INV-9', payment_status: 'paid', paid_evidence: 'Paid $18.63' }, 'Fly.io invoice INV-9 total $18.63 on 2026-09-01 Paid $18.63');
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
    const r = gateReceipt({ kind: 'receipt', amount: 5, currency: 'EUR', payment_status: 'paid', paid_evidence: 'Paid 5,00' }, 'total 5,00 Paid 5,00');
    const s = receiptToSighting(r, { emailId: 'e-2', from: 'Cabify <receipts@cabify.com>', subject: 'Trip' });
    expect(s.merchant_raw).toBe('cabify');
  });
});

describe('a bank alert forwarded by email', () => {
  const at = { emailId: 'e9', receivedAt: '2026-09-12T21:04:10.000Z' };
  it('is read by the phone parser, not the model, with the same shape as a phone capture', () => {
    const s = bankAlertSighting({
      from: 'Banco Santander <alertas@santander.es>',
      subject: 'Compra con tarjeta',
      text: 'Compra realizada con tu tarjeta terminada en 4821 por 9,90€ en CABIFY el 12/09/2026 a las 23:02',
    }, at);
    expect(s).toMatchObject({ source: 'email', channel: 'card', direction: 'out', amount: 9.9, merchant_raw: 'CABIFY', card_last4: '4821' });
    expect(s.occurred_at).toBe('2026-09-12T23:02:00.000Z');
    expect(s.source_ref).toMatch(/^email:[0-9a-f]{32}$/);
    expect(s.raw_json.kind).toBe('bank_alert');
    expect(s.parse_confidence).toBeGreaterThanOrEqual(0.85);
  });
  it('takes a bank sender at a lower confidence, and a stranger only at the full shape', () => {
    const bare = { subject: 'Aviso', text: 'Pago de 3,20 € con Apple Pay en METRO MADRID' };
    expect(bankAlertSighting({ ...bare, from: 'alertas@santander.es' }, at)).not.toBeNull();
    expect(bankAlertSighting({ ...bare, from: 'newsletter@shop.example' }, at)).toBeNull();
  });
  it('leaves a receipt with prices but no bank verb to the model', () => {
    expect(bankAlertSighting({ from: 'no-reply@spotify.com', subject: 'Your receipt', text: 'Spotify Premium 11,99 EUR\nTotal 11,99 EUR' }, at)).toBeNull();
  });
});

describe('Santander\'s own alert emails, as received on 2026-09-14', () => {
  const at = { emailId: 'e-santander-1', receivedAt: '2026-09-14T07:13:25.972Z' };
  const footer = '\nGracias por confiar en nosotros.\n?Te ha resultado interesante esta comunicacion?\nhttps://click.emailing.bancosantander-mail.es/?qs=x\nBanco Santander, S.A. Paseo de Pereda 9-12, Santander. Retirada de efectivo en cajero sin comision.';
  it('reads the card payment email: amount with a dot, the card, the shop, nothing from the footer', () => {
    const s = bankAlertSighting({
      from: 'SantanderInforma@emailing.bancosantander-mail.es',
      subject: '!Pago realizado con tu tarjeta!',
      text: 'Santander\nEste email es para ti, Stefano.\n Stefano, \n te confirmamos que has pagado 1.70 EUR con tu tarjeta terminada en 1245 en RENFE CERCANIAS. \n Consulta todos tus detalles y movimientos en tu Banca Online.' + footer,
    }, at);
    expect(s).toMatchObject({ source: 'email', amount: 1.7, direction: 'out', channel: 'card', card_last4: '1245', merchant_raw: 'RENFE CERCANIAS' });
    expect(s.parse_confidence).toBeGreaterThanOrEqual(0.8);
  });
  it('reads the account movement email as an amount with no name: unknown merchant, no channel, no card', () => {
    const s = bankAlertSighting({
      from: 'SantanderInforma@emailing.bancosantander-mail.es',
      subject: 'Ha habido un nuevo movimiento en tu cuenta',
      text: 'Santander\nEste email es para ti, Stefano.\n Stefano, te informamos de que se ha realizado un movimiento de -0.5 EUR en tu cuenta acabada en 7516.\n Para mas informacion, entra en tu App Santander.' + footer,
    }, { emailId: 'e-santander-2', receivedAt: '2026-09-14T07:42:12.846Z' });
    expect(s).toMatchObject({ source: 'email', amount: 0.5, direction: 'out', channel: null, card_last4: null, merchant_raw: null, merchant_key: 'unknown' });
    expect(s.raw_json.kind).toBe('bank_alert');
    expect(s.raw_json.account_last4).toBe('7516');
    const inflow = bankAlertSighting({ from: 'SantanderInforma@emailing.bancosantander-mail.es', subject: 'Ha habido un nuevo movimiento en tu cuenta', text: 'se ha realizado un movimiento de 100 EUR en tu cuenta acabada en 7516.' + footer }, at);
    expect(inflow).toMatchObject({ amount: 100, direction: 'in' });
  });
});


it('keeps future/unpaid/unsupported payment claims out of spending', () => {
  for (const kind of ['renewal','price_change','invoice']) {
    const receipt = gateReceipt({ kind, amount: 10, currency: 'EUR', payment_status: 'paid', paid_evidence: 'You will be charged 10 EUR' }, 'You will be charged 10 EUR');
    expect(receiptToSighting(receipt, { emailId: 'future' })).toBeNull();
  }
  const forged = gateReceipt({ kind: 'receipt', amount: 10, payment_status: 'paid', paid_evidence: 'Paid 10 EUR' }, 'Invoice due 10 EUR');
  expect(receiptToSighting(forged, { emailId: 'unconfirmed' })).toBeNull();
});

describe('the return window rides on the receipt', () => {
  it('is kept in raw_json when the email states one, as a date from the purchase', () => {
    const receipt = { kind: 'receipt', payment_status: 'paid', paid_evidence: 'paid', merchant: 'Zara', amount: 39.95, currency: 'EUR', date: '2026-09-10T10:00:00.000Z', items: [], order_ref: null, plan: null, previous_amount: null, next_charge_at: null, confidence: 0.8 };
    const text = 'Zara. Total paid 39,95 EUR. You can return your items within 30 days.';
    const row = receiptToSighting(receipt, { emailId: 'e1', from: 'noreply@zara.com', subject: 'Your order', receivedAt: '2026-09-10T10:05:00.000Z', text });
    expect(row.raw_json).toMatchObject({ return_until: '2026-10-10', return_days: 30 });
    const bare = receiptToSighting(receipt, { emailId: 'e1', from: 'noreply@zara.com', subject: 'Your order', receivedAt: '2026-09-10T10:05:00.000Z' });
    expect(bare.raw_json.return_until).toBeUndefined();
  });
});

describe('forwardingConfirmation', () => {
  const gmail = {
    from: 'Gmail Team <forwarding-noreply@google.com>',
    subject: '(#382915604) Gmail Forwarding Confirmation - Receive Mail from stefano@gmail.com',
    text: null,
    html: '<p>stefano@gmail.com has requested to automatically forward mail to your email address u-abc@in.twinme.me.</p><p>Confirmation code: 382915604</p><p>To allow it, click <a href="https://mail-settings.google.com/mail/vf-%5BANGjdJ9x%5D-Q7w?x=1">this link</a>.</p>',
  };
  it('reads the code from the subject, the requester, and the link from the HTML the tags would have hidden', () => {
    expect(forwardingConfirmation(gmail)).toEqual({ code: '382915604', requester: 'stefano@gmail.com', link: 'https://mail-settings.google.com/mail/vf-%5BANGjdJ9x%5D-Q7w?x=1' });
  });
  it('reads a plain-text body too', () => {
    const plain = forwardingConfirmation({ ...gmail, html: null, text: 'Confirmation code: 382915604\nhttps://mail-settings.google.com/mail/vf-abc' });
    expect(plain.link).toBe('https://mail-settings.google.com/mail/vf-abc');
  });
  it('trusts only Google\'s own sender', () => {
    expect(forwardingConfirmation({ ...gmail, from: 'forwarding-noreply@google.com.evil.example' })).toBeNull();
    expect(forwardingConfirmation({ ...gmail, from: 'alertas@santander.es' })).toBeNull();
  });
  it('is not a receipt and not a bank alert', () => {
    expect(bankAlertSighting(gmail, { emailId: 'e1', receivedAt: '2026-09-23T10:00:00Z' })).toBeNull();
  });
});
