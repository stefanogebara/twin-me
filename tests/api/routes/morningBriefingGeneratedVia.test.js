/**
 * GET /api/morning-briefing/generate — generated_via degraded-mode marker
 * =======================================================================
 * audit-2026-07-03 (MEDIUM): when the LLM composition failed, the endpoint
 * silently served the canned structured fallback with no signal — the
 * frontend rendered service-desk boilerplate as if it were the twin's voice.
 * The briefing now carries generated_via: 'llm' | 'fallback' | 'no_data'
 * so clients can render a degraded-mode hint. This pins that contract.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'test-secret-briefing';
process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
process.env.ENCRYPTION_KEY = '0'.repeat(64);
process.env.NODE_ENV = 'test';

// ── Mutable test state ──────────────────────────────────────────────────
// Rows returned for user_memories queries (calendar / sleep / music / voice
// samples all hit the same table; JS-side filters do the narrowing).
let memoryRows = [];
let llmBehavior = () => Promise.resolve({ content: '{}' });

vi.mock('../../../api/services/database.js', () => {
  const makeChain = (table) => {
    const chain = {};
    for (const m of ['select', 'insert', 'update', 'delete', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'is', 'not', 'or', 'ilike', 'order', 'limit', 'range']) {
      chain[m] = vi.fn(() => chain);
    }
    chain.single = vi.fn(() => {
      if (table === 'users') {
        return Promise.resolve({ data: { first_name: 'Stefano', timezone: 'UTC' }, error: null });
      }
      // proactive_insights cache lookup — always a cache miss
      return Promise.resolve({ data: null, error: null });
    });
    chain.maybeSingle = chain.single;
    chain.then = (resolve) => {
      if (table === 'user_memories') return resolve({ data: memoryRows, error: null });
      return resolve({ data: [], error: null });
    };
    return chain;
  };
  return {
    supabaseAdmin: { from: vi.fn((t) => makeChain(t)), rpc: vi.fn(async () => ({ data: null, error: null })) },
  };
});

const completeMock = vi.fn((...args) => llmBehavior(...args));
vi.mock('../../../api/services/llmGateway.js', () => ({
  complete: (...args) => completeMock(...args),
  TIER_ANALYSIS: 'analysis',
  TIER_EXTRACTION: 'extraction',
  TIER_CHAT: 'chat',
}));

vi.mock('../../../api/services/personalityProfileService.js', () => ({
  getProfile: vi.fn(async () => null),
}));

const routes = (await import('../../../api/routes/morning-briefing.js')).default;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/morning-briefing', routes);
  return app;
}
const token = () => jwt.sign({ id: 'u1' }, 'test-secret-briefing', { expiresIn: '1h' });

// A recent platform_data row that satisfies the fetchRecentMusic ilike filters
// (mock does not emulate SQL filters; JS-side length/dedup filters still run).
const musicRow = () => ({
  content: 'Listened to Radiohead on Spotify for two hours last night',
  metadata: {},
  created_at: new Date().toISOString(),
});

beforeEach(() => {
  vi.clearAllMocks();
  memoryRows = [];
  llmBehavior = () => Promise.resolve({ content: '{}' });
});

// Generous timeout: the suite's parallel workers contend heavily on CPU during
// the import phase on Windows, and the default 5s flakes under full-suite load.
describe('GET /api/morning-briefing/generate — generated_via contract', { timeout: 20000 }, () => {
  it("marks generated_via 'llm' when composition succeeds", async () => {
    memoryRows = [musicRow()];
    llmBehavior = () =>
      Promise.resolve({
        content: JSON.stringify({
          schedule_summary: 'Wide open day',
          patterns: ['You listen to music at night'],
          rest_summary: null,
          music_summary: 'Radiohead again',
          suggestion: 'Queue the album early',
        }),
      });

    const res = await request(makeApp())
      .get('/api/morning-briefing/generate')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.briefing.generated_via).toBe('llm');
    expect(res.body.briefing.music).toBe('Radiohead again');
    expect(completeMock).toHaveBeenCalledTimes(1);
  });

  it("marks generated_via 'fallback' when the LLM call throws (still 200)", async () => {
    memoryRows = [musicRow()];
    llmBehavior = () => Promise.reject(new Error('upstream 502'));

    const res = await request(makeApp())
      .get('/api/morning-briefing/generate')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.briefing.generated_via).toBe('fallback');
    // Canned copy is served, but now labeled as such.
    expect(res.body.briefing.greeting).toContain('Stefano');
  });

  it("marks generated_via 'no_data' and never calls the LLM when there is nothing to compose", async () => {
    memoryRows = [];

    const res = await request(makeApp())
      .get('/api/morning-briefing/generate')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
    expect(res.body.briefing.generated_via).toBe('no_data');
    expect(completeMock).not.toHaveBeenCalled();
  });
});
