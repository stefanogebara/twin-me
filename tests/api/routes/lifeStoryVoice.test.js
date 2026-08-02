/**
 * Voice webhook for Story Chapters (Phase 4b).
 *
 * ElevenLabs Conversational AI calls this endpoint in OpenAI
 * chat-completion format. Unlike the onboarding voice wrapper (which
 * derives state from message history), this one uses the life_story
 * session row as the source of truth: the LAST user message is the
 * answer, processTurn drives the engine, and the returned utterance is
 * the next interviewer move. Session identity arrives via a
 * LIFE_STORY_JSON block injected into the system message by the frontend
 * (conversation_config_override) — same pattern as ENRICHMENT_JSON in
 * onboarding-voice.js.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

process.env.ELEVENLABS_WEBHOOK_SECRET = 'test-webhook-secret';
process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

vi.mock('../../../api/services/lifeStoryService.js', () => ({
  processTurn: vi.fn(),
  startSession: vi.fn(),
}));

const { processTurn } = await import('../../../api/services/lifeStoryService.js');
const voiceRoutes = (await import('../../../api/routes/life-story-voice.js')).default;

const USER = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';
const SESSION = '49c10ccc-f485-4475-bdfb-858d76590e79';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/life-story/voice', voiceRoutes);
  return app;
}

const systemMsg = {
  role: 'system',
  content: `You are a warm interviewer. LIFE_STORY_JSON:{"userId":"${USER}","sessionId":"${SESSION}"}END_LIFE_STORY`,
};

const post = (app, body, secret = 'test-webhook-secret') =>
  request(app)
    .post('/api/life-story/voice/v1/chat/completions')
    .set(secret ? { 'x-elevenlabs-secret': secret } : {})
    .send(body);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /v1/chat/completions — auth', () => {
  it('401s without the webhook secret', async () => {
    const res = await post(createApp(), { messages: [systemMsg] }, null);
    expect(res.status).toBe(401);
  });

  it('401s with a wrong secret', async () => {
    const res = await post(createApp(), { messages: [systemMsg] }, 'wrong-secret');
    expect(res.status).toBe(401);
  });

  it('400s without a messages array', async () => {
    const res = await post(createApp(), {});
    expect(res.status).toBe(400);
  });
});

describe('POST /v1/chat/completions — turn driving', () => {
  it('answers with the engine move for the last user message', async () => {
    processTurn.mockResolvedValue({
      kind: 'followup',
      utterance: 'What was that move like for you?',
      questionIndex: 0,
      done: false,
    });

    const res = await post(createApp(), {
      messages: [
        systemMsg,
        { role: 'assistant', content: 'Tell me the story of your life...' },
        { role: 'user', content: 'I grew up in Sao Paulo and moved abroad.' },
      ],
    });

    expect(res.status).toBe(200);
    expect(res.body.choices[0].message.content).toBe('What was that move like for you?');
    expect(res.body.choices[0].finish_reason).toBe('stop');
    expect(processTurn).toHaveBeenCalledWith(USER, SESSION, 'I grew up in Sao Paulo and moved abroad.');
  });

  it('closes gracefully with the mirror line on chapter_done', async () => {
    processTurn.mockResolvedValue({
      kind: 'chapter_done',
      utterance: 'So stability is something you built, not inherited.',
      questionIndex: 3,
      done: true,
    });

    const res = await post(createApp(), {
      messages: [
        systemMsg,
        { role: 'assistant', content: 'Last question?' },
        { role: 'user', content: 'Final answer.' },
      ],
    });

    expect(res.status).toBe(200);
    const content = res.body.choices[0].message.content;
    expect(content).toContain('So stability is something you built, not inherited.');
  });

  it('re-asks politely when there is no user message yet (session opening handled by frontend)', async () => {
    const res = await post(createApp(), { messages: [systemMsg] });
    expect(res.status).toBe(200);
    expect(res.body.choices[0].message.content.length).toBeGreaterThan(10);
    expect(processTurn).not.toHaveBeenCalled();
  });

  it('fails gracefully when the session block is missing from the system message', async () => {
    const res = await post(createApp(), {
      messages: [
        { role: 'system', content: 'No session block here.' },
        { role: 'user', content: 'Hello?' },
      ],
    });
    expect(res.status).toBe(200);
    // Speakable apology, not an error object — this goes to TTS
    expect(res.body.choices[0].message.content.length).toBeGreaterThan(10);
    expect(processTurn).not.toHaveBeenCalled();
  });

  it('fails gracefully (speakable message) when the session is not found', async () => {
    processTurn.mockResolvedValue(null);
    const res = await post(createApp(), {
      messages: [
        systemMsg,
        { role: 'user', content: 'An answer.' },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.choices[0].message.content.length).toBeGreaterThan(10);
  });
});
