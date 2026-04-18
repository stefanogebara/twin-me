/**
 * Smoke tests for api/routes/wiki.js
 * Covers: auth guard, invalid domain, happy-path shape, downstream error.
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

// --- Mocks ---
const getWikiPagesMock = vi.fn();
const getWikiPageMock = vi.fn();
const getWikiLogsMock = vi.fn();
const compileWikiPagesMock = vi.fn();
const buildWikiGraphDataMock = vi.fn();
const detectWikiLintsMock = vi.fn();

vi.mock('../../../api/services/wikiCompilationService.js', () => ({
  getWikiPages: (...a) => getWikiPagesMock(...a),
  getWikiPage: (...a) => getWikiPageMock(...a),
  getWikiLogs: (...a) => getWikiLogsMock(...a),
  compileWikiPages: (...a) => compileWikiPagesMock(...a),
  buildWikiGraphData: (...a) => buildWikiGraphDataMock(...a),
  detectWikiLints: (...a) => detectWikiLintsMock(...a),
}));

vi.mock('../../../api/services/database.js', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      single: vi.fn().mockResolvedValue({ data: { email_verified: true, created_at: new Date().toISOString() }, error: null }),
    })),
  },
  serverDb: {},
}));

const TEST_USER = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';
const signToken = (payload = { id: TEST_USER }) => jwt.sign(payload, 'test-secret', { expiresIn: '1h' });

const wikiRoutes = (await import('../../../api/routes/wiki.js')).default;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/wiki', wikiRoutes);
  return app;
}

describe('wiki routes smoke', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated request with 401', async () => {
    const res = await request(createApp()).get('/api/wiki/pages');
    expect(res.status).toBe(401);
  });

  it('returns 400 on invalid domain', async () => {
    const res = await request(createApp())
      .get('/api/wiki/pages/not-a-domain')
      .set('Authorization', `Bearer ${signToken()}`);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/Invalid domain/);
  });

  it('returns 200 shape { success, data } for GET /pages', async () => {
    getWikiPagesMock.mockResolvedValue([{ domain: 'personality', content: 'x' }]);
    const res = await request(createApp())
      .get('/api/wiki/pages')
      .set('Authorization', `Bearer ${signToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(getWikiPagesMock).toHaveBeenCalledWith(TEST_USER);
  });

  it('returns 404 when domain page missing', async () => {
    getWikiPageMock.mockResolvedValue(null);
    const res = await request(createApp())
      .get('/api/wiki/pages/personality')
      .set('Authorization', `Bearer ${signToken()}`);
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('returns 500 when service throws', async () => {
    getWikiPagesMock.mockRejectedValue(new Error('boom'));
    const res = await request(createApp())
      .get('/api/wiki/pages')
      .set('Authorization', `Bearer ${signToken()}`);
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});
