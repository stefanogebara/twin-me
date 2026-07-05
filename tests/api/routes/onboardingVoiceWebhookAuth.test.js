/**
 * ElevenLabs voice-interview webhook auth gate — audit-2026-07-03.
 *
 * POST /api/onboarding/voice/v1/chat/completions is an OpenAI-compatible
 * custom-LLM endpoint that ElevenLabs Conversational AI calls directly. An
 * external voice provider can't carry a user JWT, so the correct auth boundary
 * is a shared secret (ELEVENLABS_WEBHOOK_SECRET) compared in constant time.
 *
 * The auto-audit flagged this route as "no auth — caller can POST arbitrary
 * userId". Verification found the secret gate already present and correct
 * (crypto.timingSafeEqual, fail-closed when the secret is unset). This test
 * pins that behavior so a future refactor can't silently drop the guard and
 * turn the endpoint into an unauthenticated memory-writer.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';
process.env.JWT_SECRET = 'test-secret';

// The next-question generator. If auth is bypassed this would be invoked; the
// mismatch/unset tests assert it is NOT, proving the gate short-circuits before
// any LLM work happens.
const completeMock = vi.fn().mockResolvedValue({ content: 'What drives you?' });
vi.mock('../../../api/services/llmGateway.js', () => ({
  complete: (...a) => completeMock(...a),
  TIER_ANALYSIS: 'analysis',
  TIER_EXTRACTION: 'extraction',
  TIER_CHAT: 'chat',
}));

vi.mock('../../../api/services/memoryStreamService.js', () => ({
  addMemory: vi.fn().mockResolvedValue(undefined),
  addConversationMemory: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../../api/services/reflectionEngine.js', () => ({
  shouldTriggerReflection: vi.fn().mockResolvedValue(false),
  generateReflections: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../../api/services/goalTrackingService.js', () => ({
  generateGoalSuggestions: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../../api/services/database.js', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  },
}));

const router = (await import('../../../api/routes/onboarding-voice.js')).default;

const SECRET = 'elevenlabs-test-secret';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/onboarding/voice', router);
  return app;
}

// Minimal OpenAI-format body: one user turn so the route derives question 1
// and tries to generate the next question (which the mock supplies).
const body = () => ({
  messages: [{ role: 'user', content: 'Hi, ask me your first question.' }],
});

describe('voice-interview webhook auth gate', () => {
  beforeEach(() => {
    completeMock.mockClear();
    process.env.ELEVENLABS_WEBHOOK_SECRET = SECRET;
  });

  it('fails closed (401, no LLM call) when ELEVENLABS_WEBHOOK_SECRET is unset', async () => {
    delete process.env.ELEVENLABS_WEBHOOK_SECRET;
    const res = await request(createApp())
      .post('/api/onboarding/voice/v1/chat/completions')
      .set('x-elevenlabs-secret', 'anything')
      .send(body());
    expect(res.status).toBe(401);
    expect(completeMock).not.toHaveBeenCalled();
  });

  it('rejects a request with no secret header (401)', async () => {
    const res = await request(createApp())
      .post('/api/onboarding/voice/v1/chat/completions')
      .send(body());
    expect(res.status).toBe(401);
    expect(completeMock).not.toHaveBeenCalled();
  });

  it('rejects a secret mismatch with 401 and runs no LLM work', async () => {
    const res = await request(createApp())
      .post('/api/onboarding/voice/v1/chat/completions')
      .set('x-elevenlabs-secret', 'wrong-secret')
      .send(body());
    expect(res.status).toBe(401);
    expect(completeMock).not.toHaveBeenCalled();
  });

  it('accepts the correct secret via x-elevenlabs-secret → 200', async () => {
    const res = await request(createApp())
      .post('/api/onboarding/voice/v1/chat/completions')
      .set('x-elevenlabs-secret', SECRET)
      .send(body());
    expect(res.status).toBe(200);
    expect(completeMock).toHaveBeenCalledTimes(1);
    expect(res.body.choices?.[0]?.message?.content).toBeTruthy();
  });

  it('accepts the correct secret via Authorization: Bearer → 200', async () => {
    const res = await request(createApp())
      .post('/api/onboarding/voice/v1/chat/completions')
      .set('Authorization', `Bearer ${SECRET}`)
      .send(body());
    expect(res.status).toBe(200);
    expect(completeMock).toHaveBeenCalledTimes(1);
  });

  it('returns 400 (still authed) when messages array is missing', async () => {
    const res = await request(createApp())
      .post('/api/onboarding/voice/v1/chat/completions')
      .set('x-elevenlabs-secret', SECRET)
      .send({});
    expect(res.status).toBe(400);
    expect(completeMock).not.toHaveBeenCalled();
  });
});
