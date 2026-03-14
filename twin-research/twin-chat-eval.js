/**
 * Twin Chat Eval — LLM-as-Judge
 * ==============================
 * Scores twin chat responses on personality fidelity, knowledge accuracy,
 * authenticity, and response quality using DeepSeek as judge.
 *
 * Usage: node --env-file=.env twin-research/twin-chat-eval.js [--fast]
 *
 * --fast: Run only prompts with fast=true (15 prompts, ~$0.30, ~90s)
 * default: Run all 25 prompts (~$0.50, ~150s)
 *
 * Output:
 *   twin_chat_score: 0.000 – 1.000 (higher = better)
 *   personality_fidelity, knowledge_accuracy, authenticity, response_quality
 *   Per-category breakdown
 */

import { readFileSync } from 'fs';
import { complete, TIER_CHAT, TIER_ANALYSIS } from '../api/services/llmGateway.js';

// Use TIER_ANALYSIS (DeepSeek) for BOTH generation and judging in eval.
// ~50x cheaper than TIER_CHAT (Claude Sonnet). Research loop only cares about
// relative score changes between configs, not absolute production-grade quality.
const EVAL_GENERATION_TIER = TIER_ANALYSIS;
import { fetchTwinContext } from '../api/services/twinContextBuilder.js';
import { getProfile } from '../api/services/personalityProfileService.js';
import { buildPersonalityPrompt } from '../api/services/personalityPromptBuilder.js';
import { buildPersonaBlock } from '../api/services/personaBlockBuilder.js';
import { detectConversationMode, applyNeurotransmitterModifiers, buildNeurotransmitterPromptBlock } from '../api/services/neurotransmitterService.js';
import { classifyNeuropil } from '../api/services/neuropilRouter.js';
import { getOracleDraft, formatOracleBlock } from '../api/services/finetuning/personalityOracle.js';
import { getFeatureFlags } from '../api/services/featureFlagsService.js';
import { buildTwinSystemPrompt } from '../api/services/twinSystemPromptBuilder.js';
import { supabaseAdmin } from '../api/services/database.js';
import { SAMPLING_OVERRIDES, ORACLE_INTEGRATION_STRENGTH, EVAL_WEIGHTS } from './twin-config.js';

const USER_ID = process.env.TEST_TWIN_USER_ID || '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';
const FAST_MODE = process.argv.includes('--fast');
const CONCURRENCY = 3; // Parallel prompt evaluations

// ─── Judge Prompt ─────────────────────────────────────────────────────────────

function buildJudgePrompt(prompt, response, profile, expectedSignals, antiSignals) {
  const ocean = profile ? {
    O: profile.openness?.toFixed(2) ?? '?',
    C: profile.conscientiousness?.toFixed(2) ?? '?',
    E: profile.extraversion?.toFixed(2) ?? '?',
    A: profile.agreeableness?.toFixed(2) ?? '?',
    N: profile.neuroticism?.toFixed(2) ?? '?',
  } : { O: '?', C: '?', E: '?', A: '?', N: '?' };

  const stylometrics = profile?.stylometric_fingerprint || {};

  return {
    system: `You are an expert evaluator of AI digital twin responses. You score how well a twin embodies its user's personality and knowledge. You are strict but fair. Return ONLY valid JSON.`,
    user: `PERSONALITY PROFILE (OCEAN Big Five, 0.0-1.0):
Openness: ${ocean.O}, Conscientiousness: ${ocean.C}, Extraversion: ${ocean.E}, Agreeableness: ${ocean.A}, Neuroticism: ${ocean.N}

WRITING STYLE:
- Formality: ${stylometrics.formality_score?.toFixed(2) ?? '?'}
- Avg sentence length: ${stylometrics.avg_sentence_length?.toFixed(1) ?? '?'} words
- Emotional expressiveness: ${stylometrics.emotional_expressiveness?.toFixed(2) ?? '?'}
- Vocabulary richness: ${stylometrics.vocabulary_richness?.toFixed(2) ?? '?'}

USER MESSAGE: "${prompt}"

TWIN RESPONSE: "${response}"

EXPECTED SIGNALS (should appear in a good response): ${expectedSignals.join(', ')}
ANTI-SIGNALS (should NOT appear): ${antiSignals.join(', ')}

Score the twin's response on these 4 dimensions (0-10 each, integers only):

1. PERSONALITY_FIDELITY: Does the response reflect the user's personality traits and writing style? High openness = creative/exploratory. Match formality and expressiveness.

2. KNOWLEDGE_ACCURACY: Does it reference real facts from the user's life? Penalize hallucinated data. Reward specific, grounded references. If the response makes claims, they should be traceable to user data.

3. AUTHENTICITY: Does it sound like a real person (close friend), not a chatbot? Penalize clinical language, excessive hedging, bullet-point lists, "as an AI" disclaimers. Reward natural conversational tone.

4. RESPONSE_QUALITY: Is it engaging, insightful, well-structured? Does it make connections? Is the length appropriate? Does it invite further conversation?

Return ONLY this JSON (no markdown fences, no explanation outside the JSON):
{"personality_fidelity":X,"knowledge_accuracy":X,"authenticity":X,"response_quality":X,"reasoning":"one sentence"}`,
  };
}

// ─── Twin Response Generation ─────────────────────────────────────────────────
// Mirrors twin-chat.js pipeline: context → system prompt → LLM call

async function generateTwinResponse(prompt, userId, featureFlags, personalityProfile) {
  const useNeurotransmitterModes = featureFlags.neurotransmitter_modes !== false;
  const useConnectomeNeuropils = featureFlags.connectome_neuropils !== false;
  const usePersonalityOracle = featureFlags.personality_oracle === true;

  // Classify neuropil
  const neuropilResult = useConnectomeNeuropils
    ? classifyNeuropil(prompt)
    : { neuropilId: null, weights: null, budgets: null, confidence: 0 };

  // Build context options (mirror twin-chat.js lines 337-351)
  const contextOptions = { platforms: ['spotify', 'calendar', 'whoop', 'web'] };
  if (neuropilResult.neuropilId && neuropilResult.budgets) {
    contextOptions.memoryBudgets = neuropilResult.budgets;
  }
  if (neuropilResult.neuropilId && neuropilResult.weights) {
    const w = neuropilResult.weights;
    contextOptions.memoryWeights = w.recency >= 0.8 ? 'recent' : 'identity';
  }

  // Fetch context + oracle in parallel (mirror twin-chat.js lines 352-370)
  let oracleDraft = null;
  const [twinContext] = await Promise.all([
    fetchTwinContext(userId, prompt, contextOptions),
    ...(usePersonalityOracle ? [
      getOracleDraft(userId, prompt)
        .then(draft => { oracleDraft = draft; })
        .catch(() => {}),
    ] : []),
  ]);

  const { soulSignature, platformData, personalityScores, writingProfile, twinSummary, proactiveInsights } = twinContext;

  // Build system prompt (mirror twin-chat.js lines 387-408)
  let systemPrompt = buildTwinSystemPrompt(soulSignature, platformData, personalityScores, twinSummary, proactiveInsights, null);

  const personaBlock = buildPersonaBlock({ personalityScores, soulSignature, twinSummary, writingProfile, platformData });
  if (personaBlock) {
    systemPrompt.splice(1, 0, { type: 'text', text: `\n${personaBlock}` });
  }

  const personalityPromptBlock = buildPersonalityPrompt(personalityProfile);
  if (personalityPromptBlock) {
    systemPrompt.push({ type: 'text', text: `\n${personalityPromptBlock}` });
  }

  // Oracle injection with configurable strength
  const oracleBlock = formatOracleBlock(oracleDraft);
  if (oracleBlock && ORACLE_INTEGRATION_STRENGTH > 0) {
    if (ORACLE_INTEGRATION_STRENGTH >= 1.0) {
      systemPrompt.push({ type: 'text', text: `\n${oracleBlock}` });
    } else {
      systemPrompt.push({ type: 'text', text: `\n[PERSONALITY ORACLE — weight: ${ORACLE_INTEGRATION_STRENGTH}]\n${oracleBlock}` });
    }
  }

  // Neurotransmitter mode
  let neurotransmitterMode = { mode: 'default', confidence: 0, matchedKeywords: [] };
  if (useNeurotransmitterModes) {
    neurotransmitterMode = detectConversationMode(prompt);
    if (neurotransmitterMode.mode !== 'default') {
      const ntBlock = buildNeurotransmitterPromptBlock(neurotransmitterMode.mode);
      if (ntBlock) {
        systemPrompt.push({ type: 'text', text: `\n${ntBlock}` });
      }
    }
  }

  // Sampling params: personality-derived + neurotransmitter + config overrides
  const baseSampling = {
    temperature: (personalityProfile?.temperature ?? 0.7) + SAMPLING_OVERRIDES.temperature_delta,
    top_p: (personalityProfile?.top_p ?? 0.9) + SAMPLING_OVERRIDES.top_p_delta,
    frequency_penalty: (personalityProfile?.frequency_penalty ?? 0.0) + SAMPLING_OVERRIDES.frequency_penalty_delta,
    presence_penalty: (personalityProfile?.presence_penalty ?? 0.0) + SAMPLING_OVERRIDES.presence_penalty_delta,
  };
  const finalSampling = useNeurotransmitterModes
    ? applyNeurotransmitterModifiers(baseSampling, neurotransmitterMode.mode)
    : baseSampling;

  // Clamp
  finalSampling.temperature = Math.min(1.0, Math.max(0.1, finalSampling.temperature));
  finalSampling.top_p = Math.min(1.0, Math.max(0.5, finalSampling.top_p));
  finalSampling.frequency_penalty = Math.min(1.0, Math.max(0.0, finalSampling.frequency_penalty));
  finalSampling.presence_penalty = Math.min(1.0, Math.max(0.0, finalSampling.presence_penalty));

  // LLM call
  const result = await complete({
    system: systemPrompt,
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 2048,
    userId,
    tier: EVAL_GENERATION_TIER,
    ...finalSampling,
    serviceName: 'twin-chat-eval',
  });

  return {
    response: result?.content || '',
    samplingParams: finalSampling,
    neuropil: neuropilResult.neuropilId,
    neurotransmitter: neurotransmitterMode.mode,
  };
}

// ─── Judge Call ────────────────────────────────────────────────────────────────

async function judgeResponse(prompt, response, profile, expectedSignals, antiSignals) {
  const { system, user } = buildJudgePrompt(prompt, response, profile, expectedSignals, antiSignals);

  const result = await complete({
    system,
    messages: [{ role: 'user', content: user }],
    maxTokens: 300,
    temperature: 0,
    tier: TIER_ANALYSIS,
    serviceName: 'twin-chat-eval-judge',
  });

  const raw = (result?.content || '').trim();

  // Parse JSON — strip markdown fences if present
  const jsonStr = raw.replace(/^```json?\n?/i, '').replace(/\n?```$/i, '').trim();
  try {
    const scores = JSON.parse(jsonStr);
    return {
      personality_fidelity: Math.min(10, Math.max(0, scores.personality_fidelity ?? 0)),
      knowledge_accuracy: Math.min(10, Math.max(0, scores.knowledge_accuracy ?? 0)),
      authenticity: Math.min(10, Math.max(0, scores.authenticity ?? 0)),
      response_quality: Math.min(10, Math.max(0, scores.response_quality ?? 0)),
      reasoning: scores.reasoning || '',
    };
  } catch {
    console.error(`  Judge JSON parse failed: ${raw.slice(0, 200)}`);
    return { personality_fidelity: 0, knowledge_accuracy: 0, authenticity: 0, response_quality: 0, reasoning: 'PARSE_FAILED' };
  }
}

// ─── Evaluate Single Prompt ───────────────────────────────────────────────────

async function evaluatePrompt(testPrompt, userId, featureFlags, profile) {
  const start = Date.now();
  try {
    const { response, samplingParams, neuropil, neurotransmitter } = await generateTwinResponse(
      testPrompt.prompt, userId, featureFlags, profile
    );

    if (!response || response.length < 10) {
      console.error(`  [${testPrompt.id}] Empty response`);
      return { id: testPrompt.id, scores: null, error: 'empty_response' };
    }

    const scores = await judgeResponse(
      testPrompt.prompt, response, profile,
      testPrompt.expected_signals, testPrompt.anti_signals
    );

    const elapsed = Date.now() - start;
    console.log(`  [${testPrompt.id}] pf=${scores.personality_fidelity} ka=${scores.knowledge_accuracy} au=${scores.authenticity} rq=${scores.response_quality} (${elapsed}ms) — ${scores.reasoning}`);

    return {
      id: testPrompt.id,
      category: testPrompt.category,
      weight: testPrompt.weight || 1.0,
      scores,
      responseLength: response.length,
      neuropil,
      neurotransmitter,
      elapsedMs: elapsed,
    };
  } catch (err) {
    console.error(`  [${testPrompt.id}] ERROR: ${err.message}`);
    return { id: testPrompt.id, scores: null, error: err.message };
  }
}

// ─── Batch with concurrency ───────────────────────────────────────────────────

async function runBatch(items, fn, concurrency) {
  const results = [];
  const queue = [...items];
  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      results.push(await fn(item));
    }
  });
  await Promise.all(workers);
  return results;
}

// ─── Main Evaluate ────────────────────────────────────────────────────────────

async function evaluate() {
  const startTime = Date.now();
  console.log('=== Twin Chat Eval (LLM-as-Judge) ===');
  console.log(`Mode: ${FAST_MODE ? 'FAST (subset)' : 'FULL (all prompts)'}`);
  console.log(`User: ${USER_ID.slice(0, 8)}...`);
  console.log(`Sampling overrides: temp=${SAMPLING_OVERRIDES.temperature_delta} top_p=${SAMPLING_OVERRIDES.top_p_delta} freq=${SAMPLING_OVERRIDES.frequency_penalty_delta} pres=${SAMPLING_OVERRIDES.presence_penalty_delta}`);
  console.log(`Oracle strength: ${ORACLE_INTEGRATION_STRENGTH}`);
  console.log('');

  // Load test prompts
  const data = JSON.parse(readFileSync(new URL('./test-data/chat-eval-prompts.json', import.meta.url), 'utf-8'));
  let prompts = data.queries;
  if (FAST_MODE) {
    prompts = prompts.filter(p => p.fast === true);
  }
  console.log(`Prompts: ${prompts.length} (${data.queries.length} total)`);

  // Load profile + feature flags
  const [profile, featureFlags] = await Promise.all([
    getProfile(USER_ID),
    getFeatureFlags(USER_ID).catch(() => ({})),
  ]);
  console.log(`Profile: OCEAN [O=${profile?.openness?.toFixed(2)} C=${profile?.conscientiousness?.toFixed(2)} E=${profile?.extraversion?.toFixed(2)} A=${profile?.agreeableness?.toFixed(2)} N=${profile?.neuroticism?.toFixed(2)}]`);
  console.log(`Features: oracle=${featureFlags.personality_oracle}, neuropils=${featureFlags.connectome_neuropils !== false}, neurotransmitter=${featureFlags.neurotransmitter_modes !== false}`);
  console.log('');

  // Run evaluations with concurrency
  console.log('Evaluating...');
  const results = await runBatch(prompts, (p) => evaluatePrompt(p, USER_ID, featureFlags, profile), CONCURRENCY);

  // Compute scores
  const valid = results.filter(r => r.scores);
  const failed = results.filter(r => !r.scores);

  if (valid.length === 0) {
    console.error('\nAll prompts failed!');
    console.log('twin_chat_score: 0.000');
    process.exit(1);
  }

  // Weighted dimension scores
  let totalWeight = 0;
  let totalPF = 0, totalKA = 0, totalAU = 0, totalRQ = 0;
  const categoryStats = {};

  for (const r of valid) {
    const w = r.weight;
    totalWeight += w;
    totalPF += r.scores.personality_fidelity * w;
    totalKA += r.scores.knowledge_accuracy * w;
    totalAU += r.scores.authenticity * w;
    totalRQ += r.scores.response_quality * w;

    const cat = r.category;
    if (!categoryStats[cat]) categoryStats[cat] = { pf: 0, ka: 0, au: 0, rq: 0, weight: 0, count: 0 };
    categoryStats[cat].pf += r.scores.personality_fidelity * w;
    categoryStats[cat].ka += r.scores.knowledge_accuracy * w;
    categoryStats[cat].au += r.scores.authenticity * w;
    categoryStats[cat].rq += r.scores.response_quality * w;
    categoryStats[cat].weight += w;
    categoryStats[cat].count++;
  }

  // Normalize to 0-10
  const avgPF = totalPF / totalWeight;
  const avgKA = totalKA / totalWeight;
  const avgAU = totalAU / totalWeight;
  const avgRQ = totalRQ / totalWeight;

  // Composite: weighted by dimension importance (personality 30%, knowledge 25%, authenticity 25%, quality 20%)
  const compositeRaw = 0.30 * avgPF + 0.25 * avgKA + 0.25 * avgAU + 0.20 * avgRQ;
  const twinChatScore = compositeRaw / 10.0; // Normalize to 0-1

  // Print results
  console.log('\n=== Results ===');
  console.log(`Evaluated: ${valid.length}/${prompts.length} (${failed.length} failed)`);
  console.log('');

  // Per-category breakdown
  console.log('Category breakdown:');
  for (const [cat, s] of Object.entries(categoryStats)) {
    const pf = (s.pf / s.weight).toFixed(1);
    const ka = (s.ka / s.weight).toFixed(1);
    const au = (s.au / s.weight).toFixed(1);
    const rq = (s.rq / s.weight).toFixed(1);
    console.log(`  ${cat.padEnd(15)} pf=${pf} ka=${ka} au=${au} rq=${rq} (n=${s.count})`);
  }

  console.log('');
  console.log('Dimension averages (0-10):');
  console.log(`  personality_fidelity: ${avgPF.toFixed(2)}`);
  console.log(`  knowledge_accuracy:  ${avgKA.toFixed(2)}`);
  console.log(`  authenticity:        ${avgAU.toFixed(2)}`);
  console.log(`  response_quality:    ${avgRQ.toFixed(2)}`);

  console.log('');
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`twin_chat_score:    ${twinChatScore.toFixed(6)}`);
  console.log(`personality_fidelity: ${(avgPF / 10).toFixed(6)}`);
  console.log(`knowledge_accuracy:   ${(avgKA / 10).toFixed(6)}`);
  console.log(`authenticity:         ${(avgAU / 10).toFixed(6)}`);
  console.log(`response_quality:     ${(avgRQ / 10).toFixed(6)}`);
  console.log(`elapsed_seconds:    ${elapsed}`);
  console.log(`prompts_evaluated:  ${valid.length}`);
  console.log(`prompts_failed:     ${failed.length}`);
}

evaluate().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
