/**
 * Platform Insights — Cold-start / generating behavior
 * ====================================================
 * Regression for the 2026-06-06 audit bug: a cold insights load blocked ~20s
 * on LLM generation, hit the route's timeout, and returned a `fallback` shape
 * the frontend rendered as a misleading "Connect <platform>" empty state — even
 * though the platform was connected.
 *
 * New contract for GET /api/insights/:platform:
 *  - connected + NO fresh cache  -> respond immediately with { generating: true }
 *    and spawn exactly ONE background generation (lock prevents poll-storms from
 *    spawning duplicate LLM calls).
 *  - connected + fresh cache     -> return the real reflection (warm path).
 *  - not connected               -> { notConnected: true } (unchanged).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'test-secret-cold';
process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
process.env.ENCRYPTION_KEY = '0'.repeat(64);
process.env.NODE_ENV = 'test';

// Mutable test state (read by the mocks via closure)
let connectionRow = { id: 'conn-1' };          // platform_connections row (null = not connected)
let freshCache = false;                          // hasFreshReflection() return value
let getReflectionsImpl = () => Promise.resolve({ success: true, reflection: { text: 'x' } });
let refreshImpl = () => Promise.resolve({ success: true });

vi.mock('../../../api/services/database.js', () => {
  const makeChain = () => {
    const chain = {};
    for (const m of ['select', 'eq', 'gte', 'order', 'limit', 'is', 'update', 'insert']) {
      chain[m] = vi.fn(() => chain);
    }
    // Connection pre-check uses .single(); PGRST116 == no row found.
    chain.single = vi.fn(() =>
      Promise.resolve({ data: connectionRow, error: connectionRow ? null : { code: 'PGRST116' } })
    );
    chain.maybeSingle = vi.fn(() => Promise.resolve({ data: connectionRow, error: null }));
    chain.then = (resolve) => resolve({ data: [], error: null });
    return chain;
  };
  return {
    supabaseAdmin: { from: vi.fn(() => makeChain()), rpc: vi.fn().mockResolvedValue({ data: 0, error: null }) },
    serverDb: { from: vi.fn(() => makeChain()) },
  };
});

vi.mock('../../../api/services/platformReflectionService.js', () => ({
  default: {
    hasFreshReflection: vi.fn(async () => freshCache),
    getReflections: vi.fn((...args) => getReflectionsImpl(...args)),
    refreshReflection: vi.fn((...args) => refreshImpl(...args)),
  },
}));

vi.mock('../../../api/services/twinPatternService.js', () => ({
  seedPatternFromInsight: vi.fn().mockResolvedValue(undefined),
}));

const platformReflectionService = (await import('../../../api/services/platformReflectionService.js')).default;
const routes = (await import('../../../api/routes/platform-insights.js')).default;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/insights', routes);
  return app;
}
const token = () => jwt.sign({ id: 'u1' }, 'test-secret-cold', { expiresIn: '1h' });

beforeEach(() => {
  vi.clearAllMocks();
  connectionRow = { id: 'conn-1' };
  freshCache = false;
  getReflectionsImpl = () => Promise.resolve({ success: true, reflection: { text: 'x' } });
  refreshImpl = () => Promise.resolve({ success: true });
});

describe('GET /api/insights/:platform — cold-start generating behavior', () => {
  it('connected + cold cache + slow LLM -> returns generating:true (not a fallback/empty state)', async () => {
    freshCache = false;
    getReflectionsImpl = () => new Promise(() => {}); // slow LLM: never settles within the peek
    const res = await request(makeApp())
      .get('/api/insights/spotify')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.generating).toBe(true);
    expect(res.body.notConnected).toBeUndefined();
    expect(res.body.fallback).toBeUndefined();
    // Exactly one background generation spawned.
    expect(platformReflectionService.getReflections).toHaveBeenCalledTimes(1);
  }, 15000);

  it('connected + cold cache + no platform data -> returns empty-state fallback immediately (no endless spinner)', async () => {
    // audit-2026-06-10: this test used 'web' as an arbitrary stand-in platform,
    // but web now short-circuits on extension-data presence before the
    // cold-generation race (see the dedicated web test below). Use a real
    // OAuth platform to keep pinning the cold-start no-data contract — but NOT
    // 'spotify': the slow-LLM test above leaves the module-level generation
    // lock held for u1:spotify, which would short-circuit this request to
    // generating:true.
    freshCache = false;
    getReflectionsImpl = () => Promise.resolve({ success: false, error: 'No discord data available' });
    const res = await request(makeApp())
      .get('/api/insights/discord')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.generating).toBeUndefined();
    expect(res.body.fallback).toBe(true);
  });

  it('web + no extension data -> hasExtensionData:false immediately (no generation spawned)', async () => {
    // audit-2026-06-10: no OAuth flow ever creates a platform_connections row
    // for 'web' — the page is driven by actual extension data presence. With
    // zero user_platform_data web rows (the mock chain resolves data: []),
    // the route must short-circuit to the extension-install CTA signal
    // without entering the cold-generation race.
    freshCache = false;
    const res = await request(makeApp())
      .get('/api/insights/web')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.hasExtensionData).toBe(false);
    expect(res.body.generating).toBeUndefined();
    expect(res.body.fallback).toBeUndefined();
    expect(platformReflectionService.getReflections).not.toHaveBeenCalled();
  });

  it('connected + cold cache + fast generation -> returns the real reflection inline', async () => {
    freshCache = false;
    getReflectionsImpl = () => Promise.resolve({ success: true, reflection: { text: 'fresh fast reflection' } });
    const res = await request(makeApp())
      .get('/api/insights/youtube')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
    expect(res.body.generating).toBeUndefined();
    expect(res.body.reflection).toEqual({ text: 'fresh fast reflection' });
  });

  it('not connected -> returns notConnected:true and does NOT generate', async () => {
    connectionRow = null; // PGRST116
    const res = await request(makeApp())
      .get('/api/insights/youtube')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
    expect(res.body.notConnected).toBe(true);
    expect(platformReflectionService.getReflections).not.toHaveBeenCalled();
  });

  it('connected + fresh cache -> returns the real reflection (warm path)', async () => {
    freshCache = true;
    getReflectionsImpl = () => Promise.resolve({ success: true, reflection: { text: 'warm reflection' } });
    const res = await request(makeApp())
      .get('/api/insights/calendar')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.generating).toBeUndefined();
    expect(res.body.reflection).toEqual({ text: 'warm reflection' });
  });

  it('concurrent cold requests spawn only ONE background generation (poll-storm lock)', async () => {
    freshCache = false;
    getReflectionsImpl = () => new Promise(() => {}); // never resolves: simulates slow LLM still running
    const app = makeApp();
    const reqs = [0, 1, 2].map(() =>
      request(app).get('/api/insights/discord').set('Authorization', `Bearer ${token()}`)
    );
    const results = await Promise.all(reqs);
    for (const res of results) {
      expect(res.status).toBe(200);
      expect(res.body.generating).toBe(true);
    }
    expect(platformReflectionService.getReflections).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/insights/:platform/refresh — non-blocking regeneration', () => {
  it('returns regenerating:true immediately and spawns the refresh in the background', async () => {
    const res = await request(makeApp())
      .post('/api/insights/web/refresh')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.regenerating).toBe(true);
    expect(platformReflectionService.refreshReflection).toHaveBeenCalledTimes(1);
  });

  it('does not block: a slow refresh still responds fast and is not double-spawned', async () => {
    // 'calendar' (not 'linkedin'): linkedin was dropped from VALID_PLATFORMS in
    // the replan-2026-06-10 Track C portfolio cut. The generation lock map is
    // module-level and keyed `${userId}:${platform}`, so this test needs a
    // platform whose lock is not still held by an earlier never-resolving test
    // (spotify/discord) — calendar only runs the warm path above and never locks.
    refreshImpl = () => new Promise(() => {}); // never resolves: simulates slow LLM
    const app = makeApp();
    const r1 = await request(app).post('/api/insights/calendar/refresh').set('Authorization', `Bearer ${token()}`);
    const r2 = await request(app).post('/api/insights/calendar/refresh').set('Authorization', `Bearer ${token()}`);

    expect(r1.status).toBe(200);
    expect(r1.body.regenerating).toBe(true);
    expect(r2.body.regenerating).toBe(true);
    expect(r2.body.alreadyRunning).toBe(true); // lock held by r1
    expect(platformReflectionService.refreshReflection).toHaveBeenCalledTimes(1);
  });
});
