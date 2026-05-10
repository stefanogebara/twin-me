/**
 * Twin Conversational Probes
 * ==========================
 * Two post-assembly system-prompt mutations: proactive deep question every
 * 5th turn + ambient interview hint (session-lottery + thin-domain gated).
 *
 * Extracted from POST /api/chat/message during the 2026-05-09 monolith trim
 * (audit ARCH-1).
 */

import { maybeBuildAmbientHint } from './ambientInterviewService.js';
import { createLogger } from './logger.js';

const log = createLogger('TwinConversationalProbes');

const DEEP_QUESTION_BLOCK = `
PROACTIVE QUESTION: At the very end of your response, naturally ask ONE of these questions based on what you know about the user (pick the most relevant, don't ask the same one twice):
- "By the way — what are you actually working on these days? I feel like I barely know what you do professionally."
- "What's something you've been meaning to do but keep putting off? I'm genuinely curious."
- "How do you actually feel about [specific thing you noticed in their data]? Not the optimized version — the real version."
- "What did today actually feel like for you?"
Make it sound natural and curious, not like a survey question.`;

function appendOrPush(systemPrompt, text) {
  const last = systemPrompt[systemPrompt.length - 1];
  if (last && !last.cache_control) {
    last.text += text;
  } else {
    systemPrompt.push({ type: 'text', text: text.trim() });
  }
}

export async function injectConversationalProbes({
  userId,
  systemPrompt,
  conversationHistory,
  chatLog,
}) {
  if (conversationHistory.length > 0 && conversationHistory.length % 5 === 0) {
    appendOrPush(systemPrompt, DEEP_QUESTION_BLOCK);
    log.debug('Injected proactive deep question', { turn: conversationHistory.length });
  }

  try {
    const ambientHint = await maybeBuildAmbientHint(userId);
    if (ambientHint) {
      systemPrompt.push({ type: 'text', text: ambientHint });
      chatLog?.('Ambient interview hint injected');
    }
  } catch (err) {
    log.warn('Ambient interview hint failed (non-fatal)', { error: err?.message });
  }
}
