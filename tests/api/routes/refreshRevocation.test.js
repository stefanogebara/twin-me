/**
 * Refresh-token revocation actually revokes (audit S6, 2026-09-26).
 * ====================================================================
 * user_refresh_tokens rotation with reuse detection (auth-simple.js + refreshRotation.js)
 * used to be undone by a legacy column: every rotation also wrote the new hash to
 * users.refresh_token_hash, and /refresh fell back to that column, with no expiry check,
 * whenever no row matched the presented token. Neither reuse detection nor the row-expiry
 * path ever cleared it -- they only deleted the row -- so:
 *
 *   - A stolen token's rotated successor kept working after reuse detection deleted the
 *     row: the victim was signed out, the thief was not.
 *   - An expired token, refused once (the row check catches it directly), was accepted on
 *     a second try, because by then the row was gone but the column still held its hash.
 *   - Logout deleted the row (and cleared the column) only inside the access token's
 *     jwt.verify try block, so a logout called after the access token had expired revoked
 *     nothing server-side.
 *
 * The fix removes the column read and write entirely and moves the refresh-row delete in
 * /logout outside the jwt.verify block. These tests exercise the route with the database
 * mocked (supertest against the auth router, per tests/api/routes/desktopHandoff.smoke.test.js),
 * proving the behaviour rather than matching source text.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

process.env.JWT_SECRET = 'test-secret-key-for-unit-tests-only'; // >=32 chars (auth-simple guard)
process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';
process.env.ENCRYPTION_KEY = '0'.repeat(64);
process.env.NODE_ENV = 'test';

const TEST_USER = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';
const sha256 = (raw) => crypto.createHash('sha256').update(raw).digest('hex');
const DAY_MS = 24 * 60 * 60 * 1000;

/** In-memory stand-in for one Postgres table, wired to the exact chain shapes
 * api/_app/services/auth/authStore.js builds (select/eq(*n)/single|maybeSingle,
 * update/eq(*n)/select, delete/eq, insert). */
function makeTableMock(rows) {
  function reader(matchFn) {
    return {
      eq(col, val) {
        return reader((r) => matchFn(r) && r[col] === val);
      },
      single: async () => {
        const found = rows.find(matchFn);
        return found ? { data: { ...found }, error: null } : { data: null, error: { message: 'not found' } };
      },
      maybeSingle: async () => {
        const found = rows.find(matchFn);
        return { data: found ? { ...found } : null, error: null };
      },
    };
  }
  function writer(patch, matchFn) {
    const result = () => {
      const matched = rows.filter(matchFn);
      matched.forEach((r) => Object.assign(r, patch));
      return matched;
    };
    return {
      eq(col, val) {
        return writer(patch, (r) => matchFn(r) && r[col] === val);
      },
      select: async () => ({ data: result().map((r) => ({ id: r.id })), error: null }),
      then: (resolve) => { result(); resolve({ data: null, error: null }); },
    };
  }
  function remover(matchFn) {
    return {
      eq: async (col, val) => {
        const full = (r) => matchFn(r) && r[col] === val;
        for (let i = rows.length - 1; i >= 0; i--) if (full(rows[i])) rows.splice(i, 1);
        return { data: null, error: null };
      },
    };
  }
  return {
    select: () => reader(() => true),
    update: (patch) => writer(patch, () => true),
    delete: () => remover(() => true),
    insert: async (row) => {
      const r = Array.isArray(row) ? row[0] : row;
      rows.push({ id: `row-${rows.length + 1}`, ...r });
      return { data: null, error: null };
    },
  };
}

let refreshRows;
let users;

const fakeAdmin = {
  from: (table) => {
    if (table === 'user_refresh_tokens') return makeTableMock(refreshRows);
    if (table === 'users') return makeTableMock(users);
    throw new Error(`unmocked table: ${table}`);
  },
};
/* Same two doors as desktopHandoff.smoke.test.js: authStore.js reads services/database.js,
   the middleware reads config/supabase.js. */
vi.mock('../../../api/_app/config/supabase.js', () => ({ supabase: {}, supabaseAdmin: fakeAdmin }));
vi.mock('../../../api/_app/services/database.js', () => ({ supabaseAdmin: fakeAdmin }));

const authRoutes = (await import('../../../api/_app/routes/auth-simple.js')).default;
const { ROTATION_GRACE_MS } = await import('../../../api/_app/services/auth/refreshRotation.js');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/auth', authRoutes);
  return app;
}

function seedUser(overrides = {}) {
  users.push({
    id: TEST_USER,
    email: 'stefanogebara@gmail.com',
    first_name: 'Test',
    last_name: 'User',
    created_at: new Date().toISOString(),
    email_verified: true,
    oauth_provider: null,
    timezone: null,
    preferred_language: null,
    ...overrides,
  });
}

function seedRow(overrides = {}) {
  const row = {
    id: `row-${refreshRows.length + 1}`,
    user_id: TEST_USER,
    token_hash: null,
    previous_token_hash: null,
    rotated_at: null,
    expires_at: new Date(Date.now() + 30 * DAY_MS).toISOString(),
    ...overrides,
  };
  refreshRows.push(row);
  return row;
}

function expiredAccessToken() {
  // Setting `exp` directly (rather than the `expiresIn` option) yields an
  // already-expired token without needing to wait or fake the clock.
  return jwt.sign(
    { id: TEST_USER, email: 'stefanogebara@gmail.com', exp: Math.floor(Date.now() / 1000) - 60 },
    process.env.JWT_SECRET
  );
}

describe('refresh token revocation (S6)', () => {
  beforeEach(() => {
    refreshRows = [];
    users = [];
    seedUser();
  });

  it('after reuse is detected, neither the reused token nor its successor can refresh', async () => {
    // T1 was rotated to T2 (an attacker refreshing first, or an ordinary rotation) longer
    // ago than the grace window, so presenting T1 now is reuse of a dead credential.
    seedRow({
      token_hash: sha256('T2'),
      previous_token_hash: sha256('T1'),
      rotated_at: new Date(Date.now() - ROTATION_GRACE_MS - 1000).toISOString(),
    });
    // The legacy column still holds T2's hash -- proof the fix does not consult it. Before
    // the fix this alone would have let T2 refresh again after the row was deleted below.
    users[0].refresh_token_hash = sha256('T2');

    const app = createApp();

    const reused = await request(app).post('/api/auth/refresh').set('Cookie', 'refresh_token=T1').send({});
    expect(reused.status).toBe(401);
    expect(refreshRows).toHaveLength(0); // reuse detection revoked the session

    const successor = await request(app).post('/api/auth/refresh').set('Cookie', 'refresh_token=T2').send({});
    expect(successor.status).toBe(401); // T2 does not keep working through the column
  });

  it('an expired token stays refused on a second try', async () => {
    seedRow({ token_hash: sha256('T3'), expires_at: new Date(Date.now() - 60 * 60 * 1000).toISOString() });
    users[0].refresh_token_hash = sha256('T3'); // legacy column still holds it; must not rescue it

    const app = createApp();

    const first = await request(app).post('/api/auth/refresh').set('Cookie', 'refresh_token=T3').send({});
    expect(first.status).toBe(401);
    expect(refreshRows).toHaveLength(0); // the expired row was deleted, not just refused

    const second = await request(app).post('/api/auth/refresh').set('Cookie', 'refresh_token=T3').send({});
    expect(second.status).toBe(401); // no column fallback to be accepted through this time
  });

  it('logout with an expired access token still deletes the refresh row', async () => {
    seedRow({ token_hash: sha256('T4') });
    const app = createApp();

    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${expiredAccessToken()}`)
      .set('Cookie', 'refresh_token=T4')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(refreshRows.find((r) => r.token_hash === sha256('T4'))).toBeUndefined();
  });

  it('logout with a valid access token still deletes the refresh row (happy path)', async () => {
    seedRow({ token_hash: sha256('T7') });
    const app = createApp();
    const validToken = jwt.sign({ id: TEST_USER, email: 'stefanogebara@gmail.com' }, process.env.JWT_SECRET, { expiresIn: '30m' });

    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${validToken}`)
      .set('Cookie', 'refresh_token=T7')
      .send({});

    expect(res.status).toBe(200);
    expect(refreshRows.find((r) => r.token_hash === sha256('T7'))).toBeUndefined();
  });

  it('a token presented moments after its own rotation still gets a fresh access token (grace window intact)', async () => {
    // #576: two tabs sharing one cookie jar both call /refresh; the loser presents the hash
    // the winner just rotated away. Within ROTATION_GRACE_MS this must succeed, not 401.
    seedRow({
      token_hash: sha256('T6'),
      previous_token_hash: sha256('T5'),
      rotated_at: new Date(Date.now() - 5000).toISOString(),
    });
    const app = createApp();

    const res = await request(app).post('/api/auth/refresh').set('Cookie', 'refresh_token=T5').send({});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.accessToken).toBe('string');
    // Grace does not rotate: the row is untouched, so a third tab gets the same answer.
    expect(refreshRows).toHaveLength(1);
    expect(refreshRows[0].token_hash).toBe(sha256('T6'));
  });

  it('a token matching its row rotates normally (happy path, not adversarial)', async () => {
    seedRow({ token_hash: sha256('T8') });
    const app = createApp();

    const res = await request(app).post('/api/auth/refresh').set('Cookie', 'refresh_token=T8').send({});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(refreshRows).toHaveLength(1);
    expect(refreshRows[0].token_hash).not.toBe(sha256('T8')); // rotated to a new hash
    expect(refreshRows[0].previous_token_hash).toBe(sha256('T8'));
    // No second row appeared and no legacy column write happened (nothing reads it, but a
    // regression that reintroduced the write would still show up as an extra users column).
    expect(users[0].refresh_token_hash).toBeUndefined();
  });
});
