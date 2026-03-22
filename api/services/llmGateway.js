/**
 * LLM Gateway Service
 * ====================
 * Single entry point for ALL LLM calls across the platform.
 *
 * Routes through OpenRouter (OpenAI-compatible API) with:
 * - Tiered model selection (chat/analysis/extraction)
 * - Response caching (Redis with in-memory fallback)
 * - Cost tracking to Supabase llm_usage_log
 * - Streaming support for twin-chat
 * - Automatic fallback to direct Anthropic on OpenRouter failure
 *
 * Usage:
 *   import { complete, stream, TIER_ANALYSIS } from '../services/llmGateway.js';
 *   const result = await complete({ tier: TIER_ANALYSIS, system: '...', messages: [...] });
 */

import crypto from 'crypto';
import OpenAI from 'openai';
import { getRedisClient, isRedisAvailable } from './redisClient.js';
import { supabaseAdmin } from './database.js';
import { createLogger } from './logger.js';

const log = createLogger('LLMGateway');
import {
  TIER_CHAT, TIER_CHAT_FINETUNED, TIER_ANALYSIS, TIER_EXTRACTION,
  OPENROUTER_MODELS, MODEL_PRICING, CACHE_TTL_BY_TIER,
} from '../config/aiModels.js';

// Re-export tier constants for convenience
export { TIER_CHAT, TIER_CHAT_FINETUNED, TIER_ANALYSIS, TIER_EXTRACTION };

// ====================================================================
// Circuit Breaker (4B)
// ====================================================================
const circuitBreaker = {
  state: 'closed',     // closed | open | half-open
  failures: 0,
  lastFailure: null,
  consecutiveOpens: 0, // tracks repeated open cycles for backoff
  threshold: 3,        // failures before opening
  baseResetTimeout: 30000, // ms before trying half-open (base)
  maxResetTimeout: 300000, // max 5 minutes between retries
};

/** Current reset timeout with exponential backoff */
function getResetTimeout() {
  const backoff = Math.min(
    circuitBreaker.baseResetTimeout * Math.pow(2, circuitBreaker.consecutiveOpens),
    circuitBreaker.maxResetTimeout
  );
  return backoff;
}

function checkCircuitBreaker() {
  if (circuitBreaker.state === 'open') {
    const elapsed = Date.now() - circuitBreaker.lastFailure;
    if (elapsed >= getResetTimeout()) {
      circuitBreaker.state = 'half-open';
      circuitBreaker.failures = 0; // Reset counter so half-open retry gets a fair chance
      log.info('Circuit breaker: open -> half-open', { nextTimeout: getResetTimeout() });
    }
  }
}

function recordCircuitBreakerFailure() {
  const wasHalfOpen = circuitBreaker.state === 'half-open';
  circuitBreaker.failures++;
  circuitBreaker.lastFailure = Date.now();
  if (circuitBreaker.failures >= circuitBreaker.threshold) {
    circuitBreaker.state = 'open';
    if (wasHalfOpen) {
      circuitBreaker.consecutiveOpens++;
    }
    log.warn('Circuit breaker OPEN', {
      failures: circuitBreaker.failures,
      consecutiveOpens: circuitBreaker.consecutiveOpens,
      nextRetryIn: `${getResetTimeout() / 1000}s`,
    });
  }
}

function recordCircuitBreakerSuccess() {
  if (circuitBreaker.state !== 'closed') {
    log.info('Circuit breaker: reset to closed');
  }
  circuitBreaker.state = 'closed';
  circuitBreaker.failures = 0;
  circuitBreaker.consecutiveOpens = 0;
}

/** Manual circuit breaker reset (admin use) */
export function resetCircuitBreaker() {
  const prevState = circuitBreaker.state;
  circuitBreaker.state = 'closed';
  circuitBreaker.failures = 0;
  circuitBreaker.consecutiveOpens = 0;
  circuitBreaker.lastFailure = null;
  log.info('Circuit breaker: manually reset', { prevState });
  return { prevState, newState: 'closed' };
}

/** Circuit breaker status (for health checks) */
export function getCircuitBreakerStatus() {
  return {
    state: circuitBreaker.state,
    failures: circuitBreaker.failures,
    consecutiveOpens: circuitBreaker.consecutiveOpens,
    lastFailure: circuitBreaker.lastFailure,
    nextRetryIn: circuitBreaker.state === 'open'
      ? Math.max(0, getResetTimeout() - (Date.now() - circuitBreaker.lastFailure))
      : null,
  };
}

// ====================================================================
// Request Timeouts by Tier (4C)
// ====================================================================
const TIER_TIMEOUTS = {
  [TIER_CHAT]: 30000,
  [TIER_ANALYSIS]: 90000,
  [TIER_EXTRACTION]: 15000,
};

// ====================================================================
// LLM Budget Guard (4D)
// ====================================================================
let dailyCostCache = { value: 0, fetchedAt: 0 };

async function getDailyCost() {
  // Return cached value if fresh (< 60 seconds old)
  if (Date.now() - dailyCostCache.fetchedAt < 60000) {
    return dailyCostCache.value;
  }

  if (!supabaseAdmin) return 0;

  try {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const { data, error } = await supabaseAdmin
      .rpc('sum_llm_costs_since', { since_ts: todayStart.toISOString() });

    if (error) {
      // Fallback to client-side sum if RPC doesn't exist yet
      if (error.code === '42883') {
        const { data: rows, error: fallbackErr } = await supabaseAdmin
          .from('llm_usage_log')
          .select('cost_usd')
          .gte('created_at', todayStart.toISOString());
        if (fallbackErr) {
          log.warn('Budget check fallback error', { error: fallbackErr });
          return dailyCostCache.value;
        }
        const fallbackCost = (rows || []).reduce((sum, row) => sum + (row.cost_usd || 0), 0);
        dailyCostCache = { value: fallbackCost, fetchedAt: Date.now() };
        return fallbackCost;
      }
      log.warn('Budget check query error', { error });
      return dailyCostCache.value; // Return stale cache on error
    }

    const totalCost = data ?? 0;
    dailyCostCache = { value: totalCost, fetchedAt: Date.now() };
    return totalCost;
  } catch (err) {
    log.warn('Budget check failed', { error: err });
    return dailyCostCache.value;
  }
}

// ====================================================================
// OpenRouter Client
// ====================================================================
const openrouter = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY || 'sk-placeholder-will-fail-at-call-time',
  defaultHeaders: {
    'HTTP-Referer': process.env.APP_URL || 'http://localhost:8086',
    'X-Title': 'TwinMe',
  },
});

// Direct OpenAI client for finetuned models (ft: prefix)
const openaiDirect = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

/**
 * Select the correct client based on model ID.
 * ft: models go to OpenAI directly; everything else to OpenRouter.
 */
function getClientForModel(model) {
  if (model && model.startsWith('ft:') && openaiDirect) {
    return openaiDirect;
  }
  return openrouter;
}

// ====================================================================
// In-Memory Cache Fallback (when Redis is unavailable)
// ====================================================================
const MAX_MEMORY_CACHE_ENTRIES = 200;
const memoryCache = new Map();

function memoryCacheGet(key) {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return entry.value;
}

function memoryCacheSet(key, value, ttlSeconds) {
  // Evict oldest entries if at capacity
  if (memoryCache.size >= MAX_MEMORY_CACHE_ENTRIES) {
    const oldestKey = memoryCache.keys().next().value;
    memoryCache.delete(oldestKey);
  }
  memoryCache.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

// ====================================================================
// Cache Helpers
// ====================================================================
function buildCacheKey(model, system, messages, maxTokens) {
  const payload = JSON.stringify({ model, system, messages, maxTokens });
  return 'llm:' + crypto.createHash('sha256').update(payload).digest('hex');
}

async function cacheGet(key) {
  // Try Redis first
  if (isRedisAvailable()) {
    try {
      const client = getRedisClient();
      const raw = await client.get(key);
      if (raw) return JSON.parse(raw);
    } catch (err) {
      log.warn('Redis get error', { error: err });
    }
  }
  // Fallback to in-memory
  return memoryCacheGet(key);
}

async function cacheSet(key, value, ttlSeconds) {
  if (ttlSeconds <= 0) return;

  // Try Redis first
  if (isRedisAvailable()) {
    try {
      const client = getRedisClient();
      await client.setex(key, ttlSeconds, JSON.stringify(value));
    } catch (err) {
      log.warn('Redis set error', { error: err });
    }
  }
  // Always write to in-memory as backup
  memoryCacheSet(key, value, ttlSeconds);
}

// ====================================================================
// Cost Calculation
// ====================================================================
function calculateCost(model, usage) {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING.default;
  const inputCost = ((usage.prompt_tokens || 0) / 1_000_000) * pricing.input;
  const outputCost = ((usage.completion_tokens || 0) / 1_000_000) * pricing.output;
  const cachedCost = ((usage.cached_tokens || 0) / 1_000_000) * pricing.cachedInput;
  return inputCost + outputCost + cachedCost;
}

// ====================================================================
// Supabase Logging (non-blocking)
// ====================================================================
function logUsage({ userId, serviceName, model, tier, usage, cost, cacheHit, latencyMs }) {
  if (!supabaseAdmin) return;

  supabaseAdmin
    .from('llm_usage_log')
    .insert({
      user_id: userId || null,
      service_name: serviceName || 'unknown',
      model,
      tier,
      input_tokens: usage.prompt_tokens || 0,
      output_tokens: usage.completion_tokens || 0,
      cached_tokens: usage.cached_tokens || 0,
      cost_usd: cost,
      cache_hit: cacheHit,
      latency_ms: latencyMs,
    })
    .then(({ error }) => {
      if (error) log.warn('Usage log error', { error });
    })
    .catch(err => log.warn('Usage log promise rejected', { error: err }));
}

// ====================================================================
// Format Messages: Anthropic style -> OpenAI style
// ====================================================================
function formatMessages(system, messages) {
  const formatted = [];
  if (system) {
    formatted.push({ role: 'system', content: system });
  }
  for (const msg of messages) {
    formatted.push({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content,
    });
  }
  return formatted;
}

// ====================================================================
// complete() - Non-streaming LLM call
// ====================================================================
/**
 * @param {Object} opts
 * @param {string} opts.tier - TIER_CHAT | TIER_ANALYSIS | TIER_EXTRACTION
 * @param {string} [opts.system] - System prompt
 * @param {Array} opts.messages - [{role, content}]
 * @param {number} [opts.maxTokens=1024]
 * @param {number} [opts.temperature=0.7]
 * @param {string} [opts.userId]
 * @param {string} [opts.serviceName]
 * @param {string} [opts.modelOverride] - Override the tier-based model selection (e.g., for smart routing)
 * @returns {{ content: string, model: string, usage: Object, cost: number, cacheHit: boolean }}
 */
export async function complete({
  tier = TIER_ANALYSIS,
  system,
  messages,
  maxTokens = 1024,
  temperature = 0.7,
  top_p,
  frequency_penalty,
  presence_penalty,
  userId,
  serviceName,
  modelOverride,
  sensitiveContent = false,
}) {
  // Privacy routing: downgrade to cheapest tier for sensitive content (NemoClaw pattern)
  // This minimizes data exposure for health/emotional/financial content
  const effectiveTier = (sensitiveContent && tier !== TIER_EXTRACTION) ? TIER_EXTRACTION : tier;
  const model = modelOverride || OPENROUTER_MODELS[effectiveTier] || OPENROUTER_MODELS[TIER_ANALYSIS];
  const ttl = CACHE_TTL_BY_TIER[effectiveTier] || 0;

  // Circuit breaker check (4B)
  checkCircuitBreaker();
  if (circuitBreaker.state === 'open') {
    throw new Error(`[LLM Gateway] Circuit breaker is OPEN - LLM calls temporarily disabled. Resets in ${Math.ceil(getResetTimeout() / 1000)}s`);
  }

  // Budget guard (4D) - ALL tiers are budget-checked
  {
    const dailyCost = await getDailyCost();
    const budget = parseFloat(process.env.LLM_DAILY_BUDGET_USD) || 10;
    if (dailyCost >= budget) {
      throw new Error(`[LLM Gateway] Daily LLM budget exceeded: $${dailyCost.toFixed(2)} >= $${budget.toFixed(2)} limit. Resets at midnight UTC.`);
    }
  }

  // Check cache (skip for chat)
  if (ttl > 0) {
    const cacheKey = buildCacheKey(model, system, messages, maxTokens);
    const cached = await cacheGet(cacheKey);
    if (cached) {
      log.info('Cache HIT', { serviceName: serviceName || 'unknown', tier });
      logUsage({
        userId, serviceName, model, tier,
        usage: cached.usage || { prompt_tokens: 0, completion_tokens: 0 },
        cost: 0, cacheHit: true, latencyMs: 0,
      });
      return { ...cached, cacheHit: true };
    }
  }

  const startTime = Date.now();

  // Request timeout (4C)
  const timeoutMs = TIER_TIMEOUTS[tier] || 30000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const client = getClientForModel(model);
    const response = await client.chat.completions.create({
      model,
      max_tokens: maxTokens,
      temperature,
      ...(top_p != null && { top_p }),
      ...(frequency_penalty != null && { frequency_penalty }),
      ...(presence_penalty != null && { presence_penalty }),
      messages: formatMessages(system, messages),
    }, { signal: controller.signal });

    clearTimeout(timeoutId);

    const latencyMs = Date.now() - startTime;
    const content = response.choices?.[0]?.message?.content || '';
    const usage = {
      prompt_tokens: response.usage?.prompt_tokens || 0,
      completion_tokens: response.usage?.completion_tokens || 0,
      cached_tokens: response.usage?.prompt_tokens_details?.cached_tokens || 0,
      total_tokens: response.usage?.total_tokens || 0,
    };
    const cost = calculateCost(model, usage);

    log.info('LLM complete', {
      serviceName: serviceName || 'unknown', tier, model,
      tokens: usage.total_tokens, cost: cost.toFixed(4), latencyMs,
    });

    const result = { content, model, usage, cost, cacheHit: false };

    // Cache result
    if (ttl > 0) {
      const cacheKey = buildCacheKey(model, system, messages, maxTokens);
      await cacheSet(cacheKey, result, ttl);
    }

    // Log to Supabase
    logUsage({ userId, serviceName, model, tier, usage, cost, cacheHit: false, latencyMs });

    // Circuit breaker success (4B)
    recordCircuitBreakerSuccess();

    return result;

  } catch (error) {
    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;

    // Check if this was a timeout abort
    if (error.name === 'AbortError' || controller.signal.aborted) {
      recordCircuitBreakerFailure();
      throw new Error(`[LLM Gateway] Request timed out after ${timeoutMs}ms for ${tier}/${model} (${serviceName || 'unknown'})`);
    }

    log.error('LLM error', { tier, model, error, latencyMs });

    // Only trip circuit breaker on transient infrastructure errors (5xx, timeouts, network)
    // Don't trip on billing (402), auth (401), bad request (400), rate limit (429) — those won't self-heal
    const httpStatus = error?.status || error?.code;
    const isTransient = !httpStatus || httpStatus >= 500;
    if (isTransient) {
      recordCircuitBreakerFailure();
    } else {
      log.warn('LLM non-transient error (circuit breaker NOT tripped)', { status: httpStatus, tier, model });
    }

    // Rethrow - let callers handle errors as they did before
    throw error;
  }
}

// ====================================================================
// stream() - Streaming LLM call
// ====================================================================
/**
 * @param {Object} opts
 * @param {string} opts.tier
 * @param {string} [opts.system]
 * @param {Array} opts.messages
 * @param {number} [opts.maxTokens=1024]
 * @param {number} [opts.temperature=0.7]
 * @param {string} [opts.userId]
 * @param {string} [opts.serviceName]
 * @param {Function} [opts.onChunk] - Called with each text chunk
 * @param {string} [opts.modelOverride] - Override the tier-based model selection (e.g., for smart routing)
 * @returns {{ content: string, model: string, usage: Object, cost: number, cacheHit: boolean }}
 */
export async function stream({
  tier = TIER_CHAT,
  system,
  messages,
  maxTokens = 1024,
  temperature = 0.7,
  top_p,
  frequency_penalty,
  presence_penalty,
  userId,
  serviceName,
  onChunk,
  modelOverride,
}) {
  const model = modelOverride || OPENROUTER_MODELS[tier] || OPENROUTER_MODELS[TIER_CHAT];
  const startTime = Date.now();

  // Circuit breaker check (4B)
  checkCircuitBreaker();
  if (circuitBreaker.state === 'open') {
    throw new Error(`[LLM Gateway] Circuit breaker is OPEN - LLM calls temporarily disabled. Resets in ${Math.ceil(getResetTimeout() / 1000)}s`);
  }

  // Budget guard (4D) - consistent with complete()
  {
    const dailyCost = await getDailyCost();
    const budget = parseFloat(process.env.LLM_DAILY_BUDGET_USD) || 10;
    if (dailyCost >= budget) {
      throw new Error(`[LLM Gateway] Daily LLM budget exceeded: $${dailyCost.toFixed(2)} >= $${budget.toFixed(2)} limit. Resets at midnight UTC.`);
    }
  }

  try {
    const client = getClientForModel(model);
    // AbortController for stream timeout (90s default — generous for long completions)
    const streamTimeoutMs = parseInt(process.env.LLM_STREAM_TIMEOUT_MS, 10) || 90_000;
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), streamTimeoutMs);

    const streamResponse = await client.chat.completions.create({
      model,
      max_tokens: maxTokens,
      temperature,
      ...(top_p != null && { top_p }),
      ...(frequency_penalty != null && { frequency_penalty }),
      ...(presence_penalty != null && { presence_penalty }),
      messages: formatMessages(system, messages),
      stream: true,
      stream_options: { include_usage: true },
    }, { signal: abortController.signal });

    let fullContent = '';
    let usage = { prompt_tokens: 0, completion_tokens: 0, cached_tokens: 0, total_tokens: 0 };

    for await (const chunk of streamResponse) {
      // Handle usage data (comes in the last chunk)
      if (chunk.usage) {
        usage = {
          prompt_tokens: chunk.usage.prompt_tokens || 0,
          completion_tokens: chunk.usage.completion_tokens || 0,
          cached_tokens: chunk.usage.prompt_tokens_details?.cached_tokens || 0,
          total_tokens: chunk.usage.total_tokens || 0,
        };
      }

      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) {
        fullContent += delta;
        if (onChunk) {
          onChunk(delta);
        }
      }
    }

    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;
    const cost = calculateCost(model, usage);

    log.info('LLM stream complete', {
      serviceName: serviceName || 'unknown', tier, model,
      tokens: usage.total_tokens, cost: cost.toFixed(4), latencyMs,
    });

    // Log to Supabase
    logUsage({ userId, serviceName, model, tier, usage, cost, cacheHit: false, latencyMs });

    // Circuit breaker success (4B)
    recordCircuitBreakerSuccess();

    return { content: fullContent, model, usage, cost, cacheHit: false };

  } catch (error) {
    const latencyMs = Date.now() - startTime;
    log.error('LLM stream error', { tier, model, error, latencyMs });

    // Only trip circuit breaker on transient infrastructure errors
    const httpStatus = error?.status || error?.code;
    const isTransient = !httpStatus || httpStatus >= 500;
    if (isTransient) {
      recordCircuitBreakerFailure();
    } else {
      log.warn('LLM stream non-transient error (circuit breaker NOT tripped)', { status: httpStatus, tier, model });
    }

    throw error;
  }
}

export default { complete, stream, TIER_CHAT, TIER_ANALYSIS, TIER_EXTRACTION };
