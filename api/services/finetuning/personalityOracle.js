/**
 * Personality Oracle
 * ==================
 * Queries a per-user finetuned model (together.ai) to generate a personality-aligned
 * draft response. This draft is injected into Claude's system prompt as directional
 * guidance — Claude still generates the final response.
 *
 * Architecture: finetuned Qwen-7B → 100-token draft → Claude Sonnet → final response
 *
 * Based on: Park et al. "Finetuning LLMs for Human Behavior Prediction" (2509.05830)
 */

import { getModelId } from './finetuneManager.js';
import { buildPersonalitySystemPrompt } from './trainingDataExporter.js';
import { get as cacheGet, set as cacheSet } from '../redisClient.js';
import { createLogger } from '../logger.js';
import crypto from 'crypto';

const log = createLogger('PersonalityOracle');

const TOGETHER_API = 'https://api.together.xyz/v1';
const ORACLE_FETCH_TIMEOUT_MS = 8000; // 8s total (DB prep ~400ms + together.ai cold start ~3s)
const ORACLE_MAX_TOKENS = 100;
const CACHE_TTL = 60; // 60s cache on oracle drafts

/**
 * Generate a personality-aligned draft response using the finetuned model.
 * Returns null if no model is available or on any error (graceful fallback).
 *
 * @param {string} userId
 * @param {string} userMessage - The user's current message
 * @param {string[]} topMemories - Top 5 relevant memories for context
 * @returns {string|null} Draft response or null
 */
export async function getOracleDraft(userId, userMessage, topMemories = []) {
  try {
    const modelInfo = await getModelId(userId);
    if (!modelInfo) return null;

    const apiKey = process.env.TOGETHER_API_KEY;
    if (!apiKey) return null;

    // Check cache
    const cacheKey = `oracle:${userId}:${hashMessage(userMessage)}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached;

    // Build condensed context for the oracle
    const systemPrompt = await buildPersonalitySystemPrompt(userId);
    const memoryContext = topMemories.length > 0
      ? `\n\n[RELEVANT MEMORIES]\n${topMemories.slice(0, 5).join('\n')}`
      : '';

    const oracleInstruction = '\n\nIMPORTANT: You are a behavioral compass, NOT the twin itself. Describe how this person would respond in SECOND PERSON (e.g. "you\'d say...", "you tend to...", "your vibe here is..."). Be brief (1-2 sentences). Do NOT write the actual response — just describe the tone, angle, and personality that should come through.';

    const messages = [
      { role: 'system', content: systemPrompt + memoryContext + oracleInstruction },
      { role: 'user', content: userMessage },
    ];

    // Try primary model (DPO if available, else SFT), fallback to SFT on failure
    const modelsToTry = [modelInfo.modelId];
    if (modelInfo.sftModelId && modelInfo.sftModelId !== modelInfo.modelId) {
      modelsToTry.push(modelInfo.sftModelId);
    }

    for (const modelId of modelsToTry) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), ORACLE_FETCH_TIMEOUT_MS);

        const res = await fetch(`${TOGETHER_API}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: modelId,
            messages,
            max_tokens: ORACLE_MAX_TOKENS,
            temperature: 0.7,
            stop: ['\n\n'],
          }),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!res.ok) {
          log.warn(`Oracle model ${modelId.slice(-12)} failed: ${res.status}, trying fallback...`);
          continue;
        }

        const data = await res.json();
        const draft = data.choices?.[0]?.message?.content?.trim();

        if (!draft || draft.length < 10) continue;

        const isDPO = modelId === modelInfo.modelId && modelInfo.trainingMethod === 'dpo';
        log.info(`Oracle draft from ${isDPO ? 'DPO' : 'SFT'} model (${modelId.slice(-12)})`);

        // Cache the draft
        cacheSet(cacheKey, draft, CACHE_TTL).catch(() => {});

        return draft;
      } catch (innerErr) {
        if (innerErr.name === 'AbortError') {
          log.warn(`Oracle ${modelId.slice(-12)} timed out, trying fallback...`);
        } else {
          log.warn(`Oracle ${modelId.slice(-12)} error: ${innerErr.message}, trying fallback...`);
        }
        continue;
      }
    }

    return null;
  } catch (err) {
    log.error('Oracle error:', err.message);
    return null;
  }
}

/**
 * Format oracle draft for injection into Claude's system prompt.
 * Returns empty string if no draft available.
 */
export function formatOracleBlock(draft) {
  if (!draft) return '';
  return [
    '\n[PERSONALITY ORACLE — BEHAVIORAL COMPASS]',
    'Your twin\'s behavioral patterns suggest:',
    draft,
    'Channel this energy and tone into your response. Speak AS the person, in first person.',
  ].join('\n');
}

function hashMessage(msg) {
  return crypto.createHash('md5').update(msg).digest('hex').slice(0, 12);
}

export default { getOracleDraft, formatOracleBlock };
