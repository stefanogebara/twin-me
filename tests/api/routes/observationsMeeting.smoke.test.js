/**
 * Smoke tests for api/routes/observations-meeting.js
 * POST /api/observations/meeting — desktop meeting session sync (Phase 5A).
 *
 * Covers: auth guard (401), malformed payload (400), happy-path sync mapping
 * with a duration-aware summary, and a no-end-time session ("...started").
 * addMemory is mocked so tests never hit the DB.
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

// Transcript-bearing meetings get an LLM-generated summary (Phase 5B). Mock the
// gateway so tests never hit a real model; assert on whether/how it's called.
const completeMock = vi.fn();
vi.mock('../../../api/services/llmGateway.js', () => ({
  complete: (...a) => completeMock(...a),
  TIER_ANALYSIS: 'analysis',
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

const observationsMeetingRoutes = (await import('../../../api/routes/observations-meeting.js')).default;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/observations', observationsMeetingRoutes);
  return app;
}

describe('observations meeting route smoke', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects unauthenticated request with 401', async () => {
    const res = await request(createApp())
      .post('/api/observations/meeting')
      .send({ meetings: [] });
    expect(res.status).toBe(401);
  });

  it('returns 400 when meetings is not an array', async () => {
    const res = await request(createApp())
      .post('/api/observations/meeting')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({ meetings: 'nope' });
    expect(res.status).toBe(400);
  });

  it('syncs a valid 1-meeting batch with a duration-aware summary', async () => {
    addMemoryMock.mockResolvedValue({ id: 'mem-456', importance_score: 5 });
    const startedAt = 1716800000000;
    const endedAt = startedAt + 45 * 60 * 1000; // 45 minutes later
    const res = await request(createApp())
      .post('/api/observations/meeting')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({
        meetings: [
          { local_id: 1, platform: 'Zoom', title: 'Standup', started_at: startedAt, ended_at: endedAt },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.dropped).toEqual([]);
    expect(res.body.synced).toEqual([{ local_id: 1, memory_id: 'mem-456' }]);
    expect(res.body.synced[0].local_id).toBe(1);
    expect(typeof res.body.synced[0].memory_id).toBe('string');
    expect(addMemoryMock).toHaveBeenCalledTimes(1);
    // addMemory(userId, content, type, metadata, options) — verify real signature usage
    const [userId, summary, memoryType, metadata] = addMemoryMock.mock.calls[0];
    expect(userId).toBe(TEST_USER);
    expect(memoryType).toBe('observation');
    expect(summary).toContain('45-min Zoom meeting');
    expect(metadata.source).toBe('desktop_meeting');
    expect(metadata.platform).toBe('Zoom');
  });

  it('syncs a meeting with no ended_at using a started summary', async () => {
    addMemoryMock.mockResolvedValue({ id: 'mem-789', importance_score: 5 });
    const res = await request(createApp())
      .post('/api/observations/meeting')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({
        meetings: [
          { local_id: 2, platform: 'Google Meet', title: 'Sync', started_at: 1716800000000 },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.dropped).toEqual([]);
    expect(res.body.synced).toEqual([{ local_id: 2, memory_id: 'mem-789' }]);
    expect(addMemoryMock).toHaveBeenCalledTimes(1);
    const [, summary] = addMemoryMock.mock.calls[0];
    expect(summary).toContain('Google Meet meeting started');
  });

  it('summarizes a transcript and stores BOTH the transcript and the summary', async () => {
    addMemoryMock.mockResolvedValue({ id: 'mem-t1', importance_score: 6 });
    completeMock.mockResolvedValue({
      content: 'Discussed the Q3 roadmap. You committed to ship the API by Friday.',
    });
    const startedAt = 1716800000000;
    const res = await request(createApp())
      .post('/api/observations/meeting')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({
        meetings: [
          {
            local_id: 10,
            platform: 'Zoom',
            title: 'Roadmap',
            started_at: startedAt,
            ended_at: startedAt + 30 * 60 * 1000,
            transcript: 'Alright team, lets talk about the Q3 roadmap and what we ship this quarter. '.repeat(6),
          },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.synced).toEqual([{ local_id: 10, memory_id: 'mem-t1' }]);
    expect(completeMock).toHaveBeenCalledTimes(1);
    // The LLM summary becomes the memory CONTENT (what surfaces in retrieval);
    // the full transcript + summary live in metadata (full transcript + summary).
    const [, content, type, metadata, options] = addMemoryMock.mock.calls[0];
    expect(type).toBe('observation');
    expect(content).toContain('Q3 roadmap');
    expect(metadata.summary).toContain('Q3 roadmap');
    expect(metadata.transcript).toContain('Q3 roadmap');
    expect(metadata.has_transcript).toBe(true);
    expect(metadata.source).toBe('desktop_meeting');
    expect(options.importanceScore).toBe(6);
  });

  it('skips the LLM for a too-short transcript and stores the label only', async () => {
    addMemoryMock.mockResolvedValue({ id: 'mem-t2', importance_score: 5 });
    const res = await request(createApp())
      .post('/api/observations/meeting')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({
        meetings: [
          {
            local_id: 11,
            platform: 'Zoom',
            title: 'Quick',
            started_at: 1716800000000,
            ended_at: 1716800000000 + 60 * 1000,
            transcript: 'ok bye',
          },
        ],
      });
    expect(res.status).toBe(200);
    expect(completeMock).not.toHaveBeenCalled();
    const [, content, , metadata] = addMemoryMock.mock.calls[0];
    expect(content).toContain('Zoom meeting'); // synthetic label, not a summary
    expect(metadata.transcript).toBeUndefined();
    expect(metadata.has_transcript).toBeUndefined();
  });

  it('still stores the transcript when summarization fails (no drop)', async () => {
    addMemoryMock.mockResolvedValue({ id: 'mem-t3', importance_score: 6 });
    completeMock.mockRejectedValue(new Error('llm down'));
    const res = await request(createApp())
      .post('/api/observations/meeting')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({
        meetings: [
          {
            local_id: 12,
            platform: 'Teams',
            started_at: 1716800000000,
            ended_at: 1716800000000 + 30 * 60 * 1000,
            transcript: 'We reviewed the design and agreed on the new onboarding flow in detail. '.repeat(6),
          },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.dropped).toEqual([]);
    expect(res.body.synced).toEqual([{ local_id: 12, memory_id: 'mem-t3' }]);
    const [, content, , metadata] = addMemoryMock.mock.calls[0];
    expect(content).toContain('Teams meeting'); // fell back to the label
    expect(metadata.transcript).toContain('onboarding flow'); // transcript still kept
    expect(metadata.summary).toBeUndefined();
  });
});
