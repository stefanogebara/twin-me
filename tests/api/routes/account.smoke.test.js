/**
 * Smoke tests for api/routes/account.js — GET /api/account/timezone
 *
 * The settings page needs to display the user's saved IANA timezone, but only
 * a PATCH handler existed, so a GET 404'd on every /settings load (prod canary,
 * 2026-06-24). These cover the new read endpoint: auth guard, happy path,
 * null-when-unset, and DB-error paths.
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

// Mutated per-test to drive the handler's `users.timezone` read.
let timezoneResult = { data: { timezone: 'America/Sao_Paulo' }, error: null };

vi.mock('../../../api/services/database.js', () => ({
  supabaseAdmin: {
    from: vi.fn(() => {
      let columns = '';
      const builder = {
        select: vi.fn((cols) => { columns = cols || ''; return builder; }),
        eq: vi.fn(() => builder),
        // The auth middleware reads email_verified/created_at; the timezone
        // handler reads timezone. Branch on the selected columns so a single
        // mock serves both DB calls within one request.
        single: vi.fn(() => {
          if (columns.includes('email_verified')) {
            return Promise.resolve({
              data: { email_verified: true, created_at: new Date().toISOString() },
              error: null,
            });
          }
          return Promise.resolve(timezoneResult);
        }),
      };
      return builder;
    }),
  },
  serverDb: {},
}));

// Importing account.js pulls in soulSignatureService (for the export route),
// which drags in the LLM gateway + memory stream. Stub it — unused here.
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
    timezoneResult = { data: { timezone: 'America/Sao_Paulo' }, error: null };
  });

  it('rejects unauthenticated request with 401', async () => {
    const res = await request(createApp()).get('/api/account/timezone');
    expect(res.status).toBe(401);
  });

  it('returns the saved timezone on happy path', async () => {
    const res = await request(createApp())
      .get('/api/account/timezone')
      .set('Authorization', `Bearer ${signToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.timezone).toBe('America/Sao_Paulo');
  });

  it('returns null timezone when the user has not set one', async () => {
    timezoneResult = { data: { timezone: null }, error: null };
    const res = await request(createApp())
      .get('/api/account/timezone')
      .set('Authorization', `Bearer ${signToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.timezone).toBeNull();
  });

  it('returns 500 when the timezone read errors', async () => {
    timezoneResult = { data: null, error: { message: 'db down' } };
    const res = await request(createApp())
      .get('/api/account/timezone')
      .set('Authorization', `Bearer ${signToken()}`);
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});
