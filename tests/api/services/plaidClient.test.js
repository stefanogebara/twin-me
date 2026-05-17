/**
 * Unit tests for api/services/transactions/plaidClient.js
 *
 * Coverage:
 *   - isPlaidConfigured returns false when env vars unset
 *   - createLinkToken hits /link/token/create with the right body shape
 *   - exchangePublicToken hits /item/public_token/exchange
 *   - syncTransactions hits /transactions/sync with the cursor passed through
 *   - getInvestmentHoldings hits /investments/holdings/get
 *   - getLiabilities hits /liabilities/get
 *   - Non-2xx responses surface as Error with status + plaidErrorCode
 *   - 5xx triggers retry; 4xx does not
 *
 * Strategy: mock global fetch so we can inspect every outgoing call shape
 * AND control the response body. No SDK indirection — the client uses
 * plain fetch directly.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

process.env.PLAID_CLIENT_ID = 'test-client-id';
process.env.PLAID_SECRET = 'test-secret';
process.env.PLAID_ENV = 'sandbox';

// Capture each call to fetch so tests can assert on URL/body shape.
const fetchCalls = [];
let nextFetchResponse = null;

beforeEach(() => {
  fetchCalls.length = 0;
  nextFetchResponse = null;
  global.fetch = vi.fn(async (url, init) => {
    fetchCalls.push({ url, init });
    const r = nextFetchResponse;
    if (!r) {
      return { ok: true, status: 200, text: async () => JSON.stringify({}) };
    }
    if (typeof r === 'function') return r({ url, init });
    return r;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function jsonResponse(body, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

const plaid = await import('../../../api/services/transactions/plaidClient.js');

describe('plaidClient — config + auth', () => {
  it('isPlaidConfigured: true when both env vars set', () => {
    expect(plaid.isPlaidConfigured()).toBe(true);
  });

  it('isPlaidConfigured: false when client_id missing', () => {
    const orig = process.env.PLAID_CLIENT_ID;
    delete process.env.PLAID_CLIENT_ID;
    expect(plaid.isPlaidConfigured()).toBe(false);
    process.env.PLAID_CLIENT_ID = orig;
  });
});

describe('plaidClient — Link flow', () => {
  it('createLinkToken posts to /link/token/create with credentials + user', async () => {
    nextFetchResponse = jsonResponse({ link_token: 'link-sandbox-abc', expiration: '2026-05-17T12:00:00Z' });

    const result = await plaid.createLinkToken({
      clientUserId: 'user-123',
      products: ['transactions', 'investments'],
      countryCodes: ['US'],
    });

    expect(fetchCalls).toHaveLength(1);
    const { url, init } = fetchCalls[0];
    expect(url).toBe('https://sandbox.plaid.com/link/token/create');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body.client_id).toBe('test-client-id');
    expect(body.secret).toBe('test-secret');
    expect(body.user).toEqual({ client_user_id: 'user-123' });
    expect(body.products).toEqual(['transactions', 'investments']);
    expect(body.country_codes).toEqual(['US']);
    expect(body.client_name).toBe('TwinMe');
    expect(result.link_token).toBe('link-sandbox-abc');
  });

  it('createLinkToken drops `products` field when access_token provided (update mode)', async () => {
    nextFetchResponse = jsonResponse({ link_token: 'update-link', expiration: '2026-05-17T12:00:00Z' });

    await plaid.createLinkToken({
      clientUserId: 'user-123',
      accessToken: 'access-existing-abc',
    });

    const body = JSON.parse(fetchCalls[0].init.body);
    // Plaid REJECTS link/token/create with both `products` and `access_token` in update mode.
    expect(body.access_token).toBe('access-existing-abc');
    expect(body.products).toBeUndefined();
  });

  it('createLinkToken throws when clientUserId missing', async () => {
    await expect(plaid.createLinkToken({})).rejects.toThrow(/clientUserId is required/);
  });

  it('exchangePublicToken posts to /item/public_token/exchange', async () => {
    nextFetchResponse = jsonResponse({
      access_token: 'access-sandbox-xyz',
      item_id: 'wEXAMPLE',
      request_id: 'req-1',
    });

    const result = await plaid.exchangePublicToken('public-sandbox-tok');

    expect(fetchCalls[0].url).toBe('https://sandbox.plaid.com/item/public_token/exchange');
    const body = JSON.parse(fetchCalls[0].init.body);
    expect(body.public_token).toBe('public-sandbox-tok');
    expect(result.access_token).toBe('access-sandbox-xyz');
    expect(result.item_id).toBe('wEXAMPLE');
  });
});

describe('plaidClient — transactions/sync', () => {
  it('syncTransactions: omits cursor on first call, includes it on subsequent', async () => {
    nextFetchResponse = jsonResponse({
      added: [], modified: [], removed: [], next_cursor: 'cursor-1', has_more: false, accounts: [],
    });

    await plaid.syncTransactions('access-1');
    let body = JSON.parse(fetchCalls[0].init.body);
    expect(body.access_token).toBe('access-1');
    expect(body.cursor).toBeUndefined();

    fetchCalls.length = 0;
    nextFetchResponse = jsonResponse({
      added: [], modified: [], removed: [], next_cursor: 'cursor-2', has_more: false, accounts: [],
    });
    await plaid.syncTransactions('access-1', { cursor: 'cursor-1' });
    body = JSON.parse(fetchCalls[0].init.body);
    expect(body.cursor).toBe('cursor-1');
    expect(body.count).toBe(500);
  });
});

describe('plaidClient — Investments / Liabilities', () => {
  it('getInvestmentHoldings posts to /investments/holdings/get', async () => {
    nextFetchResponse = jsonResponse({ accounts: [], holdings: [], securities: [] });
    await plaid.getInvestmentHoldings('access-inv');
    expect(fetchCalls[0].url).toBe('https://sandbox.plaid.com/investments/holdings/get');
    expect(JSON.parse(fetchCalls[0].init.body).access_token).toBe('access-inv');
  });

  it('getLiabilities posts to /liabilities/get', async () => {
    nextFetchResponse = jsonResponse({ accounts: [], liabilities: { credit: [], student: [], mortgage: [] } });
    await plaid.getLiabilities('access-liab');
    expect(fetchCalls[0].url).toBe('https://sandbox.plaid.com/liabilities/get');
  });

  it('getInvestmentTransactions requires date range', async () => {
    await expect(plaid.getInvestmentTransactions('access-1', {})).rejects.toThrow(/startDate and endDate/);
  });
});

describe('plaidClient — error handling', () => {
  it('surfaces 4xx Plaid errors with plaidErrorCode + status', async () => {
    nextFetchResponse = jsonResponse(
      { error_type: 'ITEM_ERROR', error_code: 'ITEM_LOGIN_REQUIRED', error_message: 'the user needs to log in again' },
      { status: 400 },
    );

    let caught;
    try {
      await plaid.exchangePublicToken('bad-token');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    expect(caught.status).toBe(400);
    expect(caught.plaidErrorCode).toBe('ITEM_LOGIN_REQUIRED');
    expect(caught.plaidErrorType).toBe('ITEM_ERROR');
  });

  it('retries on 5xx and eventually succeeds', async () => {
    let calls = 0;
    nextFetchResponse = () => {
      calls += 1;
      if (calls < 2) return jsonResponse({ error: 'transient' }, { status: 503 });
      return jsonResponse({ link_token: 'recovered', expiration: '2026-05-17T12:00:00Z' });
    };

    const result = await plaid.createLinkToken({ clientUserId: 'user-1' });
    expect(calls).toBe(2);
    expect(result.link_token).toBe('recovered');
  });

  it('does NOT retry on 4xx', async () => {
    let calls = 0;
    nextFetchResponse = () => {
      calls += 1;
      return jsonResponse(
        { error_type: 'INVALID_INPUT', error_code: 'INVALID_PUBLIC_TOKEN', error_message: 'invalid token' },
        { status: 400 },
      );
    };

    await expect(plaid.exchangePublicToken('bad')).rejects.toThrow();
    expect(calls).toBe(1);
  });

  it('removeItem treats INVALID_ACCESS_TOKEN as already-gone, not an error', async () => {
    nextFetchResponse = jsonResponse(
      { error_type: 'INVALID_INPUT', error_code: 'INVALID_ACCESS_TOKEN', error_message: 'gone' },
      { status: 400 },
    );

    const result = await plaid.removeItem('dead-token');
    expect(result).toEqual({ removed: false, reason: 'already_gone' });
  });
});

describe('plaidClient — sandbox-only helpers', () => {
  it('sandboxCreatePublicToken posts to /sandbox/public_token/create', async () => {
    nextFetchResponse = jsonResponse({ public_token: 'public-sandbox-test', request_id: 'r' });
    const r = await plaid.sandboxCreatePublicToken();
    expect(fetchCalls[0].url).toBe('https://sandbox.plaid.com/sandbox/public_token/create');
    const body = JSON.parse(fetchCalls[0].init.body);
    expect(body.institution_id).toBe('ins_109508');
    expect(body.initial_products).toEqual(['transactions']);
    expect(r.public_token).toBe('public-sandbox-test');
  });

  it('sandboxCreatePublicToken refuses to run when PLAID_ENV=production', async () => {
    const orig = process.env.PLAID_ENV;
    process.env.PLAID_ENV = 'production';
    await expect(plaid.sandboxCreatePublicToken()).rejects.toThrow(/sandbox/);
    process.env.PLAID_ENV = orig;
  });
});
