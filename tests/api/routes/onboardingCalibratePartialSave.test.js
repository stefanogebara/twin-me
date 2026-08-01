/**
 * Regression tests for POST /api/onboarding/calibrate forceComplete partial save
 * (api/routes/onboarding-calibration.js)
 *
 * Bug: the partial-save branch called addConversationMemory(userId, answer, metadata)
 * with 3 args, but the signature is (userId, userMessage, assistantResponse, metadata).
 * The metadata object was stored as the assistant utterance and the source tag was
 * lost, so partial interview saves were malformed and untagged (and the re-interview
 * cleanup in storeInterviewMemories, which matches on metadata.source, missed them).
 * Correct shape mirrors the full-save path in storeInterviewMemories (~line 790).
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

// The calibration route module pulls in heavy services at import time —
// stub them so the test stays network/DB-free.
vi.mock('../../../api/services/llmGateway.js', () => ({
  complete: vi.fn(),
  TIER_CHAT: 'chat',
  TIER_ANALYSIS: 'analysis',
  TIER_EXTRACTION: 'extraction',
}));
const addConversationMemoryMock = vi.fn().mockResolvedValue({ userMemory: {}, twinMemory: {} });
vi.mock('../../../api/services/memoryStreamService.js', () => ({
  addMemory: vi.fn(),
  addConversationMemory: (...a) => addConversationMemoryMock(...a),
}));
vi.mock('../../../api/services/reflectionEngine.js', () => ({
  shouldTriggerReflection: vi.fn(),
  generateReflections: vi.fn(),
}));
vi.mock('../../../api/services/goalTrackingService.js', () => ({
  generateGoalSuggestions: vi.fn(),
}));

const TEST_USER = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';
const signToken = () => jwt.sign({ id: TEST_USER }, 'test-secret', { expiresIn: '1h' });

const calibrationRoutes = (await import('../../../api/routes/onboarding-calibration.js')).default;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/onboarding', calibrationRoutes);
  return app;
}

describe('POST /api/onboarding/calibrate forceComplete partial save', () => {
  beforeEach(() => vi.clearAllMocks());

  it('stores each Q&A pair with the question as assistantResponse and tagged metadata', async () => {
    const history = [
      { role: 'assistant', content: 'What drives you at work?' },
      { role: 'user', content: 'Building things people actually use.' },
      { role: 'assistant', content: 'How do you recharge?' },
      { role: 'user', content: 'Long runs, no headphones.' },
    ];

    const res = await request(createApp())
      .post('/api/onboarding/calibrate')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({ forceComplete: true, history });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, partialSave: true });

    expect(addConversationMemoryMock).toHaveBeenCalledTimes(2);

    const [userId, answer, question, metadata] = addConversationMemoryMock.mock.calls[0];
    expect(userId).toBe(TEST_USER);
    expect(answer).toBe('Building things people actually use.');
    // The question is the assistant utterance — a string, never a metadata object
    expect(question).toBe('What drives you at work?');
    expect(metadata).toMatchObject({ source: 'onboarding_interview' });

    const second = addConversationMemoryMock.mock.calls[1];
    expect(second[1]).toBe('Long runs, no headphones.');
    expect(second[2]).toBe('How do you recharge?');
    expect(second[3]).toMatchObject({ source: 'onboarding_interview' });
  });

  it('saves nothing but still succeeds when history has no Q&A pairs', async () => {
    const res = await request(createApp())
      .post('/api/onboarding/calibrate')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({ forceComplete: true, history: [{ role: 'user', content: 'hi' }] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, partialSave: true });
    expect(addConversationMemoryMock).not.toHaveBeenCalled();
  });
});
