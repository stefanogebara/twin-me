/**
 * Story Chapters — Voice Webhook (ElevenLabs Custom LLM)
 * =======================================================
 * POST /api/life-story/voice/v1/chat/completions
 *
 * OpenAI-compatible endpoint for an ElevenLabs Conversational AI agent,
 * following the onboarding-voice.js pattern (shared webhook secret,
 * timing-safe comparison). Unlike onboarding, state is NOT derived from
 * message history — the life_story_sessions row is the source of truth:
 * the last user message is the answer, processTurn drives the engine.
 *
 * Session identity travels in the system message the frontend injects via
 * conversation_config_override:
 *   LIFE_STORY_JSON:{"userId":"...","sessionId":"..."}END_LIFE_STORY
 * The frontend calls /api/life-story/session/start BEFORE connecting the
 * voice agent, so the opening utterance already exists; the agent's
 * first_message is configured from it.
 *
 * ACTIVATION (one-time, ElevenLabs dashboard): create a Conversational AI
 * agent whose Custom LLM URL points at this endpoint, set the webhook
 * secret to ELEVENLABS_WEBHOOK_SECRET, and put the agent id in
 * VITE_ELEVENLABS_STORY_AGENT_ID. Until then this endpoint is inert.
 *
 * All failure paths return a SPEAKABLE sentence (this content goes
 * straight to TTS) — never a bare error object mid-conversation.
 */

import express from 'express';
import crypto from 'crypto';
import { processTurn } from '../services/lifeStoryService.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('LifeStoryVoice');

const router = express.Router();

function openAiResponse(content) {
  return {
    id: `chatcmpl-lifestory-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content },
        finish_reason: 'stop',
      },
    ],
  };
}

function validateSecret(req) {
  const secret =
    req.headers['x-elevenlabs-secret'] || req.headers['authorization']?.replace('Bearer ', '');
  const expectedSecret = process.env.ELEVENLABS_WEBHOOK_SECRET;
  if (!expectedSecret || !secret) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(secret, 'utf8'), Buffer.from(expectedSecret, 'utf8'));
  } catch {
    return false; // length mismatch
  }
}

router.post('/v1/chat/completions', async (req, res) => {
  try {
    if (!validateSecret(req)) {
      log.warn('Missing or invalid ElevenLabs webhook secret');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array required' });
    }

    // Session identity from the injected system-message block.
    let userId = null;
    let sessionId = null;
    const systemMsg = messages.find(m => m.role === 'system');
    if (systemMsg?.content) {
      try {
        const match = systemMsg.content.match(/LIFE_STORY_JSON:({.*?})END_LIFE_STORY/s);
        if (match) {
          const parsed = JSON.parse(match[1]);
          userId = parsed.userId || null;
          sessionId = parsed.sessionId || null;
        }
      } catch {
        log.warn('Failed to parse LIFE_STORY_JSON block');
      }
    }

    if (!userId || !sessionId) {
      log.warn('Voice turn without session identity');
      return res.json(
        openAiResponse(
          'I lost track of our session for a moment. Please close this conversation and start the chapter again from the Story page.'
        )
      );
    }

    // The last user utterance is the answer to process. No user message yet
    // means ElevenLabs pinged before the first answer — re-invite gently.
    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUser?.content?.trim()) {
      return res.json(openAiResponse('Take your time. Whenever you are ready, just start talking.'));
    }

    const move = await processTurn(userId, sessionId, lastUser.content.trim());
    if (!move) {
      log.warn('Voice turn: session not found or inactive', { sessionId });
      return res.json(
        openAiResponse(
          'It looks like this chapter session has ended. You can start the next chapter from the Story page whenever you like.'
        )
      );
    }

    if (move.kind === 'chapter_done') {
      const mirror = move.utterance ? `${move.utterance} ` : '';
      return res.json(
        openAiResponse(
          `${mirror}That completes this chapter — thank you for sharing it with me. You can start another one from the Story page whenever you feel like it.`
        )
      );
    }

    return res.json(openAiResponse(move.utterance));
  } catch (error) {
    log.error('Voice chapter turn failed', { error: error.message });
    // Still speakable — this content is read aloud by the agent.
    return res.json(
      openAiResponse('Something went wrong on my side. Give me a second and try saying that again.')
    );
  }
});

export default router;
