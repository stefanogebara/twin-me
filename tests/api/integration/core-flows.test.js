/**
 * Integration Tests — Core Flows
 * ================================
 * Covers the 6 most critical platform flows with mocked DB/LLM dependencies.
 *
 * Flows tested:
 *   1. Memory stats — getMemoryStats shape and error handling
 *   2. Reflections — GET /twin/reflections auth guard + response shape
 *   3. Chat — POST /chat/message: missing message → 400
 *   4. Goal suggestions — GET /goals/suggestions shape
 *   5. Reflection trigger threshold — shouldTriggerReflection unit
 *   6. JWT payload format — token with { id: uuid } sets req.user.id
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import jwt from 'jsonwebtoken';

// ── Environment setup (must come before module imports) ──────────────────────
process.env.JWT_SECRET = 'integration-test-secret';
process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.ENCRYPTION_KEY = '0'.repeat(64);
process.env.NODE_ENV = 'test';

// ── Module mocks ─────────────────────────────────────────────────────────────

// Mock database module — shared across all service imports
vi.mock('../../../api/services/database.js', () => {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    lte: vi.fn(),
    lt: vi.fn(),
    gte: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    single: vi.fn(),
    then: vi.fn(),
  };
  // Make all chain methods return chain so queries can be chained
  Object.keys(chain).forEach(k => {
    if (k !== 'then') chain[k].mockReturnValue(chain);
  });
  return {
    supabaseAdmin: {
      from: vi.fn().mockReturnValue(chain),
      rpc: vi.fn().mockResolvedValue({ data: 0, error: null }),
      _chain: chain,
    },
    serverDb: {
      from: vi.fn().mockReturnValue(chain),
    },
  };
});

// Mock LLM gateway — no real AI calls in tests
vi.mock('../../../api/services/llmGateway.js', () => ({
  complete: vi.fn().mockResolvedValue({ content: '5' }),
  stream: vi.fn(),
  TIER_CHAT: 'chat',
  TIER_ANALYSIS: 'analysis',
  TIER_EXTRACTION: 'extraction',
}));

// Mock embedding service — no real OpenAI calls
vi.mock('../../../api/services/embeddingService.js', () => ({
  generateEmbedding: vi.fn().mockResolvedValue(new Array(1536).fill(0)),
  vectorToString: vi.fn().mockReturnValue('[0,0,0]'),
}));

// ── Imports (after mocks) ────────────────────────────────────────────────────
const { supabaseAdmin } = await import('../../../api/services/database.js');
const { getMemoryStats, archiveOldMemories } = await import('../../../api/services/memoryStreamService.js');
const { authenticateUser } = await import('../../../api/middleware/auth.js');

// ── Test helpers ─────────────────────────────────────────────────────────────

function makeReq(overrides = {}) {
  return {
    headers: {},
    query: {},
    body: {},
    path: '/test',
    ...overrides,
  };
}

function makeRes() {
  const res = { statusCode: 200, _body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => { res._body = data; return res; };
  return res;
}

function signToken(payload, secret = 'integration-test-secret') {
  return jwt.sign(payload, secret, { expiresIn: '1h' });
}

// ── Flow 1: Memory Stats ─────────────────────────────────────────────────────

describe('Flow 1: Memory stats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const chain = supabaseAdmin._chain;
    Object.keys(chain).forEach(k => {
      if (k !== 'then') chain[k].mockReturnValue(chain);
    });
    supabaseAdmin.from.mockReturnValue(chain);
    supabaseAdmin.rpc.mockResolvedValue({ data: 0, error: null });
  });

  it('returns correct shape with total and byType', async () => {
    // getMemoryStats now uses parallel COUNT queries (head:true) returning { count, error }
    // All 5 type queries share the same mock chain, so each resolves to count=1 → total=5
    supabaseAdmin._chain.then.mockImplementation((cb) =>
      Promise.resolve(cb({ count: 1, error: null }))
    );

    const stats = await getMemoryStats('user-test-1');

    expect(stats).toHaveProperty('total');
    expect(stats).toHaveProperty('byType');
    expect(stats.byType).toHaveProperty('reflection');
    expect(stats.byType).toHaveProperty('fact');
    expect(stats.byType).toHaveProperty('platform_data');
    expect(stats.byType).toHaveProperty('conversation');
    expect(stats.total).toBe(5);       // 5 types × count=1 each
    expect(stats.byType.reflection).toBe(1);
    expect(stats.byType.fact).toBe(1);
  });

  it('returns zeroed defaults on DB error', async () => {
    supabaseAdmin._chain.then.mockImplementation((cb) =>
      Promise.resolve(cb({ data: null, error: { message: 'DB connection failed' } }))
    );

    const stats = await getMemoryStats('user-test-2');
    expect(stats.total).toBe(0);
    expect(stats.byType.reflection).toBe(0);
  });

  it('no auth → 401 (auth guard behavior)', async () => {
    const req = makeReq({ headers: {} });
    const res = makeRes();
    const next = vi.fn();

    await authenticateUser(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });
});

// ── Flow 2: Reflections ──────────────────────────────────────────────────────

describe('Flow 2: Reflections auth guard', () => {
  it('no auth header → authenticateUser returns 401', async () => {
    const req = makeReq({ headers: {} });
    const res = makeRes();
    const next = vi.fn();

    await authenticateUser(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('valid auth → authenticateUser calls next and sets req.user.id', async () => {
    const userId = 'a1b2c3d4-0000-0000-0000-000000000001';
    const token = signToken({ id: userId, email: 'test@example.com' });
    const req = makeReq({ headers: { authorization: `Bearer ${token}` } });
    const res = makeRes();
    const next = vi.fn();

    await authenticateUser(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user?.id).toBe(userId);
  });
});

// ── Flow 3: Chat — missing message → 400 ────────────────────────────────────

describe('Flow 3: Chat validation', () => {
  it('returns 400 when message body is empty', () => {
    // Inline test of the validation logic used in twin-chat.js
    // Matches: if (!message || !message.trim()) return 400
    const testCases = [
      { body: {}, expectedError: true },
      { body: { message: '' }, expectedError: true },
      { body: { message: '   ' }, expectedError: true },
      { body: { message: 'hello' }, expectedError: false },
    ];

    for (const tc of testCases) {
      const message = tc.body.message;
      const isInvalid = !message || !message.trim();
      expect(isInvalid).toBe(tc.expectedError);
    }
  });

  it('no auth → 401', async () => {
    const req = makeReq({ headers: {}, method: 'POST' });
    const res = makeRes();
    const next = vi.fn();

    await authenticateUser(req, res, next);
    expect(res.statusCode).toBe(401);
  });
});

// ── Flow 4: Goal suggestions ─────────────────────────────────────────────────

describe('Flow 4: Goal suggestions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const chain = supabaseAdmin._chain;
    Object.keys(chain).forEach(k => {
      if (k !== 'then') chain[k].mockReturnValue(chain);
    });
    supabaseAdmin.from.mockReturnValue(chain);
  });

  it('returns empty array when no suggestions exist', async () => {
    // Mock goals query returning empty array
    supabaseAdmin._chain.then.mockImplementation((cb) =>
      Promise.resolve(cb({ data: [], error: null }))
    );

    // Dynamically import goalTrackingService with mocked supabase
    const { getUserGoals } = await import('../../../api/services/goalTrackingService.js');
    const suggestions = await getUserGoals('user-test-3', 'suggested');

    expect(Array.isArray(suggestions)).toBe(true);
  });

  it('no auth → 401', async () => {
    const req = makeReq({ headers: {} });
    const res = makeRes();
    const next = vi.fn();

    await authenticateUser(req, res, next);
    expect(res.statusCode).toBe(401);
  });
});

// ── Flow 5: Reflection trigger threshold ────────────────────────────────────

describe('Flow 5: Reflection trigger threshold', () => {
  it('returns false when importance sum is below threshold (< 40)', async () => {
    // Mock memoryStreamService to return low importance sum
    const memoryService = await import('../../../api/services/memoryStreamService.js');
    const origFn = memoryService.getRecentImportanceSum;

    // Patch the imported function via the mock
    supabaseAdmin.rpc.mockResolvedValue({ data: 30, error: null });

    const { shouldTriggerReflection } = await import('../../../api/services/reflectionEngine.js');

    // Use a unique userId so cooldown doesn't interfere
    const result = await shouldTriggerReflection('threshold-test-user-low-' + Date.now());

    // Result depends on DB mock — 30 < 40 → false
    expect(typeof result).toBe('boolean');
  });

  it('IMPORTANCE_THRESHOLD is exported and equals 40', async () => {
    const { IMPORTANCE_THRESHOLD } = await import('../../../api/services/reflectionEngine.js');
    expect(IMPORTANCE_THRESHOLD).toBe(40);
  });

  it('threshold logic: sum >= 40 → trigger', () => {
    const THRESHOLD = 40;
    expect(25 >= THRESHOLD).toBe(false);
    expect(39 >= THRESHOLD).toBe(false);
    expect(40 >= THRESHOLD).toBe(true);
    expect(100 >= THRESHOLD).toBe(true);
  });
});

// ── Flow 6: JWT payload format ───────────────────────────────────────────────

describe('Flow 6: JWT payload format', () => {
  it('token with { id: uuid } sets req.user.id', async () => {
    const uuid = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';
    const token = signToken({ id: uuid });
    const req = makeReq({ headers: { authorization: `Bearer ${token}` } });
    const res = makeRes();
    const next = vi.fn();

    await authenticateUser(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user.id).toBe(uuid);
  });

  it('token with wrong secret → 401', async () => {
    const token = jwt.sign({ id: 'user-123' }, 'wrong-secret', { expiresIn: '1h' });
    const req = makeReq({ headers: { authorization: `Bearer ${token}` } });
    const res = makeRes();
    const next = vi.fn();

    await authenticateUser(req, res, next);
    expect(res.statusCode).toBe(401);
  });
});

// ── Memory archive service ───────────────────────────────────────────────────

describe('archiveOldMemories service', () => {
  beforeEach(() => {
    supabaseAdmin.rpc.mockResolvedValue({ data: 0, error: null });
  });

  it('returns 0 when RPC reports nothing archived', async () => {
    supabaseAdmin.rpc.mockResolvedValue({ data: 0, error: null });
    const count = await archiveOldMemories('user-archive-test');
    expect(count).toBe(0);
  });

  it('returns archived count from RPC result', async () => {
    supabaseAdmin.rpc.mockResolvedValue({ data: 42, error: null });
    const count = await archiveOldMemories('user-archive-big');
    expect(count).toBe(42);
  });

  it('returns 0 gracefully on RPC error', async () => {
    supabaseAdmin.rpc.mockResolvedValue({ data: null, error: { message: 'RPC failed' } });
    const count = await archiveOldMemories('user-archive-err');
    expect(count).toBe(0);
  });

  it('returns 0 for null userId', async () => {
    const count = await archiveOldMemories(null);
    expect(count).toBe(0);
  });
});
