/**
 * Tests for api/routes/og-image.js — GET /api/og/soul-card cost hardening.
 *
 * Contract under test (2026-07-03 backend-cost audit):
 *  - Invalid/garbage userId never triggers the per-user renderer, and the
 *    fallback card is rendered at most ONCE per process (memoized) — the
 *    endpoint is public, so garbage requests must be ~zero CPU.
 *  - Success responses carry CDN cache headers incl. stale-while-revalidate
 *    so Vercel's edge absorbs repeat traffic.
 *  - Redis-cached PNGs are served without re-rendering.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

process.env.JWT_SECRET = 'test-secret';
process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';
process.env.ENCRYPTION_KEY = '0'.repeat(64);
process.env.NODE_ENV = 'test';

// ── Mocks ────────────────────────────────────────────────────────────────

const renderSoulCardMock = vi.fn(async () => Buffer.from('soul-card-png'));
// Manual counter: the route memoizes the fallback at MODULE level, so the
// process-wide render total is the invariant — vi.clearAllMocks() resets
// mock.calls between tests, but not this counter.
let fallbackRenderCount = 0;
const renderFallbackCardMock = vi.fn(async () => {
  fallbackRenderCount++;
  return Buffer.from('fallback-png');
});
vi.mock('../../../api/services/soulCardRenderer.js', () => ({
  renderSoulCard: (...a) => renderSoulCardMock(...a),
  renderFallbackCard: (...a) => renderFallbackCardMock(...a),
}));

const cacheStore = new Map();
vi.mock('../../../api/services/redisClient.js', () => ({
  get: vi.fn(async (key) => (cacheStore.has(key) ? cacheStore.get(key) : null)),
  set: vi.fn(async (key, value) => { cacheStore.set(key, value); }),
  del: vi.fn(async (key) => { cacheStore.delete(key); }),
  getRedisClient: vi.fn(() => null),
  isRedisAvailable: vi.fn(() => false),
}));

vi.mock('../../../api/services/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

// Per-table Supabase stub: soul_signatures + users
let signatureRow = null;
let userRow = null;
vi.mock('../../../api/services/database.js', () => ({
  supabaseAdmin: {
    from: (table) => {
      const single = async () => {
        if (table === 'soul_signatures') {
          return signatureRow
            ? { data: signatureRow, error: null }
            : { data: null, error: { message: 'not found' } };
        }
        if (table === 'users') {
          return { data: userRow, error: null };
        }
        return { data: null, error: { message: `unexpected table ${table}` } };
      };
      const chain = {
        select: () => chain,
        eq: () => chain,
        single,
      };
      return chain;
    },
  },
  serverDb: {},
}));

const ogRoutes = (await import('../../../api/routes/og-image.js')).default;

function createApp() {
  const app = express();
  app.use('/api', ogRoutes);
  return app;
}

const VALID_USER = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';

describe('GET /api/og/soul-card (public cost surface)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cacheStore.clear();
    signatureRow = {
      archetype_name: 'The Curious Builder',
      archetype_subtitle: 'Always making something',
      defining_traits: [{ trait: 'curiosity', score: 0.9 }],
      color_scheme: { primary: '#E8D5B7' },
      is_public: true,
    };
    userRow = { first_name: 'Stefano' };
  });

  it('never calls the per-user renderer for an invalid userId', async () => {
    const res = await request(createApp()).get('/api/og/soul-card?userId=garbage');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/png/);
    expect(renderSoulCardMock).not.toHaveBeenCalled();
  });

  it('memoizes the fallback card: repeated garbage requests render at most once per process', async () => {
    const app = createApp();

    await request(app).get('/api/og/soul-card?userId=garbage');
    await request(app).get('/api/og/soul-card'); // missing param
    await request(app).get('/api/og/soul-card?userId=unknown'); // /s/:userId flow sends this

    expect(renderSoulCardMock).not.toHaveBeenCalled();
    // Process-wide invariant: no matter how many garbage requests this test
    // file has issued (including earlier tests), the fallback rendered once.
    expect(fallbackRenderCount).toBe(1);
  });

  it('sets CDN cache headers with stale-while-revalidate on a successful render', async () => {
    const res = await request(createApp()).get(`/api/og/soul-card?userId=${VALID_USER}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/png/);
    const cacheControl = res.headers['cache-control'] || '';
    expect(cacheControl).toContain('public');
    expect(cacheControl).toContain('max-age=3600');
    expect(cacheControl).toContain('s-maxage=3600');
    expect(cacheControl).toContain('stale-while-revalidate');
    expect(renderSoulCardMock).toHaveBeenCalledTimes(1);
  });

  it('serves the PNG from Redis cache without re-rendering', async () => {
    cacheStore.set(`og:card:${VALID_USER}`, Buffer.from('cached-png').toString('base64'));

    const res = await request(createApp()).get(`/api/og/soul-card?userId=${VALID_USER}`);

    expect(res.status).toBe(200);
    expect(res.body.toString()).toBe('cached-png');
    expect(renderSoulCardMock).not.toHaveBeenCalled();
    expect(renderFallbackCardMock).not.toHaveBeenCalled();
  });

  it('serves the fallback (not the private card) to non-owners of a private signature', async () => {
    signatureRow.is_public = false;

    const res = await request(createApp()).get(`/api/og/soul-card?userId=${VALID_USER}`);

    expect(res.status).toBe(200);
    expect(renderSoulCardMock).not.toHaveBeenCalled();
    expect(res.body.toString()).toBe('fallback-png');
  });
});
