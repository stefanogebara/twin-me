/**
 * Tests for /api/cron/stripe-webhook-events-cleanup (audit C1 follow-up).
 *
 * The cron deletes Stripe webhook idempotency rows older than 30 days.
 * The handler itself is small but the failure modes matter:
 *
 *   - Without CRON_SECRET auth, any caller could trigger an unbounded
 *     DELETE on the idempotency table — kills replay protection.
 *   - The Supabase delete chain (.delete({count}).lt().select()) is
 *     fragile; a typo in column name silently deletes nothing.
 *   - A 500 from Supabase should not crash the cron framework.
 *
 * Strategy: spin up an express app with just this route mounted, mock
 * the supabase chain so we capture the column + cutoff date used, and
 * drive it with supertest.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const TEST_CRON_SECRET = 'test_cron_secret_abcdef';

process.env.NODE_ENV = 'test';
process.env.CRON_SECRET = TEST_CRON_SECRET;

// ── shared mock state ─────────────────────────────────────────────────────────
let lastQuery; // { table, ops: [...] } - records the supabase chain used
let supabaseResult; // { data, error } - what the chain resolves to

beforeEach(() => {
  lastQuery = null;
  supabaseResult = { data: [], error: null };
});

vi.mock('../../../api/services/database.js', () => {
  // Re-implement a thin chain that records every call and resolves to
  // whatever supabaseResult is set to by the active test.
  function makeChain(table) {
    const ops = [];
    lastQuery = { table, ops };
    const chain = {
      delete(...args) { ops.push(['delete', args]); return chain; },
      lt(...args) { ops.push(['lt', args]); return chain; },
      select(...args) { ops.push(['select', args]); return Promise.resolve(supabaseResult); },
    };
    return chain;
  }
  return {
    supabaseAdmin: {
      from: (table) => makeChain(table),
    },
  };
});

vi.mock('../../../api/services/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  }),
}));

// Import after mocks land.
const { default: router } = await import(
  '../../../api/routes/cron-stripe-webhook-events-cleanup.js'
);

function makeApp() {
  const app = express();
  app.use('/cron', router);
  return app;
}

describe('cron /stripe-webhook-events-cleanup', () => {
  it('rejects 401 when Authorization header is missing', async () => {
    const res = await request(makeApp()).post('/cron');
    expect(res.status).toBe(401);
    expect(lastQuery).toBeNull(); // never touched the DB
  });

  it('rejects 401 when Bearer token is wrong', async () => {
    const res = await request(makeApp())
      .post('/cron')
      .set('Authorization', 'Bearer not_the_secret');
    expect(res.status).toBe(401);
    expect(lastQuery).toBeNull();
  });

  it('accepts the x-vercel-cron-secret header form (Vercel native)', async () => {
    supabaseResult = { data: [{ event_id: 'evt_old_1' }], error: null };
    const res = await request(makeApp())
      .post('/cron')
      .set('x-vercel-cron-secret', TEST_CRON_SECRET);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('targets the stripe_webhook_events table with a 30-day cutoff on received_at', async () => {
    supabaseResult = { data: [{ event_id: 'evt_a' }, { event_id: 'evt_b' }], error: null };

    const res = await request(makeApp())
      .post('/cron')
      .set('Authorization', `Bearer ${TEST_CRON_SECRET}`);

    expect(res.status).toBe(200);
    expect(lastQuery.table).toBe('stripe_webhook_events');

    // .delete({ count: 'exact' })
    const deleteOp = lastQuery.ops.find(([op]) => op === 'delete');
    expect(deleteOp).toBeDefined();
    expect(deleteOp[1][0]).toEqual({ count: 'exact' });

    // .lt('received_at', <iso30daysAgo>)
    const ltOp = lastQuery.ops.find(([op]) => op === 'lt');
    expect(ltOp).toBeDefined();
    expect(ltOp[1][0]).toBe('received_at');
    const cutoffIso = ltOp[1][1];
    const cutoff = new Date(cutoffIso);
    const ageDays = (Date.now() - cutoff.getTime()) / 86400_000;
    // Allow generous slack so CI clock skew doesn't flake. The constant is
    // 30 days; we just want to assert it's clearly in the "weeks" range
    // and not e.g. 30 minutes or 30 hours.
    expect(ageDays).toBeGreaterThan(29);
    expect(ageDays).toBeLessThan(31);
  });

  it('reports the number of deleted rows in the response body', async () => {
    supabaseResult = {
      data: [{ event_id: 'evt_a' }, { event_id: 'evt_b' }, { event_id: 'evt_c' }],
      error: null,
    };
    const res = await request(makeApp())
      .post('/cron')
      .set('Authorization', `Bearer ${TEST_CRON_SECRET}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.deleted).toBe(3);
    expect(res.body.retentionDays).toBe(30);
    expect(typeof res.body.durationMs).toBe('number');
  });

  it('returns success with deleted=0 when no rows were old enough', async () => {
    supabaseResult = { data: [], error: null };
    const res = await request(makeApp())
      .post('/cron')
      .set('Authorization', `Bearer ${TEST_CRON_SECRET}`);
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(0);
  });

  it('returns 500 with a generic error body when Supabase delete fails', async () => {
    supabaseResult = {
      data: null,
      error: { code: '42P01', message: 'relation "stripe_webhook_events" does not exist' },
    };
    const res = await request(makeApp())
      .post('/cron')
      .set('Authorization', `Bearer ${TEST_CRON_SECRET}`);
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    // Don't leak the underlying DB error verbatim to the caller — that
    // would broadcast the table name + driver code to a public endpoint.
    expect(res.body.error).not.toContain('relation');
    expect(res.body.error).toBe('cleanup failed');
  });
});
