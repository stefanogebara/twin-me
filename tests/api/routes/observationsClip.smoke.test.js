/**
 * Smoke tests for api/routes/observations-clip.js
 * POST /api/observations/clip — desktop activity clip sync.
 *
 * Covers: auth guard (401), malformed payload (400), happy-path sync mapping,
 * and oversized-content drop. addMemory is mocked so tests never hit the DB.
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

const addMemoryMock = vi.fn();

vi.mock('../../../api/services/memoryStreamService.js', () => ({
  addMemory: (...a) => addMemoryMock(...a),
}));

// Auth middleware does an email-verification lookup against supabaseAdmin.
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

const observationsClipRoutes = (await import('../../../api/routes/observations-clip.js')).default;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/observations', observationsClipRoutes);
  return app;
}

describe('observations clip route smoke', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects unauthenticated request with 401', async () => {
    const res = await request(createApp())
      .post('/api/observations/clip')
      .send({ clips: [] });
    expect(res.status).toBe(401);
  });

  it('returns 400 when clips is not an array', async () => {
    const res = await request(createApp())
      .post('/api/observations/clip')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({ clips: 'nope' });
    expect(res.status).toBe(400);
  });

  it('syncs a valid 1-clip batch and returns local_id -> memory_id mapping', async () => {
    addMemoryMock.mockResolvedValue({ id: 'mem-123', importance_score: 4 });
    const res = await request(createApp())
      .post('/api/observations/clip')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({
        clips: [
          { local_id: 1, app_name: 'Code', window_title: 'server.js', started_at: 1716800000 },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.dropped).toEqual([]);
    expect(res.body.synced).toEqual([{ local_id: 1, memory_id: 'mem-123' }]);
    expect(addMemoryMock).toHaveBeenCalledTimes(1);
    // addMemory(userId, content, type, metadata, options) — verify real signature usage
    const [userId, , memoryType, metadata] = addMemoryMock.mock.calls[0];
    expect(userId).toBe(TEST_USER);
    expect(memoryType).toBe('observation');
    expect(metadata.source).toBe('desktop_clip');
    expect(metadata.app).toBe('Code');
  });

  it('drops a clip whose content exceeds 8000 chars with reason content_too_long', async () => {
    addMemoryMock.mockResolvedValue({ id: 'mem-should-not-happen' });
    const longContent = 'x'.repeat(8001);
    const res = await request(createApp())
      .post('/api/observations/clip')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({
        clips: [
          { local_id: 7, app_name: 'Notes', content: longContent, started_at: 1716800001 },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.synced).toEqual([]);
    expect(res.body.dropped).toEqual([{ local_id: 7, reason: 'content_too_long' }]);
    expect(addMemoryMock).not.toHaveBeenCalled();
  });
});
