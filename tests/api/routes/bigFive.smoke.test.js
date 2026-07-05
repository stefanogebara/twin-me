/**
 * Smoke tests for api/routes/big-five.js
 * Covers: optionalAuth demo mode on /questions (no 401), authenticateToken gate
 * on /responses, response value 1-5 validation, invalid domain 400, missing
 * scores 404, downstream 500.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'test-secret';
process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_ANON_KEY = 'test-anon';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';
process.env.ENCRYPTION_KEY = '0'.repeat(64);
process.env.NODE_ENV = 'test';

const getQuestionsMock = vi.fn(() => [
  { id: 'q1', domain: 'O', facet: 1, facet_name: 'Imagination', text: 'q', keyed: 'plus', order: 1 },
]);
const getUserResponsesMock = vi.fn().mockResolvedValue([]);
const getUserScoresMock = vi.fn();
const getUserFacetScoresMock = vi.fn().mockResolvedValue([]);
const saveResponsesMock = vi.fn().mockResolvedValue(undefined);

vi.mock('../../../api/services/bigFiveAssessmentService.js', () => ({
  getQuestions: (...a) => getQuestionsMock(...a),
  getQuestionMetadata: () => ({ scale: {}, domains: {}, facets: {} }),
  calculateAllScores: vi.fn(() => ({})),
  saveResponses: (...a) => saveResponsesMock(...a),
  calculateAndSaveScores: vi.fn().mockResolvedValue({}),
  getUserScores: (...a) => getUserScoresMock(...a),
  getUserFacetScores: (...a) => getUserFacetScoresMock(...a),
  getUserResponses: (...a) => getUserResponsesMock(...a),
  formatScoresForResponse: vi.fn(() => ({})),
  getDomainInterpretation: vi.fn(() => 'interpretation'),
}));

vi.mock('../../../api/services/database.js', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { email_verified: true, created_at: new Date().toISOString() }, error: null }),
    })),
  },
  serverDb: {},
}));

const TEST_USER = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';
const signToken = () => jwt.sign({ id: TEST_USER }, 'test-secret', { expiresIn: '1h' });

const bigFiveRoutes = (await import('../../../api/routes/big-five.js')).default;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/big-five', bigFiveRoutes);
  return app;
}

describe('big-five routes smoke', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getQuestionsMock.mockReturnValue([
      { id: 'q1', domain: 'O', facet: 1, facet_name: 'Imagination', text: 'q', keyed: 'plus', order: 1 },
    ]);
    getUserResponsesMock.mockResolvedValue([]);
  });

  it('GET /questions works unauthenticated (demo mode, no 401)', async () => {
    const res = await request(createApp()).get('/api/big-five/questions');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.isDemo).toBe(true);
    expect(Array.isArray(res.body.questions)).toBe(true);
  });

  it('POST /responses rejects unauthenticated request with 401', async () => {
    const res = await request(createApp())
      .post('/api/big-five/responses')
      .send({ responses: [{ questionId: 'q1', value: 3 }] });
    expect(res.status).toBe(401);
  });

  it('POST /responses returns 400 when responses is not an array', async () => {
    const res = await request(createApp())
      .post('/api/big-five/responses')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({ responses: 'nope' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Responses array required/i);
  });

  it('POST /responses returns 400 for a value outside 1-5', async () => {
    const res = await request(createApp())
      .post('/api/big-five/responses')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({ responses: [{ questionId: 'q1', value: 9 }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/value \(1-5\) required/i);
  });

  it('GET /interpretation/:domain returns 400 for an invalid domain', async () => {
    const res = await request(createApp())
      .get('/api/big-five/interpretation/zzz')
      .set('Authorization', `Bearer ${signToken()}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid domain/i);
  });

  it('GET /interpretation/:domain returns 404 when the user has no scores', async () => {
    getUserScoresMock.mockResolvedValue(null);
    const res = await request(createApp())
      .get('/api/big-five/interpretation/openness')
      .set('Authorization', `Bearer ${signToken()}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/No scores found/i);
  });

  it('GET /scores returns hasScores:false when no data', async () => {
    getUserScoresMock.mockResolvedValue(null);
    getUserResponsesMock.mockResolvedValue([]);
    const res = await request(createApp())
      .get('/api/big-five/scores')
      .set('Authorization', `Bearer ${signToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.hasScores).toBe(false);
  });

  it('GET /questions returns 500 when the service throws', async () => {
    getQuestionsMock.mockImplementation(() => { throw new Error('questions unavailable'); });
    const res = await request(createApp()).get('/api/big-five/questions');
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Failed to fetch questions');
  });
});
