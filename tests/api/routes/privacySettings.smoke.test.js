/**
 * Smoke tests for api/routes/privacy-settings.js
 * Covers: auth guard, GET profile shape, cluster privacyLevel 0-100 validation,
 * preset-not-found 404, downstream 500.
 *
 * Note: privacy-settings.js imports the default supabase client from
 * ../config/supabase.js and business logic from ../services/privacyService.js.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'test-secret';
process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_ANON_KEY = 'test-anon';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';
process.env.ENCRYPTION_KEY = '0'.repeat(64);
process.env.NODE_ENV = 'test';

const getOrCreatePrivacyProfileMock = vi.fn();
const updateClusterPrivacyMock = vi.fn();

// preset lookup result holder for the /presets/:key/apply path
let presetResult = { data: { preset_key: 'friends', global_privacy: 50 }, error: null };

vi.mock('../../../api/services/privacyService.js', () => ({
  getOrCreatePrivacyProfile: (...a) => getOrCreatePrivacyProfileMock(...a),
  updateGlobalPrivacyLevel: vi.fn().mockResolvedValue({ success: true, profile: { globalPrivacy: 50 } }),
  updateClusterPrivacy: (...a) => updateClusterPrivacyMock(...a),
  batchUpdateClusters: vi.fn().mockResolvedValue({ success: true, profile: {} }),
  getPrivacyStats: vi.fn().mockResolvedValue({ success: true, stats: {} }),
  DEFAULT_LIFE_CLUSTERS: {},
}));

vi.mock('../../../api/config/supabase.js', () => {
  const client = {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn(() => Promise.resolve({ data: [], error: null })),
      single: vi.fn(() => Promise.resolve(presetResult)),
    })),
  };
  return { supabaseAdmin: client, supabase: client, default: client };
});

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

const privacyRoutes = (await import('../../../api/routes/privacy-settings.js')).default;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/privacy-settings', privacyRoutes);
  return app;
}

describe('privacy-settings routes smoke', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    presetResult = { data: { preset_key: 'friends', global_privacy: 50 }, error: null };
  });

  it('rejects unauthenticated GET with 401', async () => {
    const res = await request(createApp()).get('/api/privacy-settings');
    expect(res.status).toBe(401);
  });

  it('returns { success, settings } on GET happy path', async () => {
    getOrCreatePrivacyProfileMock.mockResolvedValue({ success: true, profile: { globalPrivacy: 50, clusters: [] } });
    const res = await request(createApp())
      .get('/api/privacy-settings')
      .set('Authorization', `Bearer ${signToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.settings).toBeDefined();
  });

  it('returns 400 when cluster privacyLevel is out of range (>100)', async () => {
    const res = await request(createApp())
      .put('/api/privacy-settings/clusters/work/privacy')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({ privacyLevel: 150 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/privacyLevel must be between 0 and 100/i);
  });

  it('returns 400 when cluster privacyLevel is undefined', async () => {
    const res = await request(createApp())
      .put('/api/privacy-settings/clusters/work/privacy')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/privacyLevel must be between 0 and 100/i);
  });

  it('updates cluster privacy and returns { success, profile } for a valid level', async () => {
    updateClusterPrivacyMock.mockResolvedValue({ success: true, profile: { clusters: [{ id: 'work', privacyLevel: 30 }] } });
    const res = await request(createApp())
      .put('/api/privacy-settings/clusters/work/privacy')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({ privacyLevel: 30 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(updateClusterPrivacyMock).toHaveBeenCalledWith(TEST_USER, 'work', 30);
  });

  it('returns 404 when applying a non-existent preset', async () => {
    presetResult = { data: null, error: { message: 'no rows' } };
    const res = await request(createApp())
      .post('/api/privacy-settings/presets/does-not-exist/apply')
      .set('Authorization', `Bearer ${signToken()}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Preset not found/i);
  });

  it('returns 500 when getOrCreatePrivacyProfile signals failure', async () => {
    getOrCreatePrivacyProfileMock.mockResolvedValue({ success: false, error: 'db down' });
    const res = await request(createApp())
      .get('/api/privacy-settings')
      .set('Authorization', `Bearer ${signToken()}`);
    expect(res.status).toBe(500);
  });
});
