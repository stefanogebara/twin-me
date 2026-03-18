/**
 * AI Model Configuration
 *
 * Single source of truth for all AI model identifiers.
 * Update here to change models across the entire platform.
 *
 * OPENROUTER COST TIERS (via llmGateway.js):
 * - Chat (Claude Sonnet 4.5):    $3.00/M input, $15.00/M output  (~$0.01-0.03/msg, quality matters)
 * - Analysis (DeepSeek V3.2):    $0.25/M input, $0.38/M output
 * - Extraction (Mistral Small):  $0.10/M input, $0.30/M output
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

// Finetuned model ID from OpenAI (set via env after fine-tune job completes)
// Format: ft:gpt-4o-mini-2024-07-18:org::id
export const FINETUNED_MODEL = process.env.FINETUNED_TWIN_MODEL || null;

export const OPENROUTER_MODELS = {
  [TIER_CHAT]: 'anthropic/claude-sonnet-4.6', // $3.00/$15.00 per M — 1M context, better personality lock than 4.5
  [TIER_CHAT_FINETUNED]: FINETUNED_MODEL,     // OpenAI finetuned model — routed directly, not via OpenRouter
  [TIER_ANALYSIS]: 'deepseek/deepseek-v3.2',          // $0.25/$0.38 per M — 90% cheaper than Haiku
  [TIER_EXTRACTION]: 'mistralai/mistral-small-creative', // $0.10/$0.30 per M — replaces deprecated gemini-2.0-flash
  // NOTE: Kimi K2.5 is a reasoning model (wastes tokens on chain-of-thought).
  // Only suitable for complex problem-solving, not general chat/analysis.
};

export const MODEL_PRICING = {
  'moonshotai/kimi-k2.5': { input: 0.45, output: 2.25, cachedInput: 0.045 },
  'deepseek/deepseek-v3.2': { input: 0.25, output: 0.38, cachedInput: 0.025 },
  'mistralai/mistral-small-creative': { input: 0.10, output: 0.30, cachedInput: 0.01 },
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
};
