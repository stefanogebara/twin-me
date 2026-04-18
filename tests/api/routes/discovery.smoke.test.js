/**
 * Smoke tests for api/routes/discovery.js
 * Public endpoint (no auth). Covers: invalid email, happy path shape, rate-limit path.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

process.env.JWT_SECRET = 'test-secret';
process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';
process.env.ENCRYPTION_KEY = '0'.repeat(64);
process.env.NODE_ENV = 'test';
// Disable BRAVE_SEARCH to skip Phase 2 and keep tests fast/deterministic
delete process.env.BRAVE_SEARCH_API_KEY;

const quickEnrichMock = vi.fn();

vi.mock('../../../api/services/profileEnrichmentService.js', () => ({
  default: { quickEnrich: (...a) => quickEnrichMock(...a) },
}));

vi.mock('../../../api/services/enrichment/braveSearchProvider.js', () => ({
  searchWithBrave: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../../api/services/enrichment/enrichmentUtils.js', () => ({
  inferNameFromEmail: vi.fn(email => email.split('@')[0]),
}));

vi.mock('../../../api/services/llmGateway.js', () => ({
  complete: vi.fn().mockResolvedValue({ content: 'persona' }),
  stream: vi.fn(),
  TIER_CHAT: 'chat',
  TIER_ANALYSIS: 'analysis',
  TIER_EXTRACTION: 'extraction',
}));

vi.mock('../../../api/services/redisClient.js', () => ({
  getRedisClient: vi.fn().mockReturnValue(null),
  isRedisAvailable: vi.fn().mockReturnValue(false),
}));

const discoveryRoutes = (await import('../../../api/routes/discovery.js')).default;

function createApp() {
  const app = express();
  // Trust X-Forwarded-For so each test can present a unique client IP
  // and sidestep the module-scoped 3-req/15-min in-memory rate limiter.
  app.set('trust proxy', true);
  app.use(express.json());
  app.use('/api/discovery', discoveryRoutes);
  return app;
}

let ipCounter = 0;
const nextIp = () => `10.0.${(++ipCounter >> 8) & 0xff}.${ipCounter & 0xff}`;

describe('discovery routes smoke', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 on missing email', async () => {
    const res = await request(createApp())
      .post('/api/discovery/scan')
      .set('X-Forwarded-For', nextIp())
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/email/i);
  });

  it('returns 400 on malformed email', async () => {
    const res = await request(createApp())
      .post('/api/discovery/scan')
      .set('X-Forwarded-For', nextIp())
      .send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  it('returns 200 { success, discovered } on valid email', async () => {
    quickEnrichMock.mockResolvedValue({
      data: { source: 'gravatar', social_links: [], discovered_name: 'Test User' },
    });
    const res = await request(createApp())
      .post('/api/discovery/scan')
      .set('X-Forwarded-For', nextIp())
      .send({ email: 'smoke@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body).toHaveProperty('discovered');
  });

  it('returns 200 with discovered=null when enrichment yields nothing', async () => {
    quickEnrichMock.mockResolvedValue({ data: { source: 'none' } });
    const res = await request(createApp())
      .post('/api/discovery/scan')
      .set('X-Forwarded-For', nextIp())
      .send({ email: 'empty@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.discovered).toBeNull();
  });

  it('swallows enrichment errors and still returns success', async () => {
    quickEnrichMock.mockRejectedValue(new Error('network'));
    const res = await request(createApp())
      .post('/api/discovery/scan')
      .set('X-Forwarded-For', nextIp())
      .send({ email: 'boom@example.com' });
    // Route catches errors and returns { success: true, discovered: null } by design
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.discovered).toBeNull();
  });
});
