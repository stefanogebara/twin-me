/**
 * POST /api/chat/feedback — surviving thumbs endpoint
 * ====================================================
 * Regression for replan-2026-06-10 cycle 4 (DPO/fine-tuning stack deletion):
 * the chat feedback endpoint used to live in routes/finetuning.js (mounted at
 * both /api/finetuning and /api/chat) and auto-created DPO preference pairs
 * on thumbs-down. The router was deleted; the endpoint was extracted to
 * routes/chat-feedback.js WITHOUT the preference-pair branch.
 *
 * Contract pinned here:
 *  - valid rating (1 | -1) + messageContent -> 200, row in chat_message_feedback
 *  - invalid rating -> 400
 *  - missing messageContent -> 400
 *  - thumbs-down does NOT touch preference_pairs or twin_messages (the DPO
 *    branch is gone)
 *  - DB insert failure surfaces as a 500 with a user-visible error
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'test-secret-chat-feedback';
process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
process.env.ENCRYPTION_KEY = '0'.repeat(64);
process.env.NODE_ENV = 'test';

// Mutable test state (read by the mock via closure)
let insertShouldFail = false;
const recorded = { inserts: [], tablesTouched: [] }; // { table, payload }

vi.mock('../../../api/services/database.js', () => {
  const makeChain = (table) => {
    recorded.tablesTouched.push(table);
    const chain = {};
    chain.insert = vi.fn((payload) => {
      recorded.inserts.push({ table, payload });
      return chain;
    });
    for (const m of ['select', 'eq', 'neq', 'gte', 'order', 'limit', 'update', 'delete']) {
      chain[m] = vi.fn(() => chain);
    }
    chain.single = vi.fn(() => Promise.resolve(
      insertShouldFail
        ? { data: null, error: { message: 'insert failed' } }
        : { data: { id: 'fb-1' }, error: null }
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

const routes = (await import('../../../api/routes/chat-feedback.js')).default;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/chat', routes);
  return app;
}
const token = () => jwt.sign({ id: 'u1' }, 'test-secret-chat-feedback', { expiresIn: '1h' });

beforeEach(() => {
  insertShouldFail = false;
  recorded.inserts.length = 0;
  recorded.tablesTouched.length = 0;
});

describe('POST /api/chat/feedback', () => {
  it('records a thumbs-up into chat_message_feedback', async () => {
    const res = await request(makeApp())
      .post('/api/chat/feedback')
      .set('Authorization', `Bearer ${token()}`)
      .send({ rating: 1, messageContent: 'Great answer', userMessage: 'What did I listen to?' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.feedbackId).toBe('fb-1');

    const inserts = recorded.inserts.filter(i => i.table === 'chat_message_feedback');
    expect(inserts.length).toBe(1);
    expect(inserts[0].payload.rating).toBe(1);
    expect(inserts[0].payload.user_id).toBe('u1');
  });

  it('thumbs-down records feedback WITHOUT touching preference_pairs or twin_messages', async () => {
    const res = await request(makeApp())
      .post('/api/chat/feedback')
      .set('Authorization', `Bearer ${token()}`)
      .send({ rating: -1, messageContent: 'Not me at all', userMessage: 'hello', conversationId: 'c1' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // The whole point of the extraction: no DPO pair generation on thumbs-down.
    expect(recorded.tablesTouched).not.toContain('preference_pairs');
    expect(recorded.tablesTouched).not.toContain('twin_messages');
    expect('preferenceGenerated' in res.body).toBe(false);
  });

  it('rejects an invalid rating with 400', async () => {
    const res = await request(makeApp())
      .post('/api/chat/feedback')
      .set('Authorization', `Bearer ${token()}`)
      .send({ rating: 5, messageContent: 'x' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(recorded.inserts.length).toBe(0);
  });

  it('rejects missing messageContent with 400', async () => {
    const res = await request(makeApp())
      .post('/api/chat/feedback')
      .set('Authorization', `Bearer ${token()}`)
      .send({ rating: 1 });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('surfaces a DB insert failure as a 500 with a user-visible error', async () => {
    insertShouldFail = true;
    const res = await request(makeApp())
      .post('/api/chat/feedback')
      .set('Authorization', `Bearer ${token()}`)
      .send({ rating: 1, messageContent: 'x' });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Failed to save feedback');
  });
});
