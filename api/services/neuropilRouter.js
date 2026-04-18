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
      'who am i', 'who are you', 'personality', 'identity', 'values', 'believe',
      'character', 'trait', 'traits', 'self', 'authentic', 'soul', 'real me',
      'introvert', 'extrovert', 'attachment', 'big five', 'ocean', 'my style',
      'describe me', 'describe yourself', 'my vibe', 'my energy', 'my type',
    ],
    weights: { recency: 0.0, importance: 2.0, relevance: 1.2 },
    budgets: { reflections: 6, conversations: 6, facts: 4, platform_data: 2, observations: 2 },
  },
  lifestyle: {
    keywords: [
      'sleep', 'exercise', 'routine', 'morning', 'energy',
      'health', 'diet', 'workout', 'recovery', 'daily', 'rest', 'tired',
      'schedule', 'habit', 'rhythm', 'hrv', 'strain', 'body', 'run',
      'gym', 'walk', 'eat', 'food', 'nap', 'bedtime', 'wake',
    ],
    weights: { recency: 0.0, importance: 0.5, relevance: 1.0 },
    budgets: { reflections: 2, conversations: 2, facts: 2, platform_data: 10, observations: 4 },
  },
  cultural: {
    keywords: [
      'music', 'song', 'songs', 'playlist', 'movie', 'film', 'book', 'show',
      'art', 'taste', 'aesthetic', 'genre', 'style', 'culture', 'spotify',
      'youtube', 'watch', 'listen', 'listening', 'read', 'reading', 'podcast',
      'artist', 'artists', 'album', 'track', 'band', 'netflix', 'anime',
    ],
    weights: { recency: 0.0, importance: 0.5, relevance: 1.0 },
    budgets: { reflections: 4, conversations: 3, facts: 3, platform_data: 6, observations: 4 },
  },
  social: {
    keywords: [
      'friend', 'friends', 'relationship', 'relationships', 'people', 'social',
      'talk', 'community', 'discord', 'group', 'conversation', 'connect',
      'network', 'linkedin', 'team', 'collaborate', 'communicate', 'family',
      'partner', 'mom', 'dad', 'sister', 'brother', 'roommate', 'colleague',
      'chat', 'text', 'call', 'meet', 'hangout',
    ],
    weights: { recency: 0.0, importance: 0.5, relevance: 1.0 },
    budgets: { reflections: 3, conversations: 8, facts: 3, platform_data: 3, observations: 3 },
  },
  motivation: {
    keywords: [
      'goal', 'goals', 'ambition', 'ambitions', 'career', 'work', 'job',
      'achieve', 'motivation', 'motivated', 'purpose', 'drive', 'plan',
      'future', 'success', 'progress', 'productivity', 'decision', 'challenge',
      'startup', 'project', 'launch', 'ship', 'build', 'grind', 'focus',
      'priority', 'should i', 'next step',
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

  // Activate on >=1 keyword match (lowered from 2 after audit found routing
  // fired on <15% of eligible prompts). Single matches are low-confidence.
  if (bestCount < 1 || !bestConfig) {
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
