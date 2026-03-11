/**
 * Platform Insights — Route Ordering Test
 * ========================================
 * Verifies that GET /api/insights/proactive does NOT collide with
 * GET /api/insights/:platform (bug L12).
 *
 * The /:platform handler validates against VALID_PLATFORMS and returns 400
 * for unknown values. Before the fix, "proactive" was treated as a platform name.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// ── Environment setup ────────────────────────────────────────────────────────
process.env.JWT_SECRET = 'test-secret-for-routing';
process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.ENCRYPTION_KEY = '0'.repeat(64);
process.env.NODE_ENV = 'test';

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('../../../api/services/database.js', () => {
  // Build a Supabase-like chainable mock where every method returns the chain
  // and the chain itself is a thenable (so `await query` works).
  const makeChain = () => {
    const chain = {
      select: vi.fn(),
      eq: vi.fn(),
      gte: vi.fn(),
      order: vi.fn(),
      limit: vi.fn(),
      single: vi.fn(),
      update: vi.fn(),
      // Make the chain thenable so `const { data, error } = await chain` works
      then: vi.fn((resolve) => resolve({ data: [], error: null })),
    };
    // Every method returns the chain for continued chaining
    Object.keys(chain).forEach(k => {
      if (k !== 'then') chain[k].mockReturnValue(chain);
    });
    return chain;
  };
  const chain = makeChain();
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

vi.mock('../../../api/services/platformReflectionService.js', () => ({
  default: {
    getReflections: vi.fn().mockResolvedValue({ success: true, reflection: { text: 'test' } }),
    refreshReflection: vi.fn().mockResolvedValue({ success: true }),
  },
}));

vi.mock('../../../api/services/twinPatternService.js', () => ({
  seedPatternFromInsight: vi.fn().mockResolvedValue(undefined),
}));

// ── Imports ──────────────────────────────────────────────────────────────────

const { supabaseAdmin } = await import('../../../api/services/database.js');
const platformInsightsRoutes = (await import('../../../api/routes/platform-insights.js')).default;

// ── App setup ────────────────────────────────────────────────────────────────

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/insights', platformInsightsRoutes);
  return app;
}

function signToken(payload) {
  return jwt.sign(payload, 'test-secret-for-routing', { expiresIn: '1h' });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('L12: /api/insights/proactive route ordering', () => {
  let app;
  let token;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp();
    token = signToken({ id: 'test-user-id' });

    // Reset the chain so each query call gets a fresh chainable mock
    const chain = supabaseAdmin._chain;
    Object.keys(chain).forEach(k => {
      if (k !== 'then') chain[k].mockReturnValue(chain);
    });
    // Thenable: resolves to { data: [], error: null } when awaited
    chain.then.mockImplementation((resolve) => resolve({ data: [], error: null }));
    supabaseAdmin.from.mockReturnValue(chain);
  });

  it('GET /api/insights/proactive returns 200, NOT 400 "Invalid platform"', async () => {
    const res = await request(app)
      .get('/api/insights/proactive')
      .set('Authorization', `Bearer ${token}`);

    // Must NOT be the platform handler's 400 "Invalid platform" response
    expect(res.status).toBe(200);
    expect(res.body.error).toBeUndefined();
    expect(res.body.success).toBe(true);
    expect(res.body).toHaveProperty('insights');
    expect(Array.isArray(res.body.insights)).toBe(true);
  });

  it('GET /api/insights/spotify still hits the platform handler (not proactive)', async () => {
    const res = await request(app)
      .get('/api/insights/spotify')
      .set('Authorization', `Bearer ${token}`);

    // Spotify is a valid platform — should get a 200 response from the platform handler
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('GET /api/insights/invalid-platform returns 400 from platform handler', async () => {
    const res = await request(app)
      .get('/api/insights/invalid-platform')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid platform/i);
  });

  it('GET /api/insights/proactive/engagement-stats returns 200', async () => {
    const res = await request(app)
      .get('/api/insights/proactive/engagement-stats')
      .set('Authorization', `Bearer ${token}`);

    // Should hit the engagement-stats handler, not the platform handler
    expect(res.status).not.toBe(400);
    expect(res.body.success).toBe(true);
  });
});
