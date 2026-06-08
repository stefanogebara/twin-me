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

  it('truncates an over-long window_title instead of 400-ing the batch (keeps the clip)', async () => {
    // Windows captures raw OS window titles with no length cap; long browser/doc
    // titles routinely exceed the 512 schema limit. A reject here 400s the whole
    // batch, which the desktop then retries forever — poisoning the queue. We must
    // truncate and keep the clip instead.
    addMemoryMock.mockResolvedValue({ id: 'mem-long-title' });
    const longTitle = 'T'.repeat(600); // > 512
    const res = await request(createApp())
      .post('/api/observations/clip')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({
        clips: [
          { local_id: 11, app_name: 'Chrome', window_title: longTitle, started_at: 1716800002 },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.synced).toEqual([{ local_id: 11, memory_id: 'mem-long-title' }]);
    expect(res.body.dropped).toEqual([]);
    const [, , , metadata] = addMemoryMock.mock.calls[0];
    expect(metadata.window.length).toBe(512); // truncated, not rejected
  });

  it('drops only the malformed clip and still syncs the valid ones (one bad clip cannot poison the batch)', async () => {
    addMemoryMock.mockResolvedValue({ id: 'mem-ok' });
    const res = await request(createApp())
      .post('/api/observations/clip')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({
        clips: [
          { local_id: 21, app_name: 'Code', window_title: 'ok.js', started_at: 1716800003 },
          { local_id: 22.5, app_name: 'Bad', window_title: 'x', started_at: 1716800004 }, // non-integer local_id → uncoercible → invalid
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.synced).toEqual([{ local_id: 21, memory_id: 'mem-ok' }]);
    expect(res.body.dropped).toEqual([{ local_id: 22.5, reason: 'invalid_clip' }]);
    expect(addMemoryMock).toHaveBeenCalledTimes(1);
  });

  it('coerces a blank app_name to a default instead of silently dropping the clip', async () => {
    // Regression: real desktop clips were silently rejected (200 OK, zero rows)
    // when a field tripped the schema. Coerce-and-keep, never drop a real clip.
    addMemoryMock.mockResolvedValue({ id: 'mem-blank-app' });
    const res = await request(createApp())
      .post('/api/observations/clip')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({
        clips: [{ local_id: 31, app_name: '', window_title: 'x', started_at: 1716800005 }],
      });
    expect(res.status).toBe(200);
    expect(res.body.synced).toEqual([{ local_id: 31, memory_id: 'mem-blank-app' }]);
    expect(res.body.dropped).toEqual([]);
    const [, , , metadata] = addMemoryMock.mock.calls[0];
    expect(metadata.app).toBe('Unknown'); // blank app coerced
  });

  it('coerces a non-positive started_at to a valid timestamp instead of dropping', async () => {
    addMemoryMock.mockResolvedValue({ id: 'mem-bad-ts' });
    const res = await request(createApp())
      .post('/api/observations/clip')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({
        clips: [{ local_id: 32, app_name: 'Notepad', started_at: 0 }], // zero → coerced to now()
      });
    expect(res.status).toBe(200);
    expect(res.body.synced).toEqual([{ local_id: 32, memory_id: 'mem-bad-ts' }]);
    expect(res.body.dropped).toEqual([]);
    const [, , , metadata] = addMemoryMock.mock.calls[0];
    expect(Number.isInteger(metadata.started_at) && metadata.started_at > 0).toBe(true);
  });
});
