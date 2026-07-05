/**
 * Tests for api/routes/inbox-summary.js — cache-first, non-blocking refresh.
 *
 * Contract under test (2026-07-03 backend-cost audit):
 *  - Cache HIT is served instantly and never touches Gmail or the LLM.
 *  - Cache MISS returns a cheap `pending: true` response immediately and kicks
 *    the expensive refresh (Gmail fetch + LLM categorization) in the background.
 *  - Concurrent misses trigger exactly ONE refresh (single-flight guard).
 *  - Gmail failures are cached briefly and surfaced as 400 on the next poll.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

process.env.JWT_SECRET = 'test-secret';
process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';
process.env.ENCRYPTION_KEY = '0'.repeat(64);
process.env.NODE_ENV = 'test';

// ── Mocks ────────────────────────────────────────────────────────────────

const getEmailsMock = vi.fn();
vi.mock('../../../api/services/googleWorkspaceActions.js', () => ({
  getEmails: (...a) => getEmailsMock(...a),
}));

const completeMock = vi.fn();
vi.mock('../../../api/services/llmGateway.js', () => ({
  complete: (...a) => completeMock(...a),
  TIER_EXTRACTION: 'extraction',
}));

// Map-backed cache stub (mirrors redisClient's JSON semantics: set stores the
// value as-is, get returns it as-is — the real client stringifies/parses).
const cacheStore = new Map();
vi.mock('../../../api/services/redisClient.js', () => ({
  get: vi.fn(async (key) => (cacheStore.has(key) ? cacheStore.get(key) : null)),
  set: vi.fn(async (key, value) => { cacheStore.set(key, value); }),
  del: vi.fn(async (key) => { cacheStore.delete(key); }),
  getRedisClient: vi.fn(() => null),
  isRedisAvailable: vi.fn(() => false),
}));

vi.mock('../../../api/services/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

// auth middleware looks up email verification
vi.mock('../../../api/services/database.js', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { email_verified: true, created_at: new Date().toISOString() },
        error: null,
      }),
    })),
  },
  serverDb: {},
}));

const inboxSummaryRoutes = (await import('../../../api/routes/inbox-summary.js')).default;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/inbox', inboxSummaryRoutes);
  return app;
}

// Fresh user per test so single-flight/cache state never bleeds between tests.
function newAuth() {
  const userId = crypto.randomUUID();
  const token = jwt.sign({ id: userId }, 'test-secret', { expiresIn: '1h' });
  return { userId, token };
}

const getSummary = (app, token) =>
  request(app).get('/api/inbox/summary').set('Authorization', `Bearer ${token}`);

const SAMPLE_EMAILS = [
  { from: 'boss@work.com', subject: 'Need your report', snippet: 'Can you send...', date: '2026-07-01' },
  { from: 'news@letter.com', subject: 'Weekly digest', snippet: 'This week in...', date: '2026-07-02' },
];

const LLM_CATEGORIES = JSON.stringify({
  categories: [
    { index: 1, category: 'needs_reply' },
    { index: 2, category: 'promotional' },
  ],
});

describe('GET /api/inbox/summary (cache-first, non-blocking refresh)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cacheStore.clear();
  });

  it('serves a cache hit without calling Gmail or the LLM', async () => {
    const { userId, token } = newAuth();
    cacheStore.set(`inbox_summary:${userId}`, {
      needsReply: [{ from: 'a@b.c', subject: 'hi', date: null }],
      fyi: [],
      promotional: 2,
      total: 3,
    });

    const res = await getSummary(createApp(), token);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.cached).toBe(true);
    expect(res.body.promotional).toBe(2);
    expect(res.body.total).toBe(3);
    expect(getEmailsMock).not.toHaveBeenCalled();
    expect(completeMock).not.toHaveBeenCalled();
  });

  it('still serves legacy double-stringified cache entries', async () => {
    const { userId, token } = newAuth();
    // Old code cached JSON.stringify(result); the wrapper stringified again.
    cacheStore.set(`inbox_summary:${userId}`, JSON.stringify({
      needsReply: [], fyi: [], promotional: 5, total: 5,
    }));

    const res = await getSummary(createApp(), token);

    expect(res.status).toBe(200);
    expect(res.body.promotional).toBe(5);
    expect(getEmailsMock).not.toHaveBeenCalled();
  });

  it('returns pending immediately on a cache miss instead of blocking on Gmail', async () => {
    const { token } = newAuth();
    // Gmail hangs forever — the GET must NOT wait for it.
    getEmailsMock.mockReturnValue(new Promise(() => {}));

    const res = await getSummary(createApp(), token);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.pending).toBe(true);
    expect(res.body.cached).toBe(false);
    expect(res.body.total).toBe(0);
    expect(Array.isArray(res.body.needsReply)).toBe(true);
    expect(Array.isArray(res.body.fyi)).toBe(true);
  }, 5000);

  it('background refresh populates the cache; next poll serves real data', async () => {
    const { userId, token } = newAuth();
    getEmailsMock.mockResolvedValue({ success: true, emails: SAMPLE_EMAILS });
    completeMock.mockResolvedValue({ content: LLM_CATEGORIES });
    const app = createApp();

    const first = await getSummary(app, token);
    expect(first.body.pending).toBe(true);

    await vi.waitFor(() => {
      const cached = cacheStore.get(`inbox_summary:${userId}`);
      expect(cached).toBeTruthy();
      expect(cached.unavailable).toBeUndefined();
    });

    const second = await getSummary(app, token);
    expect(second.status).toBe(200);
    expect(second.body.cached).toBe(true);
    expect(second.body.total).toBe(2);
    expect(second.body.needsReply).toHaveLength(1);
    expect(second.body.needsReply[0].from).toBe('boss@work.com');
    expect(second.body.promotional).toBe(1);
    expect(getEmailsMock).toHaveBeenCalledTimes(1);
    expect(completeMock).toHaveBeenCalledTimes(1);
  });

  it('concurrent cache misses trigger exactly one Gmail fetch and one LLM call (single-flight)', async () => {
    const { userId, token } = newAuth();
    getEmailsMock.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ success: true, emails: SAMPLE_EMAILS }), 30))
    );
    completeMock.mockResolvedValue({ content: LLM_CATEGORIES });
    const app = createApp();

    const responses = await Promise.all(
      Array.from({ length: 5 }, () => getSummary(app, token))
    );

    for (const res of responses) {
      expect(res.status).toBe(200);
      expect(res.body.pending).toBe(true);
    }

    await vi.waitFor(() => {
      expect(cacheStore.has(`inbox_summary:${userId}`)).toBe(true);
    });

    expect(getEmailsMock).toHaveBeenCalledTimes(1);
    expect(completeMock).toHaveBeenCalledTimes(1);
  });

  it('caches a Gmail failure briefly and surfaces it as 400 on the next poll', async () => {
    const { userId, token } = newAuth();
    getEmailsMock.mockResolvedValue({ success: false, error: 'Gmail not connected' });
    const app = createApp();

    const first = await getSummary(app, token);
    expect(first.body.pending).toBe(true);

    await vi.waitFor(() => {
      const cached = cacheStore.get(`inbox_summary:${userId}`);
      expect(cached?.unavailable).toBe(true);
    });

    const second = await getSummary(app, token);
    expect(second.status).toBe(400);
    expect(second.body.success).toBe(false);
    expect(second.body.error).toMatch(/Gmail not connected/);
    // The failure is served from cache — no second fetch attempt
    expect(getEmailsMock).toHaveBeenCalledTimes(1);
    expect(completeMock).not.toHaveBeenCalled();
  });

  it('caches an empty inbox without ever calling the LLM', async () => {
    const { userId, token } = newAuth();
    getEmailsMock.mockResolvedValue({ success: true, emails: [] });
    const app = createApp();

    await getSummary(app, token);

    await vi.waitFor(() => {
      expect(cacheStore.has(`inbox_summary:${userId}`)).toBe(true);
    });

    const second = await getSummary(app, token);
    expect(second.status).toBe(200);
    expect(second.body.total).toBe(0);
    expect(completeMock).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await request(createApp()).get('/api/inbox/summary');
    expect(res.status).toBe(401);
    expect(getEmailsMock).not.toHaveBeenCalled();
  });
});
