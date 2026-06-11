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
import { get as cacheGet, set as cacheSet } from '../redisClient.js';
import { supabaseAdmin } from '../database.js';
import { createLogger } from '../logger.js';
import crypto from 'crypto';

const log = createLogger('PersonalityOracle');

const TOGETHER_API = 'https://api.together.xyz/v1';
const ORACLE_FETCH_TIMEOUT_MS = 8000; // 8s total (DB prep ~400ms + together.ai cold start ~3s)
const ORACLE_MAX_TOKENS = 100;
const CACHE_TTL = 60; // 60s cache on oracle drafts

/**
 * Build a condensed personality system prompt for the oracle model.
 * Pulls: twin summary, top reflections, OCEAN scores, interview archetype.
 * Target: ~800 tokens (focused signal, not full context dump).
 *
 * Moved here from trainingDataExporter.js when the DPO/fine-tuning TRAINING
 * stack was deleted (replan-2026-06-10 cycle 4) — this builder is part of the
 * SERVING path and has no training dependencies.
 */
export async function buildPersonalitySystemPrompt(userId) {
  const [summaryResult, reflectionsResult, profileResult, calibrationResult, axesResult, multimodalResult] = await Promise.all([
    supabaseAdmin
      .from('twin_summaries')
      .select('summary')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from('user_memories')
      .select('content')
      .eq('user_id', userId)
      .eq('memory_type', 'reflection')
      .gte('importance_score', 7)
      .order('importance_score', { ascending: false })
      .limit(10),
    supabaseAdmin
      .from('user_personality_profiles')
      .select('ocean_scores, stylometric_fingerprint')
      .eq('user_id', userId)
      .maybeSingle(),
    supabaseAdmin
      .from('onboarding_calibration')
      .select('archetype, calibration_data')
      .eq('user_id', userId)
      .maybeSingle(),
    supabaseAdmin
      .from('personality_axes')
      .select('label, description')
      .eq('user_id', userId)
      .order('variance_explained', { ascending: false })
      .limit(10),
    supabaseAdmin
      .from('multimodal_profiles')
      .select('modalities_present, spotify_features, whoop_features, calendar_features')
      .eq('user_id', userId)
      .maybeSingle(),
  ]);

  const parts = [
    'You are a digital twin — an AI that embodies this specific person\'s personality, knowledge, and communication style.',
    'You speak as if you ARE the person, in first person. Match their tone exactly.',
  ];

  // Archetype from onboarding
  if (calibrationResult.data?.archetype) {
    parts.push(`\nArchetype: ${calibrationResult.data.archetype}`);
  }

  // Twin summary (most concentrated personality signal)
  if (summaryResult.data?.summary) {
    const summary = summaryResult.data.summary.slice(0, 1500);
    parts.push(`\n[WHO YOU ARE]\n${summary}`);
  }

  // OCEAN personality
  if (profileResult.data?.ocean_scores) {
    const o = profileResult.data.ocean_scores;
    const traits = [];
    if (o.openness > 0.65) traits.push('highly creative and open');
    if (o.openness < 0.35) traits.push('practical and concrete');
    if (o.conscientiousness > 0.65) traits.push('organized and precise');
    if (o.conscientiousness < 0.35) traits.push('spontaneous and flexible');
    if (o.extraversion > 0.65) traits.push('energetic and social');
    if (o.extraversion < 0.35) traits.push('introspective and measured');
    if (o.agreeableness > 0.65) traits.push('warm and supportive');
    if (o.agreeableness < 0.35) traits.push('direct and blunt');
    if (o.neuroticism > 0.65) traits.push('emotionally intense');
    if (o.neuroticism < 0.35) traits.push('calm and steady');
    if (traits.length > 0) {
      parts.push(`\n[PERSONALITY] ${traits.join(', ')}`);
    }
  }

  // Stylometric fingerprint
  if (profileResult.data?.stylometric_fingerprint) {
    const s = profileResult.data.stylometric_fingerprint;
    const style = [];
    if (s.avg_sentence_length < 12) style.push('short punchy sentences');
    else if (s.avg_sentence_length > 20) style.push('longer flowing sentences');
    if (s.formality < 0.3) style.push('casual tone');
    else if (s.formality > 0.6) style.push('formal tone');
    if (s.humor_markers > 0.02) style.push('uses humor');
    if (s.emotional_expressiveness > 0.05) style.push('emotionally expressive');
    if (style.length > 0) {
      parts.push(`[WRITING STYLE] ${style.join(', ')}`);
    }
  }

  // Top reflections (distilled personality insights)
  if (reflectionsResult.data?.length > 0) {
    const reflections = reflectionsResult.data.map(r => `- ${r.content.slice(0, 200)}`).join('\n');
    parts.push(`\n[KEY INSIGHTS ABOUT THIS PERSON]\n${reflections}`);
  }

  // ICA personality axes — data-driven personality dimensions
  if (axesResult.data?.length > 0) {
    const axes = axesResult.data
      .filter(a => a.label && !a.label.startsWith('Axis '))
      .slice(0, 8)
      .map(a => `- ${a.label}${a.description ? ': ' + a.description.slice(0, 100) : ''}`)
      .join('\n');
    if (axes) parts.push(`\n[PERSONALITY DIMENSIONS]\n${axes}`);
  }

  // Multimodal behavioral signals
  if (multimodalResult.data?.modalities_present?.length > 0) {
    const mm = multimodalResult.data;
    const signals = [];
    if (mm.whoop_features?.some(v => v !== 0.5)) {
      const w = mm.whoop_features;
      signals.push(`Health: recovery=${(w[1] * 100).toFixed(0)}%, workout freq=${(w[3] * 100).toFixed(0)}%, HRV stability=${(w[4] * 100).toFixed(0)}%`);
    }
    if (mm.calendar_features?.some(v => v !== 0.5)) {
      const c = mm.calendar_features;
      signals.push(`Schedule: social density=${(c[0] * 100).toFixed(0)}%, flexibility=${(c[1] * 100).toFixed(0)}%, work-life=${(c[3] * 100).toFixed(0)}%`);
    }
    if (signals.length > 0) parts.push(`\n[BEHAVIORAL SIGNALS] ${signals.join('. ')}`);
  }

  return parts.join('\n');
}

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
