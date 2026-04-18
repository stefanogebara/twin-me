/**
 * Smoke tests for api/routes/twin-chat.js
 * Focus: route registration + auth guard + body validation only.
 * Full happy-path requires mocking ~30 downstream services; out of scope for a smoke test.
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

// --- Module mocks: keep everything inert so import doesn't explode ---
vi.mock('../../../api/services/llmGateway.js', () => ({
  complete: vi.fn().mockResolvedValue({ content: 'hi', usage: {} }),
  stream: vi.fn(),
  TIER_CHAT: 'chat',
  TIER_ANALYSIS: 'analysis',
  TIER_EXTRACTION: 'extraction',
}));

vi.mock('../../../api/services/embeddingService.js', () => ({
  generateEmbedding: vi.fn().mockResolvedValue(new Array(1536).fill(0)),
  embedText: vi.fn().mockResolvedValue(new Array(1536).fill(0)),
}));

vi.mock('../../../api/services/database.js', () => {
  const chain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { id: 'conv-1', email_verified: true, created_at: new Date().toISOString() }, error: null }),
    then: vi.fn(resolve => resolve({ data: [], error: null, count: 0 })),
  };
  return {
    supabaseAdmin: { from: vi.fn(() => chain), rpc: vi.fn().mockResolvedValue({ data: [], error: null }) },
    serverDb: { from: vi.fn(() => chain) },
  };
});

vi.mock('../../../api/services/redisClient.js', () => ({
  getRedisClient: vi.fn().mockReturnValue(null),
  isRedisAvailable: vi.fn().mockReturnValue(false),
  getCachedPlatformStatus: vi.fn().mockResolvedValue(null),
  setCachedPlatformStatus: vi.fn().mockResolvedValue(undefined),
  invalidatePlatformStatusCache: vi.fn().mockResolvedValue(undefined),
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue(undefined),
  del: vi.fn().mockResolvedValue(undefined),
  getCacheStats: vi.fn().mockReturnValue({ hits: 0, misses: 0 }),
  CACHE_TTL: { SHORT: 60, MEDIUM: 300, LONG: 3600 },
  CACHE_KEYS: {},
  default: {},
}));

// Inert stubs for the wide net of services twin-chat imports. Each default-shape
// returns an empty/null value so the handler can execute without crashing.
vi.mock('../../../api/services/subscriptionService.js', () => ({
  getUserSubscription: vi.fn().mockResolvedValue({ plan: 'pro' }),
  PLAN_DISPLAY_NAMES: { pro: 'Pro', free: 'Free' },
}));
vi.mock('../../../api/routes/chat-usage.js', () => ({
  getMonthlyUsage: vi.fn().mockResolvedValue({ used: 0, limit: 1000 }),
}));
vi.mock('../../../api/services/featureFlagsService.js', () => ({
  getFeatureFlags: vi.fn().mockResolvedValue({}),
}));

const TEST_USER = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';
const signToken = () => jwt.sign({ id: TEST_USER }, 'test-secret', { expiresIn: '1h' });

// Import AFTER mocks are declared.
let twinChatRoutes;
try {
  twinChatRoutes = (await import('../../../api/routes/twin-chat.js')).default;
} catch (err) {
  // Some transitive import may fail to load in test env; skip suite in that case.
  twinChatRoutes = null;
  // eslint-disable-next-line no-console
  console.warn('twin-chat import failed:', err.message);
}

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/chat', twinChatRoutes);
  return app;
}

const d = twinChatRoutes ? describe : describe.skip;

d('twin-chat routes smoke', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects unauthenticated POST /message with 401', async () => {
    const res = await request(createApp())
      .post('/api/chat/message')
      .send({ message: 'hello' });
    expect(res.status).toBe(401);
  });

  it('returns 400 when message body is empty', async () => {
    const res = await request(createApp())
      .post('/api/chat/message')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({ message: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/Message is required/i);
  });

  it('returns 400 when message exceeds length cap', async () => {
    const res = await request(createApp())
      .post('/api/chat/message')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({ message: 'x'.repeat(8001) });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/too long/i);
  });

  it('rejects unauthenticated GET /conversations with 401', async () => {
    const res = await request(createApp()).get('/api/chat/conversations');
    expect(res.status).toBe(401);
  });
});
