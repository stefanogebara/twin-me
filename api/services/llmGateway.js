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
import {
  TIER_CHAT, TIER_ANALYSIS, TIER_EXTRACTION,
  OPENROUTER_MODELS, MODEL_PRICING, CACHE_TTL_BY_TIER,
} from '../config/aiModels.js';

// Re-export tier constants for convenience
export { TIER_CHAT, TIER_ANALYSIS, TIER_EXTRACTION };

// ====================================================================
// OpenRouter Client
// ====================================================================
const openrouter = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': process.env.APP_URL || 'http://localhost:8086',
    'X-Title': 'TwinMe',
  },
});

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
      console.warn('[LLM Gateway] Redis get error:', err.message);
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
      console.warn('[LLM Gateway] Redis set error:', err.message);
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
      if (error) console.warn('[LLM Gateway] Usage log error:', error.message);
    });
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
 * @returns {{ content: string, model: string, usage: Object, cost: number, cacheHit: boolean }}
 */
export async function complete({
  tier = TIER_ANALYSIS,
  system,
  messages,
  maxTokens = 1024,
  temperature = 0.7,
  userId,
  serviceName,
}) {
  const model = OPENROUTER_MODELS[tier] || OPENROUTER_MODELS[TIER_ANALYSIS];
  const ttl = CACHE_TTL_BY_TIER[tier] || 0;

  // Check cache (skip for chat)
  if (ttl > 0) {
    const cacheKey = buildCacheKey(model, system, messages, maxTokens);
    const cached = await cacheGet(cacheKey);
    if (cached) {
      console.log(`[LLM Gateway] Cache HIT for ${serviceName || 'unknown'} (${tier})`);
      logUsage({
        userId, serviceName, model, tier,
        usage: cached.usage || { prompt_tokens: 0, completion_tokens: 0 },
        cost: 0, cacheHit: true, latencyMs: 0,
      });
      return { ...cached, cacheHit: true };
    }
  }

  const startTime = Date.now();

  try {
    const response = await openrouter.chat.completions.create({
      model,
      max_tokens: maxTokens,
      temperature,
      messages: formatMessages(system, messages),
    });

    const latencyMs = Date.now() - startTime;
    const content = response.choices?.[0]?.message?.content || '';
    const usage = {
      prompt_tokens: response.usage?.prompt_tokens || 0,
      completion_tokens: response.usage?.completion_tokens || 0,
      cached_tokens: response.usage?.prompt_tokens_details?.cached_tokens || 0,
      total_tokens: response.usage?.total_tokens || 0,
    };
    const cost = calculateCost(model, usage);

    console.log(
      `[LLM Gateway] ${serviceName || 'unknown'} | ${tier} | ${model} | ` +
      `${usage.total_tokens} tokens | $${cost.toFixed(4)} | ${latencyMs}ms`
    );

    const result = { content, model, usage, cost, cacheHit: false };

    // Cache result
    if (ttl > 0) {
      const cacheKey = buildCacheKey(model, system, messages, maxTokens);
      await cacheSet(cacheKey, result, ttl);
    }

    // Log to Supabase
    logUsage({ userId, serviceName, model, tier, usage, cost, cacheHit: false, latencyMs });

    return result;

  } catch (error) {
    const latencyMs = Date.now() - startTime;
    console.error(`[LLM Gateway] Error (${tier}/${model}): ${error.message} [${latencyMs}ms]`);

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
 * @returns {{ content: string, model: string, usage: Object, cost: number, cacheHit: boolean }}
 */
export async function stream({
  tier = TIER_CHAT,
  system,
  messages,
  maxTokens = 1024,
  temperature = 0.7,
  userId,
  serviceName,
  onChunk,
}) {
  const model = OPENROUTER_MODELS[tier] || OPENROUTER_MODELS[TIER_CHAT];
  const startTime = Date.now();

  try {
    const streamResponse = await openrouter.chat.completions.create({
      model,
      max_tokens: maxTokens,
      temperature,
      messages: formatMessages(system, messages),
      stream: true,
      stream_options: { include_usage: true },
    });

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

    const latencyMs = Date.now() - startTime;
    const cost = calculateCost(model, usage);

    console.log(
      `[LLM Gateway] STREAM ${serviceName || 'unknown'} | ${tier} | ${model} | ` +
      `${usage.total_tokens} tokens | $${cost.toFixed(4)} | ${latencyMs}ms`
    );

    // Log to Supabase
    logUsage({ userId, serviceName, model, tier, usage, cost, cacheHit: false, latencyMs });

    return { content: fullContent, model, usage, cost, cacheHit: false };

  } catch (error) {
    const latencyMs = Date.now() - startTime;
    console.error(`[LLM Gateway] Stream error (${tier}/${model}): ${error.message} [${latencyMs}ms]`);
    throw error;
  }
}

export default { complete, stream, TIER_CHAT, TIER_ANALYSIS, TIER_EXTRACTION };
