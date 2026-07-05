/**
 * GET /api/dashboard/context/heatmap — error envelope consistency
 * ===============================================================
 * audit-2026-07-03 (MEDIUM): the RPC-error branch returned 500
 * { success:false, error:'heatmap_unavailable' } (fixed in audit-2026-05-25
 * M4), but the outer catch still returned HTTP 200 with an empty heatmap —
 * so a thrown failure (cache blowup, rpc rejection) masqueraded as
 * "user has no memories". Both failure paths must now return 500 so the
 * frontend can distinguish "empty" from "unavailable".
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'test-secret-heatmap';
process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
process.env.ENCRYPTION_KEY = '0'.repeat(64);
process.env.NODE_ENV = 'test';

// Mutable per-test behavior for the heatmap RPC
let rpcBehavior = () => Promise.resolve({ data: [], error: null });

vi.mock('../../../api/services/database.js', () => {
  const makeChain = () => {
    const chain = {};
    for (const m of ['select', 'insert', 'update', 'delete', 'eq', 'gte', 'lte', 'in', 'is', 'not', 'or', 'order', 'limit', 'range']) {
      chain[m] = vi.fn(() => chain);
    }
    chain.single = vi.fn(() => Promise.resolve({ data: null, error: null }));
    chain.maybeSingle = chain.single;
    chain.then = (resolve) => resolve({ data: [], error: null });
    return chain;
  };
  return {
    supabaseAdmin: {
      from: vi.fn(() => makeChain()),
      rpc: vi.fn((...args) => rpcBehavior(...args)),
    },
  };
});

// Cache always misses; set is a no-op promise (the route .catch()es it).
vi.mock('../../../api/services/redisClient.js', () => ({
  get: vi.fn(async () => null),
  set: vi.fn(async () => true),
  del: vi.fn(async () => true),
  getRedisClient: vi.fn(() => null),
  isRedisAvailable: vi.fn(() => false),
  getCacheStats: vi.fn(async () => ({ available: false })),
  CACHE_TTL: { DASHBOARD_CONTEXT: 120 },
  CACHE_KEYS: { DASHBOARD_CONTEXT: (id) => `dashboard:${id}` },
}));

vi.mock('../../../api/services/memoryStreamService.js', () => ({
  getTwinReadinessScore: vi.fn(async () => ({ score: 0, total: 0 })),
}));

vi.mock('../../../api/services/tokenRefreshService.js', () => ({
  getValidAccessToken: vi.fn(async () => ({ success: false })),
}));

const routes = (await import('../../../api/routes/dashboard-context.js')).default;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/dashboard/context', routes);
  return app;
}
const token = () => jwt.sign({ id: 'u1' }, 'test-secret-heatmap', { expiresIn: '1h' });

beforeEach(() => {
  vi.clearAllMocks();
  rpcBehavior = () => Promise.resolve({ data: [], error: null });
});

// Generous timeout: the suite's parallel workers contend heavily on CPU during
// the import phase on Windows, and the default 5s flakes under full-suite load.
describe('GET /api/dashboard/context/heatmap — failure envelopes', { timeout: 20000 }, () => {
  it('returns 200 with heatmap data on success', async () => {
    const rows = [{ day: '2026-07-01', count: 4 }];
    rpcBehavior = () => Promise.resolve({ data: rows, error: null });

    const res = await request(makeApp())
      .get('/api/dashboard/context/heatmap')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, heatmap: rows });
  });

  it('returns 500 heatmap_unavailable when the RPC resolves with an error', async () => {
    rpcBehavior = () => Promise.resolve({ data: null, error: { message: 'function does not exist' } });

    const res = await request(makeApp())
      .get('/api/dashboard/context/heatmap')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: 'heatmap_unavailable' });
  });

  it('returns 500 heatmap_unavailable when the RPC throws (was HTTP 200 + empty array)', async () => {
    rpcBehavior = () => Promise.reject(new Error('connection reset'));

    const res = await request(makeApp())
      .get('/api/dashboard/context/heatmap')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: 'heatmap_unavailable' });
  });
});
