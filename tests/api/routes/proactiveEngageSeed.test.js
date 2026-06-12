/**
 * POST /api/insights/proactive/:id/engage — pattern seeding
 * =========================================================
 * Regression for replan-2026-06-10 Track A item 1: the engage handler selected
 * `content, category` from proactive_insights, but the column is named
 * `insight`. The query errored on EVERY call, the error vanished into an empty
 * .catch, and twin_patterns stayed empty forever — the single loop-closing
 * write of the learning system was silently dead for months.
 *
 * Contract pinned here:
 *  - engage returns 200 and marks the insight engaged
 *  - the seed reads the REAL column (`insight`) and creates a twin_patterns
 *    topic_affinity row carrying the insight text + category
 *  - a failed seed lookup never breaks the 200 response or inserts garbage
 *
 * The DB mock emulates PostgREST column checking: selecting the nonexistent
 * `content` column errors (42703) exactly like the live DB did.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'test-secret-engage';
process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
process.env.ENCRYPTION_KEY = '0'.repeat(64);
process.env.NODE_ENV = 'test';

// Mutable test state (read by the mock via closure)
let insightRow = { insight: 'You ship more code on days you start with ambient playlists', category: 'trend' };
let insightSelectError = null; // force the seed lookup to fail
const recorded = { insightSelects: [], twinPatternInserts: [] };

vi.mock('../../../api/services/database.js', () => {
  const makeChain = (table) => {
    const state = { selectCols: null, insertPayload: null };
    const chain = {};
    chain.select = vi.fn((cols) => { state.selectCols = cols; return chain; });
    chain.insert = vi.fn((payload) => { state.insertPayload = payload; return chain; });
    for (const m of ['eq', 'gte', 'order', 'limit', 'is', 'in', 'update', 'delete']) {
      chain[m] = vi.fn(() => chain);
    }
    chain.single = vi.fn(() => {
      if (table === 'twin_patterns' && state.insertPayload) {
        recorded.twinPatternInserts.push(state.insertPayload);
        return Promise.resolve({ data: { id: 'pat-1' }, error: null });
      }
      if (table === 'proactive_insights') {
        recorded.insightSelects.push(state.selectCols);
        if (insightSelectError) {
          return Promise.resolve({ data: null, error: insightSelectError });
        }
        // Emulate PostgREST: requesting a column that does not exist errors.
        // proactive_insights has `insight`, NOT `content` — the live bug.
        if (/\bcontent\b/.test(state.selectCols || '')) {
          return Promise.resolve({
            data: null,
            error: { code: '42703', message: 'column proactive_insights.content does not exist' },
          });
        }
        return Promise.resolve({ data: insightRow, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
    chain.maybeSingle = chain.single;
    chain.then = (resolve) => resolve({ data: [], error: null });
    return chain;
  };
  return {
    supabaseAdmin: { from: vi.fn((t) => makeChain(t)), rpc: vi.fn().mockResolvedValue({ data: 0, error: null }) },
    serverDb: { from: vi.fn((t) => makeChain(t)) },
  };
});

vi.mock('../../../api/services/platformReflectionService.js', () => ({
  default: {
    hasFreshReflection: vi.fn(async () => false),
    getReflections: vi.fn(async () => ({ success: true, reflection: { text: 'x' } })),
    refreshReflection: vi.fn(async () => ({ success: true })),
  },
}));

const routes = (await import('../../../api/routes/platform-insights.js')).default;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/insights', routes);
  return app;
}
const token = () => jwt.sign({ id: 'u1' }, 'test-secret-engage', { expiresIn: '1h' });

beforeEach(() => {
  vi.clearAllMocks();
  insightRow = { insight: 'You ship more code on days you start with ambient playlists', category: 'trend' };
  insightSelectError = null;
  recorded.insightSelects.length = 0;
  recorded.twinPatternInserts.length = 0;
});

describe('POST /api/insights/proactive/:id/engage — twin_patterns seeding', () => {
  it('creates a twin_patterns topic_affinity row from the engaged insight', async () => {
    const res = await request(makeApp())
      .post('/api/insights/proactive/ins-1/engage')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Seed is fire-and-forget after res.json — wait for the async write.
    await vi.waitFor(() => {
      expect(recorded.twinPatternInserts.length).toBe(1);
    });

    const row = recorded.twinPatternInserts[0];
    expect(row.user_id).toBe('u1');
    expect(row.pattern_type).toBe('topic_affinity');
    expect(row.name).toBe('trend'); // insight category becomes the pattern name
    expect(row.description).toBe(insightRow.insight); // real column, not `content`
  });

  it('falls back to a generic pattern name when the insight has no category', async () => {
    insightRow = { insight: 'Late-night Spotify sessions precede your most productive mornings', category: null };

    const res = await request(makeApp())
      .post('/api/insights/proactive/ins-2/engage')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
    await vi.waitFor(() => {
      expect(recorded.twinPatternInserts.length).toBe(1);
    });
    expect(recorded.twinPatternInserts[0].name).toBe('engaged_insight');
  });

  it('a failed seed lookup never breaks the 200 response and inserts nothing', async () => {
    insightSelectError = { code: 'XX000', message: 'connection reset' };

    const res = await request(makeApp())
      .post('/api/insights/proactive/ins-3/engage')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Give the fire-and-forget chain a tick to settle, then assert no insert.
    await new Promise((r) => setImmediate(r));
    expect(recorded.insightSelects.length).toBe(1);
    expect(recorded.twinPatternInserts.length).toBe(0);
  });
});
