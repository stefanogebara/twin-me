/**
 * Desktop sign-in handoff flow — integration test (no real Google login).
 *
 * Proves the backend half of the desktop Google sign-in that the /desktop-handoff
 * page relies on:
 *   POST /api/auth/desktop-handoff  → mints a one-time auth code (tagged for
 *                                      /soul-reveal) from an authenticated session
 *   GET  /api/auth/oauth/claim       → the desktop app claims that code → session
 *                                      + redirectAfterAuth=/soul-reveal, one-time use
 *
 * Uses a test JWT + a stateful in-memory pending_auth_codes mock so the mint→claim
 * round-trip behaves like prod, with no real Google OAuth and no live database.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'test-secret-0123456789-abcdef-0123456789'; // >=32 chars (auth-simple guard)
process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';
process.env.ENCRYPTION_KEY = '0'.repeat(64);
process.env.NODE_ENV = 'test';

// Stateful pending_auth_codes so mint stores and claim reads/deletes — like prod.
const pendingCodes = new Map();
// Captures persistRefreshToken() inserts so we can assert the claim writes the
// refresh token to user_refresh_tokens (the table /auth/refresh validates against).
const persistedRefreshTokens = [];

vi.mock('../../../api/config/supabase.js', () => ({
  supabase: {},
  supabaseAdmin: {
    from: (table) => {
      if (table === 'pending_auth_codes') {
        return {
          insert: async (row) => {
            const r = Array.isArray(row) ? row[0] : row;
            pendingCodes.set(r.code, r);
            return { data: null, error: null };
          },
          select: () => ({
            eq: (_col, val) => ({
              single: async () => ({
                data: pendingCodes.get(val) || null,
                error: pendingCodes.has(val) ? null : { message: 'not found' },
              }),
            }),
          }),
          delete: () => ({
            eq: async (_col, val) => { pendingCodes.delete(val); return { data: null, error: null }; },
          }),
        };
      }
      if (table === 'user_refresh_tokens') {
        return {
          insert: async (row) => {
            persistedRefreshTokens.push(Array.isArray(row) ? row[0] : row);
            return { data: null, error: null };
          },
        };
      }
      // users — the auth middleware's email-verification lookup (select) AND
      // persistRefreshToken's legacy refresh_token_hash write (update).
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: { email_verified: true, created_at: new Date().toISOString() },
              error: null,
            }),
          }),
        }),
        update: () => ({ eq: async () => ({ data: null, error: null }) }),
      };
    },
  },
}));

const TEST_USER = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';
const signToken = () =>
  jwt.sign({ id: TEST_USER, email: 'stefanogebara@gmail.com' }, process.env.JWT_SECRET, { expiresIn: '1h' });

const authRoutes = (await import('../../../api/routes/auth-simple.js')).default;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  return app;
}

describe('desktop handoff flow (mint -> claim -> /soul-reveal)', () => {
  beforeEach(() => { pendingCodes.clear(); persistedRefreshTokens.length = 0; });

  it('rejects an unauthenticated mint with 401', async () => {
    const res = await request(createApp()).post('/api/auth/desktop-handoff').send({});
    expect(res.status).toBe(401);
  });

  it('mints a one-time code tagged for /soul-reveal when authenticated', async () => {
    const res = await request(createApp())
      .post('/api/auth/desktop-handoff')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.auth_code).toBe('string');
    expect(res.body.auth_code.length).toBeGreaterThan(20);
    const row = pendingCodes.get(res.body.auth_code);
    expect(row).toBeTruthy();
    expect(row.provider).toBe('desktop_handoff');
    expect(row.redirect_after_auth).toBe('/soul-reveal');
    expect(row.access_token).toBeTruthy();
  });

  it('round-trips: the minted code claims to a session that lands on /soul-reveal (one-time use)', async () => {
    const app = createApp();
    const mint = await request(app)
      .post('/api/auth/desktop-handoff')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({});
    const code = mint.body.auth_code;

    const claim = await request(app).get(`/api/auth/oauth/claim?auth_code=${code}`);
    expect(claim.status).toBe(200);
    expect(claim.body.success).toBe(true);
    expect(claim.body.token).toBeTruthy();
    expect(claim.body.redirectAfterAuth).toBe('/soul-reveal');

    // One-time use: a second claim of the same code is rejected.
    const claim2 = await request(app).get(`/api/auth/oauth/claim?auth_code=${code}`);
    expect(claim2.status).toBe(404);
  });

  it('a desktop (client=mobile) claim also returns the refresh token (Phase 6 sync auth)', async () => {
    // The desktop hands this refresh token to the OS keyring so the headless
    // sync + webview can mint fresh access tokens via body-based /auth/refresh
    // (no cookie). Without client=mobile, shouldExposeRefreshToken() withholds it.
    const app = createApp();
    const mint = await request(app)
      .post('/api/auth/desktop-handoff')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({});
    const claim = await request(app)
      .get(`/api/auth/oauth/claim?auth_code=${mint.body.auth_code}&client=mobile`);
    expect(claim.status).toBe(200);
    expect(typeof claim.body.refreshToken).toBe('string');
    expect(claim.body.refreshToken.length).toBeGreaterThan(0);
  });

  it('a web (default) claim does NOT expose the refresh token', async () => {
    const app = createApp();
    const mint = await request(app)
      .post('/api/auth/desktop-handoff')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({});
    const claim = await request(app)
      .get(`/api/auth/oauth/claim?auth_code=${mint.body.auth_code}`);
    expect(claim.status).toBe(200);
    expect(claim.body.refreshToken).toBeUndefined();
  });

  it('the claim PERSISTS the refresh token to user_refresh_tokens so /auth/refresh can validate it', async () => {
    // ROOT-CAUSE regression guard. The desktop-handoff/claim path minted a refresh
    // token but never wrote it to user_refresh_tokens (unlike /signin, /signup, and
    // the web OAuth callbacks). So every desktop /auth/refresh — body AND cookie —
    // 401'd from the first use: the webview session silently died after one
    // access-token lifetime, and the headless capture sync could never authenticate.
    const app = createApp();
    const mint = await request(app)
      .post('/api/auth/desktop-handoff')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({});
    expect(persistedRefreshTokens).toHaveLength(0); // nothing persisted at mint

    const claim = await request(app)
      .get(`/api/auth/oauth/claim?auth_code=${mint.body.auth_code}&client=mobile`);
    expect(claim.status).toBe(200);

    // The claimed refresh token must now be in user_refresh_tokens, keyed to the user.
    const persisted = persistedRefreshTokens.find(
      (r) => r.user_id === TEST_USER && typeof r.token_hash === 'string' && r.token_hash.length > 0
    );
    expect(persisted).toBeTruthy();
  });
});
