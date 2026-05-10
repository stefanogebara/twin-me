/**
 * Twin Chat Input Validation
 * ==========================
 * Validates the chat request body and (on first message) creates a new
 * twin_conversations row. Returns either cleaned inputs or a ready-to-send
 * error response.
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

async function autoCreateConversation(userId, message) {
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

export async function validateChatInput({ userId, body }) {
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

  let conversationId = rawConversationId || null;
  if (!conversationId) {
    conversationId = await autoCreateConversation(userId, message);
  }

  return { ok: true, message, conversationId };
}
