/**
 * Connectome Neuropils — Domain-specific memory retrieval routing
 *
 * Maps 5 brain regions to the 5 reflection expert domains
 * with custom retrieval weights and type budgets.
 *
 * All functions are PURE (no DB, no LLM, microseconds).
 */

// Weights aligned with twin-research findings (sessions 1-2):
// recency=0 consistently wins — reflection decay_rate=90 creates unfair recency advantage.
// Identity-like weights (high importance + relevance, zero recency) outperform across domains.
const NEUROPILS = {
  personality: {
    keywords: [
      'who am i', 'personality', 'identity', 'values', 'believe',
      'character', 'trait', 'self', 'authentic', 'soul',
      'introvert', 'extrovert', 'attachment', 'big five', 'ocean',
    ],
    weights: { recency: 0.0, importance: 2.0, relevance: 1.2 },
    budgets: { reflections: 6, conversations: 6, facts: 4, platform_data: 2, observations: 2 },
  },
  lifestyle: {
    keywords: [
      'sleep', 'exercise', 'routine', 'morning', 'energy',
      'health', 'diet', 'workout', 'recovery', 'daily',
      'schedule', 'habit', 'rhythm', 'hrv', 'strain',
    ],
    weights: { recency: 0.0, importance: 0.5, relevance: 1.0 },
    budgets: { reflections: 2, conversations: 2, facts: 2, platform_data: 10, observations: 4 },
  },
  cultural: {
    keywords: [
      'music', 'movie', 'book', 'show', 'art',
      'taste', 'aesthetic', 'genre', 'style', 'culture',
      'spotify', 'youtube', 'watch', 'listen', 'read',
    ],
    weights: { recency: 0.0, importance: 0.5, relevance: 1.0 },
    budgets: { reflections: 4, conversations: 3, facts: 3, platform_data: 6, observations: 4 },
  },
  social: {
    keywords: [
      'friend', 'relationship', 'people', 'social', 'talk',
      'community', 'discord', 'group', 'conversation', 'connect',
      'network', 'linkedin', 'team', 'collaborate', 'communicate',
    ],
    weights: { recency: 0.0, importance: 0.5, relevance: 1.0 },
    budgets: { reflections: 3, conversations: 8, facts: 3, platform_data: 3, observations: 3 },
  },
  motivation: {
    keywords: [
      'goal', 'ambition', 'career', 'work', 'achieve',
      'motivation', 'purpose', 'drive', 'plan', 'future',
      'success', 'progress', 'productivity', 'decision', 'challenge',
    ],
    weights: { recency: 0.0, importance: 1.0, relevance: 1.2 },
    budgets: { reflections: 3, conversations: 3, facts: 8, platform_data: 3, observations: 3 },
  },
};

/**
 * Classify a user message into the most relevant neuropil domain.
 * Requires >= 2 keyword matches to activate routing.
 *
 * @param {string} message - User message
 * @returns {{ neuropilId: string|null, weights: object|null, budgets: object|null, confidence: number }}
 */
export function classifyNeuropil(message) {
  if (!message || typeof message !== 'string') {
    return { neuropilId: null, weights: null, budgets: null, confidence: 0 };
  }

  const lower = message.toLowerCase();
  let bestId = null;
  let bestCount = 0;
  let bestConfig = null;

  for (const [id, config] of Object.entries(NEUROPILS)) {
    const count = config.keywords.filter((kw) => lower.includes(kw)).length;
    if (count > bestCount) {
      bestId = id;
      bestCount = count;
      bestConfig = config;
    }
  }

  // Require at least 2 keyword matches to activate routing
  if (bestCount < 2 || !bestConfig) {
    return { neuropilId: null, weights: null, budgets: null, confidence: 0 };
  }

  const confidence = Math.min(1, bestCount / 5);
  return {
    neuropilId: bestId,
    weights: { ...bestConfig.weights },
    budgets: { ...bestConfig.budgets },
    confidence,
  };
}
