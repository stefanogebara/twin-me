/**
 * Smoke tests for api/routes/goals.js
 * Covers: auth guard, invalid filter, valid list response, 500 on downstream failure.
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

const getUserGoalsMock = vi.fn();
const getGoalWithProgressMock = vi.fn();
const acceptGoalMock = vi.fn();
const abandonGoalMock = vi.fn();
const dismissGoalMock = vi.fn();
const createManualGoalMock = vi.fn();
const completeGoalMock = vi.fn();
const getGoalSummaryMock = vi.fn();

vi.mock('../../../api/services/goalTrackingService.js', () => ({
  getUserGoals: (...a) => getUserGoalsMock(...a),
  getGoalWithProgress: (...a) => getGoalWithProgressMock(...a),
  acceptGoal: (...a) => acceptGoalMock(...a),
  abandonGoal: (...a) => abandonGoalMock(...a),
  dismissGoal: (...a) => dismissGoalMock(...a),
  createManualGoal: (...a) => createManualGoalMock(...a),
  completeGoal: (...a) => completeGoalMock(...a),
  getGoalSummary: (...a) => getGoalSummaryMock(...a),
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

const goalsRoutes = (await import('../../../api/routes/goals.js')).default;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/goals', goalsRoutes);
  return app;
}

describe('goals routes smoke', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects unauthenticated request with 401', async () => {
    const res = await request(createApp()).get('/api/goals');
    expect(res.status).toBe(401);
  });

  it('returns 400 on invalid status filter', async () => {
    const res = await request(createApp())
      .get('/api/goals?status=bogus')
      .set('Authorization', `Bearer ${signToken()}`);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/Invalid status/);
  });

  it('returns list shape { success, data, pagination } on happy path', async () => {
    getUserGoalsMock.mockResolvedValue({ data: [{ id: 'g1' }], total: 1 });
    const res = await request(createApp())
      .get('/api/goals')
      .set('Authorization', `Bearer ${signToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.pagination).toBeDefined();
  });

  it('rejects POST /api/goals with missing title as 400', async () => {
    const res = await request(createApp())
      .post('/api/goals')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/title is required/i);
  });

  it('returns 400 for invalid UUID param on GET /:id', async () => {
    const res = await request(createApp())
      .get('/api/goals/not-a-uuid')
      .set('Authorization', `Bearer ${signToken()}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid goal ID/);
  });

  it('returns 500 when downstream throws', async () => {
    getUserGoalsMock.mockRejectedValue(new Error('db down'));
    const res = await request(createApp())
      .get('/api/goals')
      .set('Authorization', `Bearer ${signToken()}`);
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});
