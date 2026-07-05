/**
 * Smoke tests for the /api/account/timezone pair.
 *
 * audit-2026-07-03 route-sweep: Settings.tsx GETs /api/account/timezone to
 * show the persisted value, but account.js only defined PATCH — every
 * Settings visit produced a 404. These tests pin the new GET handler and the
 * existing PATCH contract.
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

// Resolves .single() for the route's `select('timezone')` lookup.
const timezoneSingleMock = vi.fn();
// Resolves the awaited `.update({ timezone }).eq(...)` chain in PATCH.
const updateEqMock = vi.fn().mockResolvedValue({ error: null });
const updateMock = vi.fn(() => ({ eq: (...a) => updateEqMock(...a) }));

vi.mock('../../../api/services/database.js', () => ({
  supabaseAdmin: {
    from: vi.fn(() => {
      let cols = '';
      const chain = {
        select: vi.fn((c) => { cols = c; return chain; }),
        eq: vi.fn(() => chain),
        single: vi.fn(() => {
          // Auth middleware's email-verification lookup
          if (String(cols).includes('email_verified')) {
            return Promise.resolve({
              data: { email_verified: true, created_at: new Date().toISOString() },
              error: null,
            });
          }
          return timezoneSingleMock();
        }),
        update: (...a) => updateMock(...a),
      };
      return chain;
    }),
  },
  serverDb: {},
}));

vi.mock('../../../api/services/soulSignatureService.js', () => ({
  getAllSoulSignatures: vi.fn().mockResolvedValue([]),
}));

const TEST_USER = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';
const signToken = () => jwt.sign({ id: TEST_USER }, 'test-secret', { expiresIn: '1h' });

const accountRoutes = (await import('../../../api/routes/account.js')).default;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/account', accountRoutes);
  return app;
}

describe('GET /api/account/timezone', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateEqMock.mockResolvedValue({ error: null });
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await request(createApp()).get('/api/account/timezone');
    expect(res.status).toBe(401);
  });

  it('returns the stored timezone', async () => {
    timezoneSingleMock.mockResolvedValue({ data: { timezone: 'America/Sao_Paulo' }, error: null });
    const res = await request(createApp())
      .get('/api/account/timezone')
      .set('Authorization', `Bearer ${signToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.timezone).toBe('America/Sao_Paulo');
  });

  it('returns null when no timezone has been stored yet', async () => {
    timezoneSingleMock.mockResolvedValue({ data: { timezone: null }, error: null });
    const res = await request(createApp())
      .get('/api/account/timezone')
      .set('Authorization', `Bearer ${signToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.timezone).toBe(null);
  });

  it('returns 500 (not a silent 200) when the lookup fails', async () => {
    timezoneSingleMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const res = await request(createApp())
      .get('/api/account/timezone')
      .set('Authorization', `Bearer ${signToken()}`);
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

describe('PATCH /api/account/timezone (existing contract)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateEqMock.mockResolvedValue({ error: null });
  });

  it('persists a valid IANA timezone', async () => {
    const res = await request(createApp())
      .patch('/api/account/timezone')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({ timezone: 'Europe/London' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(updateMock).toHaveBeenCalledWith({ timezone: 'Europe/London' });
  });

  it('rejects an invalid timezone string with 400', async () => {
    const res = await request(createApp())
      .patch('/api/account/timezone')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({ timezone: 'Not/AZone' });
    expect(res.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });
});
