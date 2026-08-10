/**
 * GET /recent — server-side chat history bootstrap (Phase 2)
 * ==========================================================
 * product-truth-review 2026-08-09: for a product whose thesis is "Memory Is
 * Everything," the user's own conversation history lived in a 20-message
 * localStorage buffer that evaporated per browser. Every turn is already
 * persisted server-side (twin_messages); /recent returns the latest
 * conversation + its most recent messages in one round trip so the chat
 * page can boot from server truth.
 *
 * Pinned here:
 * - returns the newest conversation (by updated_at) with messages in
 *   chronological order, capped at `limit`, keeping the LATEST turns (the
 *   sibling /history endpoint truncates from the START of a conversation —
 *   /recent must not repeat that)
 * - a user with no conversations gets { conversationId: null, messages: [] }
 * - unauthenticated requests are rejected
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const TEST_USER = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';
const CONVO_ID = '9b2f1a34-0000-4000-8000-000000000001';

const state = { conversations: [], messages: [] };

function conversationChain() {
  const chain = {
    maybeSingle: vi.fn(() =>
      Promise.resolve({ data: state.conversations[0] ?? null, error: null }),
    ),
    single: vi.fn(() =>
      Promise.resolve(
        state.conversations.length > 0
          ? { data: state.conversations[0], error: null }
          : { data: null, error: { code: 'PGRST116' } },
      ),
    ),
  };
  for (const m of ['select', 'eq', 'order', 'limit']) chain[m] = vi.fn(() => chain);
  return chain;
}

function messagesChain() {
  // The route orders created_at DESC + limit; resolve with rows as the DB
  // would return them (newest first), honoring the limit arg.
  let capturedLimit = Infinity;
  const chain = {
    then: (resolve, reject) => {
      const sorted = [...state.messages].sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at),
      );
      return Promise.resolve({ data: sorted.slice(0, capturedLimit), error: null }).then(
        resolve,
        reject,
      );
    },
  };
  for (const m of ['select', 'eq', 'order']) chain[m] = vi.fn(() => chain);
  chain.limit = vi.fn((n) => {
    capturedLimit = n;
    return chain;
  });
  return chain;
}

vi.mock('../../../api/services/database.js', () => ({
  supabaseAdmin: {
    from: vi.fn((table) =>
      table === 'twin_conversations' ? conversationChain() : messagesChain(),
    ),
  },
  serverDb: {},
}));
vi.mock('../../../api/services/llmGateway.js', () => ({
  complete: vi.fn(),
  TIER_CHAT: 'chat',
}));
vi.mock('../../../api/services/memoryStreamService.js', () => ({
  getMemoryStats: vi.fn(),
}));
vi.mock('../../../api/services/twinSummaryService.js', () => ({
  getTwinSummary: vi.fn(),
}));
vi.mock('../../../api/services/twinSystemPromptBuilder.js', () => ({
  deduplicateByTheme: vi.fn((x) => x),
}));
vi.mock('../../../api/services/twinPromptAssembly.js', () => ({
  ANTI_EMOJI_RULE: '',
}));
vi.mock('../../../api/services/soulSignatureService.js', () => ({
  getSoulSignature: vi.fn(),
}));
vi.mock('../../../api/services/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const { default: routes } = await import('../../../api/routes/twin-conversations.js');

const app = express();
app.use('/api/chat', routes);

const token = () => jwt.sign({ id: TEST_USER }, process.env.JWT_SECRET);

function msg(id, role, content, createdAt) {
  return { id, role, content, created_at: createdAt };
}

beforeEach(() => {
  state.conversations = [{ id: CONVO_ID }];
  state.messages = [
    msg('m1', 'user', 'oldest', '2026-08-01T10:00:00Z'),
    msg('m2', 'assistant', 'old reply', '2026-08-01T10:00:05Z'),
    msg('m3', 'user', 'newest question', '2026-08-09T09:00:00Z'),
    msg('m4', 'assistant', 'newest reply', '2026-08-09T09:00:07Z'),
  ];
});

describe('GET /api/chat/recent', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/chat/recent');
    expect(res.status).toBe(401);
  });

  it('returns the latest conversation with messages in chronological order', async () => {
    const res = await request(app)
      .get('/api/chat/recent')
      .set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.conversationId).toBe(CONVO_ID);
    expect(res.body.messages.map((m) => m.content)).toEqual([
      'oldest',
      'old reply',
      'newest question',
      'newest reply',
    ]);
    expect(res.body.messages[0]).toMatchObject({ id: 'm1', isUser: true });
    expect(res.body.messages[1]).toMatchObject({ id: 'm2', isUser: false });
  });

  it('keeps the LATEST turns when limit truncates', async () => {
    const res = await request(app)
      .get('/api/chat/recent?limit=2')
      .set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(200);
    expect(res.body.messages.map((m) => m.content)).toEqual([
      'newest question',
      'newest reply',
    ]);
  });

  it('returns an empty payload for a user with no conversations', async () => {
    state.conversations = [];
    const res = await request(app)
      .get('/api/chat/recent')
      .set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, conversationId: null, messages: [] });
  });
});
