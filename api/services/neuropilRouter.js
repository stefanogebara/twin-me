/**
 * Connectome-Inspired Neuropil Router
 * ====================================
 * Routes memory retrieval through domain-specific "neuropils" that adjust
 * retrieval weights and type budgets based on conversation topic.
 *
 * Like how different brain regions activate for different tasks:
 *   - Mushroom body → learning/memory (personality neuropil)
 *   - Central complex → navigation/planning (motivation neuropil)
 *   - Lateral horn → innate behaviors (lifestyle neuropil)
 *
 * Maps to the 5 reflection engine expert domains:
 *   1. Personality Psychologist → personality neuropil
 *   2. Lifestyle Analyst → lifestyle neuropil
 *   3. Cultural Identity Expert → cultural neuropil
 *   4. Social Dynamics Analyst → social neuropil
 *   5. Motivation Analyst → motivation neuropil
 *
 * All functions are PURE (no DB, no LLM, no side effects).
 *
 * Reference: Eon Systems (Nature, Oct 2024) — brain regions have distinct
 * neurotransmitter compositions and connectivity patterns that determine
 * what information flows through them.
 */

// ── Neuropil Definitions ─────────────────────────────────────────────────────

/**
 * Each neuropil defines:
 *   - keywords: triggers for classification (>= 2 matches required)
 *   - weights: retrieval weight preset { recency, importance, relevance }
 *     for the reflection query in retrieveDiverseMemories
 *   - budgets: per-type memory count allocation { reflections, facts, platformData, conversations }
 */
export const NEUROPILS = {
  personality: {
    keywords: [
      'feeling', 'emotion', 'personality', 'anxiety', 'mood', 'stress',
      'attachment', 'coping', 'therapy', 'relationship', 'identity', 'self',
      'character', 'trait', 'temperament', 'introvert', 'extrovert', 'empathy',
      'confidence', 'insecurity', 'fear', 'anger', 'joy', 'grief',
    ],
    weights: { recency: 0.3, importance: 0.8, relevance: 1.0 },  // identity-like: relevance dominant
    budgets: { reflections: 18, facts: 6, platformData: 2, conversations: 6 },
  },
  lifestyle: {
    keywords: [
      'sleep', 'exercise', 'routine', 'health', 'morning', 'evening',
      'workout', 'diet', 'energy', 'recovery', 'schedule', 'habit',
      'fitness', 'nutrition', 'weight', 'rest', 'wake', 'bed', 'gym',
      'run', 'walk', 'meal', 'hydration', 'caffeine',
    ],
    weights: { recency: 1.0, importance: 0.5, relevance: 0.8 },  // recent-biased: latest data matters
    budgets: { reflections: 10, facts: 5, platformData: 10, conversations: 3 },
  },
  cultural: {
    keywords: [
      'music', 'movie', 'book', 'art', 'show', 'podcast', 'game',
      'playlist', 'genre', 'aesthetic', 'taste', 'song', 'album', 'artist',
      'film', 'series', 'concert', 'museum', 'theater', 'culture',
      'listen', 'watch', 'read', 'stream',
    ],
    weights: { recency: 0.5, importance: 0.7, relevance: 1.0 },  // balanced: taste evolves but has roots
    budgets: { reflections: 12, facts: 6, platformData: 8, conversations: 4 },
  },
  social: {
    keywords: [
      'friend', 'family', 'people', 'team', 'meeting', 'conversation',
      'community', 'colleague', 'social', 'chat', 'talk', 'group',
      'party', 'network', 'collaboration', 'partner', 'dating', 'lonely',
      'together', 'hangout', 'discord', 'message',
    ],
    weights: { recency: 0.7, importance: 0.6, relevance: 1.0 },  // balanced-recent: recent social context
    budgets: { reflections: 12, facts: 5, platformData: 4, conversations: 8 },
  },
  motivation: {
    keywords: [
      'goal', 'work', 'career', 'project', 'ambition', 'decision', 'plan',
      'progress', 'achieve', 'motivation', 'focus', 'productivity', 'deadline',
      'promotion', 'job', 'success', 'failure', 'challenge', 'strategy',
      'growth', 'learn', 'skill', 'performance', 'target',
    ],
    weights: { recency: 0.8, importance: 0.7, relevance: 1.0 },  // recent + importance: active goals matter
    budgets: { reflections: 12, facts: 8, platformData: 5, conversations: 4 },
  },
};

// Default values matching current hardcoded behavior in memoryStreamService.js
export const DEFAULT_BUDGETS = { reflections: 15, facts: 8, platformData: 4, conversations: 4 };
export const DEFAULT_WEIGHTS = 'identity';

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Classify a user message into a neuropil domain.
 * Returns the matching neuropil's retrieval weights and budgets,
 * or null neuropilId if no domain matches strongly enough.
 *
 * @param {string} message - The user's message text
 * @returns {{ neuropilId: string|null, weights: object|null, budgets: object|null, confidence: number }}
 */
export function classifyNeuropil(message) {
  if (!message || typeof message !== 'string') {
    return { neuropilId: null, weights: null, budgets: null, confidence: 0 };
  }

  const lower = message.toLowerCase();
  const wordCount = lower.split(/\s+/).filter(Boolean).length;

  let bestId = null;
  let bestScore = 0;

  for (const [id, neuropil] of Object.entries(NEUROPILS)) {
    let matchCount = 0;
    for (const keyword of neuropil.keywords) {
      if (lower.includes(keyword)) matchCount++;
    }
    if (matchCount > bestScore && matchCount >= 2) {
      bestId = id;
      bestScore = matchCount;
    }
  }

  if (!bestId) {
    return { neuropilId: null, weights: null, budgets: null, confidence: 0 };
  }

  const confidence = wordCount > 0
    ? Math.min(1.0, bestScore / Math.max(wordCount, 1))
    : 0;

  return {
    neuropilId: bestId,
    weights: NEUROPILS[bestId].weights,
    budgets: NEUROPILS[bestId].budgets,
    confidence: Math.round(confidence * 1000) / 1000,
  };
}
