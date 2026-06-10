/**
 * Smoke tests for POST /api/onboarding/complete (api/routes/onboarding-calibration.js)
 *
 * audit-2026-06-10: finishing the onboarding flow — even with the interview
 * skipped and zero platforms connected — must persist completed_at so
 * new-user-check's hasCalibration flag never re-gates the user.
 * Covers: auth guard, first-completion upsert (with completion_source marker),
 * idempotency (existing completed_at never overwritten), 500 on save failure.
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

const calibrationMaybeSingleMock = vi.fn();
const calibrationUpsertMock = vi.fn();

vi.mock('../../../api/services/database.js', () => ({
  supabaseAdmin: {
    from: vi.fn((table) => {
      if (table === 'onboarding_calibration') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: (...a) => calibrationMaybeSingleMock(...a),
          upsert: (...a) => calibrationUpsertMock(...a),
        };
      }
      // auth middleware email-verification lookup on `users`
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { email_verified: true, created_at: new Date().toISOString() },
          error: null,
        }),
      };
    }),
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
vi.mock('../../../api/services/memoryStreamService.js', () => ({
  addMemory: vi.fn(),
  addConversationMemory: vi.fn(),
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

describe('POST /api/onboarding/complete smoke', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects unauthenticated request with 401', async () => {
    const res = await request(createApp()).post('/api/onboarding/complete');
    expect(res.status).toBe(401);
    expect(calibrationUpsertMock).not.toHaveBeenCalled();
  });

  it('stamps completed_at with completion_source on first completion', async () => {
    calibrationMaybeSingleMock.mockResolvedValue({ data: null, error: null });
    calibrationUpsertMock.mockResolvedValue({ error: null });

    const res = await request(createApp())
      .post('/api/onboarding/complete')
      .set('Authorization', `Bearer ${signToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.alreadyCompleted).toBe(false);
    expect(res.body.completedAt).toBeTruthy();

    expect(calibrationUpsertMock).toHaveBeenCalledTimes(1);
    const [row, opts] = calibrationUpsertMock.mock.calls[0];
    expect(row.user_id).toBe(TEST_USER);
    expect(row.completed_at).toBeTruthy();
    expect(row.enrichment_context.completion_source).toBe('flow_finish');
    expect(opts).toEqual({ onConflict: 'user_id' });
  });

  it('merges completion_source without clobbering existing enrichment_context', async () => {
    calibrationMaybeSingleMock.mockResolvedValue({
      data: { completed_at: null, enrichment_context: { name: 'Stefano', company: 'TwinMe' } },
      error: null,
    });
    calibrationUpsertMock.mockResolvedValue({ error: null });

    const res = await request(createApp())
      .post('/api/onboarding/complete')
      .set('Authorization', `Bearer ${signToken()}`);

    expect(res.status).toBe(200);
    const [row] = calibrationUpsertMock.mock.calls[0];
    expect(row.enrichment_context).toEqual({
      name: 'Stefano',
      company: 'TwinMe',
      completion_source: 'flow_finish',
    });
  });

  it('is idempotent: never overwrites an existing completed_at', async () => {
    const existingTs = '2026-06-01T12:00:00.000Z';
    calibrationMaybeSingleMock.mockResolvedValue({
      data: { completed_at: existingTs, enrichment_context: {} },
      error: null,
    });

    const res = await request(createApp())
      .post('/api/onboarding/complete')
      .set('Authorization', `Bearer ${signToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.alreadyCompleted).toBe(true);
    expect(res.body.completedAt).toBe(existingTs);
    expect(calibrationUpsertMock).not.toHaveBeenCalled();
  });

  it('returns 500 when the lookup fails', async () => {
    calibrationMaybeSingleMock.mockResolvedValue({ data: null, error: { message: 'db down' } });

    const res = await request(createApp())
      .post('/api/onboarding/complete')
      .set('Authorization', `Bearer ${signToken()}`);

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(calibrationUpsertMock).not.toHaveBeenCalled();
  });

  it('returns 500 when the upsert fails', async () => {
    calibrationMaybeSingleMock.mockResolvedValue({ data: null, error: null });
    calibrationUpsertMock.mockResolvedValue({ error: { message: 'write failed' } });

    const res = await request(createApp())
      .post('/api/onboarding/complete')
      .set('Authorization', `Bearer ${signToken()}`);

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});
