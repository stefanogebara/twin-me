/**
 * Discovery route rate-limit fail-open test.
 *
 * Verifies: when the Redis client throws (or is unavailable), the route falls
 * back to the in-memory limiter rather than 429-ing or 500-ing. Three sequential
 * requests from the same IP should all pass (<= RATE_LIMIT_MAX = 3).
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

// Redis client: simulate "unavailable" — either getRedisClient returns null,
// OR it throws on .incr. We exercise BOTH: first unavailable-flag, then throwing.
vi.mock('../../../api/services/redisClient.js', () => ({
  getRedisClient: vi.fn(() => {
    // Throw → caught by the route's try/catch → memory fallback
    throw new Error('redis connect refused');
  }),
  isRedisAvailable: vi.fn(() => false),
}));

// Stub heavy services the /scan handler depends on so tests don't hit the network
vi.mock('../../../api/services/profileEnrichmentService.js', () => ({
  default: {
    quickEnrich: vi.fn().mockResolvedValue({
      data: { source: 'none', social_links: [] },
    }),
  },
}));

vi.mock('../../../api/services/enrichment/braveSearchProvider.js', () => ({
  searchWithBrave: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../../api/services/enrichment/enrichmentUtils.js', () => ({
  inferNameFromEmail: vi.fn().mockReturnValue('Test User'),
}));

vi.mock('../../../api/services/llmGateway.js', () => ({
  complete: vi.fn().mockResolvedValue({ content: 'a persona narrative' }),
  TIER_ANALYSIS: 'analysis',
}));

vi.mock('../../../api/services/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  }),
}));

// Ensure Brave key is NOT set → the heavy Phase 2 path is skipped
delete process.env.BRAVE_SEARCH_API_KEY;

const discoveryRoutes = (await import('../../../api/routes/discovery.js')).default;

function createApp() {
  const app = express();
  app.use(express.json());
  // Force a stable IP so the limiter groups the 3 requests together
  app.use((req, _res, next) => {
    Object.defineProperty(req, 'ip', { value: '10.0.0.42', configurable: true });
    next();
  });
  app.use('/api/discovery', discoveryRoutes);
  return app;
}

describe('discovery /scan rate-limit fail-open behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('falls back to in-memory limiter when Redis throws (fail-open, 3 requests all succeed)', async () => {
    const app = createApp();

    const results = [];
    for (let i = 0; i < 3; i++) {
      const res = await request(app)
        .post('/api/discovery/scan')
        .send({ email: 'alice@example.com', name: 'Alice' });
      results.push(res.status);
    }

    // None of the 3 should be 429 (fail-open proof). The route may return 200
    // (scan succeeded) or 500 (downstream), but NOT 429 and NOT rejected on
    // rate-limit grounds. We assert: no 429 in the set.
    expect(results.some(s => s === 429)).toBe(false);
    // First request must succeed end-to-end (200) since phase 1 is mocked to resolve.
    expect(results[0]).toBe(200);
  });

  it('blocks on the 4th request because memory limiter still counts (boundary check)', async () => {
    const app = createApp();

    // Reuse same IP → exhaust 3 allowed requests first
    for (let i = 0; i < 3; i++) {
      await request(app).post('/api/discovery/scan').send({ email: 'boundary@example.com' });
    }
    const fourth = await request(app)
      .post('/api/discovery/scan')
      .send({ email: 'boundary@example.com' });

    // The 4th should be 429 — proving memory limiter ACTUALLY works (not no-op fail-open)
    expect(fourth.status).toBe(429);
  });
});
