/**
 * Tests for api/routes/system-health.js — detailed health must not hang.
 *
 * Contract under test (2026-07-03 backend-cost audit):
 *  - The three detail probes (memory count, ingestion last-run, LLM calls)
 *    run in PARALLEL, not serially.
 *  - Each probe has a timeout (HEALTH_PROBE_TIMEOUT_MS, default 2s); a slow
 *    or hanging probe yields partial status instead of blocking the response.
 *  - The connectivity gate itself is also timeout-guarded (hanging DB → 503,
 *    not a hung request).
 *
 * The route keeps a 30s in-memory health cache, so each test re-imports a
 * fresh module via vi.resetModules().
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'test-secret';
process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';
process.env.ENCRYPTION_KEY = '0'.repeat(64);
process.env.NODE_ENV = 'test';
process.env.HEALTH_PROBE_TIMEOUT_MS = '150';
delete process.env.SKIP_CRON_AUTH;
delete process.env.CRON_SECRET;

// ── Shared mock state (hoisted so the factories can close over it) ─────────
const state = vi.hoisted(() => ({
  behaviors: {},   // probeKey -> () => Promise<result>
  starts: {},      // probeKey -> first execution timestamp (ms)
}));

const DEFAULT_RESULTS = {
  ping: { data: [{ id: 'm1' }], error: null },
  memoryCount: { count: 42, error: null },
  ingestion: { data: { run_at: '2026-07-03T04:00:00Z', duration_ms: 1200 }, error: null },
  llmCount: { count: 7, error: null },
};

vi.mock('../../../api/services/database.js', () => ({
  supabaseAdmin: {
    from: (table) => {
      let countRequested = false;
      const probeKey = () => {
        if (table === 'user_memories') return countRequested ? 'memoryCount' : 'ping';
        if (table === 'ingestion_health_log') return 'ingestion';
        if (table === 'llm_usage_log') return 'llmCount';
        return table;
      };
      const exec = () => {
        const key = probeKey();
        if (state.starts[key] === undefined) state.starts[key] = Date.now();
        const behavior = state.behaviors[key];
        if (behavior) return behavior();
        return Promise.resolve(
          { ping: { data: [{ id: 'm1' }], error: null },
            memoryCount: { count: 42, error: null },
            ingestion: { data: { run_at: '2026-07-03T04:00:00Z', duration_ms: 1200 }, error: null },
            llmCount: { count: 7, error: null },
          }[key] ?? { data: null, error: null }
        );
      };
      const chain = {
        select: (_cols, opts) => { if (opts?.count) countRequested = true; return chain; },
        limit: () => chain,
        order: () => chain,
        gte: () => chain,
        single: () => exec(),
        then: (onFulfilled, onRejected) => exec().then(onFulfilled, onRejected),
      };
      return chain;
    },
  },
  serverDb: {},
}));

vi.mock('../../../api/services/llmGateway.js', () => ({
  getCircuitBreakerStatus: vi.fn(() => ({ state: 'closed' })),
  resetCircuitBreaker: vi.fn(() => ({ reset: true })),
}));

vi.mock('../../../api/services/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const signToken = () => jwt.sign({ id: 'health-checker' }, 'test-secret', { expiresIn: '1h' });

async function createApp() {
  // Fresh module each time — the route caches detailed health for 30s in memory.
  vi.resetModules();
  const routes = (await import('../../../api/routes/system-health.js')).default;
  const app = express();
  app.use('/api/system', routes);
  return app;
}

const delayed = (value, ms) =>
  () => new Promise((resolve) => setTimeout(() => resolve(value), ms));

describe('GET /api/system health (parallel probes with timeouts)', () => {
  beforeEach(() => {
    state.behaviors = {};
    state.starts = {};
  });

  it('returns basic health only for unauthenticated callers (no DB probes)', async () => {
    const app = await createApp();
    const res = await request(app).get('/api/system');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.database).toBeUndefined();
    expect(Object.keys(state.starts)).toHaveLength(0);
  });

  it('returns full detailed checks for authenticated callers', async () => {
    const app = await createApp();
    const res = await request(app)
      .get('/api/system')
      .set('Authorization', `Bearer ${signToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.database.connected).toBe(true);
    expect(res.body.memoryStreamCount).toBe(42);
    expect(res.body.llmCallsLastHour).toBe(7);
    expect(res.body.ingestionLastRun).toBeTruthy();
    expect(res.body.circuitBreaker).toEqual({ state: 'closed' });
  });

  it('runs the three detail probes in parallel, not serially', async () => {
    state.behaviors.memoryCount = delayed(DEFAULT_RESULTS.memoryCount, 80);
    state.behaviors.ingestion = delayed(DEFAULT_RESULTS.ingestion, 80);
    state.behaviors.llmCount = delayed(DEFAULT_RESULTS.llmCount, 80);

    const app = await createApp();
    const res = await request(app)
      .get('/api/system')
      .set('Authorization', `Bearer ${signToken()}`);

    expect(res.status).toBe(200);
    const starts = [state.starts.memoryCount, state.starts.ingestion, state.starts.llmCount];
    expect(starts.every((s) => typeof s === 'number')).toBe(true);
    const spread = Math.max(...starts) - Math.min(...starts);
    // Serial execution staggers starts by >= 80ms each; parallel starts land
    // in the same event-loop turn.
    expect(spread).toBeLessThan(60);
  });

  it('a hanging probe yields partial status instead of blocking the response', async () => {
    state.behaviors.memoryCount = () => new Promise(() => {}); // never resolves

    const app = await createApp();
    const res = await request(app)
      .get('/api/system')
      .set('Authorization', `Bearer ${signToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.database.connected).toBe(true);
    expect(res.body.memoryStreamCount).toBe(0); // default — probe timed out
    expect(res.body.llmCallsLastHour).toBe(7);  // other probes still reported
    expect(res.body.probeTimeouts).toContain('memoryStreamCount');
  }, 4000);

  it('a hanging connectivity check returns 503 unhealthy, not a hung request', async () => {
    state.behaviors.ping = () => new Promise(() => {}); // never resolves

    const app = await createApp();
    const res = await request(app)
      .get('/api/system')
      .set('Authorization', `Bearer ${signToken()}`);

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('unhealthy');
    expect(res.body.database.connected).toBe(false);
    expect(res.body.database.error).toMatch(/timed out/i);
  }, 4000);
});
