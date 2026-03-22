/**
 * Context Condenser — LLM Summarization Instead of Truncation
 * =============================================================
 * Replaces hard context truncation with intelligent summarization.
 * When messages exceed the token threshold, older messages are
 * summarized while preserving: emotional state, commitments,
 * open questions, and key facts.
 *
 * Cost: Linear scaling instead of quadratic. ~50% token reduction.
 *
 * Research:
 *   - OpenHands Context Condensation (2025)
 *   - ACON: Context Compression for Long-Horizon Agents (arXiv:2510.00615)
 */

import { complete, TIER_ANALYSIS } from './llmGateway.js';
import { createLogger } from './logger.js';

const log = createLogger('ContextCondenser');

// Approximate token count (4 chars per token)
const CHARS_PER_TOKEN = 4;
const DEFAULT_THRESHOLD_TOKENS = 12000; // ~48K chars
const RECENT_TURNS_TO_KEEP = 8; // Keep last 8 messages verbatim

/**
 * Estimate token count from text.
 */
function estimateTokens(text) {
  return Math.ceil((text || '').length / CHARS_PER_TOKEN);
}

/**
 * Estimate total tokens in a messages array.
 */
function estimateMessagesTokens(messages) {
  return messages.reduce((sum, m) => sum + estimateTokens(m.content || ''), 0);
}

/**
 * Condense messages if they exceed the token threshold.
 * Returns the condensed messages array (or original if under threshold).
 *
 * @param {Array} messages - [{role: 'user'|'assistant', content: string}]
 * @param {Object} options - { thresholdTokens, recentTurnsToKeep, userId }
 * @returns {Array} Condensed messages array
 */
export async function condenseIfNeeded(messages, options = {}) {
  const {
    thresholdTokens = DEFAULT_THRESHOLD_TOKENS,
    recentTurnsToKeep = RECENT_TURNS_TO_KEEP,
    userId = 'unknown'
  } = options;

  if (!messages || messages.length <= recentTurnsToKeep) {
    return messages;
  }

  const totalTokens = estimateMessagesTokens(messages);
  if (totalTokens <= thresholdTokens) {
    return messages;
  }

  log.info('Condensing context', {
    userId,
    totalTokens,
    threshold: thresholdTokens,
    messageCount: messages.length
  });

  // Split into old (to summarize) and recent (to keep verbatim)
  const splitIndex = Math.max(0, messages.length - recentTurnsToKeep);
  const oldMessages = messages.slice(0, splitIndex);
  const recentMessages = messages.slice(splitIndex);

  if (oldMessages.length === 0) {
    return messages;
  }

  // Format old messages for summarization
  const oldText = oldMessages
    .map(m => `${m.role === 'user' ? 'User' : 'Twin'}: ${m.content.slice(0, 500)}`)
    .join('\n');

  const summary = await summarizeOldContext(oldText, userId);

  // Build condensed messages array
  const condensed = [
    {
      role: 'system',
      content: `[CONVERSATION SUMMARY — earlier in this session]\n${summary}\n[END SUMMARY — recent messages follow]`
    },
    ...recentMessages
  ];

  const condensedTokens = estimateMessagesTokens(condensed);
  log.info('Context condensed', {
    userId,
    beforeTokens: totalTokens,
    afterTokens: condensedTokens,
    reduction: `${Math.round((1 - condensedTokens / totalTokens) * 100)}%`,
    summarizedMessages: oldMessages.length,
    keptMessages: recentMessages.length
  });

  return condensed;
}

/**
 * Summarize old conversation context using DeepSeek (cheap).
 * Preserves: emotional state, commitments, open questions, key facts.
 */
async function summarizeOldContext(conversationText, userId) {
  const prompt = `Summarize this earlier part of a conversation between a digital twin and its user.

PRESERVE (these are critical for continuity):
- The user's emotional state throughout the conversation
- Any commitments or promises the twin made
- Open questions that haven't been answered yet
- Key facts revealed about the user
- What the conversation was trying to accomplish
- Any action items or tasks discussed

DO NOT preserve:
- Greetings, small talk, filler
- Redundant back-and-forth
- Information already resolved

Write a concise summary paragraph (200-400 words max):

${conversationText}`;

  try {
    const response = await complete({
      messages: [{ role: 'user', content: prompt }],
      tier: TIER_ANALYSIS,
      maxTokens: 500,
      temperature: 0.2,
      userId,
      purpose: 'context_condensation'
    });

    return response?.content || response?.text || 'Earlier conversation context unavailable.';
  } catch (err) {
    log.error('Context summarization failed', { userId, error: err.message });
    // Fallback: take first and last sentences from old messages
    const lines = conversationText.split('\n').filter(l => l.trim());
    const fallback = [
      lines[0] || '',
      '...',
      lines[lines.length - 1] || ''
    ].join('\n');
    return `[Summary unavailable — key excerpts]\n${fallback}`;
  }
}

export { estimateTokens, estimateMessagesTokens };
