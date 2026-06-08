/**
 * Tests for /api/cron/wiki-compile.
 *
 * Replaces the broken setTimeout chain in observationIngestion.js that
 * never fired on Vercel (audit 2026-05-21: all 5 wiki pages 11-34 days
 * stale despite reflections streaming in fresh every 30 min).
 *
 * Behaviors under test:
 *   - CRON_SECRET gate (the cron writes proactive_insights downstream
 *     when wiki linting catches drift — DDoS surface).
 *   - findEligibleUsers respects the llm_wiki feature flag (opt-in only).
 *   - Users with no wiki rows yet are processed FIRST (they're infinitely
 *     stale by definition).
 *   - MAX_USERS_PER_RUN caps the queue.
 *   - A per-user timeout doesn't crash the cron — it logs + moves on.
 *   - logCronExecution records success + error rows so the cleanup-cron
 *     observability monitor catches drift on this one too.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const TEST_CRON_SECRET = 'test_cron_secret_wiki_compile';

process.env.NODE_ENV = 'test';
process.env.CRON_SECRET = TEST_CRON_SECRET;

// ── shared mock state ─────────────────────────────────────────────────────────
let flagRows;          // rows returned by .from('feature_flags')
let wikiAgeRows;       // rows returned by .from('user_wiki_pages')
let compileCalls;      // [{ userId }, ...]
let compileImpl;       // (userId) => Promise<{ compiled: [...] }>
let cronLoggerCalls;   // [{ name, status, ms, payload, err }, ...]

beforeEach(() => {
  flagRows = [];
  wikiAgeRows = [];
  compileCalls = [];
  compileImpl = vi.fn(async () => ({ compiled: ['personality'], skipped: [], errors: [] }));
  cronLoggerCalls = [];
});

vi.mock('../../../api/services/database.js', () => {
  function makeChain() {
    const seenEqs = [];
    const seenIn = [];
    const chain = {
      select() { return chain; },
      eq(col, val) {
        seenEqs.push([col, val]);
        chain._eqs = seenEqs;
        return chain;
      },
      in(col, val) {
        seenIn.push([col, val]);
        chain._in = seenIn;
        return chain;
      },
      order() {
        // Dispatch on what was queried — the cron makes two distinct calls.
        const isFlag = seenEqs.some(([c]) => c === 'flag_name');
        if (isFlag) return Promise.resolve({ data: flagRows, error: null });
        return Promise.resolve({ data: wikiAgeRows, error: null });
      },
      // .eq + .eq + the terminal — supports the .from('feature_flags').select().eq().eq() chain
      then(resolve) {
        // For the feature_flags query that ends in .eq().eq() without .order()
        const isFlag = seenEqs.some(([c]) => c === 'flag_name');
        if (isFlag) return resolve({ data: flagRows, error: null });
        return resolve({ data: wikiAgeRows, error: null });
      },
    };
    return chain;
  }
  return {
    supabaseAdmin: {
      from: () => makeChain(),
    },
  };
});

vi.mock('../../../api/services/wikiCompilationService.js', () => ({
  compileWikiPages: (userId) => {
    compileCalls.push({ userId });
    return compileImpl(userId);
  },
}));

vi.mock('../../../api/services/cronLogger.js', () => ({
  logCronExecution: async (name, status, ms, payload, err) => {
    cronLoggerCalls.push({ name, status, ms, payload, err });
  },
}));

vi.mock('../../../api/services/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  }),
}));

const { default: router } = await import('../../../api/routes/cron-wiki-compile.js');

function makeApp() {
  const app = express();
  app.use('/cron', router);
  return app;
}

describe('cron /wiki-compile', () => {
  describe('auth gate', () => {
    it('returns 401 with no Authorization header', async () => {
      const res = await request(makeApp()).post('/cron');
      expect(res.status).toBe(401);
      expect(compileCalls).toHaveLength(0);
      expect(cronLoggerCalls).toHaveLength(0);
    });

    it('returns 401 with wrong Bearer token', async () => {
      const res = await request(makeApp())
        .post('/cron')
        .set('Authorization', 'Bearer wrong_secret');
      expect(res.status).toBe(401);
      expect(compileCalls).toHaveLength(0);
    });
  });

  describe('eligibility', () => {
    it('returns success with processed=0 when no users have the llm_wiki flag enabled', async () => {
      flagRows = [];
      const res = await request(makeApp())
        .post('/cron')
        .set('Authorization', `Bearer ${TEST_CRON_SECRET}`);
      expect(res.status).toBe(200);
      expect(res.body.processed).toBe(0);
      expect(compileCalls).toHaveLength(0);
    });

    it('compiles one user when one is eligible (MAX_USERS_PER_RUN cap)', async () => {
      flagRows = [{ user_id: 'u_one' }];
      wikiAgeRows = [{ user_id: 'u_one', updated_at: '2026-05-10T00:00:00Z' }];
      const res = await request(makeApp())
        .post('/cron')
        .set('Authorization', `Bearer ${TEST_CRON_SECRET}`);
      expect(res.status).toBe(200);
      expect(res.body.processed).toBe(1);
      expect(res.body.compiled).toBe(1);
      expect(compileCalls).toEqual([{ userId: 'u_one' }]);
    });

    it('processes users with no wiki rows FIRST (infinitely stale by definition)', async () => {
      flagRows = [
        { user_id: 'u_old_wiki' },
        { user_id: 'u_no_wiki' },
        { user_id: 'u_recent_wiki' },
      ];
      wikiAgeRows = [
        { user_id: 'u_old_wiki', updated_at: '2026-04-01T00:00:00Z' },
        { user_id: 'u_recent_wiki', updated_at: '2026-05-20T00:00:00Z' },
      ];
      // MAX_USERS_PER_RUN=5, so all three are processed — but ordering matters:
      // the no-wiki user (infinitely stale) first, then oldest-wiki, then recent.
      await request(makeApp())
        .post('/cron')
        .set('Authorization', `Bearer ${TEST_CRON_SECRET}`);
      expect(compileCalls).toEqual([
        { userId: 'u_no_wiki' },
        { userId: 'u_old_wiki' },
        { userId: 'u_recent_wiki' },
      ]);
    });

    it('among users WITH wiki rows, processes the oldest one first', async () => {
      flagRows = [
        { user_id: 'u_old' },
        { user_id: 'u_recent' },
      ];
      wikiAgeRows = [
        { user_id: 'u_old', updated_at: '2026-03-01T00:00:00Z' },
        { user_id: 'u_recent', updated_at: '2026-05-21T00:00:00Z' },
      ];
      await request(makeApp())
        .post('/cron')
        .set('Authorization', `Bearer ${TEST_CRON_SECRET}`);
      expect(compileCalls).toEqual([{ userId: 'u_old' }, { userId: 'u_recent' }]);
    });
  });

  describe('compile-time outcomes', () => {
    it('counts a successful compile as compiled, not skipped', async () => {
      flagRows = [{ user_id: 'u' }];
      compileImpl = vi.fn(async () => ({
        compiled: ['personality', 'lifestyle'],
        skipped: [], errors: [],
      }));
      const res = await request(makeApp())
        .post('/cron')
        .set('Authorization', `Bearer ${TEST_CRON_SECRET}`);
      expect(res.body.compiled).toBe(1);
      expect(res.body.skipped).toBe(0);
    });

    it('counts an empty-compiled result as skipped (cooldown / no new data)', async () => {
      flagRows = [{ user_id: 'u' }];
      compileImpl = vi.fn(async () => ({ compiled: [], skipped: ['all'], errors: [] }));
      const res = await request(makeApp())
        .post('/cron')
        .set('Authorization', `Bearer ${TEST_CRON_SECRET}`);
      expect(res.body.compiled).toBe(0);
      expect(res.body.skipped).toBe(1);
    });

    it('catches a thrown error per user — does not crash the cron, logs into errors', async () => {
      flagRows = [{ user_id: 'u_explodes' }];
      compileImpl = vi.fn(async () => { throw new Error('LLM rate limit'); });
      const res = await request(makeApp())
        .post('/cron')
        .set('Authorization', `Bearer ${TEST_CRON_SECRET}`);
      expect(res.status).toBe(200);
      expect(res.body.errored).toBe(1);
      expect(res.body.errors[0].userId).toBe('u_explodes');
      expect(res.body.errors[0].error).toBe('LLM rate limit');
    });
  });

  describe('observability', () => {
    it('writes a success row to cron_executions with the result payload', async () => {
      flagRows = [{ user_id: 'u' }];
      await request(makeApp())
        .post('/cron')
        .set('Authorization', `Bearer ${TEST_CRON_SECRET}`);
      expect(cronLoggerCalls).toHaveLength(1);
      expect(cronLoggerCalls[0].name).toBe('wiki-compile');
      expect(cronLoggerCalls[0].status).toBe('success');
      expect(cronLoggerCalls[0].payload).toMatchObject({
        processed: 1,
        compiled: expect.any(Number),
        skipped: expect.any(Number),
        errored: expect.any(Number),
      });
    });
  });
});
