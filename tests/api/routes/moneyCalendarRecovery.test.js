/**
 * The calendar's ways back, through the real route, calendar and token service (2026-09-26).
 *
 * A Google grant that is gone offers a reconnect: #587 carried `needsReconnect` from the token
 * service to the page, but a refresh Google refused (invalid_grant) never set it, so the page
 * offered "Try calendar again" for ever. Google being unwell is still a retry.
 *
 * A new link stands on its own: adding a Canvas or Blackboard link read every other source
 * first, so an older link or Google failing answered a good new link with a 400 that blamed
 * it. The new link is judged by reading it alone; an unreadable one keeps its 400.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import axios from 'axios';
import { memoryDb } from '../../helpers/memorySupabase.js';

process.env.ENCRYPTION_KEY = '0'.repeat(64);
const owner = '00000000-0000-4000-8000-000000000001';
const facts = vi.hoisted(() => ({ list: vi.fn() }));

vi.mock('../../../api/_app/middleware/auth.js', () => ({ authenticateUser: (req, _res, next) => { req.user = { id: owner }; next(); } }));
vi.mock('../../../api/_app/services/money/store.js', async (importOriginal) => ({
  ...await importOriginal(),
  inPersonScope: (_id, fn) => fn(),
  personProfileCached: async () => ({ timezone: 'Europe/Madrid', country: 'ES', currency: 'EUR', language: null }),
}));
vi.mock('../../../api/_app/services/database.js', async (importOriginal) => ({
  ...await importOriginal(),
  supabaseAdmin: (await import('../../helpers/memorySupabase.js')).memoryDb.client,
}));
vi.mock('../../../api/_app/services/money/factsRepository.js', async (importOriginal) => ({
  ...await importOriginal(), listFacts: (...args) => facts.list(...args),
}));
/* A pasted link is resolved before it is fetched; every name here is a public address. */
vi.mock('node:dns/promises', () => ({ default: { lookup: async () => [{ address: '93.184.216.34', family: 4 }] } }));

const { default: router } = await import('../../../api/_app/routes/money.js');
const { encryptToken } = await import('../../../api/_app/services/encryption.js');
const app = express(); app.use(express.json()); app.use('/money', router);

const googleSays = (status, data) => Object.assign(new Error(`Request failed with status code ${status}`), { isAxiosError: true, response: { status, data } });

beforeEach(() => {
  vi.restoreAllMocks();
  memoryDb.reset();
  facts.list.mockReset();
  facts.list.mockResolvedValue([]);
  vi.stubEnv('GOOGLE_CLIENT_ID', 'client-id');
  vi.stubEnv('GOOGLE_CLIENT_SECRET', 'client-secret');
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('GET /money/calendar when Google\'s access token has run out', () => {
  beforeEach(() => {
    memoryDb.seed('platform_connections', [{
      user_id: owner, platform: 'google_calendar', access_token: encryptToken('old-at'), refresh_token: encryptToken('rt'),
      token_expires_at: new Date(Date.now() - 60_000).toISOString(), connected_at: new Date(Date.now() - 86400_000).toISOString(), status: 'connected',
    }]);
  });

  it('offers a reconnect when Google refuses the refresh token (invalid_grant)', async () => {
    vi.spyOn(axios, 'post').mockRejectedValue(googleSays(400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }));
    const res = await request(app).get('/money/calendar');
    expect(res.status).toBe(502);
    expect(res.body).toEqual({ success: false, error: 'The calendar could not be read right now.', needsReconnect: true });
  });

  it('offers a retry, not a reconnect, when Google answers 503', async () => {
    vi.spyOn(axios, 'post').mockRejectedValue(googleSays(503, { error: 'backend_error' }));
    const res = await request(app).get('/money/calendar');
    expect(res.status).toBe(502);
    expect(res.body).toEqual({ success: false, error: 'The calendar could not be read right now.' });
  });
});

describe('POST /money/calendar/feed beside a source that fails', () => {
  const OLD = 'https://old.instructure.com/feeds/calendars/user_old.ics';
  const NEW = 'https://school.blackboard.com/webapps/calendar/calendarFeed/abc/learn.ics';
  const ICS = 'BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:new-1\nDTSTART:20260928T090000Z\nSUMMARY:Seminar\nEND:VEVENT\nEND:VCALENDAR';
  const answer = (body) => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => body });
  const links = () => memoryDb.rows('money_facts').filter((r) => r.kind === 'calendar_feed');
  let serves;

  beforeEach(() => {
    facts.list.mockResolvedValue([{ kind: 'calendar_feed', subject: 'old', subject_label: 'canvas', value: OLD }]);
    serves = { [OLD]: async () => { throw new Error('the old link is offline'); }, [NEW]: async () => answer(ICS) };
    vi.stubGlobal('fetch', vi.fn(async (url) => serves[url]()));
  });

  it('keeps a good new link and answers 200 while an older link cannot be read', async () => {
    const res = await request(app).post('/money/calendar/feed').send({ url: NEW });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ kind: 'blackboard', label: 'Blackboard', events: 1, already: false });
    expect(links()).toHaveLength(1);
    expect(links()[0].value).not.toContain('blackboard');
  });

  it.each([
    ['answers a login page', async () => answer('<html>Sign in</html>'), 'The link did not return a calendar.'],
    ['cannot be reached', async () => { throw new Error('ECONNREFUSED'); }, 'That link could not be read.'],
  ])('still answers 400 about the new link when it %s, and keeps nothing', async (_why, serve, sentence) => {
    serves[NEW] = serve;
    const res = await request(app).post('/money/calendar/feed').send({ url: NEW });
    expect(res.status).toBe(400);
    expect(res.body.error.startsWith(sentence)).toBe(true);
    expect(links()).toHaveLength(0);
  });
});
