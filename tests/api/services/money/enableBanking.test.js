/**
 * enableBanking.toSighting: a Berlin-Group-shaped feed row becomes a bankfeed sighting.
 */
import { describe, it, expect } from 'vitest';
import { toSighting, isConfigured, startAuthorisation, fetchTransactions, resetApplicationEnvironment, distinctPending, sessionShape, applicationInfo } from '../../../../api/services/money/feeds/enableBanking.js';

describe('toSighting', () => {
  it('maps a debit with a creditor name', () => {
    const s = toSighting({ entry_reference: 'E1', transaction_amount: { amount: '12.50', currency: 'EUR' }, credit_debit_indicator: 'DBIT', booking_date: '2026-09-08', value_date: '2026-09-07', creditor: { name: 'MERCADONA MADRID' }, remittance_information: ['COMPRA TARJETA 1234'] }, 'acc-1');
    expect(s).toMatchObject({ source: 'bankfeed', source_ref: 'bank:acc-1:E1', account_id: 'acc-1', amount: 12.5, currency: 'EUR', direction: 'out', merchant_key: 'mercadona madrid', channel: 'card', parse_confidence: 1 });
    expect(s.occurred_at.slice(0, 10)).toBe('2026-09-07');
  });
  it('maps a credit with a debtor name as an inflow on transfer, and Bizum by remittance', () => {
    const a = toSighting({ transaction_id: 'T2', transaction_amount: { amount: '850.00', currency: 'EUR' }, credit_debit_indicator: 'CRDT', booking_date: '2026-09-01', debtor: { name: 'UNIVERSIDAD' }, remittance_information: ['NOMINA'] }, null);
    expect(a).toMatchObject({ direction: 'in', amount: 850, channel: 'transfer', merchant_key: 'universidad' });
    const b = toSighting({ transaction_amount: { amount: '20', currency: 'EUR' }, credit_debit_indicator: 'DBIT', booking_date: '2026-09-02', remittance_information: ['BIZUM A JUAN'] }, null);
    expect(b.channel).toBe('bizum');
    expect(b.source_ref).toMatch(/^bank:fallback:[a-f0-9]{32}$/);
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


/* A session belongs to the application that created it. The sandbox application answers
   SESSION_DOES_NOT_EXIST for every production session, which is the same words a genuinely
   ended session gets, and on 2026-09-11 a dev machine on the sandbox key recorded a healthy
   Santander connection as expired in the shared database. Only production may say "ended". */
describe('fetchTransactions on a session the application cannot see', () => {
  const withApp = async (environment, run) => {
    const saved = { fetch: global.fetch, id: process.env.ENABLE_BANKING_APP_ID, key: process.env.ENABLE_BANKING_PRIVATE_KEY };
    const { generateKeyPairSync } = await import('node:crypto');
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
    process.env.ENABLE_BANKING_APP_ID = 'test-app';
    process.env.ENABLE_BANKING_PRIVATE_KEY = privateKey;
    resetApplicationEnvironment();
    global.fetch = async (url) => {
      const u = String(url);
      if (u.endsWith('/application')) return { ok: true, status: 200, text: async () => JSON.stringify({ name: 'TwinMe', environment }) };
      return { ok: false, status: 404, text: async () => JSON.stringify({ code: 404, message: 'No session found matching provided id', error: 'SESSION_DOES_NOT_EXIST' }) };
    };
    try { return await run(); } finally {
      global.fetch = saved.fetch;
      resetApplicationEnvironment();
      if (saved.id) process.env.ENABLE_BANKING_APP_ID = saved.id; else delete process.env.ENABLE_BANKING_APP_ID;
      if (saved.key) process.env.ENABLE_BANKING_PRIVATE_KEY = saved.key; else delete process.env.ENABLE_BANKING_PRIVATE_KEY;
    }
  };

  it('is "ended" only when the production application says so', async () => {
    await withApp('PRODUCTION', async () => {
      await expect(fetchTransactions('acc-1', '2026-09-01')).rejects.toMatchObject({ code: 'bank_session_expired' });
    });
  });

  it('is "unreachable", never "ended", from the sandbox application', async () => {
    await withApp('SANDBOX', async () => {
      await expect(fetchTransactions('acc-1', '2026-09-01')).rejects.toMatchObject({ code: 'bank_session_unreachable' });
    });
  });
});

/* A read made with the person present is not one of the bank's four background reads a
   day; Enable Banking tells the two apart by the PSU headers alone. And a card payment
   should show the day it is made, so booked and pending rows are both asked for. */
describe('fetchTransactions, attended and with pending rows', () => {
  const withFetch = async (impl, run) => {
    const saved = { fetch: global.fetch, id: process.env.ENABLE_BANKING_APP_ID, key: process.env.ENABLE_BANKING_PRIVATE_KEY };
    const { generateKeyPairSync } = await import('node:crypto');
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
    process.env.ENABLE_BANKING_APP_ID = 'test-app';
    process.env.ENABLE_BANKING_PRIVATE_KEY = privateKey;
    global.fetch = impl;
    try { return await run(); } finally {
      global.fetch = saved.fetch;
      if (saved.id) process.env.ENABLE_BANKING_APP_ID = saved.id; else delete process.env.ENABLE_BANKING_APP_ID;
      if (saved.key) process.env.ENABLE_BANKING_PRIVATE_KEY = saved.key; else delete process.env.ENABLE_BANKING_PRIVATE_KEY;
    }
  };

  it('sends the person\'s address and agent, and asks for booked and pending', async () => {
    const calls = [];
    await withFetch(async (url, init) => {
      calls.push({ url: String(url), headers: init.headers });
      return { ok: true, status: 200, text: async () => JSON.stringify({ transactions: [], continuation_key: null }) };
    }, async () => {
      await fetchTransactions('acc-1', '2026-09-01', null, { psu: { ip: '81.9.1.2', userAgent: 'TwinMe/1.0' } });
    });
    expect(calls[0].url).toContain('transaction_status=BOTH');
    expect(calls[0].headers['Psu-Ip-Address']).toBe('81.9.1.2');
    expect(calls[0].headers['Psu-User-Agent']).toBe('TwinMe/1.0');
  });

  it('sends no PSU header for a background read', async () => {
    const calls = [];
    await withFetch(async (url, init) => {
      calls.push({ url: String(url), headers: init.headers });
      return { ok: true, status: 200, text: async () => JSON.stringify({ transactions: [] }) };
    }, async () => { await fetchTransactions('acc-1', '2026-09-01'); });
    expect(calls[0].headers['Psu-Ip-Address']).toBeUndefined();
  });

  it('asks again without the status filter when the bank refuses it', async () => {
    const calls = [];
    await withFetch(async (url) => {
      calls.push(String(url));
      if (calls.length === 1) return { ok: false, status: 422, text: async () => JSON.stringify({ code: 422, message: 'transaction_status not supported' }) };
      return { ok: true, status: 200, text: async () => JSON.stringify({ transactions: [{ status: 'BOOK' }] }) };
    }, async () => {
      const r = await fetchTransactions('acc-1', '2026-09-01');
      expect(r.rows).toHaveLength(1);
    });
    expect(calls[0]).toContain('transaction_status=BOTH');
    expect(calls[1]).not.toContain('transaction_status');
  });
});

describe('toSighting on a pending row', () => {
  it('keys it by its own day and amount, marks it less certain, and keeps the status', () => {
    const s = toSighting({ status: 'PDNG', transaction_amount: { amount: '19.99', currency: 'EUR' }, credit_debit_indicator: 'DBIT', remittance_information: ['PAGO MOVIL EN CABIFY, MADRID ES, TARJ. :*741245'], transaction_date: '2026-09-13' }, 'a1');
    expect(s.source_ref.startsWith('pend:')).toBe(true);
    expect(s.parse_confidence).toBe(0.85);
    expect(s.raw_json.status).toBe('PDNG');
    expect(s.amount).toBe(19.99);
  });
});

describe('two identical pending rows in one read', () => {
  it('get distinct keys, in order, so the batch can be written; booked rows are untouched', () => {
    const row = { status: 'PDNG', transaction_amount: { amount: '0.50', currency: 'EUR' }, credit_debit_indicator: 'DBIT', remittance_information: ['BIZUM A FAVOR DE SEBASTIAN ALFONSO IZURIETA SAENZ CONCEPTO Sin concepto'], transaction_date: '2026-09-14' };
    const booked = { status: 'BOOK', entry_reference: 'ref-1', transaction_amount: { amount: '1.70', currency: 'EUR' }, credit_debit_indicator: 'DBIT', remittance_information: ['PAGO MOVIL EN RENFE, MADRID ES'], transaction_date: '2026-09-11' };
    const batch = distinctPending([toSighting(row, 'a1'), toSighting(booked, 'a1'), toSighting(row, 'a1'), toSighting(row, 'a1')]);
    const refs = batch.map((s) => s.source_ref);
    expect(new Set(refs).size).toBe(4);
    expect(refs[0].startsWith('pend:')).toBe(true);
    expect(refs[2]).toBe(`${refs[0]}#2`);
    expect(refs[3]).toBe(`${refs[0]}#3`);
    expect(refs[1]).toBe('bank:a1:ref-1');
    expect(distinctPending([])).toEqual([]);
  });
});

describe('pickBalance', () => {
  it('prefers the available figure, then expected, then the accounting balance, and marks a credit line', async () => {
    const { pickBalance } = await import('../../../../api/services/money/feeds/enableBanking.js');
    const santander = [
      { name: 'closingBooked', balance_amount: { currency: 'EUR', amount: '1250.00' }, balance_type: 'CLBD', reference_date: '2026-09-14' },
      { name: 'expected', balance_amount: { currency: 'EUR', amount: '1198.55' }, balance_type: 'XPCD', last_change_date_time: '2026-09-14T17:47:00Z' },
    ];
    expect(pickBalance(santander)).toMatchObject({ amount: 1198.55, type: 'XPCD', credit_included: false, at: '2026-09-14T17:47:00Z' });
    const revolut = [{ balance_amount: { currency: 'EUR', amount: '210.4' }, balance_type: 'ITAV' }, { balance_amount: { currency: 'EUR', amount: '210.4' }, balance_type: 'CLBD' }];
    expect(pickBalance(revolut)).toMatchObject({ amount: 210.4, type: 'ITAV', at: null });
    expect(pickBalance([{ balance_amount: { currency: 'EUR', amount: '500' }, balance_type: 'CLBD', credit_limit_included: true }]).credit_included).toBe(true);
    /* An overdraft keeps its sign; the screen says overdrawn, never available. */
    expect(pickBalance([{ balance_amount: { currency: 'EUR', amount: '-120.00' }, balance_type: 'XPCD' }]).amount).toBe(-120);
    /* A multi-currency account: only the account's own currency counts. */
    expect(pickBalance([{ balance_amount: { currency: 'USD', amount: '900' }, balance_type: 'ITAV' }, { balance_amount: { currency: 'EUR', amount: '210.4' }, balance_type: 'ITAV' }], { currency: 'EUR' }).amount).toBe(210.4);
    expect(pickBalance([])).toBeNull();
    expect(pickBalance([{ balance_amount: { amount: 'nan' }, balance_type: 'ITAV' }])).toBeNull();
  });
});

describe('getSession', () => {
  it('reads a session again by id and shapes it like createSession', async () => {
    const saved = { fetch: global.fetch, id: process.env.ENABLE_BANKING_APP_ID, key: process.env.ENABLE_BANKING_PRIVATE_KEY }; let url = null;
    const { generateKeyPairSync } = await import('node:crypto');
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
    process.env.ENABLE_BANKING_APP_ID = 'test-app';
    process.env.ENABLE_BANKING_PRIVATE_KEY = privateKey;
    global.fetch = async (u) => { url = String(u); return { ok: true, status: 200, text: async () => JSON.stringify({ session_id: 's9', status: 'AUTHORIZED', access: { valid_until: '2027-03-01T00:00:00Z' }, aspsp: { name: 'Revolut', country: 'ES' }, accounts: [{ uid: 'u-2', account_id: { iban: 'LT12' }, name: 'Main', currency: 'EUR' }] }) }; };
    try {
      const { getSession } = await import('../../../../api/services/money/feeds/enableBanking.js');
      const s = await getSession('s9');
      expect(url).toMatch(/\/sessions\/s9$/);
      expect(s.bankName).toBe('Revolut');
      expect(s.accounts).toEqual([{ uid: 'u-2', identificationHash: null, iban: 'LT12', name: 'Main', currency: 'EUR' }]);
      expect(s.raw.status).toBe('AUTHORIZED');
    } finally {
      global.fetch = saved.fetch;
      if (saved.id) process.env.ENABLE_BANKING_APP_ID = saved.id; else delete process.env.ENABLE_BANKING_APP_ID;
      if (saved.key) process.env.ENABLE_BANKING_PRIVATE_KEY = saved.key; else delete process.env.ENABLE_BANKING_PRIVATE_KEY;
    }
  });
});

describe('createSession', () => {
  it('keeps the bank\'s name the session came back with, so a second bank is told apart', async () => {
    const saved = { fetch: global.fetch, id: process.env.ENABLE_BANKING_APP_ID, key: process.env.ENABLE_BANKING_PRIVATE_KEY };
    const { generateKeyPairSync } = await import('node:crypto');
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
    process.env.ENABLE_BANKING_APP_ID = 'test-app';
    process.env.ENABLE_BANKING_PRIVATE_KEY = privateKey;
    global.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ session_id: 's9', access: { valid_until: '2027-03-01T00:00:00Z' }, aspsp: { name: 'Revolut', country: 'ES' }, accounts: [{ uid: 'u-1', account_id: { iban: 'LT123456789012345678' }, name: 'Main', currency: 'EUR' }] }) });
    try {
      const { createSession } = await import('../../../../api/services/money/feeds/enableBanking.js');
      const s = await createSession('code');
      expect(s).toMatchObject({ sessionId: 's9', bankName: 'Revolut', validUntil: '2027-03-01T00:00:00Z' });
      expect(s.accounts[0]).toMatchObject({ uid: 'u-1', iban: 'LT123456789012345678', name: 'Main' });
    } finally {
      global.fetch = saved.fetch;
      if (saved.id) process.env.ENABLE_BANKING_APP_ID = saved.id; else delete process.env.ENABLE_BANKING_APP_ID;
      if (saved.key) process.env.ENABLE_BANKING_PRIVATE_KEY = saved.key; else delete process.env.ENABLE_BANKING_PRIVATE_KEY;
    }
  });
});

describe('fetchBalances', () => {
  it('refuses to read without the person present, so the four a day stay true', async () => {
    const { fetchBalances } = await import('../../../../api/services/money/feeds/enableBanking.js');
    await expect(fetchBalances('acc-1', { psu: null })).rejects.toMatchObject({ code: 'psu_required' });
    await expect(fetchBalances('acc-1', { psu: { ip: null, userAgent: 'x' } })).rejects.toMatchObject({ code: 'psu_required' });
  });
});

/* 2026-09-16: Revolut and Sabadell sessions came back authorised with no accounts. What
   tells a restricted application (accounts seen, then withheld) from a bank that shared
   none is Enable Banking's own count, so the empty-session log keeps it, and never the
   account identifiers themselves. */
describe('an empty session, as the feed log keeps it', () => {
  it('counts the accounts Enable Banking holds and names their fields, never their values', () => {
    const s = sessionShape({ session_id: 's1', status: 'AUTHORIZED', accounts: [], accounts_data: [{ uid: 'u-1', identification_hash: 'h-1' }, { uid: 'u-2', identification_hash: 'h-2' }], aspsp: { name: 'Revolut', country: 'ES' } });
    expect(s.accounts).toEqual([]);
    expect(s.raw.accounts_data).toEqual({ count: 2, fields: ['uid', 'identification_hash'] });
    expect(JSON.stringify(s.raw)).not.toContain('u-1');
    expect(JSON.stringify(s.raw)).not.toContain('h-1');
  });
  it('says so when there is no accounts_data at all', () => {
    expect(sessionShape({ session_id: 's2', accounts: [] }).raw.accounts_data).toBeNull();
  });
  it('describes the application without its key id, keeping only its status fields', async () => {
    const saved = { fetch: global.fetch, id: process.env.ENABLE_BANKING_APP_ID, key: process.env.ENABLE_BANKING_PRIVATE_KEY };
    const { generateKeyPairSync } = await import('node:crypto');
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
    process.env.ENABLE_BANKING_APP_ID = 'test-app'; process.env.ENABLE_BANKING_PRIVATE_KEY = privateKey;
    global.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ kid: 'secret-kid', name: 'TwinMe', environment: 'PRODUCTION', active: true, restricted: true, redirect_urls: ['https://x'], description: 'long text' }) });
    try {
      const info = await applicationInfo();
      expect(info).toMatchObject({ name: 'TwinMe', environment: 'PRODUCTION', active: true, restricted: true });
      expect(info.keys).toContain('restricted');
      expect(JSON.stringify(info)).not.toContain('secret-kid');
      expect(info).not.toHaveProperty('redirect_urls');
    } finally {
      global.fetch = saved.fetch;
      if (saved.id) process.env.ENABLE_BANKING_APP_ID = saved.id; else delete process.env.ENABLE_BANKING_APP_ID;
      if (saved.key) process.env.ENABLE_BANKING_PRIVATE_KEY = saved.key; else delete process.env.ENABLE_BANKING_PRIVATE_KEY;
    }
  });
});


describe('bank reference identity', () => {
  const row = { transaction_amount: { amount: '5', currency: 'EUR' }, value_date: '2026-09-11', creditor: { name: 'Cafe' }, status: 'BOOK' };
  it('ignores unstable transaction_id and scopes stable entry references to an account', () => {
    expect(toSighting({ ...row, transaction_id: 'read-1' }, 'a').source_ref).toBe(toSighting({ ...row, transaction_id: 'read-2' }, 'a').source_ref);
    expect(toSighting({ ...row, entry_reference: '1' }, 'a').source_ref).not.toBe(toSighting({ ...row, entry_reference: '1' }, 'b').source_ref);
  });
  it('retains repeated fallback rows even across page boundaries', () => {
    const occurrences = new Map();
    const first = distinctPending([toSighting(row, 'a')], occurrences);
    const second = distinctPending([toSighting(row, 'a')], occurrences);
    expect(second[0].source_ref).toBe(first[0].source_ref + '#2');
  });
});
