/**
 * Chat Message Complexity Router
 * ===============================
 * Classifies incoming twin chat messages into three cost tiers
 * and routes to the cheapest model that maintains quality.
 *
 * Tiers:
 *   LIGHT    -> Gemini 2.5 Flash  ($0.15/$0.60 per M)  — greetings, acks, short factual
 *   STANDARD -> DeepSeek V3.2     ($0.25/$0.38 per M)  — medium complexity, casual personality
 *   DEEP     -> Claude Sonnet 4.6 ($3.00/$15.00 per M) — emotional, identity, complex reasoning
 *
 * Classification is pure heuristic (keyword + length), no LLM call.
 * Runs in < 1ms.
 *
 * Feature flag: `smart_routing` (default: enabled)
 */

import { createLogger } from './logger.js';

const log = createLogger('ChatRouter');

// ====================================================================
// Tier Constants & Model Mapping
// ====================================================================

export const CHAT_TIER_LIGHT = 'chat_light';
export const CHAT_TIER_STANDARD = 'chat_standard';
export const CHAT_TIER_DEEP = 'chat_deep';

export const CHAT_TIER_MODELS = {
  [CHAT_TIER_LIGHT]: 'google/gemini-2.5-flash',
  [CHAT_TIER_STANDARD]: 'deepseek/deepseek-v3.2',
  [CHAT_TIER_DEEP]: 'anthropic/claude-sonnet-4.6',
};

// ====================================================================
// Keyword Sets (pre-compiled for speed)
// ====================================================================

// Emotional / vulnerability markers -> DEEP
const EMOTIONAL_KEYWORDS = new Set([
  'feeling', 'feelings', 'feel', 'felt',
  'anxiety', 'anxious', 'stressed', 'stress', 'depressed', 'depression',
  'lonely', 'loneliness', 'overwhelmed', 'exhausted',
  'love', 'loved', 'heartbreak', 'heartbroken',
  'fear', 'afraid', 'scared', 'terrified', 'worry', 'worried',
  'angry', 'anger', 'frustrated', 'frustration', 'furious',
  'sad', 'sadness', 'crying', 'cried', 'cry',
  'happy', 'happiness', 'joy', 'joyful', 'grateful', 'gratitude',
  'hurt', 'pain', 'suffering', 'struggle', 'struggling',
  'trauma', 'traumatic', 'grief', 'grieving', 'mourning',
  'insecure', 'insecurity', 'vulnerable', 'vulnerability',
  'jealous', 'jealousy', 'envious', 'envy',
  'shame', 'ashamed', 'guilt', 'guilty',
  'hopeless', 'hopeful', 'hope', 'desperate', 'despair',
  'panic', 'panicking', 'breakdown',
  'therapy', 'therapist', 'counseling',
  'relationship', 'breakup', 'divorce',
  'dreams', 'nightmare', 'nightmares',
]);

// Identity / personality / deep reflection markers -> DEEP
const IDENTITY_KEYWORDS = new Set([
  'who am i', 'what makes me', 'my identity', 'my purpose',
  'meaning of life', 'life purpose', 'self-discovery',
  'unique', 'uniqueness', 'authentic', 'authenticity',
  'soul', 'essence', 'core', 'values',
  'personality', 'character', 'temperament',
  'strengths', 'weaknesses', 'flaws',
  'growth', 'evolving', 'becoming', 'transformation',
  'legacy', 'impact', 'contribution',
  'believe', 'beliefs', 'philosophy', 'worldview',
  'consciousness', 'awareness', 'mindfulness',
  'spiritual', 'spirituality', 'existential',
]);

// Identity phrases (multi-word) -> DEEP
const IDENTITY_PHRASES = [
  'who am i',
  'what makes me',
  'what defines me',
  'my true self',
  'deep down',
  'at my core',
  'what do you think of me',
  'what do you see in me',
  'how do you see me',
  'tell me about myself',
  'what kind of person',
  'what type of person',
  'am i a good',
  'life advice',
  'meaning of life',
  'purpose in life',
  'who do you think i am',
  'what am i like',
  'analyze me',
  'psychoanalyze',
];

// Greeting / acknowledgment patterns -> LIGHT
const GREETING_PATTERNS = [
  /^(hey|hi|hello|yo|sup|hola|oi|ola|fala|eai|e ai|salve|bom dia|boa tarde|boa noite|good morning|good afternoon|good evening|good night|gm|gn|whats up|what's up|wassup|howdy|hiya)[\s!?.]*$/i,
];

const ACKNOWLEDGMENT_PATTERNS = [
  /^(ok|okay|k|kk|got it|gotcha|sure|yep|yup|yeah|yes|no|nah|nope|cool|nice|great|awesome|thanks|thank you|thx|ty|lol|lmao|haha|hahaha|hmm|hm|oh|ah|aight|bet|word|facts|true|right|exactly|agreed|for sure|definitely|absolutely|alright|fine|np|no problem)[\s!?.]*$/i,
];

// Follow-up patterns (short, low-info) -> LIGHT
const FOLLOWUP_PATTERNS = [
  /^(tell me more|go on|continue|and then|why|how come|really|seriously|for real|what else|anything else|more|elaborate|explain|wdym|what do you mean)[\s!?.]*$/i,
];

// Medium complexity indicators -> STANDARD
const STANDARD_KEYWORDS = new Set([
  'think', 'opinion', 'compare', 'versus', 'recommend', 'suggestion',
  'plan', 'planning', 'schedule', 'organize', 'focus',
  'music', 'playlist', 'song', 'listen',
  'movie', 'show', 'watch', 'book', 'read',
  'workout', 'exercise', 'gym', 'run', 'health',
  'food', 'eat', 'recipe', 'cook', 'restaurant',
  'travel', 'trip', 'vacation', 'destination',
  'hobby', 'hobbies', 'interest', 'interests',
  'productivity', 'productive', 'efficient', 'routine',
  'goal', 'goals', 'habit', 'habits',
  'vibe', 'mood', 'energy', 'motivation',
]);

// Simple factual question indicators -> LIGHT
const FACTUAL_PATTERNS = [
  /^(what time|when is|where is|how many|how much|what day|what date|who is|who's playing|what's the score|what's on)/i,
  /^(do i have|is there|are there|did i|have i|was i)/i,
];

// ====================================================================
// Classification Engine
// ====================================================================

/**
 * Classify a message into a cost tier for model routing.
 *
 * @param {string} message - The user's message text
 * @param {Array} conversationHistory - Previous messages [{role, content}]
 * @returns {{ tier: string, model: string, reason: string }}
 */
export function classifyMessageTier(message, conversationHistory = []) {
  const trimmed = (message || '').trim();

  // Empty or very short -> LIGHT
  if (trimmed.length === 0) {
    return buildResult(CHAT_TIER_LIGHT, 'empty message');
  }

  const lower = trimmed.toLowerCase();
  const wordCount = trimmed.split(/\s+/).length;

  // --- Phase 1: Check for DEEP signals (highest priority) ---

  // Check identity phrases (multi-word patterns)
  for (const phrase of IDENTITY_PHRASES) {
    if (lower.includes(phrase)) {
      return buildResult(CHAT_TIER_DEEP, `identity phrase: "${phrase}"`);
    }
  }

  // Check emotional keywords
  const words = lower.replace(/[^a-zA-Z\s'-]/g, '').split(/\s+/);
  const emotionalHits = words.filter(w => EMOTIONAL_KEYWORDS.has(w));
  if (emotionalHits.length >= 2) {
    return buildResult(CHAT_TIER_DEEP, `emotional keywords: ${emotionalHits.slice(0, 3).join(', ')}`);
  }

  // Single emotional keyword in a longer message (likely emotional context)
  if (emotionalHits.length === 1 && wordCount >= 10) {
    return buildResult(CHAT_TIER_DEEP, `emotional context: ${emotionalHits[0]} in ${wordCount}-word message`);
  }

  // Check identity keywords
  const identityHits = words.filter(w => IDENTITY_KEYWORDS.has(w));
  if (identityHits.length >= 1) {
    return buildResult(CHAT_TIER_DEEP, `identity keyword: ${identityHits[0]}`);
  }

  // Long messages with personal context -> DEEP
  if (wordCount >= 50) {
    return buildResult(CHAT_TIER_DEEP, `long message: ${wordCount} words`);
  }

  // Deep conversation escalation: 5+ exchanges on same topic -> DEEP
  if (conversationHistory.length >= 10) {
    // 10 messages = 5 user+assistant exchanges
    return buildResult(CHAT_TIER_DEEP, `deep conversation: ${conversationHistory.length} messages in history`);
  }

  // --- Phase 2: Check for LIGHT signals ---

  // Pure greetings
  for (const pattern of GREETING_PATTERNS) {
    if (pattern.test(trimmed)) {
      return buildResult(CHAT_TIER_LIGHT, 'greeting');
    }
  }

  // Pure acknowledgments
  for (const pattern of ACKNOWLEDGMENT_PATTERNS) {
    if (pattern.test(trimmed)) {
      return buildResult(CHAT_TIER_LIGHT, 'acknowledgment');
    }
  }

  // Short follow-ups
  for (const pattern of FOLLOWUP_PATTERNS) {
    if (pattern.test(trimmed)) {
      return buildResult(CHAT_TIER_LIGHT, 'follow-up');
    }
  }

  // Simple factual questions
  for (const pattern of FACTUAL_PATTERNS) {
    if (pattern.test(trimmed)) {
      return buildResult(CHAT_TIER_LIGHT, 'factual question');
    }
  }

  // Very short messages (< 15 words) with no emotional/identity signals
  if (wordCount < 15) {
    // Check if it has standard keywords -> STANDARD
    const standardHits = words.filter(w => STANDARD_KEYWORDS.has(w));
    if (standardHits.length >= 1) {
      return buildResult(CHAT_TIER_STANDARD, `standard keyword: ${standardHits[0]}`);
    }
    // Otherwise short and simple -> LIGHT
    return buildResult(CHAT_TIER_LIGHT, `short message: ${wordCount} words, no complexity signals`);
  }

  // --- Phase 3: Check for STANDARD signals ---

  // Medium-length messages (15-49 words) without deep signals
  const standardHits = words.filter(w => STANDARD_KEYWORDS.has(w));
  if (standardHits.length >= 1) {
    return buildResult(CHAT_TIER_STANDARD, `standard keyword: ${standardHits[0]}`);
  }

  // Default for medium-length messages -> STANDARD
  if (wordCount >= 15 && wordCount < 50) {
    return buildResult(CHAT_TIER_STANDARD, `medium message: ${wordCount} words`);
  }

  // Fallback -> STANDARD (safe middle ground)
  return buildResult(CHAT_TIER_STANDARD, 'default fallback');
}

// ====================================================================
// Helpers
// ====================================================================

function buildResult(tier, reason) {
  return {
    tier,
    model: CHAT_TIER_MODELS[tier],
    reason,
  };
}
