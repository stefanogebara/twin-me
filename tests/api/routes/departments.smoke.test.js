/**
 * Smoke tests for api/routes/departments.js
 * Covers: auth guard, invalid name, happy-path list shape, 500 on downstream failure.
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

const getAllDepartmentsMock = vi.fn();
const getDepartmentStatusMock = vi.fn();
const updateDepartmentAutonomyMock = vi.fn();

vi.mock('../../../api/services/departmentService.js', () => ({
  getAllDepartments: (...a) => getAllDepartmentsMock(...a),
  getDepartmentStatus: (...a) => getDepartmentStatusMock(...a),
  updateDepartmentAutonomy: (...a) => updateDepartmentAutonomyMock(...a),
  getPendingProposals: vi.fn().mockResolvedValue([]),
  checkDepartmentHeartbeats: vi.fn().mockResolvedValue({ checked: 0 }),
  getAllDepartmentActivity: vi.fn().mockResolvedValue([]),
  getDepartmentActivity: vi.fn().mockResolvedValue([]),
  proposeDepartmentAction: vi.fn().mockResolvedValue({ id: 'p1' }),
}));

vi.mock('../../../api/services/departmentBudgetService.js', () => ({
  getAllDepartmentBudgets: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../../api/services/autonomyService.js', () => ({
  executeApprovedAction: vi.fn().mockResolvedValue({ ok: true }),
  recordActionResponse: vi.fn().mockResolvedValue(undefined),
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

const departmentsRoutes = (await import('../../../api/routes/departments.js')).default;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/departments', departmentsRoutes);
  return app;
}

describe('departments routes smoke', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects unauthenticated request with 401', async () => {
    const res = await request(createApp()).get('/api/departments');
    expect(res.status).toBe(401);
  });

  it('returns 200 with departments list on happy path', async () => {
    getAllDepartmentsMock.mockResolvedValue([{ name: 'communications', autonomy: 1 }]);
    const res = await request(createApp())
      .get('/api/departments')
      .set('Authorization', `Bearer ${signToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.departments)).toBe(true);
  });

  it('returns 400 for unknown department name', async () => {
    const res = await request(createApp())
      .get('/api/departments/nonsense')
      .set('Authorization', `Bearer ${signToken()}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Unknown department/);
  });

  it('returns 400 when autonomyLevel out of range', async () => {
    const res = await request(createApp())
      .put('/api/departments/communications/autonomy')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({ autonomyLevel: 99 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/autonomyLevel/);
  });

  it('returns 500 when downstream throws', async () => {
    getAllDepartmentsMock.mockRejectedValue(new Error('fail'));
    const res = await request(createApp())
      .get('/api/departments')
      .set('Authorization', `Bearer ${signToken()}`);
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});
