/**
 * POST /api/insights/:id/feedback — thumbs semantics
 * ==================================================
 * Regression for replan-2026-06-10 Track A item 2: thumbs-down used to write
 * engaged=false, making an explicit rejection indistinguishable from an
 * insight the user never saw — and silently un-engaging a row the user HAD
 * engaged with. The negative signal was being destroyed at write time.
 *
 * Contract pinned here:
 *  - thumbs-up  -> engaged: true + metadata.feedback = 'up'
 *  - thumbs-down -> does NOT touch `engaged` at all (a previously-engaged row
 *    stays engaged); the rejection is recorded as metadata.feedback = 'down'
 *  - existing metadata keys survive the feedback merge
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'test-secret-feedback';
process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
process.env.ENCRYPTION_KEY = '0'.repeat(64);
process.env.NODE_ENV = 'test';

// Mutable test state (read by the mock via closure)
let insightRow = {
  id: 'ins-1',
  user_id: 'u1',
  category: 'trend',
  insight: 'Your deep-focus blocks doubled this week',
  metadata: null,
};
const recorded = { updates: [] }; // { table, payload } per .update() call

vi.mock('../../../api/services/database.js', () => {
  const makeChain = (table) => {
    const chain = {};
    chain.update = vi.fn((payload) => {
      recorded.updates.push({ table, payload });
      return chain;
    });
    for (const m of ['select', 'eq', 'neq', 'gte', 'order', 'limit', 'is', 'in', 'insert', 'delete']) {
      chain[m] = vi.fn(() => chain);
    }
    chain.single = vi.fn(() => Promise.resolve(
      table === 'proactive_insights'
        ? { data: insightRow, error: null }
        : { data: null, error: null }
    ));
    chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
    chain.then = (resolve) => resolve({ data: null, error: null });
    return chain;
  };
  return {
    supabaseAdmin: { from: vi.fn((t) => makeChain(t)), rpc: vi.fn().mockResolvedValue({ data: 0, error: null }) },
    serverDb: { from: vi.fn((t) => makeChain(t)) },
  };
});

vi.mock('../../../api/services/autonomyService.js', () => ({
  logAgentAction: vi.fn().mockResolvedValue({ id: 'action-1' }),
}));

vi.mock('../../../api/services/finetuning/preferenceCollector.js', () => ({
  collectFromActionFeedback: vi.fn().mockResolvedValue(undefined),
}));

const routes = (await import('../../../api/routes/insight-feedback.js')).default;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/insights', routes);
  return app;
}
const token = () => jwt.sign({ id: 'u1' }, 'test-secret-feedback', { expiresIn: '1h' });

const insightUpdates = () => recorded.updates.filter(u => u.table === 'proactive_insights');

beforeEach(() => {
  vi.clearAllMocks();
  insightRow = {
    id: 'ins-1',
    user_id: 'u1',
    category: 'trend',
    insight: 'Your deep-focus blocks doubled this week',
    metadata: null,
  };
  recorded.updates.length = 0;
});

describe('POST /api/insights/:id/feedback — thumbs semantics', () => {
  it('thumbs-up sets engaged=true and records metadata.feedback=up', async () => {
    const res = await request(makeApp())
      .post('/api/insights/ins-1/feedback')
      .set('Authorization', `Bearer ${token()}`)
      .send({ rating: 1 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const updates = insightUpdates();
    expect(updates.length).toBe(1);
    expect(updates[0].payload.engaged).toBe(true);
    expect(updates[0].payload.metadata?.feedback).toBe('up');
  });

  it('thumbs-down does NOT touch engaged and records metadata.feedback=down', async () => {
    const res = await request(makeApp())
      .post('/api/insights/ins-1/feedback')
      .set('Authorization', `Bearer ${token()}`)
      .send({ rating: -1 });

    expect(res.status).toBe(200);

    const updates = insightUpdates();
    expect(updates.length).toBe(1);
    // The whole bug: engaged=false made rejection look like never-seen and
    // wiped engagement off rows the user HAD tapped. Thumbs-down must not
    // write the column at all.
    expect('engaged' in updates[0].payload).toBe(false);
    expect(updates[0].payload.metadata?.feedback).toBe('down');
  });

  it('feedback merge preserves existing metadata keys', async () => {
    insightRow = { ...insightRow, metadata: { email_count: 12 } };

    await request(makeApp())
      .post('/api/insights/ins-1/feedback')
      .set('Authorization', `Bearer ${token()}`)
      .send({ rating: -1 });

    const updates = insightUpdates();
    expect(updates[0].payload.metadata).toMatchObject({ email_count: 12, feedback: 'down' });
  });
});
