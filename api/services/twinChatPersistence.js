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

/**
 * Insert both turn rows (user + assistant) in a single transactional write.
 *
 * audit-2026-05-15 C1: previously the user and assistant rows were fired
 * as two independent .insert() calls without await, and a separate
 * attachLzScoreToLastMessage() did a follow-up SELECT+UPDATE to attach
 * the complexity score. The audit found 85.8% of twin_conversations had
 * ZERO twin_messages rows — both inserts were failing silently with
 * errors only visible to log.warn. Making this awaited + batched:
 *   1. Surfaces the actual error (we now return it to the caller)
 *   2. Two DB round-trips collapse to one (faster + atomic)
 *   3. lz_complexity is included in assistant metadata at insert time,
 *      removing the separate read+update entirely
 */
async function insertTwinMessageRows({
  conversationId, message, assistantMessage, routedModel, routingTier, lzScore,
}) {
  if (!conversationId) return { ok: false, reason: 'no_conversation_id' };

  const rows = [
    {
      conversation_id: conversationId,
      role: 'user',
      content: message,
      metadata: {},
    },
    {
      conversation_id: conversationId,
      role: 'assistant',
      content: assistantMessage,
      metadata: {
        model: routedModel || 'unknown',
        tier: routingTier || 'unknown',
        lz_complexity: lzScore,
      },
    },
  ];

  const { error } = await supabaseAdmin.from('twin_messages').insert(rows);
  if (error) {
    // Surface the actual error so the next orphaned-conversation incident
    // is diagnosable. Was hidden behind log.warn for months — the audit
    // discovered 333 of 388 conversations had zero messages before this
    // came to light.
    log.error('Failed to save twin_messages rows', {
      conversationId,
      error: error.message,
      code: error.code,
      details: error.details,
    });
    return { ok: false, reason: error.message, code: error.code };
  }
  return { ok: true };
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
  // Audit bug H10 (2026-05-12): telemetry for context-build latency + how
  // many memories made it into the final prompt. Persisted into the
  // dedicated mcp_conversation_logs columns (added by the
  // 20260512_add_cold_start_telemetry_to_logs migration).
  coldStartMs = null,
  memoryCount = null,
  // audit-2026-05-13 trace-id follow-up: per-request trace ID and the
  // per-hop timing ladder. Persisted to mcp_conversation_logs.trace_id +
  // hop_timings (migration 20260514_chat_hop_timings) so we can query
  // the slow tail by trace ID without needing Vercel log drains.
  traceId = null,
  hopTimings = null,
}) {
  const lzScore = lzComplexity(assistantMessage);

  // audit-2026-05-15 C1: twin_messages inserts are now awaited and batched
  // alongside the unified-conversation log + memory-stream writes. Previously
  // these were fire-and-forget and silently failed, leaving 85.8% of
  // twin_conversations orphaned. lz_complexity is included in the assistant
  // row's metadata at insert time, eliminating the separate
  // attachLzScoreToLastMessage SELECT+UPDATE round-trip.
  await Promise.all([
    insertTwinMessageRows({
      conversationId, message, assistantMessage, routedModel, routingTier, lzScore,
    }).catch(err => {
      // Should be unreachable — insertTwinMessageRows catches its own errors
      // and returns { ok: false }. Defensive guard against a future regression.
      log.error('insertTwinMessageRows threw unexpectedly', { error: err?.message });
      return { ok: false };
    }),

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
      coldStartMs,
      memoryCount,
      traceId,
      hopTimings,
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
