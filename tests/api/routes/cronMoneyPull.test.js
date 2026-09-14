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
vi.mock('../../../api/services/money/store.js', () => ({
  pullBankFeed: (...a) => pull(...a),
  enrichPlaces: (...a) => places(...a),
  refreshReadings: (...a) => refresh(...a),
  bankFeedUserIds: async () => ['u1', 'u2'],
}));
vi.mock('../../../api/services/money/feeds/enableBanking.js', () => ({ isConfigured: () => true }));
vi.mock('../../../api/services/money/predictions.js', () => ({ learnFromLedger: (...a) => learn(...a) }));
vi.mock('../../../api/services/cronLogger.js', () => ({ wasRecentlyRun: async () => false, logCronExecution: async () => {} }));

const { default: router, isDailyRun } = await import('../../../api/routes/cron-money-pull.js');

function app() {
  const a = express();
  a.use('/api/cron/money-pull', router);
  return a;
}
const AUTH = { Authorization: 'Bearer test-cron-secret' };

describe('cron-money-pull', () => {
  beforeEach(() => {
    pull.mockReset(); refresh.mockReset(); places.mockReset(); learn.mockReset();
    places.mockResolvedValue({ placed: 0, left: 0 });
    refresh.mockResolvedValue({ findings: [] });
    learn.mockResolvedValue({ recorded: 0, scored: 0 });
  });
  afterEach(() => vi.useRealTimers());

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
    expect(places).not.toHaveBeenCalled();
    expect(learn).toHaveBeenCalledTimes(2);
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
