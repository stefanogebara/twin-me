/**
 * Twin Pattern Learning Service (EWC++ inspired)
 * ================================================
 * Wraps the twin_patterns table with confidence-weighted reinforcement.
 *
 * Architecture inspired by Elastic Weight Consolidation++ (Schwarz et al., 2018):
 * - ewc_importance weights resist forgetting high-confidence patterns
 * - confidence adjusts via reinforce_pattern / decay_pattern RPCs
 * - Patterns are seeded from high-retrieval memories (see migration: twin_patterns_learning_loop)
 * - User engagement signals (e.g. insight tapped) reinforce topic_affinity patterns
 *
 * Table: twin_patterns
 * RPCs: reinforce_pattern, decay_pattern, find_matching_patterns
 */

import { supabaseAdmin } from './database.js';
import { vectorToString } from './embeddingService.js';
import { createLogger } from './logger.js';

const log = createLogger('TwinPattern');

// ====================================================================
// Read Operations
// ====================================================================

/**
 * Get top patterns by confidence for context injection into twin chat.
 * Returns topic_affinity patterns with highest confidence + ewc_importance.
 */
export async function getTopPatterns(userId, limit = 5) {
  if (!userId) return [];
  try {
    const { data, error } = await supabaseAdmin
      .from('twin_patterns')
      .select('id, pattern_type, name, description, confidence, ewc_importance')
      .eq('user_id', userId)
      .gte('confidence', 0.55)
      .order('confidence', { ascending: false })
      .order('ewc_importance', { ascending: false })
      .limit(limit);

    if (error) {
      log.warn('getTopPatterns failed:', error.message);
      return [];
    }

    return data || [];
  } catch (err) {
    log.warn('getTopPatterns error:', err.message);
    return [];
  }
}

/**
 * Semantic pattern lookup using embedding similarity.
 * Uses find_matching_patterns RPC (HNSW index on twin_patterns.embedding).
 *
 * @param {string} userId
 * @param {number[]} queryEmbedding - 1536d float array
 * @param {object} opts
 * @param {string|null} opts.patternType - filter by pattern_type (null = all types)
 * @param {number} opts.minConfidence - minimum confidence threshold
 * @param {number} opts.limit - max patterns to return
 */
export async function findRelevantPatterns(userId, queryEmbedding, {
  patternType = null,
  minConfidence = 0.55,
  limit = 5,
} = {}) {
  if (!userId || !queryEmbedding) return [];
  try {
    const { data, error } = await supabaseAdmin.rpc('find_matching_patterns', {
      p_user_id: userId,
      p_query_embedding: vectorToString(queryEmbedding),
      p_pattern_type: patternType,
      p_min_confidence: minConfidence,
      p_limit: limit,
    });

    if (error) {
      log.warn('findRelevantPatterns RPC failed:', error.message);
      return [];
    }

    return data || [];
  } catch (err) {
    log.warn('findRelevantPatterns error:', err.message);
    return [];
  }
}

// ====================================================================
// Write Operations
// ====================================================================

/**
 * Reinforce a pattern after a positive signal (insight engaged, goal met).
 * Calls reinforce_pattern RPC which boosts confidence + ewc_importance.
 *
 * @param {string} patternId - UUID of the twin_patterns row
 * @param {number} reward - reinforcement strength [0, 1]
 */
export async function reinforcePatternById(patternId, reward = 0.10) {
  if (!patternId) return;
  try {
    await supabaseAdmin.rpc('reinforce_pattern', {
      p_pattern_id: patternId,
      p_reward: reward,
    });
  } catch (err) {
    log.warn('reinforcePatternById error:', err.message);
  }
}

/**
 * Decay a pattern after a negative signal (insight dismissed, irrelevant).
 * Calls decay_pattern RPC which reduces confidence + ewc_importance.
 *
 * @param {string} patternId - UUID of the twin_patterns row
 * @param {number} penalty - decay strength [0, 1]
 */
export async function decayPatternById(patternId, penalty = 0.05) {
  if (!patternId) return;
  try {
    await supabaseAdmin.rpc('decay_pattern', {
      p_pattern_id: patternId,
      p_penalty: penalty,
    });
  } catch (err) {
    log.warn('decayPatternById error:', err.message);
  }
}

/**
 * Seed a new topic_affinity pattern from a proactive insight the user engaged with.
 * Idempotent — silently ignores duplicate (name + user_id already exists).
 *
 * @param {string} userId
 * @param {string} name - pattern name (e.g. insight category like "music", "productivity")
 * @param {string} description - insight content or short description
 * @returns {string|null} - pattern ID or null
 */
export async function seedPatternFromInsight(userId, name, description) {
  if (!userId || !name) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from('twin_patterns')
      .insert({
        user_id: userId,
        pattern_type: 'topic_affinity',
        name: name.substring(0, 120),
        description: description?.substring(0, 500) || null,
        confidence: 0.55,
        ewc_importance: 1.0,
        success_count: 1,
      })
      .select('id')
      .single();

    if (error) {
      // Unique violation = already seeded; silently skip
      if (error.code !== '23505') {
        log.warn('seedPatternFromInsight failed:', error.message);
      }
      return null;
    }

    return data?.id || null;
  } catch (err) {
    log.warn('seedPatternFromInsight error:', err.message);
    return null;
  }
}
