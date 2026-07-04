/**
 * Smoke tests for api/routes/personality-profile.js
 * Covers: auth guard, null-profile shape, embedding strip, happy-path shape,
 * 410-gone legacy routes, downstream 500.
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

const getProfileMock = vi.fn();
const buildProfileMock = vi.fn();

vi.mock('../../../api/services/personalityProfileService.js', () => ({
  getProfile: (...a) => getProfileMock(...a),
  buildProfile: (...a) => buildProfileMock(...a),
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

const personalityRoutes = (await import('../../../api/routes/personality-profile.js')).default;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/personality-profile', personalityRoutes);
  return app;
}

describe('personality-profile routes smoke', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects unauthenticated GET with 401', async () => {
    const res = await request(createApp()).get('/api/personality-profile');
    expect(res.status).toBe(401);
  });

  it('returns { success, profile: null } when not enough data', async () => {
    getProfileMock.mockResolvedValue(null);
    const res = await request(createApp())
      .get('/api/personality-profile')
      .set('Authorization', `Bearer ${signToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.profile).toBeNull();
    expect(res.body.message).toMatch(/minimum 20 memories/i);
  });

  it('strips the raw embedding vector from the returned profile', async () => {
    getProfileMock.mockResolvedValue({
      id: 'p1',
      openness: 0.7,
      personality_embedding: new Array(1536).fill(0.1),
    });
    const res = await request(createApp())
      .get('/api/personality-profile')
      .set('Authorization', `Bearer ${signToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.profile.openness).toBe(0.7);
    expect(res.body.profile.personality_embedding).toBeUndefined();
  });

  it('POST /rebuild returns { success, profile, rebuilt } on success', async () => {
    buildProfileMock.mockResolvedValue({ id: 'p1', personality_embedding: [0.1] });
    const res = await request(createApp())
      .post('/api/personality-profile/rebuild')
      .set('Authorization', `Bearer ${signToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.rebuilt).toBe(true);
    expect(res.body.profile.personality_embedding).toBeUndefined();
  });

  it('GET /drift returns 410 gone (feature removed)', async () => {
    const res = await request(createApp())
      .get('/api/personality-profile/drift')
      .set('Authorization', `Bearer ${signToken()}`);
    expect(res.status).toBe(410);
    expect(res.body.success).toBe(false);
  });

  it('returns 500 when getProfile throws', async () => {
    getProfileMock.mockRejectedValue(new Error('boom'));
    const res = await request(createApp())
      .get('/api/personality-profile')
      .set('Authorization', `Bearer ${signToken()}`);
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    // Error message must not leak internals
    expect(res.body.error).toBe('Failed to retrieve personality profile.');
  });
});
