/**
 * Open-redirect regression test for the magic-link sign-in flow.
 *
 * GET /magic-link/verify reads `redirect` off the query string and stores it
 * with the one-time auth code (api/_app/routes/auth-simple.js ~906-1022); the
 * claim endpoint (~1832, GET /oauth/claim) later hands it back as
 * `redirectAfterAuth` and the page navigates there. The old rule ("starts
 * with / and not //") let "/\evil.example" through:
 * new URL('/\\evil.example', 'https://twinme.me').href is
 * 'https://evil.example/' — a genuine sign-in email could land a person on
 * an attacker's page.
 *
 * Mounts the real router (same recipe as
 * tests/api/routes/desktopHandoff.smoke.test.js) with authStore.js mocked, so
 * the assertion is on what the route actually persists as
 * redirect_after_auth, not on a description of the fix.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

process.env.JWT_SECRET = 'test-secret-key-for-unit-tests-only'; // >=32 chars (auth-simple guard)
process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';
process.env.ENCRYPTION_KEY = '0'.repeat(64);
process.env.NODE_ENV = 'test';

const TEST_USER = { id: '167c27b5-a40b-49fb-8d00-deb1b1c57f4d', email: 'stefanogebara@gmail.com', first_name: 'Stefano' };
const VALID_TOKEN = 'a'.repeat(64);

const MAGIC_LINK_ROW = {
  id: 'ml-1',
  email: TEST_USER.email,
  invite_code: null,
  expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  consumed_at: null,
};

// Captures every insertPendingAuthCode call so the test can read exactly what
// the route decided to persist as redirect_after_auth.
const insertPendingAuthCodeCalls = [];

/* Mocking authStore.js directly (rather than the supabase client, as
   desktopHandoff.smoke.test.js does) keeps this test to only the functions
   the GET /magic-link/verify path actually calls — findUserByEmail returning
   an existing user skips the whole new-user/invite branch. */
vi.mock('../../../api/_app/services/auth/authStore.js', () => ({
  findMagicLink: async () => ({ data: MAGIC_LINK_ROW, error: null }),
  consumeMagicLink: async () => ({ error: null }),
  findUserByEmail: async () => ({ data: TEST_USER, error: null }),
  updateUser: async () => ({ error: null }),
  insertRefreshToken: async () => ({ error: null }),
  insertPendingAuthCode: async (row) => { insertPendingAuthCodeCalls.push(row); return { error: null }; },
  // Imported by auth-simple.js for its other routes; unused by the verify
  // path this test exercises, so plain no-ops are enough.
  findUserById: async () => ({ data: null, error: null }),
  findUserByLegacyRefreshHash: async () => ({ data: null, error: null }),
  findUserByVerificationToken: async () => ({ data: null, error: null }),
  createUser: async () => ({ data: null, error: null }),
  clearLegacyRefreshHash: async () => ({ error: null }),
  findRefreshToken: async () => ({ data: null, error: null }),
  findRefreshTokenByPrevious: async () => ({ data: null, error: null }),
  deleteRefreshTokenById: async () => ({ error: null }),
  deleteRefreshTokenByHash: async () => ({ error: null }),
  rotateRefreshToken: async () => ({ data: null, error: null }),
  insertMagicLink: async () => ({ error: null }),
  findPendingAuthCode: async () => ({ data: null, error: null }),
  deletePendingAuthCode: async () => ({ error: null }),
  upsertPlatformConnection: async () => ({ error: null }),
}));

const authRoutes = (await import('../../../api/_app/routes/auth-simple.js')).default;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  return app;
}

describe('GET /magic-link/verify — redirect safety', () => {
  beforeEach(() => { insertPendingAuthCodeCalls.length = 0; });

  it('falls back to /money when redirect is the backslash open-redirect payload', async () => {
    const res = await request(createApp())
      .get('/api/auth/magic-link/verify')
      .query({ token: VALID_TOKEN, redirect: '/\\evil.example' });

    expect(res.status).toBe(302);
    expect(insertPendingAuthCodeCalls).toHaveLength(1);
    expect(insertPendingAuthCodeCalls[0].redirect_after_auth).toBe('/money');
    expect(res.headers.location).not.toContain('evil');
    expect(res.headers.location).toContain('/oauth/callback?auth_code=');
  });

  it('keeps a genuine same-origin redirect', async () => {
    const res = await request(createApp())
      .get('/api/auth/magic-link/verify')
      .query({ token: VALID_TOKEN, redirect: '/money/you' });

    expect(res.status).toBe(302);
    expect(insertPendingAuthCodeCalls).toHaveLength(1);
    expect(insertPendingAuthCodeCalls[0].redirect_after_auth).toBe('/money/you');
  });
});
