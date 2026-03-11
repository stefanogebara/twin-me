/**
 * Embedding Service
 * =================
 * Generates text embeddings via OpenRouter (OpenAI-compatible API).
 * Uses text-embedding-3-small ($0.02/M tokens) through OpenRouter.
 *
 * Falls back to OpenAI directly if OPENAI_API_KEY is set.
 *
 * Used by memoryStreamService for vector search in the memory stream.
 *
 * Usage:
 *   import { generateEmbedding, generateEmbeddings } from './embeddingService.js';
 *   const vector = await generateEmbedding("User loves jazz music");
 *   const vectors = await generateEmbeddings(["fact 1", "fact 2", "fact 3"]);
 */

import OpenAI from 'openai';
import { createLogger } from './logger.js';

const log = createLogger('Embedding');

const EMBEDDING_MODEL = 'openai/text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;
const MAX_BATCH_SIZE = 50;
const MAX_INPUT_CHARS = 8000; // ~2K tokens safety limit per text

// Lazy-initialized client - prefers OpenRouter, falls back to OpenAI direct
let _client = null;
let _clientType = null;

function getClient() {
  if (_client) return _client;

  // Prefer OpenRouter (already paying for it, supports embeddings)
  if (process.env.OPENROUTER_API_KEY) {
    _client = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY,
      defaultHeaders: {
        'HTTP-Referer': process.env.APP_URL || 'http://localhost:8086',
        'X-Title': 'TwinMe',
      },
    });
    _clientType = 'openrouter';
    return _client;
  }

  // Fallback to direct OpenAI
  if (process.env.OPENAI_API_KEY) {
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    _clientType = 'openai';
    return _client;
  }

  return null;
}

function getModel() {
  // OpenRouter needs the full model path, direct OpenAI just needs the model name
  return _clientType === 'openrouter' ? 'openai/text-embedding-3-small' : 'text-embedding-3-small';
}

// Simple in-memory cache to avoid re-embedding identical text
const embeddingCache = new Map();
const MAX_CACHE_SIZE = 500;

function getCacheKey(text) {
  let hash = 0;
  const str = text.substring(0, 200);
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return `emb_${hash}_${text.length}`;
}

/**
 * Generate a single embedding vector for a text string.
 * Returns a 1536-dimensional float array, or null on failure.
 */
async function generateEmbedding(text) {
  if (!text || typeof text !== 'string') return null;

  const input = text.substring(0, MAX_INPUT_CHARS).trim();
  if (!input) return null;

  const cacheKey = getCacheKey(input);
  if (embeddingCache.has(cacheKey)) {
    return embeddingCache.get(cacheKey);
  }

  const client = getClient();
  if (!client) {
    log.warn('No API key set (OPENROUTER_API_KEY or OPENAI_API_KEY)');
    return null;
  }

  try {
    const response = await client.embeddings.create({
      model: getModel(),
      input,
      dimensions: EMBEDDING_DIMENSIONS,
    });

    const embedding = response.data?.[0]?.embedding;
    if (!embedding || embedding.length !== EMBEDDING_DIMENSIONS) {
      log.error('Unexpected response format');
      return null;
    }

    if (embeddingCache.size >= MAX_CACHE_SIZE) {
      const firstKey = embeddingCache.keys().next().value;
      embeddingCache.delete(firstKey);
    }
    embeddingCache.set(cacheKey, embedding);

    return embedding;
  } catch (error) {
    log.error('Generation failed', { error });
    return null;
  }
}

/**
 * Generate embeddings for multiple texts in a single API call (batch).
 * Returns an array of 1536-dim vectors (or null for failed items).
 * Splits into batches of MAX_BATCH_SIZE.
 */
async function generateEmbeddings(texts) {
  if (!Array.isArray(texts) || texts.length === 0) return [];
  const client = getClient();
  if (!client) {
    log.warn('No API key set');
    return texts.map(() => null);
  }

  const results = new Array(texts.length).fill(null);
  const uncachedIndices = [];
  const uncachedInputs = [];

  for (let i = 0; i < texts.length; i++) {
    const text = texts[i];
    if (!text || typeof text !== 'string') continue;
    const input = text.substring(0, MAX_INPUT_CHARS).trim();
    if (!input) continue;

    const cacheKey = getCacheKey(input);
    if (embeddingCache.has(cacheKey)) {
      results[i] = embeddingCache.get(cacheKey);
    } else {
      uncachedIndices.push(i);
      uncachedInputs.push(input);
    }
  }

  for (let batch = 0; batch < uncachedInputs.length; batch += MAX_BATCH_SIZE) {
    const batchInputs = uncachedInputs.slice(batch, batch + MAX_BATCH_SIZE);
    const batchIndices = uncachedIndices.slice(batch, batch + MAX_BATCH_SIZE);

    try {
      const response = await client.embeddings.create({
        model: getModel(),
        input: batchInputs,
        dimensions: EMBEDDING_DIMENSIONS,
      });

      for (const item of response.data) {
        const originalIndex = batchIndices[item.index];
        const embedding = item.embedding;
        if (embedding && embedding.length === EMBEDDING_DIMENSIONS) {
          results[originalIndex] = embedding;
          const cacheKey = getCacheKey(batchInputs[item.index]);
          if (embeddingCache.size >= MAX_CACHE_SIZE) {
            const firstKey = embeddingCache.keys().next().value;
            embeddingCache.delete(firstKey);
          }
          embeddingCache.set(cacheKey, embedding);
        }
      }

      log.info('Batch completed', { batch: Math.floor(batch / MAX_BATCH_SIZE) + 1, count: batchInputs.length, clientType: _clientType });
    } catch (error) {
      log.error('Batch failed', { error });
    }
  }

  return results;
}

/**
 * Format a vector as a Postgres-compatible string: [0.1,0.2,...]
 */
function vectorToString(embedding) {
  if (!embedding) return null;
  return `[${embedding.join(',')}]`;
}

export {
  generateEmbedding,
  generateEmbeddings,
  vectorToString,
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
};
