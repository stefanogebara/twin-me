/**
 * Session Reflection Service — Post-Conversation Self-Improvement
 * ================================================================
 * After each conversation ends (detected by silence), runs a lightweight
 * reflection that extracts facts, updates core memory, and creates
 * prospective memories for follow-ups.
 *
 * This is the twin's fastest learning mechanism — $0.01 per conversation.
 *
 * Research:
 *   - Reflexion (arXiv:2303.11366, NeurIPS 2023)
 *   - RMM: In Prospect and Retrospect (arXiv:2503.08026, ACL 2025)
 *   - PreFlect (arXiv:2602.07187)
 */

import { complete, TIER_ANALYSIS } from './llmGateway.js';
import { supabaseAdmin } from './database.js';
import { addMemory } from './memoryStreamService.js';
import { updateBlock, getBlocks } from './coreMemoryService.js';
import { createLogger } from './logger.js';

const log = createLogger('SessionReflection');

// Minimum messages to trigger reflection (avoid reflecting on "hi" / "bye")
const MIN_MESSAGES_FOR_REFLECTION = 4;

/**
 * Generate a post-session reflection from the last N messages.
 * Extracts facts, session theme, twin quality assessment,
 * follow-up items, and HUMAN block updates.
 *
 * @param {string} userId - User ID
 * @param {Array} messages - Recent conversation messages [{role, content}]
 * @returns {Object} Reflection results
 */
export async function generateSessionReflection(userId, messages) {
  if (!messages || messages.length < MIN_MESSAGES_FOR_REFLECTION) {
    log.debug('Skipping reflection — too few messages', { userId, count: messages?.length });
    return null;
  }

  // Get current core memory for context
  const blocks = await getBlocks(userId);
  const currentHuman = blocks.human?.content || 'No prior information.';
  const currentGoals = blocks.goals?.content || 'No goals set.';

  // Format conversation for the prompt
  const conversationText = messages
    .slice(-15) // Last 15 messages max
    .map(m => `${m.role === 'user' ? 'User' : 'Twin'}: ${m.content.slice(0, 500)}`)
    .join('\n');

  const prompt = `You are analyzing a conversation between a digital twin and its user to extract learning.

CURRENT KNOWLEDGE ABOUT USER:
${currentHuman}

CURRENT GOALS:
${currentGoals}

CONVERSATION:
${conversationText}

Analyze this conversation and respond with VALID JSON only (no markdown, no code blocks):

{
  "facts": [
    {"content": "specific fact learned about the user", "importance": 7}
  ],
  "session_theme": "one-sentence summary of what this conversation was really about",
  "twin_quality": {
    "score": 4,
    "note": "brief note on what felt right or wrong about the twin's responses"
  },
  "follow_ups": [
    {"action": "what the twin should remember to bring up later", "trigger": "time or condition description"}
  ],
  "human_block_update": "updated HUMAN block content incorporating new facts (max 1500 chars, keep existing info unless contradicted)"
}

Rules:
- Extract ONLY facts explicitly stated or clearly implied. Never infer beyond the evidence.
- twin_quality score: 1=terrible, 2=poor, 3=ok, 4=good, 5=excellent
- follow_ups: only if the user mentioned something that deserves future attention
- human_block_update: merge new info with existing, remove outdated info, stay under 1500 chars`;

  try {
    const response = await complete({
      messages: [{ role: 'user', content: prompt }],
      tier: TIER_ANALYSIS, // DeepSeek — cheap
      maxTokens: 1000,
      temperature: 0.3,
      userId,
      serviceName: 'session-reflection',
    });

    const text = response?.content || response?.text || '';

    // Parse JSON from response (handle potential markdown wrapping)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      log.warn('Session reflection returned non-JSON', { userId, response: text.slice(0, 200) });
      return null;
    }

    const result = JSON.parse(jsonMatch[0]);
    log.info('Session reflection generated', {
      userId,
      facts: result.facts?.length || 0,
      followUps: result.follow_ups?.length || 0,
      twinQuality: result.twin_quality?.score
    });

    return result;
  } catch (err) {
    log.error('Session reflection generation failed', { userId, error: err.message });
    return null;
  }
}

/**
 * Apply the results of a session reflection:
 * 1. Store new facts as memories
 * 2. Store session theme as session_reflection memory
 * 3. Update HUMAN core memory block
 * 4. Create prospective memories for follow-ups
 * 5. Log to agent_events
 */
export async function applyReflectionResults(userId, results) {
  if (!results) return;

  const applied = { facts: 0, followUps: 0, humanUpdated: false, themeStored: false };

  try {
    // 1. Store facts as memories
    if (results.facts?.length > 0) {
      for (const fact of results.facts) {
        try {
          await addMemory(
            userId,
            fact.content,
            'fact',
            { source: 'session_reflection' },
            { importanceScore: fact.importance || 6 }
          );
          applied.facts++;
        } catch (err) {
          log.warn('Failed to store reflected fact', { userId, error: err.message });
        }
      }
    }

    // 2. Store session theme
    if (results.session_theme) {
      try {
        await addMemory(
          userId,
          results.session_theme,
          'session_reflection',
          {
            source: 'session_reflection',
            expert: 'session_observer',
            twin_quality: results.twin_quality?.score
          },
          { importanceScore: 7 }
        );
        applied.themeStored = true;
      } catch (err) {
        log.warn('Failed to store session theme', { userId, error: err.message });
      }
    }

    // 3. Update HUMAN core memory block
    if (results.human_block_update) {
      try {
        await updateBlock(userId, 'human', results.human_block_update, 'session_reflection');
        applied.humanUpdated = true;
      } catch (err) {
        log.warn('Failed to update HUMAN block', { userId, error: err.message });
      }
    }

    // 4. Create prospective memories for follow-ups
    if (results.follow_ups?.length > 0) {
      for (const followUp of results.follow_ups) {
        try {
          await supabaseAdmin
            .from('prospective_memories')
            .insert({
              user_id: userId,
              trigger_type: 'condition',
              trigger_spec: { description: followUp.trigger },
              action: followUp.action,
              context: `From session reflection: ${results.session_theme || 'conversation'}`,
              source: 'session_reflection',
              priority: 'medium'
            });
          applied.followUps++;
        } catch (err) {
          log.warn('Failed to create prospective memory', { userId, error: err.message });
        }
      }
    }

    // 5. Log to agent_events
    try {
      await supabaseAdmin
        .from('agent_events')
        .insert({
          user_id: userId,
          event_type: 'session_reflection_applied',
          event_data: {
            facts_stored: applied.facts,
            follow_ups_created: applied.followUps,
            human_updated: applied.humanUpdated,
            theme_stored: applied.themeStored,
            twin_quality: results.twin_quality?.score,
            session_theme: results.session_theme
          },
          source: 'session_reflection'
        });
    } catch (err) {
      log.warn('Failed to log agent event', { error: err.message });
    }

    log.info('Session reflection applied', { userId, ...applied });
    return applied;
  } catch (err) {
    log.error('Failed to apply reflection results', { userId, error: err.message });
    return applied;
  }
}

/**
 * Get recent conversation messages for reflection.
 * Pulls from mcp_conversation_logs (where chat data actually lives).
 */
export async function getRecentConversationMessages(userId, limit = 20) {
  try {
    const { data, error } = await supabaseAdmin
      .from('mcp_conversation_logs')
      .select('role, message, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      log.error('Failed to fetch recent messages', { userId, error });
      return [];
    }

    // Reverse to chronological order and map to standard format
    return (data || [])
      .reverse()
      .map(row => ({
        role: row.role === 'assistant' ? 'assistant' : 'user',
        content: row.message
      }));
  } catch (err) {
    log.error('Error fetching conversation messages', { userId, error: err.message });
    return [];
  }
}

/**
 * Run full session reflection pipeline for a user.
 * Called by Inngest function or cron after conversation ends.
 */
export async function runSessionReflection(userId) {
  log.info('Starting session reflection', { userId });

  const messages = await getRecentConversationMessages(userId, 20);
  if (messages.length < MIN_MESSAGES_FOR_REFLECTION) {
    log.debug('Not enough messages for reflection', { userId, count: messages.length });
    return null;
  }

  const results = await generateSessionReflection(userId, messages);
  if (!results) return null;

  const applied = await applyReflectionResults(userId, results);
  return { results, applied };
}
