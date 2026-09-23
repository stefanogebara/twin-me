/**
 * The money cron: the bank is read, and what the ledger says is recomputed when there are
 * new rows or when it is the day's first run, whether or not the bank answered.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.CRON_SECRET = 'test-cron-secret';

const pull = vi.fn();
const refresh = vi.fn();
const places = vi.fn();
const learn = vi.fn();
const recurring = vi.fn();
const learnLedger = vi.fn();
vi.mock('../../../api/services/money/store.js', () => ({ inPersonZone: (id, fn) => fn(), personProfileCached: async () => ({ timezone: 'Europe/Madrid', country: 'ES', currency: 'EUR', language: null }), 
  pullBankFeed: (...a) => pull(...a),
  enrichPlaces: (...a) => places(...a),
  refreshReadings: (...a) => refresh(...a),
  /* Both ran only when somebody opened a page, so a series' next date went stale and the
     projection dropped it; the cron keeps them moving now (2026-09-16). */
  refreshRecurring: (...a) => recurring(...a),
  learn: (...a) => learnLedger(...a),
  bankFeedUserIds: async () => ['u1', 'u2'],
  finishBankFeedJob: async () => {},
}));
vi.mock('../../../api/services/money/feeds/enableBanking.js', () => ({ isConfigured: () => true }));
vi.mock('../../../api/services/money/predictions.js', () => ({ learnFromLedger: (...a) => learn(...a) }));
vi.mock('../../../api/services/cronLogger.js', () => ({ wasRecentlyRun: async () => false, logCronExecution: async () => {} }));
const calendar = vi.fn();
vi.mock('../../../api/services/money/calendar.js', () => ({ refreshIfStale: (...a) => calendar(...a) }));

const { default: router, isDailyRun } = await import('../../../api/routes/cron-money-pull.js');

function app() {
  const a = express();
  a.use('/api/cron/money-pull', router);
  return a;
}
const AUTH = { Authorization: 'Bearer test-cron-secret' };

describe('cron-money-pull', () => {
  beforeEach(() => {
    pull.mockReset(); refresh.mockReset(); places.mockReset(); learn.mockReset(); calendar.mockReset(); calendar.mockResolvedValue({ refreshed: false });
    recurring.mockReset(); recurring.mockResolvedValue([]);
    learnLedger.mockReset(); learnLedger.mockResolvedValue({ profiles: [], patterns: [], predictions: [], summary: null });
    places.mockResolvedValue({ placed: 0, left: 0 });
    refresh.mockResolvedValue({ findings: [] });
    learn.mockResolvedValue({ recorded: 0, scored: 0 });
  });
  afterEach(() => vi.useRealTimers());

  /* The loop that writes the day down and scores it ran last, on whatever the bank read left
     of the minute. On 19 September the read took 37 seconds, the loop's 35-second gate was
     already shut, and the day was not written down -- and nothing said so, because a skip was
     not an error. The bank now yields to the loop, and a skip is counted and said. */
  it('writes the day down even when the bank read eats the budget', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-19T06:00:00Z'));
    pull.mockImplementation(async (userId, { deadline }) => {
      /* The read stops at the deadline it is given; the loop must still have time after it. */
      expect(deadline - Date.now()).toBeLessThanOrEqual(30000);
      /* A slow bank: the read runs until the deadline it was given and no further. */
      vi.setSystemTime(Math.min(deadline, Date.now() + 33000));
      return [{ created: 0, complete: false, error: 'time_budget_exhausted' }];
    });
    const res = await request(app()).get('/api/cron/money-pull').set(AUTH);
    expect(res.status).toBe(200);
    expect(learn).toHaveBeenCalledWith('u1');
    expect(learn).toHaveBeenCalledWith('u2');
    expect(res.body.learned).toBe(2);
    expect(res.body.learnSkipped).toBe(0);
  });

  it('counts and says when the loop truly had no time left', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-19T06:00:00Z'));
    pull.mockImplementation(async () => { vi.setSystemTime(Date.now() + 56000); return [{ created: 0 }]; });
    const res = await request(app()).get('/api/cron/money-pull').set(AUTH);
    expect(learn).not.toHaveBeenCalled();
    expect(res.body.learnSkipped).toBe(1);
    expect(res.body.learned).toBe(0);
  });

  it('tells the day\'s first run from the others by the hour', () => {
    expect(isDailyRun(new Date('2026-09-14T00:05:00Z'))).toBe(true);
    expect(isDailyRun(new Date('2026-09-14T08:00:00Z'))).toBe(false);
    expect(isDailyRun(new Date('2026-09-14T16:00:00Z'))).toBe(false);
  });

  it('on an afternoon run, recomputes readings only where the bank brought rows', async () => {
    vi.useFakeTimers({ now: new Date('2026-09-14T16:00:30Z'), toFake: ['Date'] });
    pull.mockImplementation(async (userId) => [{ created: userId === 'u1' ? 2 : 0, seen: 5 }]);
    const res = await request(app()).get('/api/cron/money-pull').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ users: 2, read: 2, created: 2, refreshed: 1, daily: false });
    expect(refresh.mock.calls.map((c) => c[0])).toEqual(['u1']);
    expect(places).toHaveBeenCalledTimes(1);
    expect(learn).toHaveBeenCalledTimes(2);
    expect(calendar).not.toHaveBeenCalled();
  });

  it('on the day\'s first run, recomputes every reading, even for a bank that refused the read', async () => {
    vi.useFakeTimers({ now: new Date('2026-09-14T00:00:30Z'), toFake: ['Date'] });
    pull.mockImplementation(async (userId) => {
      if (userId === 'u2') { const e = new Error('budget'); e.code = 'feed_budget_spent'; throw e; }
      return [{ created: 0, seen: 5 }];
    });
    const res = await request(app()).get('/api/cron/money-pull').set(AUTH);
    expect(res.body).toMatchObject({ read: 1, skipped: 1, created: 0, refreshed: 2, daily: true });
    expect(refresh.mock.calls.map((c) => c[0])).toEqual(['u1', 'u2']);
    /* No new rows, but the day's first run still looks up what no provider has placed. */
    expect(places.mock.calls.map((c) => [c[0], c[1].limit])).toEqual([['u1', 1], ['u2', 1]]);
    expect(learn).toHaveBeenCalledTimes(2);
    expect(calendar.mock.calls.map((c) => c[0])).toEqual(['u1', 'u2']);
    /* What comes back and what it expects next move on the clock, not on somebody opening a
       page: without this a person who stops opening the app loses their standing charges
       from the month (2026-09-16). */
    expect(recurring.mock.calls.map((c) => c[0])).toEqual(['u1', 'u2']);
    expect(learnLedger.mock.calls.map((c) => c[0])).toEqual(['u1', 'u2']);
  });

  it('leaves the rhythms alone on an afternoon run with no new rows', async () => {
    vi.useFakeTimers({ now: new Date('2026-09-14T16:00:30Z'), toFake: ['Date'] });
    pull.mockResolvedValue([{ created: 0, seen: 3 }]);
    await request(app()).get('/api/cron/money-pull').set(AUTH);
    expect(recurring).not.toHaveBeenCalled();
    expect(learnLedger).not.toHaveBeenCalled();
  });

  it('does not mark provider failures as a successful run', async () => {
    vi.useFakeTimers({ now: new Date('2026-09-14T16:00:30Z'), toFake: ['Date'] });
    pull.mockRejectedValue(new Error('provider unavailable'));
    const res = await request(app()).get('/api/cron/money-pull').set(AUTH);
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ success:false, failed:2, read:0 });
  });
  it('also fails when the bank adapter returns per-account errors instead of throwing', async () => {
    vi.useFakeTimers({ now: new Date('2026-09-14T16:00:30Z'), toFake: ['Date'] });
    pull.mockResolvedValue([{ complete:false, error:'read_failed', created:0, seen:0 }]);
    const res = await request(app()).get('/api/cron/money-pull').set(AUTH);
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ success:false,failed:2,deferred:0,read:2 });
  });

  it('a refresh that fails is counted as not refreshed and does not stop the run', async () => {
    vi.useFakeTimers({ now: new Date('2026-09-14T00:00:30Z'), toFake: ['Date'] });
    pull.mockResolvedValue([{ created: 0, seen: 1 }]);
    refresh.mockImplementation(async (userId) => { if (userId === 'u1') throw new Error('boom'); return { findings: [] }; });
    const res = await request(app()).get('/api/cron/money-pull').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ refreshed: 1, daily: true });
    expect(learn).toHaveBeenCalledTimes(2);
  });
});
