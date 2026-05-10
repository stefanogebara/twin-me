/**
 * Twin Chat Turn Persistence
 * ==========================
 * Owns all database writes that happen at the tail end of POST /api/chat/message:
 *   - LZ-complexity score on the latest assistant message (fire-and-forget)
 *   - twin_messages inserts for both messages (fire-and-forget)
 *   - Unified conversation log (await — fine-tuning exports)
 *   - Memory-stream conversation memory (await unless eval mode)
 *
 * The two awaited writes are critical: returning the response before they
 * complete used to cost ~5% of conversation memories.
 *
 * Extracted from POST /api/chat/message during the 2026-05-09 monolith trim
 * (audit ARCH-1).
 */

import { supabaseAdmin } from './database.js';
import { addConversationMemory as addConversationMemoryStream } from './memoryStreamService.js';
import { logConversationToDatabase } from './conversationLearning.js';
import { lzComplexity } from '../utils/lzComplexity.js';
import { createLogger } from './logger.js';

const log = createLogger('TwinChatPersistence');

function attachLzScoreToLastMessage(conversationId, lzScore) {
  if (!conversationId) return;
  supabaseAdmin
    .from('twin_messages')
    .select('id, metadata')
    .eq('conversation_id', conversationId)
    .eq('role', 'assistant')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
    .then(({ data: msg }) => {
      if (!msg) return null;
      const meta = { ...(msg.metadata || {}), lz_complexity: lzScore };
      return supabaseAdmin.from('twin_messages').update({ metadata: meta }).eq('id', msg.id);
    })
    .catch(() => { /* non-fatal */ });
}

function insertTwinMessageRows({
  conversationId, message, assistantMessage, routedModel, routingTier,
}) {
  if (!conversationId) return;

  supabaseAdmin
    .from('twin_messages')
    .insert({
      conversation_id: conversationId,
      role: 'user',
      content: message,
      metadata: {},
    })
    .then(() => {})
    .catch(err => log.warn('Failed to save user message', { error: err.message }));

  supabaseAdmin
    .from('twin_messages')
    .insert({
      conversation_id: conversationId,
      role: 'assistant',
      content: assistantMessage,
      metadata: {
        model: routedModel || 'unknown',
        tier: routingTier || 'unknown',
      },
    })
    .then(() => {})
    .catch(err => log.warn('Failed to save assistant message', { error: err.message }));
}

function renderSystemPromptText(systemPrompt) {
  return systemPrompt.map(block => block.text || '').join('\n').trim();
}

export async function persistChatTurn({
  userId,
  message,
  assistantMessage,
  conversationId,
  evalMode,
  routedModel,
  routingTier,
  systemPrompt,
  soulSignature,
  platformData,
  memories,
  writingProfile,
  chatSource,
}) {
  const lzScore = lzComplexity(assistantMessage);

  attachLzScoreToLastMessage(conversationId, lzScore);
  insertTwinMessageRows({
    conversationId, message, assistantMessage, routedModel, routingTier,
  });

  await Promise.all([
    logConversationToDatabase({
      userId,
      userMessage: message,
      twinResponse: assistantMessage,
      source: 'twinme_web',
      conversationId,
      soulSignatureId: soulSignature?.id ?? null,
      renderedSystemPrompt: renderSystemPromptText(systemPrompt),
      platformsContext: {
        spotify: !!platformData.spotify,
        calendar: !!platformData.calendar,
        whoop: !!platformData.whoop,
        platforms_included: Object.keys(platformData),
      },
      brainStats: {
        has_soul_signature: !!soulSignature,
        has_memory_stream: memories?.length > 0,
        has_writing_profile: !!writingProfile,
      },
    }).catch(err => log.warn('Failed to log conversation', { error: err?.message })),

    !evalMode
      ? addConversationMemoryStream(userId, message, assistantMessage, {
          conversationId,
          platforms: Object.keys(platformData),
          hasSoulSignature: !!soulSignature,
          chatSource,
        }).catch(err => log.warn('Failed to store in memory stream', { error: err?.message }))
      : Promise.resolve(),
  ]);

  return { lzScore };
}
