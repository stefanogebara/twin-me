/**
 * Smoke tests for api/routes/life-story.js — the Story Chapters API.
 *
 * The route is thin (auth guard + validation + service delegation + error
 * mapping); these tests pin exactly that. Service behavior is covered in
 * tests/api/services/lifeStorySessions.test.js.
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

// Auth middleware reads users.email_verified — serve it from the DB mock.
vi.mock('../../../api/services/database.js', () => ({
  supabaseAdmin: {
    from: vi.fn(() => {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        single: vi.fn(() =>
          Promise.resolve({
            data: { email_verified: true, created_at: new Date().toISOString() },
            error: null,
          })
        ),
      };
      return builder;
    }),
  },
  serverDb: {},
}));

vi.mock('../../../api/services/lifeStoryService.js', () => ({
  getLifeStoryStatus: vi.fn(),
  startSession: vi.fn(),
  processTurn: vi.fn(),
}));

const { getLifeStoryStatus, startSession, processTurn } = await import(
  '../../../api/services/lifeStoryService.js'
);
const lifeStoryRoutes = (await import('../../../api/routes/life-story.js')).default;

const TEST_USER = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';
const signToken = () => jwt.sign({ id: TEST_USER }, 'test-secret', { expiresIn: '1h' });

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/life-story', lifeStoryRoutes);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('auth guard', () => {
  it('rejects unauthenticated requests on every endpoint', async () => {
    const app = createApp();
    expect((await request(app).get('/api/life-story/status')).status).toBe(401);
    expect((await request(app).post('/api/life-story/session/start').send({})).status).toBe(401);
    expect((await request(app).post('/api/life-story/session/turn').send({})).status).toBe(401);
  });
});

describe('GET /api/life-story/status', () => {
  it('returns the chapter list from the service', async () => {
    getLifeStoryStatus.mockResolvedValue({
      chapters: [{ id: 'your_story', completed: false }],
      completedCount: 0,
      totalChapters: 8,
      suggestedNext: 'your_story',
    });

    const res = await request(createApp())
      .get('/api/life-story/status')
      .set('Authorization', `Bearer ${signToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.totalChapters).toBe(8);
    expect(getLifeStoryStatus).toHaveBeenCalledWith(TEST_USER);
  });
});

describe('POST /api/life-story/session/start', () => {
  it('400s without a chapterId', async () => {
    const res = await request(createApp())
      .post('/api/life-story/session/start')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('404s on an unknown chapter (service throws)', async () => {
    startSession.mockRejectedValue(new Error('Unknown chapter: nope'));
    const res = await request(createApp())
      .post('/api/life-story/session/start')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({ chapterId: 'nope' });
    expect(res.status).toBe(404);
  });

  it('starts a session on the happy path', async () => {
    startSession.mockResolvedValue({
      sessionId: 'sess-1',
      chapterId: 'your_story',
      resumed: false,
      utterance: 'Intro. Tell me the story of your life...',
      questionIndex: 0,
    });

    const res = await request(createApp())
      .post('/api/life-story/session/start')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({ chapterId: 'your_story' });

    expect(res.status).toBe(200);
    expect(res.body.data.sessionId).toBe('sess-1');
    expect(startSession).toHaveBeenCalledWith(TEST_USER, 'your_story');
  });
});

describe('POST /api/life-story/session/turn', () => {
  it('400s without sessionId or a non-empty answer', async () => {
    const app = createApp();
    const token = signToken();
    expect(
      (await request(app).post('/api/life-story/session/turn')
        .set('Authorization', `Bearer ${token}`).send({ answer: 'hi there' })).status
    ).toBe(400);
    expect(
      (await request(app).post('/api/life-story/session/turn')
        .set('Authorization', `Bearer ${token}`).send({ sessionId: 's', answer: '  ' })).status
    ).toBe(400);
  });

  it('404s when the service cannot find the session', async () => {
    processTurn.mockResolvedValue(null);
    const res = await request(createApp())
      .post('/api/life-story/session/turn')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({ sessionId: 'sess-x', answer: 'my answer' });
    expect(res.status).toBe(404);
  });

  it('returns the interviewer move on the happy path', async () => {
    processTurn.mockResolvedValue({
      kind: 'followup',
      utterance: 'Which city was that?',
      questionIndex: 0,
      done: false,
    });

    const res = await request(createApp())
      .post('/api/life-story/session/turn')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({ sessionId: 'sess-1', answer: 'I moved around a lot.' });

    expect(res.status).toBe(200);
    expect(res.body.data.kind).toBe('followup');
    expect(processTurn).toHaveBeenCalledWith(TEST_USER, 'sess-1', 'I moved around a lot.');
  });
});
