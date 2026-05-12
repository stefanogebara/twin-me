/**
 * Twin Chat Input Validation
 * ==========================
 * Validates the chat request body. Returns either cleaned inputs or a
 * ready-to-send error response.
 *
 * Conversation auto-create used to live here but was moved to a dedicated
 * helper that the route calls AFTER pre-flight gates pass (audit bug H4,
 * 2026-05-12): a failed send (rate-limit 429, gateway 503) was leaving an
 * empty twin_conversations row with the user's message as its title and
 * zero messages, polluting the conversation list.
 *
 * Extracted from POST /api/chat/message during the 2026-05-09 monolith trim
 * (audit ARCH-1).
 */

import { supabaseAdmin } from './database.js';
import { createLogger } from './logger.js';

const log = createLogger('TwinChatInputValidation');

const MAX_MESSAGE_LENGTH = 8000;

function deriveConversationTitle(message) {
  const raw = message || '';
  return raw.substring(0, 60) + (raw.length > 60 ? '...' : '');
}

/**
 * Create a new twin_conversations row.
 *
 * Called by the route POST /api/chat/message AFTER pre-flight gates pass
 * (feature flags, freemium paywall, monthly quota, hourly rate limit).
 * Returns the new conversation id, or null on insert failure.
 */
export async function autoCreateConversation(userId, message) {
  try {
    const title = deriveConversationTitle(message);
    const { data: newConv, error: convError } = await supabaseAdmin
      .from('twin_conversations')
      .insert({ user_id: userId, title, mode: 'twin' })
      .select('id')
      .single();
    if (convError || !newConv) return null;
    log.info('Created new conversation', { conversationId: newConv.id, title });
    return newConv.id;
  } catch (err) {
    log.warn('Failed to create conversation (non-fatal)', { error: err?.message });
    return null;
  }
}

export async function validateChatInput({ userId: _userId, body }) {
  const { message: rawMessage, conversationId: rawConversationId } = body || {};
  const message = typeof rawMessage === 'string' ? rawMessage : '';

  if (!message.trim()) {
    return {
      ok: false,
      status: 400,
      body: { success: false, error: 'Message is required' },
    };
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return {
      ok: false,
      status: 400,
      body: {
        success: false,
        error: `Message too long (${message.length} chars). Maximum is ${MAX_MESSAGE_LENGTH} characters.`,
      },
    };
  }

  // Note: conversationId here is whatever the client sent. The route is
  // responsible for calling autoCreateConversation() AFTER pre-flight gates
  // pass — see audit bug H4. We intentionally do NOT create a row here.
  return { ok: true, message, conversationId: rawConversationId || null };
}
