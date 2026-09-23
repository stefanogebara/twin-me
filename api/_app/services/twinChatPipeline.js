/**
 * Twin Chat Pipeline
 * ==================
 * Helpers for the twin chat orchestration. Houses chunks pulled out of the
 * POST /api/chat/message handler during the 2026-05-09 monolith trim
 * (audit ARCH-1). Long-term goal: house the full chat orchestration here
 * so non-web entry points (MCP, WhatsApp, Telegram) can share the same
 * pipeline instead of duplicating it or skipping layers entirely.
 *
 * Exports:
 *   - fetchConversationHistory(userId, conversationId)
 *   - fetchCreativityBoost(userId, conversationId)
 *   - runPostResponseSideEffects({ userId, message, assistantMessage, ... })
 *
 * All functions are defensively wrapped — they ALWAYS resolve (never reject)
 * so the chat handler can race them in Promise.all without special-casing.
 */

import { supabaseAdmin } from './database.js';
import { createLogger } from './logger.js';
import {
  extractConversationFacts,
  extractCommunicationStyle,
  getMemoryStats,
} from './memoryStreamService.js';
import { shouldTriggerReflection, generateReflections, seedReflections } from './reflectionEngine.js';
import { runCitationPipeline } from './citationExtractionService.js';
import { strengthenCoCitedLinks } from './memoryLinksService.js';
import { fileQueryInsightIfValuable } from './wikiCompilationService.js';

const log = createLogger('TwinChatPipeline');

const CONVERSATION_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Fetch the last 20 messages of a conversation, with ownership verification.
 * Returns `[]` if conversationId is missing/invalid/not-owned/errors.
 * Each message is truncated to 800 chars to keep prompt context bounded.
 */
export async function fetchConversationHistory(userId, conversationId) {
  if (!conversationId) return [];
  if (!CONVERSATION_UUID_RE.test(conversationId)) {
    log.warn('Invalid conversationId format', { userId });
    return [];
  }
  try {
    const { data: convoCheck, error: convoCheckErr } = await supabaseAdmin
      .from('twin_conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('user_id', userId)
      .single();
    if (convoCheckErr && convoCheckErr.code !== 'PGRST116') {
      log.error('Conversation ownership check error', { error: convoCheckErr });
    }
    if (!convoCheck) {
      log.warn('conversationId not owned by user, ignoring history', { conversationId, userId });
      return [];
    }

    // Fetch the most RECENT 20, then restore chronological order. (audit: this was
    // ascending+limit, which returns the OLDEST 20 — so past 10 exchanges the twin
    // saw only the conversation's opening and went blind to every recent turn.)
    const { data: messages } = await supabaseAdmin
      .from('twin_messages')
      .select('role, content, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(20);

    return (messages || [])
      .reverse() // newest-first -> chronological (oldest -> newest) for the LLM
      .map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content.length > 800 ? m.content.substring(0, 800) + '...' : m.content,
      }));
  } catch (err) {
    log.warn('Could not fetch conversation history', { error: err?.message });
    return [];
  }
}

/**
 * Detect formulaic output (low LZ complexity) and surface rarely-accessed
 * memories to break the pattern. Returns null on no signal / failure.
 */
export async function fetchCreativityBoost(userId, conversationId) {
  if (!conversationId) return null;
  // audit-2026-05-26 M1: was reading twin_messages metadata for any
  // caller-supplied conversation_id without verifying ownership, leaking the
  // lz_complexity scores of another user's recent assistant messages. Mirror
  // the read-side ownership check from fetchConversationHistory.
  if (!CONVERSATION_UUID_RE.test(conversationId)) return null;
  try {
    const { data: convoCheck } = await supabaseAdmin
      .from('twin_conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!convoCheck) return null;

    const { data: recentMsgs } = await supabaseAdmin
      .from('twin_messages')
      .select('metadata')
      .eq('conversation_id', conversationId)
      .eq('role', 'assistant')
      .order('created_at', { ascending: false })
      .limit(5);
    if (!recentMsgs || recentMsgs.length < 3) return null;

    const lzScores = recentMsgs
      .map(m => m.metadata?.lz_complexity)
      .filter(s => typeof s === 'number');
    if (lzScores.length < 3) return null;

    const avgLz = lzScores.reduce((a, b) => a + b, 0) / lzScores.length;
    if (avgLz >= 0.3) return null;

    const { data: novelMemories } = await supabaseAdmin
      .from('user_memories')
      .select('id, content')
      .eq('user_id', userId)
      .gte('importance_score', 5)
      .lte('retrieval_count', 1)
      .order('created_at', { ascending: false })
      .limit(3);
    if (!novelMemories?.length) return null;

    return { novelMemories, avgLz };
  } catch {
    return null;
  }
}

/**
 * Fire-and-forget post-response side effects after the twin sends a reply.
 * Skipped entirely in eval mode. Intentionally returns void.
 */
export function runPostResponseSideEffects({
  userId,
  message,
  assistantMessage,
  conversationId,
  memoriesInContext = [],
  evalMode = false,
}) {
  if (evalMode) return;

  extractConversationFacts(userId, message).catch(err =>
    log.error('Fact extraction failed', { error: err?.message })
  );

  extractCommunicationStyle(userId, message).catch(err =>
    log.warn('Communication style extraction failed', { error: err?.message })
  );

  if (memoriesInContext.length > 0) {
    runCitationPipeline({
      memoriesInContext,
      twinResponse: assistantMessage,
      userId,
      conversationId,
    }).then(citedIds => {
      if (citedIds.length >= 2) {
        strengthenCoCitedLinks(userId, citedIds).catch(err =>
          log.warn('STDP co-citation failed', { error: err?.message })
        );
        fileQueryInsightIfValuable(userId, citedIds, assistantMessage, memoriesInContext).catch(err =>
          log.warn('Query filing failed', { error: err?.message })
        );
      }
    }).catch(err => log.warn('Citation pipeline failed', { error: err?.message }));
  }

  shouldTriggerReflection(userId).then(async (shouldReflect) => {
    if (shouldReflect) {
      log.info('Triggering background reflection', { userId });
      generateReflections(userId).catch(err =>
        log.warn('Background reflection failed', { error: err?.message })
      );
    } else {
      try {
        const stats = await getMemoryStats(userId);
        if (stats.total >= 3 && stats.byType.reflection === 0) {
          log.info('Auto-seeding reflections for new user', { userId, totalMemories: stats.total });
          seedReflections(userId).catch(err =>
            log.warn('Auto-seed reflections failed', { error: err?.message })
          );
        }
      } catch (statsErr) {
        log.warn('Stats check for auto-seed failed', { error: statsErr?.message });
      }
    }
  }).catch(err => log.warn('Reflection trigger check failed', { error: err?.message }));
}
