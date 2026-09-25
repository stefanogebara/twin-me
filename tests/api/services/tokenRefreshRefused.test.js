/**
 * A refresh Google refuses is a grant that is gone (2026-09-26).
 *
 * #587 has the calendar page offer "Reconnect Google" only when the token service says
 * requiresReauth, and only a failed decryption said it. When Google refused the refresh token
 * (400 invalid_grant: revoked, expired, the password changed) the answer carried nothing, and
 * the page offered "Try calendar again" for ever. A refusal now says so. A network error, a
 * timeout or a 5xx is Google being unwell, not the grant being gone, and stays a retry; so does
 * Google refusing our own client, which no reconnect can fix.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { memoryDb } from '../../helpers/memorySupabase.js';

process.env.ENCRYPTION_KEY = '0'.repeat(64);

vi.mock('../../../api/_app/services/database.js', async () => ({
  supabaseAdmin: (await import('../../helpers/memorySupabase.js')).memoryDb.client,
}));
vi.mock('../../../api/_app/services/logger.js', () => ({
  createLogger: () => ({ info() {}, warn() {}, error() {}, debug() {} }),
}));

const { getValidAccessToken, grantRefused } = await import('../../../api/_app/services/tokenRefreshService.js');
const { encryptToken } = await import('../../../api/_app/services/encryption.js');

const googleSays = (status, data) => Object.assign(new Error(`Request failed with status code ${status}`), { isAxiosError: true, response: { status, data } });
/* One person per case: a refresh holds a lock per person for a second after it settles. */
let serial = 0;
let person;
const connection = (over = {}) => ({
  user_id: person, platform: 'google_calendar', access_token: encryptToken('old-at'), refresh_token: encryptToken('rt'),
  token_expires_at: new Date(Date.now() - 60_000).toISOString(), connected_at: new Date(Date.now() - 86400_000).toISOString(),
  status: 'connected', ...over,
});

beforeEach(() => {
  vi.restoreAllMocks();
  memoryDb.reset();
  person = `person-${++serial}`;
  vi.stubEnv('GOOGLE_CLIENT_ID', 'client-id');
  vi.stubEnv('GOOGLE_CLIENT_SECRET', 'client-secret');
  memoryDb.seed('platform_connections', [connection()]);
});
afterEach(() => { vi.unstubAllEnvs(); });

describe('a refresh Google refuses', () => {
  it.each([
    ['invalid_grant: revoked, expired or the password changed', 400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }],
    ['unauthorized_client: the token belongs to another client', 401, { error: 'unauthorized_client', error_description: 'Unauthorized' }],
  ])('asks for a reconnect on %s', async (_why, status, data) => {
    vi.spyOn(axios, 'post').mockRejectedValue(googleSays(status, data));
    const r = await getValidAccessToken(person, 'google_calendar');
    expect(r).toMatchObject({ success: false, requiresReauth: true });
    expect(memoryDb.rows('platform_connections')[0].status).toBe('expired');
  });

  it.each([
    ['a 503', googleSays(503, { error: 'backend_error' })],
    ['a 500 with no body', googleSays(500, '')],
    ['a timeout', Object.assign(new Error('timeout of 10000ms exceeded'), { code: 'ECONNABORTED' })],
    ['a network error', Object.assign(new Error('getaddrinfo ENOTFOUND oauth2.googleapis.com'), { code: 'ENOTFOUND' })],
    ['Google refusing our own client', googleSays(401, { error: 'invalid_client', error_description: 'The OAuth client was not found.' })],
    ['a malformed request of ours', googleSays(400, { error: 'invalid_request' })],
  ])('keeps %s a retry, not a reconnect', async (_why, error) => {
    vi.spyOn(axios, 'post').mockRejectedValue(error);
    const r = await getValidAccessToken(person, 'google_calendar');
    expect(r.success).toBe(false);
    expect(r.requiresReauth).not.toBe(true);
  });

  it('asks for a reconnect when there is no refresh token to try, without calling Google', async () => {
    memoryDb.seed('platform_connections', [connection({ refresh_token: null })]);
    const post = vi.spyOn(axios, 'post');
    const r = await getValidAccessToken(person, 'google_calendar');
    expect(r).toMatchObject({ success: false, requiresReauth: true });
    expect(post).not.toHaveBeenCalled();
  });

  it('still refreshes a grant Google accepts, and keeps it', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue({ data: { access_token: 'new-at', expires_in: 3599 } });
    const r = await getValidAccessToken(person, 'google_calendar');
    expect(r).toEqual({ success: true, accessToken: 'new-at' });
    expect(memoryDb.rows('platform_connections')[0].status).toBe('connected');
  });
});

describe('grantRefused', () => {
  it.each([
    [googleSays(400, { error: 'invalid_grant' }), true],
    [googleSays(401, { error: 'unauthorized_client' }), true],
    [googleSays(400, { error: 'invalid_request' }), false],
    [googleSays(401, { error: 'invalid_client' }), false],
    [googleSays(503, { error: 'invalid_grant' }), false],
    [googleSays(400, 'invalid_grant'), false],
    [new Error('socket hang up'), false],
    [null, false],
  ])('%#: %s', (error, expected) => {
    expect(grantRefused(error)).toBe(expected);
  });
});
