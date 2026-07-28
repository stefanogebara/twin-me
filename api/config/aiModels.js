/**
 * AI Model Configuration
 *
 * Single source of truth for all AI model identifiers.
 * Update here to change models across the entire platform.
 *
 * OPENROUTER COST TIERS (via llmGateway.js) — all three are currently DeepSeek V3.2
 * ($0.25/M in, $0.38/M out); the MODELS map below is the source of truth:
 * - Chat        (DeepSeek V3.2) — twin conversation default
 * - Analysis    (DeepSeek V3.2) — reflections, summaries, insights
 * - Extraction  (DeepSeek V3.2) — importance rating, fact extraction (mistral-small 404'd 2026-04-30)
 *
 * SMART ROUTING (chatRouter.js CHAT_TIER_MODELS is the source of truth; drift-guarded by test):
 * - Chat Light    (Gemini 2.5 Flash, $0.15/$0.60) — greetings, acks, short factual
 * - Chat Standard (DeepSeek V3.2)                  — medium complexity
 * - Chat Deep     (DeepSeek V3.2)                  — emotional, identity, complex
 *                 (was Claude Sonnet 4.6; deliberately kept on DeepSeek for cost — audit #118)
 *
 * LEGACY DIRECT (kept for backward compat, not used by gateway):
 * - Sonnet 4.5: $3/M input, $15/M output
 * - Haiku 4.5:  $0.80/M input, $4/M output
 */

// Interactive/chat model - used when user is waiting for a response
export const CLAUDE_MODEL_INTERACTIVE = 'claude-sonnet-4.6';

// Background/analysis model - used for scheduled jobs, feature extraction, pattern analysis
export const CLAUDE_MODEL_BACKGROUND = 'claude-haiku-4.5';

// Default model - switched to Haiku to prevent credit burn
// Only twin-chat and direct conversation endpoints should use INTERACTIVE
export const CLAUDE_MODEL = CLAUDE_MODEL_BACKGROUND;

// Alias for backward compatibility with files that use 'MODEL'
export const MODEL = CLAUDE_MODEL;

// ====================================================================
// LLM Gateway Tier System (OpenRouter)
// ====================================================================
// All LLM calls route through llmGateway.js using these tiers.
// To change a model, update OPENROUTER_MODELS below - all callers auto-switch.

export const TIER_CHAT = 'chat';
export const TIER_CHAT_FINETUNED = 'chat_finetuned';
export const TIER_ANALYSIS = 'analysis';
export const TIER_EXTRACTION = 'extraction';
export const TIER_VISION = 'vision';

// Finetuned model ID from OpenAI (set via env after fine-tune job completes)
// Format: ft:gpt-4o-mini-2024-07-18:org::id
export const FINETUNED_MODEL = process.env.FINETUNED_TWIN_MODEL || null;

export const OPENROUTER_MODELS = {
  [TIER_CHAT]: 'deepseek/deepseek-v3.2', // $0.25/$0.38 per M — 12x cheaper, ~3x faster TTFT
  [TIER_CHAT_FINETUNED]: FINETUNED_MODEL,     // OpenAI finetuned model — routed directly, not via OpenRouter
  [TIER_ANALYSIS]: 'deepseek/deepseek-v3.2',          // $0.25/$0.38 per M — 90% cheaper than Haiku
  [TIER_EXTRACTION]: 'deepseek/deepseek-v3.2', // mistral-small-creative was 404'ing on OpenRouter (2026-04-30)
  [TIER_VISION]: 'google/gemini-2.5-flash', // vision-capable, cheapest sane choice — WhatsApp receipt extraction (~$0.001/image)
  // NOTE: Kimi K2.5 is a reasoning model (wastes tokens on chain-of-thought).
  // Only suitable for complex problem-solving, not general chat/analysis.
};

export const MODEL_PRICING = {
  'moonshotai/kimi-k2.5': { input: 0.45, output: 2.25, cachedInput: 0.045 },
  'deepseek/deepseek-v3.2': { input: 0.25, output: 0.38, cachedInput: 0.025 },
  'mistralai/mistral-small-creative': { input: 0.10, output: 0.30, cachedInput: 0.01 },
  // Smart routing models (chatRouter.js)
  'google/gemini-2.5-flash': { input: 0.30, output: 2.50, cachedInput: 0.03 },
  'anthropic/claude-sonnet-4.6': { input: 3.00, output: 15.00, cachedInput: 0.30 },
  // Fallback models (kept for cost tracking if manually overridden)
  'anthropic/claude-sonnet-4.5': { input: 3.00, output: 15.00, cachedInput: 0.30 },
  'anthropic/claude-haiku-4.5': { input: 0.80, output: 4.00, cachedInput: 0.08 },
  'google/gemini-3-flash-preview': { input: 0.50, output: 3.00, cachedInput: 0.05 },
  default: { input: 0.25, output: 0.38, cachedInput: 0.025 },
};

export const CACHE_TTL_BY_TIER = {
  [TIER_CHAT]: 0,        // Never cache chat
  [TIER_ANALYSIS]: 1800,  // 30 minutes
  [TIER_EXTRACTION]: 3600, // 1 hour
  [TIER_VISION]: 0,      // Receipt images are unique — caching buys nothing
};
