/**
 * The calendar's way in (2026-09-26).
 *
 * The consent came back to /oauth/callback, which posted to /connectors/callback: that route
 * left with the twin and the mount answers 410, so no calendar could be connected. The page now
 * posts to POST /money/calendar/callback, which finishes the consent for the person who began
 * it, with the same redirect the consent was given. And the consent asks for the calendar,
 * read only, instead of Gmail, Drive and the contacts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

process.env.ENCRYPTION_KEY = '0'.repeat(64);
const owner = '00000000-0000-4000-8000-000000000001';
const stranger = '00000000-0000-4000-8000-000000000002';
const connect = vi.hoisted(() => vi.fn());

vi.mock('../../../api/_app/middleware/auth.js', () => ({ authenticateUser: (req, _res, next) => { req.user = { id: owner }; next(); } }));
vi.mock('../../../api/_app/services/money/calendarConnection.js', async (importOriginal) => ({
  ...await importOriginal(), connectGoogleCalendar: connect,
}));
/* The router runs every request in the person's zone; here that reads no database. */
vi.mock('../../../api/_app/services/money/store.js', async (importOriginal) => ({
  ...await importOriginal(),
  inPersonScope: (_id, fn) => fn(),
  personProfileCached: async () => ({ timezone: 'Europe/Madrid', country: 'ES', currency: 'EUR', language: null }),
}));

const { default: router } = await import('../../../api/_app/routes/money.js');
const { encryptState } = await import('../../../api/_app/services/encryption.js');
const app = express(); app.use(express.json()); app.use('/money', router);

const CALENDAR_READONLY = 'https://www.googleapis.com/auth/calendar.readonly';
const seal = (over = {}) => encryptState({ provider: 'google_calendar', userId: owner, timestamp: Date.now(), returnUrl: '/money?calendar=connected', ...over }, 'connector');
const callback = (body) => request(app).post('/money/calendar/callback').send(body);

beforeEach(() => {
  connect.mockReset();
  connect.mockResolvedValue(undefined);
  vi.stubEnv('APP_URL', 'https://twinme.me');
  vi.stubEnv('GOOGLE_CLIENT_ID', 'client-id');
  vi.stubEnv('GOOGLE_CLIENT_SECRET', 'client-secret');
});
afterEach(() => { vi.unstubAllEnvs(); });

describe('GET /money/calendar/connect', () => {
  it('asks Google for the calendar, read only, and nothing else', async () => {
    const res = await request(app).get('/money/calendar/connect');
    expect(res.status).toBe(200);
    const url = new URL(res.body.data.url);
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('scope')).toBe(CALENDAR_READONLY);
    expect(url.searchParams.get('redirect_uri')).toBe('https://twinme.me/oauth/callback');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('state')).toMatch(/^connector\./);
  });

  it('seals a state the callback accepts for the same person', async () => {
    const state = new URL((await request(app).get('/money/calendar/connect')).body.data.url).searchParams.get('state');
    const res = await callback({ code: 'code-1', state });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { returnUrl: '/money?calendar=connected' } });
  });
});

describe('POST /money/calendar/callback', () => {
  it('finishes the consent for the person signed in, with the redirect the consent was given', async () => {
    const res = await callback({ code: 'code-1', state: seal() });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { returnUrl: '/money?calendar=connected' } });
    expect(connect).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledWith(owner, { code: 'code-1', redirectUri: 'https://twinme.me/oauth/callback' });
  });

  it('refuses a consent another person began, and spends nothing', async () => {
    const res = await callback({ code: 'code-1', state: seal({ userId: stranger }) });
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(connect).not.toHaveBeenCalled();
  });

  it('refuses a state older than fifteen minutes', async () => {
    const res = await callback({ code: 'code-1', state: seal({ timestamp: Date.now() - 15 * 60 * 1000 - 1 }) });
    expect(res.status).toBe(400);
    expect(connect).not.toHaveBeenCalled();
  });

  it.each([
    ['another provider', () => seal({ provider: 'spotify' })],
    ['a sign-in state', () => encryptState({ provider: 'google', timestamp: Date.now() }, 'auth')],
    ['a state this server did not seal', () => 'connector.aa:bb:cc'],
  ])('refuses %s', async (_why, state) => {
    const res = await callback({ code: 'code-1', state: state() });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(connect).not.toHaveBeenCalled();
  });

  it('answers 502 with a plain sentence when Google does not finish the exchange', async () => {
    connect.mockRejectedValue(Object.assign(new Error('Google refused the code: 400 invalid_grant'), { code: 'calendar_exchange_failed' }));
    const res = await callback({ code: 'code-1', state: seal() });
    expect(res.status).toBe(502);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/^[A-Z][^{}<>]*\.$/);
    expect(res.body.error).not.toMatch(/invalid_grant/);
  });

  it('answers 500 when the connection cannot be kept', async () => {
    connect.mockRejectedValue(new Error('platform_connections upsert unavailable'));
    const res = await callback({ code: 'code-1', state: seal() });
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });

  it('sends the person back only to a path on this site', async () => {
    const res = await callback({ code: 'code-1', state: seal({ returnUrl: '//evil.example/money' }) });
    expect(res.status).toBe(200);
    expect(res.body.data.returnUrl).toBe('/money');
  });

  it.each([
    [{ state: 'connector.x' }, 'code'],
    [{ code: 'code-1' }, 'state'],
    [{ code: '', state: 'connector.x' }, 'code'],
  ])('names the missing field in %j', async (body, field) => {
    const res = await callback(body);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ success: false, error: 'Invalid request', field });
    expect(connect).not.toHaveBeenCalled();
  });
});
