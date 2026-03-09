/**
 * Neurotransmitter Mode Service
 * =============================
 * Context-dependent dynamic modulation of sampling parameters based on detected
 * conversation mode. Inspired by how neurotransmitters globally shift brain processing:
 *
 *   - Serotonergic (emotional/supportive): warmer, allows comforting repetition
 *   - Dopaminergic (analytical/goal-focused): precise, varied technical vocabulary
 *   - Noradrenergic (creative/exploratory): widest sampling, novel connections
 *   - Default: no modulation (personality-derived params used as-is)
 *
 * All functions are PURE (no DB, no LLM, no side effects).
 * Applied as additive modifiers on top of OCEAN-derived personality sampling params.
 *
 * Reference: Eon Systems whole-brain emulation (Nature, Oct 2024) — neurotransmitter
 * distribution (55% cholinergic, 24% glutamatergic, 14% GABAergic) creates different
 * excitation/inhibition balances. We model this at API parameter level.
 */

// ── Mode Keyword Dictionaries ────────────────────────────────────────────────

const MODE_KEYWORDS = {
  serotonergic: [
    'feeling', 'stressed', 'sad', 'anxious', 'overwhelmed', 'lonely', 'hurt',
    'scared', 'worried', 'tired', 'struggling', 'grateful', 'miss', 'love',
    'cry', 'help me', 'talk about', 'afraid', 'depressed', 'exhausted',
    'upset', 'nervous', 'insecure', 'broken', 'emotional', 'tough',
  ],
  dopaminergic: [
    'analyze', 'plan', 'goal', 'strategy', 'optimize', 'measure', 'data',
    'compare', 'decide', 'productivity', 'improve', 'track', 'number',
    'calculate', 'schedule', 'metric', 'efficient', 'progress', 'target',
    'performance', 'review', 'assess', 'evaluate', 'systematic',
  ],
  noradrenergic: [
    'imagine', 'what if', 'explore', 'creative', 'brainstorm', 'inspire',
    'dream', 'wonder', 'experiment', 'idea', 'could we', 'new', 'different',
    'wild', 'try', 'invent', 'possibility', 'vision', 'innovate', 'reimagine',
    'unconventional', 'rethink', 'discovery',
  ],
};

// ── Sampling Parameter Deltas per Mode ──────────────────────────────────────

const MODE_DELTAS = {
  serotonergic: {
    temperature: +0.05,      // warmer for emotional expression
    top_p: 0.00,             // no change
    frequency_penalty: -0.08, // allow comforting repetition
    presence_penalty: +0.05,  // explore emotional space
  },
  dopaminergic: {
    temperature: -0.08,      // precise, focused
    top_p: -0.03,            // narrower sampling
    frequency_penalty: +0.08, // varied technical vocabulary
    presence_penalty: -0.05,  // stay on topic
  },
  noradrenergic: {
    temperature: +0.10,      // most creative
    top_p: +0.05,            // widest sampling
    frequency_penalty: +0.03, // varied expression
    presence_penalty: +0.03,  // explore new topics
  },
  default: {
    temperature: 0,
    top_p: 0,
    frequency_penalty: 0,
    presence_penalty: 0,
  },
};

// ── Prompt Blocks per Mode ──────────────────────────────────────────────────

const MODE_PROMPTS = {
  serotonergic:
    '[NEUROTRANSMITTER: SEROTONERGIC]\n' +
    'The user seems to be sharing something emotional. Be warm, empathetic, and present. ' +
    'Prioritize validation and understanding over advice or analysis. Use a gentler, ' +
    'more supportive tone. Mirror their emotional energy — if they\'re hurting, acknowledge it ' +
    'before offering perspective.',
  dopaminergic:
    '[NEUROTRANSMITTER: DOPAMINERGIC]\n' +
    'The user is in analytical mode. Be precise, structured, and action-oriented. ' +
    'Use clear reasoning and concrete suggestions. When relevant, include specifics like ' +
    'numbers, timelines, or step-by-step breakdowns. Match their focused energy.',
  noradrenergic:
    '[NEUROTRANSMITTER: NORADRENERGIC]\n' +
    'The user is exploring ideas creatively. Be imaginative, make unexpected connections, ' +
    'and encourage exploration. Ask thought-provoking questions. Embrace "what if" thinking ' +
    'and offer novel perspectives they might not have considered.',
  default: '',
};

// ── Clamping Bounds (same as deriveSamplingParams in personalityProfileService) ─

const CLAMP = {
  temperature: { min: 0.4, max: 0.95 },
  top_p: { min: 0.8, max: 0.98 },
  frequency_penalty: { min: 0.0, max: 0.3 },
  presence_penalty: { min: 0.0, max: 0.3 },
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Detect conversation mode from the user's message using keyword matching.
 * Zero LLM calls — pure string analysis, runs in microseconds.
 *
 * @param {string} message - The user's message text
 * @returns {{ mode: string, confidence: number, matchedKeywords: string[] }}
 */
export function detectConversationMode(message) {
  if (!message || typeof message !== 'string') {
    return { mode: 'default', confidence: 0, matchedKeywords: [] };
  }

  const lower = message.toLowerCase();
  const words = lower.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  const scores = {};
  const matches = {};

  for (const [mode, keywords] of Object.entries(MODE_KEYWORDS)) {
    matches[mode] = [];
    for (const keyword of keywords) {
      // Multi-word keywords use includes(), single-word use word boundary
      if (keyword.includes(' ')) {
        if (lower.includes(keyword)) matches[mode].push(keyword);
      } else {
        // Match whole word or word within compound (e.g., "feelings" matches "feeling")
        if (lower.includes(keyword)) matches[mode].push(keyword);
      }
    }
    scores[mode] = matches[mode].length;
  }

  // Pick highest-scoring mode, require >= 2 keyword matches to activate
  let bestMode = 'default';
  let bestScore = 0;
  for (const [mode, score] of Object.entries(scores)) {
    if (score > bestScore && score >= 2) {
      bestMode = mode;
      bestScore = score;
    }
  }

  // If two modes tie at >= 2, pick the one with more matches
  // (already handled by > comparison above — first in iteration wins on exact tie,
  //  which is fine since tie-breaking is arbitrary for equally strong signals)

  const confidence = wordCount > 0
    ? Math.min(1.0, bestScore / Math.max(wordCount, 1))
    : 0;

  return {
    mode: bestMode,
    confidence: Math.round(confidence * 1000) / 1000,
    matchedKeywords: matches[bestMode] || [],
  };
}

/**
 * Apply neurotransmitter mode modifiers to base sampling parameters.
 * Returns a NEW object (immutable pattern) with clamped values.
 *
 * @param {{ temperature?: number, top_p?: number, frequency_penalty?: number, presence_penalty?: number }} baseParams
 * @param {string} mode - One of: 'serotonergic', 'dopaminergic', 'noradrenergic', 'default'
 * @returns {{ temperature: number, top_p: number, frequency_penalty: number, presence_penalty: number }}
 */
export function applyNeurotransmitterModifiers(baseParams, mode) {
  const deltas = MODE_DELTAS[mode] || MODE_DELTAS.default;

  const base = {
    temperature: baseParams?.temperature ?? 0.7,
    top_p: baseParams?.top_p ?? 0.9,
    frequency_penalty: baseParams?.frequency_penalty ?? 0.0,
    presence_penalty: baseParams?.presence_penalty ?? 0.0,
  };

  return {
    temperature: clamp(
      base.temperature + deltas.temperature,
      CLAMP.temperature.min,
      CLAMP.temperature.max,
    ),
    top_p: clamp(
      base.top_p + deltas.top_p,
      CLAMP.top_p.min,
      CLAMP.top_p.max,
    ),
    frequency_penalty: clamp(
      base.frequency_penalty + deltas.frequency_penalty,
      CLAMP.frequency_penalty.min,
      CLAMP.frequency_penalty.max,
    ),
    presence_penalty: clamp(
      base.presence_penalty + deltas.presence_penalty,
      CLAMP.presence_penalty.min,
      CLAMP.presence_penalty.max,
    ),
  };
}

/**
 * Build a mode-specific prompt block to inject into the system prompt.
 * Returns empty string for 'default' mode.
 *
 * @param {string} mode - One of: 'serotonergic', 'dopaminergic', 'noradrenergic', 'default'
 * @returns {string}
 */
export function buildNeurotransmitterPromptBlock(mode) {
  return MODE_PROMPTS[mode] || '';
}
