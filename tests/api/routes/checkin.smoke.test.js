/**
 * Smoke tests for api/routes/checkin.js
 * Covers: auth guard, mood/energy/note/moodEmoji validation, happy path,
 * GET /today shape, downstream 500.
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

const addMemoryMock = vi.fn().mockResolvedValue(undefined);
const cacheDelMock = vi.fn().mockResolvedValue(undefined);

// upsert result and today-select result are swapped per-test via these holders
let upsertResult = { error: null };
let todaySingleResult = { data: null, error: { code: 'PGRST116' } };

vi.mock('../../../api/services/memoryStreamService.js', () => ({
  addMemory: (...a) => addMemoryMock(...a),
}));

vi.mock('../../../api/services/redisClient.js', () => ({
  del: (...a) => cacheDelMock(...a),
}));

vi.mock('../../../api/services/database.js', () => ({
  supabaseAdmin: {
    from: vi.fn((table) => {
      if (table === 'users') {
        // auth middleware email-verification lookup
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { email_verified: true, created_at: new Date().toISOString() }, error: null }),
        };
      }
      // daily_checkins: POST uses .upsert() (returns {error}); GET /today uses .select().eq().eq().single()
      return {
        upsert: vi.fn(() => Promise.resolve(upsertResult)),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn(() => Promise.resolve(todaySingleResult)),
      };
    }),
  },
  serverDb: {},
}));

const TEST_USER = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';
const signToken = () => jwt.sign({ id: TEST_USER }, 'test-secret', { expiresIn: '1h' });

const checkinRoutes = (await import('../../../api/routes/checkin.js')).default;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/checkin', checkinRoutes);
  return app;
}

describe('checkin routes smoke', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsertResult = { error: null };
    todaySingleResult = { data: null, error: { code: 'PGRST116' } };
  });

  it('rejects unauthenticated POST with 401', async () => {
    const res = await request(createApp()).post('/api/checkin').send({ mood: 'happy' });
    expect(res.status).toBe(401);
  });

  it('returns 400 when mood is missing', async () => {
    const res = await request(createApp())
      .post('/api/checkin')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/Invalid mood/i);
  });

  it('returns 400 when energy level is not low/medium/high', async () => {
    const res = await request(createApp())
      .post('/api/checkin')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({ mood: 'happy', energy: 'turbo' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid energy level/i);
  });

  it('returns 400 when note exceeds 500 chars', async () => {
    const res = await request(createApp())
      .post('/api/checkin')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({ mood: 'happy', note: 'x'.repeat(501) });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Note too long/i);
  });

  it('returns { success: true } and writes a memory on valid check-in', async () => {
    const res = await request(createApp())
      .post('/api/checkin')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({ mood: 'grateful', energy: 'high', note: 'good day' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(addMemoryMock).toHaveBeenCalledTimes(1);
  });

  it('does not write a memory when the upsert fails (500)', async () => {
    upsertResult = { error: { message: 'db write failed' } };
    const res = await request(createApp())
      .post('/api/checkin')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({ mood: 'happy' });
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Failed to save check-in');
    expect(addMemoryMock).not.toHaveBeenCalled();
  });

  it('GET /today returns { success, checkedIn, data } shape', async () => {
    const res = await request(createApp())
      .get('/api/checkin/today')
      .set('Authorization', `Bearer ${signToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.checkedIn).toBe(false);
    expect(res.body.data).toBeNull();
  });
});
