/**
 * Smoke tests for POST /api/task-brief (api/routes/task-brief.js)
 * Auth guard, body validation, service delegation, error mapping.
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

vi.mock('../../../api/services/database.js', () => ({
  supabaseAdmin: {
    // auth middleware email-verification lookup on `users`
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { email_verified: true, created_at: new Date().toISOString() },
        error: null,
      }),
    })),
  },
  serverDb: {},
}));

const compileTaskBriefMock = vi.fn();
vi.mock('../../../api/services/taskBriefService.js', () => ({
  compileTaskBrief: (...a) => compileTaskBriefMock(...a),
}));

const TEST_USER = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';
const signToken = () => jwt.sign({ id: TEST_USER }, 'test-secret', { expiresIn: '1h' });

const taskBriefRoutes = (await import('../../../api/routes/task-brief.js')).default;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/task-brief', taskBriefRoutes);
  return app;
}

describe('POST /api/task-brief smoke', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects unauthenticated requests with 401', async () => {
    const res = await request(createApp()).post('/api/task-brief').send({ task: 'book dinner' });
    expect(res.status).toBe(401);
    expect(compileTaskBriefMock).not.toHaveBeenCalled();
  });

  it('rejects missing or too-short task with 400', async () => {
    for (const body of [{}, { task: '' }, { task: 'ab' }, { task: 42 }]) {
      const res = await request(createApp())
        .post('/api/task-brief')
        .set('Authorization', `Bearer ${signToken()}`)
        .send(body);
      expect(res.status).toBe(400);
    }
    expect(compileTaskBriefMock).not.toHaveBeenCalled();
  });

  it('rejects oversized task with 400', async () => {
    const res = await request(createApp())
      .post('/api/task-brief')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({ task: 'x'.repeat(2001) });
    expect(res.status).toBe(400);
  });

  it('delegates to the service with userId and trimmed task on the happy path', async () => {
    const brief = { task: 'book dinner', preferences: [], constraints: [], autonomy: { confirm_before_payment: true } };
    compileTaskBriefMock.mockResolvedValue(brief);

    const res = await request(createApp())
      .post('/api/task-brief')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({ task: '  book dinner  ' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(brief);
    expect(compileTaskBriefMock).toHaveBeenCalledWith(TEST_USER, 'book dinner');
  });

  it('maps service failures to 500 without leaking internals outside development', async () => {
    compileTaskBriefMock.mockRejectedValue(new Error('extraction blew up'));
    const res = await request(createApp())
      .post('/api/task-brief')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({ task: 'book dinner' });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    // NODE_ENV=test, not development — message must be generic.
    expect(res.body.error).toBe('Internal server error');
  });
});
