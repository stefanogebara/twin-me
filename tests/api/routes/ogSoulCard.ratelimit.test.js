/**
 * Rate-limit test for GET /api/og/soul-card.
 *
 * The endpoint is deliberately public (OG/social image) and the render is
 * CPU-heavy (satori + resvg), so it needs its own per-IP limiter on top of
 * the generic apiLimiter. OG_CARD_RATE_LIMIT_MAX is read at module load —
 * set it small here before importing the route.
 */
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

process.env.JWT_SECRET = 'test-secret';
process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';
process.env.ENCRYPTION_KEY = '0'.repeat(64);
process.env.NODE_ENV = 'test';
process.env.OG_CARD_RATE_LIMIT_MAX = '3';

vi.mock('../../../api/services/soulCardRenderer.js', () => ({
  renderSoulCard: vi.fn(async () => Buffer.from('soul-card-png')),
  renderFallbackCard: vi.fn(async () => Buffer.from('fallback-png')),
}));

vi.mock('../../../api/services/redisClient.js', () => ({
  get: vi.fn(async () => null),
  set: vi.fn(async () => {}),
  del: vi.fn(async () => {}),
  getRedisClient: vi.fn(() => null),
  isRedisAvailable: vi.fn(() => false),
}));

vi.mock('../../../api/services/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock('../../../api/services/database.js', () => ({
  supabaseAdmin: null,
  serverDb: {},
}));

const ogRoutes = (await import('../../../api/routes/og-image.js')).default;

function createApp() {
  const app = express();
  // Stable IP so the limiter buckets all requests together
  app.use((req, _res, next) => {
    Object.defineProperty(req, 'ip', { value: '10.0.0.99', configurable: true });
    next();
  });
  app.use('/api', ogRoutes);
  return app;
}

describe('GET /api/og/soul-card rate limiting', () => {
  it('allows OG_CARD_RATE_LIMIT_MAX requests then returns 429', async () => {
    const app = createApp();

    const statuses = [];
    for (let i = 0; i < 4; i++) {
      const res = await request(app).get('/api/og/soul-card?userId=garbage');
      statuses.push(res.status);
    }

    expect(statuses.slice(0, 3)).toEqual([200, 200, 200]);
    expect(statuses[3]).toBe(429);
  });

  it('does not rate-limit the cheap OG HTML route with the card limiter', async () => {
    const app = createApp();
    // Limiter bucket for this IP is already exhausted by the previous test
    // (module-level limiter state) — /s/:userId must still respond.
    const res = await request(app).get('/api/s/not-a-uuid');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
  });
});
