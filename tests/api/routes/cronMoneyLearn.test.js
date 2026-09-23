/**
 * The day is written down and scored for everyone with a ledger, on a budget that is its own.
 *
 * This was the last step of the bank cron, on whatever the read left of the minute; on
 * 19 September a 37-second read starved it and a day went unrecorded, silently. It has
 * its own run now, for every person with a ledger and not only those with a bank job.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.CRON_SECRET = 'test-cron-secret';

const learn = vi.fn();
const users = vi.fn();
vi.mock('../../../api/_app/services/money/predictions.js', () => ({ learnFromLedger: (...a) => learn(...a) }));
vi.mock('../../../api/_app/services/money/transactionRepository.js', () => ({ moneyUserIds: (...a) => users(...a) }));
const logged = vi.fn();
vi.mock('../../../api/_app/services/cronLogger.js', () => ({ logCronExecution: (...a) => logged(...a) }));

const { default: router, BUDGET_MS } = await import('../../../api/_app/routes/cron-money-learn.js');
const app = () => { const a = express(); a.use('/api/cron/money-learn', router); return a; };
const AUTH = { Authorization: 'Bearer test-cron-secret' };

describe('cron-money-learn', () => {
  beforeEach(() => { learn.mockReset(); users.mockReset(); logged.mockReset(); learn.mockResolvedValue({ recorded: 1, scored: 1 }); users.mockResolvedValue(['u1', 'u2', 'u3']); });
  afterEach(() => vi.useRealTimers());

  it('refuses without the secret', async () => {
    const res = await request(app()).get('/api/cron/money-learn');
    expect(res.status).toBe(401);
    expect(learn).not.toHaveBeenCalled();
  });
  it('writes the day down for every person with a ledger, bank or not', async () => {
    const res = await request(app()).get('/api/cron/money-learn').set(AUTH);
    expect(res.status).toBe(200);
    expect(learn.mock.calls.map((c) => c[0])).toEqual(['u1', 'u2', 'u3']);
    expect(res.body).toMatchObject({ users: 3, learned: 3, recorded: 3, scored: 3, failed: 0, skipped: 0 });
    expect(logged).toHaveBeenCalledWith('money-learn', 'success', expect.any(Number), expect.objectContaining({ learned: 3 }));
  });
  it('one person failing does not stop the others, and the run says so', async () => {
    learn.mockImplementation(async (id) => { if (id === 'u2') throw new Error('nope'); return { recorded: 1, scored: 0 }; });
    const res = await request(app()).get('/api/cron/money-learn').set(AUTH);
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ learned: 2, failed: 1 });
  });
  it('counts, rather than hides, a person it had no time for', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-19T05:30:00Z'));
    learn.mockImplementation(async () => { vi.setSystemTime(Date.now() + BUDGET_MS / 2 + 1000); return { recorded: 1, scored: 1 }; });
    const res = await request(app()).get('/api/cron/money-learn').set(AUTH);
    expect(res.body).toMatchObject({ learned: 2, skipped: 1 });
    expect(res.status).toBe(503);
  });
});
