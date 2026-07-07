/**
 * Smoke tests for api/routes/consent.js
 * Covers: auth guard, list shape, POST consent_type-required validation,
 * revoke 404 when record missing, downstream 500.
 *
 * Note: consent.js pulls supabaseAdmin from ../config/supabase.js (not
 * ../services/database.js which the auth middleware uses) — both are mocked.
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

// Route DB result holders (swapped per test)
let listResult = { data: [], error: null };
let upsertResult = { data: { id: 'c1', consent_type: 'analytics' }, error: null };
let revokeResult = { data: { id: 'c1' }, error: null };

// consent.js: from('user_consents').select().eq().order()  (list)
//             from('user_consents').upsert().select().single()  (grant)
//             from('user_consents').update().eq().eq().eq().select().single()  (revoke)
function makeConsentClient() {
  return {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn(() => Promise.resolve(listResult)),
      upsert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      single: vi.fn(() => Promise.resolve(revokeOrUpsert())),
    })),
  };
}
// The grant path calls .upsert().select().single(); revoke calls .update()...single().
// We can't easily tell them apart in one .single(), so route each test to the
// result it expects via a small selector.
let singleMode = 'upsert';
function revokeOrUpsert() {
  return singleMode === 'revoke' ? revokeResult : upsertResult;
}

vi.mock('../../../api/config/supabase.js', () => {
  const client = makeConsentClient();
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

const consentRoutes = (await import('../../../api/routes/consent.js')).default;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/consent', consentRoutes);
  return app;
}

describe('consent routes smoke', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listResult = { data: [], error: null };
    upsertResult = { data: { id: 'c1', consent_type: 'analytics' }, error: null };
    revokeResult = { data: { id: 'c1' }, error: null };
    singleMode = 'upsert';
  });

  it('rejects unauthenticated GET with 401', async () => {
    const res = await request(createApp()).get('/api/consent');
    expect(res.status).toBe(401);
  });

  it('returns { success, consents } list shape', async () => {
    listResult = { data: [{ id: 'c1', consent_type: 'analytics', granted: true }], error: null };
    const res = await request(createApp())
      .get('/api/consent')
      .set('Authorization', `Bearer ${signToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.consents)).toBe(true);
  });

  it('returns 400 when consent_type is missing on POST', async () => {
    const res = await request(createApp())
      .post('/api/consent')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({ platform: 'spotify' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/consent_type is required/i);
  });

  it('grants consent and returns { success, consent }', async () => {
    const res = await request(createApp())
      .post('/api/consent')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({ consent_type: 'analytics', platform: 'spotify' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.consent).toBeDefined();
  });

  it('returns 404 when revoking a non-existent consent record', async () => {
    singleMode = 'revoke';
    revokeResult = { data: null, error: null };
    const res = await request(createApp())
      .delete('/api/consent/analytics/spotify')
      .set('Authorization', `Bearer ${signToken()}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('returns 500 when the list query errors', async () => {
    listResult = { data: null, error: { message: 'db down' } };
    const res = await request(createApp())
      .get('/api/consent')
      .set('Authorization', `Bearer ${signToken()}`);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to fetch consents');
  });
});
