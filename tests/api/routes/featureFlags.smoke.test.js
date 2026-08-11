/**
 * Smoke tests for api/routes/feature-flags.js
 * Covers: auth guard, GET flags shape with defaults, POST unknown-flag 400,
 * POST happy path, downstream 500.
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

const getFeatureFlagsMock = vi.fn();
const setFeatureFlagMock = vi.fn();

vi.mock('../../../api/services/featureFlagsService.js', () => ({
  getFeatureFlags: (...a) => getFeatureFlagsMock(...a),
  setFeatureFlag: (...a) => setFeatureFlagMock(...a),
}));

vi.mock('../../../api/services/database.js', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { email_verified: true, created_at: new Date().toISOString() }, error: null }),
    })),
  },
  serverDb: {},
}));

const TEST_USER = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';
const signToken = () => jwt.sign({ id: TEST_USER }, 'test-secret', { expiresIn: '1h' });

const featureFlagsRoutes = (await import('../../../api/routes/feature-flags.js')).default;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/feature-flags', featureFlagsRoutes);
  return app;
}

describe('feature-flags routes smoke', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects unauthenticated GET with 401', async () => {
    const res = await request(createApp()).get('/api/feature-flags');
    expect(res.status).toBe(401);
  });

  it('returns { success, flags } merging DB values with defaults', async () => {
    // DB overrides one flag; the rest fall back to FLAG_DEFAULTS
    getFeatureFlagsMock.mockResolvedValue({ personality_oracle: true });
    const res = await request(createApp())
      .get('/api/feature-flags')
      .set('Authorization', `Bearer ${signToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.flags.personality_oracle).toBe(true); // from DB
    expect(res.body.flags.gmail_statement_courier).toBe(false); // default opt-in off
  });

  it('returns 400 for an unknown flag on POST', async () => {
    const res = await request(createApp())
      .post('/api/feature-flags')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({ flag: 'nonexistent_flag', value: true });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/Unknown flag/i);
  });

  it('sets a known flag and returns { success, flag, value }', async () => {
    setFeatureFlagMock.mockResolvedValue(undefined);
    const res = await request(createApp())
      .post('/api/feature-flags')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({ flag: 'gmail_statement_courier', value: true });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.flag).toBe('gmail_statement_courier');
    expect(res.body.value).toBe(true);
    expect(setFeatureFlagMock).toHaveBeenCalledWith(TEST_USER, 'gmail_statement_courier', true);
  });

  it('returns 500 when getFeatureFlags throws', async () => {
    getFeatureFlagsMock.mockRejectedValue(new Error('flags table down'));
    const res = await request(createApp())
      .get('/api/feature-flags')
      .set('Authorization', `Bearer ${signToken()}`);
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Failed to load flags');
  });
});
