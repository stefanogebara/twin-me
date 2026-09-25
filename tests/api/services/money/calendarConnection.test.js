/**
 * Connecting Google Calendar again (2026-09-26).
 *
 * The consent came back to a callback that left with the twin (/connectors/callback, 410), so
 * nobody could connect a calendar. The money API now checks the sealed state, exchanges the code
 * and writes the connection in the shape the calendar read already takes: the row the token
 * service reads, proven here by reading it back through getValidAccessToken.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryDb } from '../../../helpers/memorySupabase.js';

process.env.ENCRYPTION_KEY = '0'.repeat(64);

vi.mock('../../../../api/_app/services/database.js', async () => ({
  supabaseAdmin: (await import('../../../helpers/memorySupabase.js')).memoryDb.client,
}));
vi.mock('../../../../api/_app/services/logger.js', () => ({
  createLogger: () => ({ info() {}, warn() {}, error() {}, debug() {} }),
}));

const { readConnectState, sitePath, connectGoogleCalendar, CALENDAR_SCOPE, CONNECT_STATE_MAX_AGE_MS } =
  await import('../../../../api/_app/services/money/calendarConnection.js');
const { encryptState, encryptToken, decryptToken } = await import('../../../../api/_app/services/encryption.js');
const { getValidAccessToken } = await import('../../../../api/_app/services/tokenRefreshService.js');

const owner = '00000000-0000-4000-8000-000000000001';
const stranger = '00000000-0000-4000-8000-000000000002';
const NOW = Date.parse('2026-09-26T10:00:00Z');
const seal = (over = {}) => encryptState({ provider: 'google_calendar', userId: owner, timestamp: NOW - 60_000, returnUrl: '/money?calendar=connected', ...over }, 'connector');
const redirectUri = 'https://twinme.me/oauth/callback';
const granted = (body, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
const connection = () => memoryDb.rows('platform_connections').find((r) => r.user_id === owner && r.platform === 'google_calendar');

beforeEach(() => {
  memoryDb.reset();
  vi.stubEnv('GOOGLE_CLIENT_ID', 'client-id');
  vi.stubEnv('GOOGLE_CLIENT_SECRET', 'client-secret');
});
afterEach(() => { vi.unstubAllEnvs(); });

describe('the sealed state a consent comes back with', () => {
  it('is accepted for the person who began it, under fifteen minutes old, with its way back', () => {
    expect(readConnectState(seal(), owner, { now: NOW })).toEqual({ ok: true, returnUrl: '/money?calendar=connected' });
    expect(readConnectState(seal({ timestamp: NOW - CONNECT_STATE_MAX_AGE_MS + 1000 }), owner, { now: NOW }).ok).toBe(true);
  });

  it('is refused with 403 when another person began it', () => {
    expect(readConnectState(seal(), stranger, { now: NOW })).toMatchObject({ ok: false, status: 403 });
  });

  it.each([
    ['older than fifteen minutes', () => seal({ timestamp: NOW - CONNECT_STATE_MAX_AGE_MS })],
    ['without a time', () => seal({ timestamp: undefined })],
    ['for another provider', () => seal({ provider: 'google_gmail' })],
    ['for no provider', () => seal({ provider: undefined })],
    ['not sealed by this server', () => 'connector.00:00:00'],
    ['empty', () => ''],
    ['sealed but not an object', () => encryptState('google_calendar', 'connector')],
  ])('is refused with 400 when it is %s', (_why, state) => {
    const r = readConnectState(state(), owner, { now: NOW });
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(typeof r.error).toBe('string');
  });

  it('never hands back a way off the site', () => {
    expect(readConnectState(seal({ returnUrl: '//evil.example/money' }), owner, { now: NOW }).returnUrl).toBe('/money');
  });
});

describe('a way back is a path on this site', () => {
  it.each([
    ['/money?calendar=connected', '/money?calendar=connected'],
    ['/money/account', '/money/account'],
    ['/', '/'],
    ['//evil.example', '/money'],
    ['/\\evil.example', '/money'],
    ['/money\\..\\x', '/money'],
    ['https://evil.example/money', '/money'],
    ['money', '/money'],
    ['/\t/evil.example', '/money'],
    ['/money\n', '/money'],
    [undefined, '/money'],
    [42, '/money'],
  ])('%j -> %s', (value, expected) => {
    expect(sitePath(value)).toBe(expected);
  });
});

describe('connectGoogleCalendar', () => {
  it('exchanges the code at Google with the redirect the consent was given', async () => {
    const fetchImpl = granted({ access_token: 'at-1', refresh_token: 'rt-1', expires_in: 3599, scope: CALENDAR_SCOPE, token_type: 'Bearer' });
    await connectGoogleCalendar(owner, { code: 'code-1', redirectUri }, { fetchImpl, now: new Date(NOW) });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://oauth2.googleapis.com/token');
    expect(init.method).toBe('POST');
    const body = new URLSearchParams(String(init.body));
    expect(Object.fromEntries(body)).toEqual({
      code: 'code-1', client_id: 'client-id', client_secret: 'client-secret', redirect_uri: redirectUri, grant_type: 'authorization_code',
    });
  });

  it('writes the connection the calendar read takes, and the read gets the new token', async () => {
    const fetchImpl = granted({ access_token: 'at-1', refresh_token: 'rt-1', expires_in: 3599, scope: CALENDAR_SCOPE });
    await connectGoogleCalendar(owner, { code: 'code-1', redirectUri }, { fetchImpl, now: new Date() });
    const row = connection();
    expect(row).toMatchObject({ status: 'connected', last_sync_error: null, scopes: [CALENDAR_SCOPE] });
    expect(row.access_token).not.toContain('at-1');
    expect(decryptToken(row.access_token)).toBe('at-1');
    expect(decryptToken(row.refresh_token)).toBe('rt-1');
    expect(Date.parse(row.token_expires_at) - Date.now()).toBeGreaterThan(3500 * 1000);
    expect(row.connected_at).toBeTruthy();
    /* The read path itself: the same row, found and decrypted by the service the calendar uses. */
    await expect(getValidAccessToken(owner, 'google_calendar')).resolves.toMatchObject({ success: true, accessToken: 'at-1' });
  });

  it('keeps the refresh token it holds when Google sends none, and clears the failed refresh', async () => {
    memoryDb.seed('platform_connections', [{
      user_id: owner, platform: 'google_calendar', access_token: encryptToken('old-at'), refresh_token: encryptToken('old-rt'),
      token_expires_at: new Date(NOW - 3600_000).toISOString(), connected_at: new Date(NOW - 86400_000).toISOString(),
      status: 'expired', last_sync_status: 'failed', last_sync_error: '{"error":"invalid_grant"}',
    }]);
    await connectGoogleCalendar(owner, { code: 'code-2', redirectUri }, { fetchImpl: granted({ access_token: 'at-2', expires_in: 3599, scope: CALENDAR_SCOPE }), now: new Date() });
    const rows = memoryDb.rows('platform_connections');
    expect(rows).toHaveLength(1);
    expect(decryptToken(rows[0].access_token)).toBe('at-2');
    expect(decryptToken(rows[0].refresh_token)).toBe('old-rt');
    expect(rows[0]).toMatchObject({ status: 'connected', last_sync_error: null });
    await expect(getValidAccessToken(owner, 'google_calendar')).resolves.toMatchObject({ success: true, accessToken: 'at-2' });
  });

  it('replaces the refresh token when Google sends a new one', async () => {
    memoryDb.seed('platform_connections', [{ user_id: owner, platform: 'google_calendar', access_token: encryptToken('old-at'), refresh_token: encryptToken('old-rt'), connected_at: new Date(NOW).toISOString(), status: 'connected' }]);
    await connectGoogleCalendar(owner, { code: 'code-3', redirectUri }, { fetchImpl: granted({ access_token: 'at-3', refresh_token: 'rt-3', expires_in: 3599, scope: CALENDAR_SCOPE }), now: new Date() });
    expect(decryptToken(connection().refresh_token)).toBe('rt-3');
  });

  it('does not keep a connection that could not outlive its first hour', async () => {
    await expect(connectGoogleCalendar(owner, { code: 'code-4', redirectUri }, { fetchImpl: granted({ access_token: 'at-4', expires_in: 3599, scope: CALENDAR_SCOPE }) }))
      .rejects.toMatchObject({ code: 'calendar_exchange_failed' });
    expect(connection()).toBeUndefined();
  });

  it('does not keep a grant that leaves the calendar out', async () => {
    const fetchImpl = granted({ access_token: 'at-5', refresh_token: 'rt-5', expires_in: 3599, scope: 'openid https://www.googleapis.com/auth/userinfo.email' });
    await expect(connectGoogleCalendar(owner, { code: 'code-5', redirectUri }, { fetchImpl })).rejects.toMatchObject({ code: 'calendar_exchange_failed' });
    expect(connection()).toBeUndefined();
  });

  it.each([
    ['Google refuses the code', () => granted({ error: 'invalid_grant', error_description: 'Bad Request' }, 400)],
    ['Google answers without a token', () => granted({ token_type: 'Bearer' })],
    ['the network fails', () => vi.fn(async () => { throw new TypeError('fetch failed'); })],
  ])('throws a failed exchange and writes nothing when %s', async (_why, fetchImpl) => {
    await expect(connectGoogleCalendar(owner, { code: 'code-6', redirectUri }, { fetchImpl: fetchImpl() }))
      .rejects.toMatchObject({ code: 'calendar_exchange_failed' });
    expect(memoryDb.calls.filter((c) => c.op !== 'select')).toEqual([]);
  });

  it('throws a failed exchange without calling Google when the client is not configured', async () => {
    vi.stubEnv('GOOGLE_CLIENT_SECRET', '');
    const fetchImpl = granted({ access_token: 'at-7', refresh_token: 'rt-7', expires_in: 3599, scope: CALENDAR_SCOPE });
    await expect(connectGoogleCalendar(owner, { code: 'code-7', redirectUri }, { fetchImpl })).rejects.toMatchObject({ code: 'calendar_exchange_failed' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('throws when the connection cannot be saved, and it is not a failed exchange', async () => {
    memoryDb.fail('platform_connections', 'upsert');
    const fetchImpl = granted({ access_token: 'at-8', refresh_token: 'rt-8', expires_in: 3599, scope: CALENDAR_SCOPE });
    const error = await connectGoogleCalendar(owner, { code: 'code-8', redirectUri }, { fetchImpl }).catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error.code).not.toBe('calendar_exchange_failed');
  });

  it('throws when the refresh token it would keep cannot be looked up', async () => {
    memoryDb.fail('platform_connections', 'select');
    const fetchImpl = granted({ access_token: 'at-9', expires_in: 3599, scope: CALENDAR_SCOPE });
    await expect(connectGoogleCalendar(owner, { code: 'code-9', redirectUri }, { fetchImpl })).rejects.toThrow();
    expect(memoryDb.calls.filter((c) => c.op === 'upsert')).toEqual([]);
  });
});
