/**
 * Neurotransmitter Modes — Context-dependent dynamic modulation
 *
 * Inspired by how neurotransmitters globally shift brain processing.
 * All functions are PURE (no DB, no LLM, microseconds).
 *
 * Three modes (additive deltas on top of OCEAN-derived personality params):
 * - serotonergic (emotional/supportive): warmer, allows comforting repetition
 * - dopaminergic (analytical/goal-focused): precise, varied vocabulary
 * - noradrenergic (creative/exploratory): widest sampling
 */

const MODE_KEYWORDS = {
  serotonergic: [
    'feel', 'feeling', 'feelings', 'stressed', 'stress', 'sad', 'anxious',
    'anxiety', 'overwhelmed', 'overwhelm', 'lonely', 'alone', 'worried',
    'worry', 'tired', 'exhausted', 'burnt out', 'burned out', 'struggling',
    'struggle', 'grateful', 'depressed', 'down', 'hurt', 'hurting', 'scared',
    'afraid', 'nervous', 'happy', 'rest', 'hard on myself', 'beat myself up',
    'cry', 'crying', 'heavy', 'low', 'drained', 'vulnerable', 'isolated',
  ],
  dopaminergic: [
    'analyze', 'analysis', 'plan', 'planning', 'goal', 'goals', 'strategy',
    'strategic', 'optimize', 'optimization', 'measure', 'data', 'compare',
    'decide', 'decision', 'productivity', 'productive', 'track', 'tracking',
    'metric', 'metrics', 'progress', 'schedule', 'budget', 'should i',
    'which one', 'priorit', 'efficient', 'efficiency', 'logic', 'evaluate',
    'trade-off', 'tradeoff', 'pros and cons', 'roi', 'benchmark',
  ],
  noradrenergic: [
    'imagine', 'what if', 'explore', 'exploring', 'creative', 'creativity',
    'brainstorm', 'brainstorming', 'inspire', 'inspiration', 'dream', 'wonder',
    'experiment', 'idea', 'ideas', 'invent', 'design', 'vision', 'possibility',
    'possibilities', 'art', 'create', 'make', 'build', 'write', 'story',
    'novel idea', 'wild', 'crazy idea', 'prototype', 'sketch', 'compose',
  ],
};

const MODE_DELTAS = {
  serotonergic: { temperature: 0.05, top_p: 0, frequency_penalty: -0.08, presence_penalty: 0.05 },
  dopaminergic: { temperature: -0.08, top_p: -0.03, frequency_penalty: 0.08, presence_penalty: -0.05 },
  noradrenergic: { temperature: 0.10, top_p: 0.05, frequency_penalty: 0.03, presence_penalty: 0.03 },
  default: { temperature: 0, top_p: 0, frequency_penalty: 0, presence_penalty: 0 },
};

const CLAMP_RANGES = {
  temperature: [0.4, 0.95],
  top_p: [0.8, 0.98],
  frequency_penalty: [0, 0.3],
  presence_penalty: [0, 0.3],
};

const MODE_PROMPT_BLOCKS = {
  serotonergic: `You are in an empathetic, supportive mode. The user seems to be processing emotions.
Be warm, patient, and validating. Use gentle language. It's okay to repeat reassurances for comfort.
Mirror their emotional state before offering perspective.`,

  dopaminergic: `You are in a focused, analytical mode. The user is thinking strategically.
Be precise and structured. Use data-driven language. Avoid filler words.
Present options clearly with trade-offs. Help them decide and plan.`,

  noradrenergic: `You are in a creative, exploratory mode. The user wants to brainstorm or imagine.
Be expansive and playful. Make unexpected connections. Ask "what if" questions.
Encourage wild ideas before narrowing down. Think laterally.`,
};

/**
 * Detect conversation mode from message keywords.
 * Requires >= 2 keyword matches to activate a mode.
 *
 * @param {string} message - User message
 * @returns {{ mode: string, confidence: number, matchedKeywords: string[] }}
 */
export function detectConversationMode(message) {
  if (!message || typeof message !== 'string') {
    return { mode: 'default', confidence: 0, matchedKeywords: [] };
  }

  const lower = message.toLowerCase();
  const scores = {};

  for (const [mode, keywords] of Object.entries(MODE_KEYWORDS)) {
    const matched = keywords.filter((kw) => lower.includes(kw));
    scores[mode] = { count: matched.length, keywords: matched };
  }

  // Find the mode with the highest keyword count
  let bestMode = 'default';
  let bestCount = 0;
  let bestKeywords = [];

  for (const [mode, { count, keywords }] of Object.entries(scores)) {
    if (count > bestCount) {
      bestMode = mode;
      bestCount = count;
      bestKeywords = keywords;
    }
  }

  // Activate on >=1 keyword match; single-match is treated as lower-confidence.
  // Lowered from >=2 after audit found modes fired on <15% of eligible prompts.
  if (bestCount < 1) {
    return { mode: 'default', confidence: 0, matchedKeywords: [] };
  }

  // Confidence scales with match count; single match = 0.2, 5+ matches = 1.0
  const confidence = Math.min(1, bestCount / 5);
  return { mode: bestMode, confidence, matchedKeywords: bestKeywords };
}

/**
 * Apply neurotransmitter mode deltas to base sampling parameters.
 * Returns a NEW object (immutable).
 *
 * @param {object} baseParams - { temperature, top_p, frequency_penalty, presence_penalty }
 * @param {string} mode - One of: serotonergic, dopaminergic, noradrenergic, default
 * @returns {object} New params with mode deltas applied and clamped
 */
export function applyNeurotransmitterModifiers(baseParams, mode) {
  const deltas = MODE_DELTAS[mode] || MODE_DELTAS.default;

  const clamp = (val, [min, max]) => Math.max(min, Math.min(max, val));

  return {
    temperature: clamp(
      (baseParams.temperature ?? 0.7) + deltas.temperature,
      CLAMP_RANGES.temperature
    ),
    top_p: clamp(
      (baseParams.top_p ?? 0.9) + deltas.top_p,
      CLAMP_RANGES.top_p
    ),
    frequency_penalty: clamp(
      (baseParams.frequency_penalty ?? 0.1) + deltas.frequency_penalty,
      CLAMP_RANGES.frequency_penalty
    ),
    presence_penalty: clamp(
      (baseParams.presence_penalty ?? 0.1) + deltas.presence_penalty,
      CLAMP_RANGES.presence_penalty
    ),
  };
}

/**
 * Build a mode-specific behavioral prompt block, or empty string for default.
 *
 * @param {string} mode
 * @returns {string}
 */
export function buildNeurotransmitterPromptBlock(mode) {
  return MODE_PROMPT_BLOCKS[mode] || '';
}
