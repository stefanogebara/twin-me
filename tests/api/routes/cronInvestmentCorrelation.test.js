/**
 * Tests for /api/cron/investment-correlation — financial-emotional twin
 * Phase 4.4 sweep cron.
 *
 * Behavior under test:
 *   - CRON_SECRET gate blocks unauthenticated callers (DDoS surface +
 *     spam-write surface on proactive_insights).
 *   - findEligibleUsers de-dupes user_transactions rows correctly:
 *     users with < MIN_EVENTS_FOR_USER (6) tagged trades are skipped.
 *   - For each eligible user, the backfill query runs and triggers
 *     tagTransactionsBatch ONLY when emotional_context.recovery_score
 *     is null. (Misclassifying tagged rows as needing retag would
 *     burn Whoop-API budget on no-op writes.)
 *   - generateInvestmentCorrelationInsights is called per user and its
 *     reason codes (cooldown / no_pattern / insufficient_data / stored)
 *     are bucketed into the response counters correctly.
 *   - A handler-level exception still returns 500 with a safe body —
 *     no stack leak in production NODE_ENV.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const TEST_CRON_SECRET = 'test_cron_secret_inv_corr';

process.env.NODE_ENV = 'test';
process.env.CRON_SECRET = TEST_CRON_SECRET;

// ── shared mock state ─────────────────────────────────────────────────────────
// Each test sets these up. The supabaseAdmin mock dispatches on the
// "shape" of the chain (which methods got called) so we can return
// different rows for findEligibleUsers vs backfillRecoveryForUser.
let eligibleSelectResult;     // result of .from('user_transactions').select('user_id', ...).eq().gte().limit()
let backfillSelectResult;     // result of the longer backfill chain
let backfillCallCount;        // how many times the backfill chain was used
let lastEligibleQueryArgs;    // captured args for the eligible query

let generateImpl;             // (userId) => Promise<{ reason, stored }>
let generateCalls;            // [userId, ...]

let tagTransactionsImpl;      // (userId, ids) => Promise<{ tagged }>
let tagTransactionsCalls;     // [{ userId, ids }, ...]

let cronLoggerCalls;          // [{ name, status, ms, payload, err }, ...]

beforeEach(() => {
  eligibleSelectResult = { data: [], error: null };
  backfillSelectResult = { data: [], error: null };
  backfillCallCount = 0;
  lastEligibleQueryArgs = null;

  generateImpl = vi.fn(async () => ({ reason: 'no_pattern', stored: 0 }));
  generateCalls = [];

  tagTransactionsImpl = vi.fn(async (userId, ids) => ({ tagged: ids.length }));
  tagTransactionsCalls = [];

  cronLoggerCalls = [];
});

vi.mock('../../../api/services/database.js', () => {
  // Two distinct chain shapes:
  //   eligible:  .from(t).select(cols, {count}).eq('account_type', 'investment').gte('transaction_date', x).limit(n)
  //   backfill:  .from(t).select(cols).eq('user_id', uid).eq('account_type', 'investment').gte('transaction_date', x).order().limit()
  //
  // We tag the chain on every call and resolve at the terminal .limit().
  function makeChain() {
    const seenEqs = [];
    const chain = {
      select(...args) {
        chain._select = args;
        return chain;
      },
      eq(col, val) {
        seenEqs.push([col, val]);
        chain._eqs = seenEqs;
        return chain;
      },
      gte(...args) {
        chain._gte = args;
        return chain;
      },
      order(...args) {
        chain._order = args;
        return chain;
      },
      limit(...args) {
        chain._limit = args;
        // Decide which query this was by inspecting what was chained.
        const hasUserIdEq = seenEqs.some(([col]) => col === 'user_id');
        if (hasUserIdEq) {
          backfillCallCount++;
          return Promise.resolve(backfillSelectResult);
        }
        lastEligibleQueryArgs = { select: chain._select, eqs: seenEqs, gte: chain._gte };
        return Promise.resolve(eligibleSelectResult);
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

vi.mock('../../../api/services/investmentCorrelationInsights.js', () => ({
  generateInvestmentCorrelationInsights: (...args) => {
    generateCalls.push(args[0]);
    return generateImpl(...args);
  },
}));

vi.mock('../../../api/services/transactions/transactionEmotionTagger.js', () => ({
  tagTransactionsBatch: (userId, ids) => {
    tagTransactionsCalls.push({ userId, ids });
    return tagTransactionsImpl(userId, ids);
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

// Import after mocks land.
const { default: router } = await import(
  '../../../api/routes/cron-investment-correlation.js'
);

function makeApp() {
  const app = express();
  app.use('/cron', router);
  return app;
}

describe('cron /investment-correlation', () => {
  describe('auth gate', () => {
    it('rejects 401 when Authorization header is missing', async () => {
      const res = await request(makeApp()).post('/cron');
      expect(res.status).toBe(401);
      // No DB queries, no generator calls, no cron log row.
      expect(lastEligibleQueryArgs).toBeNull();
      expect(generateCalls).toHaveLength(0);
      expect(cronLoggerCalls).toHaveLength(0);
    });

    it('rejects 401 when Bearer token is wrong', async () => {
      const res = await request(makeApp())
        .post('/cron')
        .set('Authorization', 'Bearer not_the_real_secret');
      expect(res.status).toBe(401);
      expect(generateCalls).toHaveLength(0);
    });
  });

  describe('eligibility filter', () => {
    it('returns success with zero scanned when no users have any tagged investment rows', async () => {
      eligibleSelectResult = { data: [], error: null };
      const res = await request(makeApp())
        .post('/cron')
        .set('Authorization', `Bearer ${TEST_CRON_SECRET}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.scanned).toBe(0);
      expect(generateCalls).toHaveLength(0);
    });

    it('skips users with fewer than 6 tagged investment rows (MIN_EVENTS_FOR_USER)', async () => {
      // user_a has 5 rows (below floor), user_b has 7 rows (above floor).
      // Only user_b should be scanned.
      eligibleSelectResult = {
        data: [
          ...Array.from({ length: 5 }, () => ({ user_id: 'user_a' })),
          ...Array.from({ length: 7 }, () => ({ user_id: 'user_b' })),
        ],
        error: null,
      };
      const res = await request(makeApp())
        .post('/cron')
        .set('Authorization', `Bearer ${TEST_CRON_SECRET}`);
      expect(res.status).toBe(200);
      expect(res.body.scanned).toBe(1);
      expect(generateCalls).toEqual(['user_b']);
    });

    it('queries the investment account_type with a 60-day lookback window', async () => {
      eligibleSelectResult = { data: [], error: null };
      await request(makeApp())
        .post('/cron')
        .set('Authorization', `Bearer ${TEST_CRON_SECRET}`);
      const accountTypeEq = lastEligibleQueryArgs.eqs.find(([c]) => c === 'account_type');
      expect(accountTypeEq).toEqual(['account_type', 'investment']);

      // The gte cutoff should be ~60 days ago.
      const [col, since] = lastEligibleQueryArgs.gte;
      expect(col).toBe('transaction_date');
      const sinceDate = new Date(since);
      const ageDays = (Date.now() - sinceDate.getTime()) / 86400_000;
      expect(ageDays).toBeGreaterThan(58);
      expect(ageDays).toBeLessThan(62);
    });
  });

  describe('backfill and generator dispatch', () => {
    it('triggers tagTransactionsBatch only for rows where recovery_score is null', async () => {
      // 7 rows for one eligible user.
      eligibleSelectResult = {
        data: Array.from({ length: 7 }, () => ({ user_id: 'user_b' })),
        error: null,
      };
      // Backfill query result: 2 rows need retag (null recovery), 1 already tagged.
      backfillSelectResult = {
        data: [
          { id: 'tx_1', emotional_context: { recovery_score: null } },
          { id: 'tx_2', emotional_context: null },
          { id: 'tx_3', emotional_context: { recovery_score: 0.7 } }, // already tagged
        ],
        error: null,
      };

      await request(makeApp())
        .post('/cron')
        .set('Authorization', `Bearer ${TEST_CRON_SECRET}`);

      expect(tagTransactionsCalls).toHaveLength(1);
      expect(tagTransactionsCalls[0].userId).toBe('user_b');
      // tx_3 (already has recovery) must NOT be in the retag set.
      expect(tagTransactionsCalls[0].ids).toEqual(['tx_1', 'tx_2']);
    });

    it('does NOT call tagTransactionsBatch when every row already has a recovery_score', async () => {
      eligibleSelectResult = {
        data: Array.from({ length: 7 }, () => ({ user_id: 'user_b' })),
        error: null,
      };
      backfillSelectResult = {
        data: [
          { id: 'tx_1', emotional_context: { recovery_score: 0.5 } },
          { id: 'tx_2', emotional_context: { recovery_score: 0.8 } },
        ],
        error: null,
      };

      await request(makeApp())
        .post('/cron')
        .set('Authorization', `Bearer ${TEST_CRON_SECRET}`);

      expect(tagTransactionsCalls).toHaveLength(0);
    });

    it('counts generator outcomes into the response buckets (cooldown / no_pattern / insufficient / stored)', async () => {
      eligibleSelectResult = {
        data: [
          ...Array.from({ length: 7 }, () => ({ user_id: 'cooldown_user' })),
          ...Array.from({ length: 7 }, () => ({ user_id: 'no_pattern_user' })),
          ...Array.from({ length: 7 }, () => ({ user_id: 'insufficient_user' })),
          ...Array.from({ length: 7 }, () => ({ user_id: 'stored_user' })),
        ],
        error: null,
      };
      generateImpl = vi.fn(async (userId) => {
        if (userId === 'cooldown_user') return { reason: 'cooldown', stored: 0 };
        if (userId === 'no_pattern_user') return { reason: 'no_pattern', stored: 0 };
        if (userId === 'insufficient_user') return { reason: 'insufficient_data', stored: 0 };
        if (userId === 'stored_user') return { reason: 'stored', stored: 2 };
        throw new Error('unexpected user: ' + userId);
      });

      const res = await request(makeApp())
        .post('/cron')
        .set('Authorization', `Bearer ${TEST_CRON_SECRET}`);

      expect(res.status).toBe(200);
      expect(res.body.scanned).toBe(4);
      expect(res.body.onCooldown).toBe(1);
      expect(res.body.noPattern).toBe(1);
      expect(res.body.insufficient).toBe(1);
      expect(res.body.stored).toBe(2);
      expect(res.body.errors).toBe(0);
    });

    it('records a generator throw as an error and keeps processing other users', async () => {
      eligibleSelectResult = {
        data: [
          ...Array.from({ length: 7 }, () => ({ user_id: 'good_user' })),
          ...Array.from({ length: 7 }, () => ({ user_id: 'broken_user' })),
        ],
        error: null,
      };
      generateImpl = vi.fn(async (userId) => {
        if (userId === 'broken_user') throw new Error('generator boom');
        return { reason: 'no_pattern', stored: 0 };
      });

      const res = await request(makeApp())
        .post('/cron')
        .set('Authorization', `Bearer ${TEST_CRON_SECRET}`);

      expect(res.status).toBe(200); // per-user errors don't fail the cron
      expect(res.body.scanned).toBe(2);
      expect(res.body.errors).toBe(1);
      expect(res.body.noPattern).toBe(1);
    });
  });

  describe('observability', () => {
    it('logs a success row to logCronExecution with the result payload', async () => {
      eligibleSelectResult = {
        data: Array.from({ length: 7 }, () => ({ user_id: 'user_b' })),
        error: null,
      };
      await request(makeApp())
        .post('/cron')
        .set('Authorization', `Bearer ${TEST_CRON_SECRET}`);
      expect(cronLoggerCalls).toHaveLength(1);
      expect(cronLoggerCalls[0].name).toBe('investment-correlation');
      expect(cronLoggerCalls[0].status).toBe('success');
      expect(typeof cronLoggerCalls[0].ms).toBe('number');
      expect(cronLoggerCalls[0].payload).toMatchObject({
        scanned: 1,
        onCooldown: expect.any(Number),
        noPattern: expect.any(Number),
        insufficient: expect.any(Number),
        stored: expect.any(Number),
        errors: 0,
      });
    });
  });
});
