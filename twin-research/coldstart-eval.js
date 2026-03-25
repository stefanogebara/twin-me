/**
 * TwinMe Cold Start Eval — Fixed Evaluation Harness
 * ===================================================
 * DO NOT MODIFY THIS FILE.
 * This is the fixed evaluation harness for cold start quality.
 * The agent modifies coldstart-config.js only.
 *
 * Metric: coldstart_quality_score (0.0 – 1.0, HIGHER = better)
 *
 * Composite formula:
 *   coldstart_quality_score = 0.40 * coverage
 *                           + 0.35 * accuracy
 *                           + 0.25 * wow_factor
 *
 * Components (each 0.0 – 1.0):
 *   coverage   — How much of the full personality did we capture from limited data?
 *   accuracy   — Is what we said correct (not hallucinated)?
 *   wow_factor — Would a user seeing this in their first 60 seconds be impressed?
 *
 * Also measures: generation time (wall clock), estimated token cost.
 *
 * Evaluation uses LLM-as-judge (DeepSeek via TIER_EXTRACTION for cost).
 *
 * Usage:
 *   node --env-file=.env twin-research/coldstart-eval.js
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { appendFileSync, existsSync } from 'fs';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

// ─── Config import (what changes between experiments) ────────────────────────
import {
  INITIAL_MEMORY_LIMIT,
  ENRICHMENT_WEIGHT,
  SUMMARY_PROMPT_TEMPLATE,
  SUMMARY_TEMPERATURE,
  SUMMARY_MAX_TOKENS,
  PRIORITIZE_TYPE_DIVERSITY,
  MAX_PER_TYPE,
} from './coldstart-config.js';

// ─── LLM Gateway + DB ──────────────────────────────────────────────────────
import { complete, TIER_EXTRACTION, TIER_ANALYSIS } from '../api/services/llmGateway.js';
import { supabaseAdmin } from '../api/services/database.js';

// ─── Fixed constants (never modified by agent) ──────────────────────────────
const TEST_USER_ID = process.env.TEST_TWIN_USER_ID || '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';
const EVAL_TIMEOUT_MS = 120_000;
const RESULTS_FILE = join(__dirname, 'coldstart-results.tsv');
const NUM_EVAL_ROUNDS = 3; // Average over multiple judge calls for stability

// ─── Fetch early memories (simulating cold start) ───────────────────────────
async function fetchEarlyMemories(userId, limit) {
  if (PRIORITIZE_TYPE_DIVERSITY) {
    // Fetch more than needed, then select diverse types
    const { data, error } = await supabaseAdmin
      .from('user_memories')
      .select('id, content, memory_type, importance_score, metadata, created_at')
      .eq('user_id', userId)
      .eq('is_archived', false)
      .order('created_at', { ascending: true })
      .limit(limit * 3);

    if (error || !data) return [];

    // Type-diverse selection: round-robin across types up to limit
    const byType = {};
    for (const m of data) {
      const t = m.memory_type || 'unknown';
      if (!byType[t]) byType[t] = [];
      if (byType[t].length < MAX_PER_TYPE) byType[t].push(m);
    }

    const selected = [];
    let added = true;
    while (selected.length < limit && added) {
      added = false;
      for (const type of Object.keys(byType)) {
        if (byType[type].length > 0 && selected.length < limit) {
          selected.push(byType[type].shift());
          added = true;
        }
      }
    }

    return selected;
  }

  // Simple chronological fetch
  const { data, error } = await supabaseAdmin
    .from('user_memories')
    .select('id, content, memory_type, importance_score, metadata, created_at')
    .eq('user_id', userId)
    .eq('is_archived', false)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error || !data) return [];
  return data;
}

// ─── Fetch core memory blocks ────────────────────────────────────────────────
async function fetchCoreBlocks(userId) {
  const { data, error } = await supabaseAdmin
    .from('core_memory_blocks')
    .select('block_name, block_content')
    .eq('user_id', userId);

  if (error || !data) return '';
  return data.map(b => `[${b.block_name}]: ${b.block_content}`).join('\n\n');
}

// ─── Fetch full soul signature (ground truth) ────────────────────────────────
async function fetchFullSoulSignature(userId) {
  // Get the latest twin summary as ground truth
  const { data: summary } = await supabaseAdmin
    .from('twin_summaries')
    .select('summary')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  // Also get high-importance reflections as additional ground truth
  const { data: reflections } = await supabaseAdmin
    .from('user_memories')
    .select('content')
    .eq('user_id', userId)
    .eq('memory_type', 'reflection')
    .eq('is_archived', false)
    .gte('importance_score', 7)
    .order('importance_score', { ascending: false })
    .limit(20);

  const reflectionText = reflections
    ? reflections.map(r => r.content).join('\n')
    : '';

  return {
    summary: summary?.summary || '',
    reflections: reflectionText,
  };
}

// ─── Generate cold start summary using config ───────────────────────────────
async function generateColdStartSummary(memories, coreBlocks) {
  const memoryText = memories.map(m => {
    const type = m.memory_type || 'unknown';
    const importance = m.importance_score || '?';
    return `[${type}, importance=${importance}] ${m.content}`;
  }).join('\n');

  const prompt = SUMMARY_PROMPT_TEMPLATE
    .replace('{memories}', memoryText)
    .replace('{core_blocks}', coreBlocks || 'None available yet.');

  const result = await complete({
    system: 'You are a personality analyst building soul signatures for digital twins.',
    messages: [{ role: 'user', content: prompt }],
    maxTokens: SUMMARY_MAX_TOKENS,
    temperature: SUMMARY_TEMPERATURE,
    tier: TIER_EXTRACTION,
    serviceName: 'coldstart-eval-generate',
  });

  return (result?.content || '').trim();
}

// ─── Judge cold start quality (FIXED — do not modify) ────────────────────────
function buildJudgePrompt(coldStartSummary, fullSummary, fullReflections) {
  return {
    system: `You are an expert evaluator of AI-generated personality summaries. You compare a "cold start" summary (generated from minimal data) against the full ground truth. Score strictly and fairly. Return ONLY valid JSON.`,
    user: `COLD START SUMMARY (generated from first ~50 memories):
"${coldStartSummary}"

FULL GROUND TRUTH SUMMARY (from 6000+ memories):
"${fullSummary}"

KEY PERSONALITY REFLECTIONS (ground truth):
"${fullReflections.slice(0, 3000)}"

Score the cold start summary on these 3 dimensions (0-10 each, integers only):

1. COVERAGE: How much of the FULL personality did the cold start capture? Did it identify the main personality traits, interests, patterns, and quirks? 0 = completely missed the person. 10 = captured all major facets despite limited data.

2. ACCURACY: Is everything stated in the cold start CORRECT based on the ground truth? Penalize hallucinated claims, wrong facts, or invented personality traits. 0 = mostly wrong. 10 = everything stated is verifiable from ground truth.

3. WOW_FACTOR: Would a real user be IMPRESSED seeing this after just 60 seconds? Does it feel like the system "gets" them? Is there at least one surprising or non-obvious insight? 0 = generic/boring. 10 = "how did it know that?!" moment.

Return ONLY this JSON (no markdown fences):
{"coverage":X,"accuracy":X,"wow_factor":X,"reasoning":"one sentence"}`,
  };
}

async function judgeColdStart(coldStartSummary, fullSummary, fullReflections) {
  const { system, user } = buildJudgePrompt(coldStartSummary, fullSummary, fullReflections);

  const result = await complete({
    system,
    messages: [{ role: 'user', content: user }],
    maxTokens: 300,
    temperature: 0,
    tier: TIER_EXTRACTION,
    serviceName: 'coldstart-eval-judge',
  });

  const raw = (result?.content || '').trim();
  const jsonStr = raw.replace(/^```json?\n?/i, '').replace(/\n?```$/i, '').trim();

  try {
    const scores = JSON.parse(jsonStr);
    return {
      coverage: Math.min(10, Math.max(0, scores.coverage ?? 0)) / 10,
      accuracy: Math.min(10, Math.max(0, scores.accuracy ?? 0)) / 10,
      wow_factor: Math.min(10, Math.max(0, scores.wow_factor ?? 0)) / 10,
      reasoning: scores.reasoning || '',
    };
  } catch {
    console.error(`  Judge JSON parse failed: ${raw.slice(0, 200)}`);
    return { coverage: 0, accuracy: 0, wow_factor: 0, reasoning: 'PARSE_FAILED' };
  }
}

// ─── Main evaluation ─────────────────────────────────────────────────────────
async function evaluate() {
  const startTime = Date.now();
  console.log(`\nTwinMe Cold Start Eval — coldstart_quality_score`);
  console.log(`User: ${TEST_USER_ID}`);
  console.log(`Config: memory_limit=${INITIAL_MEMORY_LIMIT}, enrichment_weight=${ENRICHMENT_WEIGHT}`);
  console.log(`Config: temp=${SUMMARY_TEMPERATURE}, max_tokens=${SUMMARY_MAX_TOKENS}`);
  console.log(`Config: type_diversity=${PRIORITIZE_TYPE_DIVERSITY}, max_per_type=${MAX_PER_TYPE}`);
  console.log(`Eval rounds: ${NUM_EVAL_ROUNDS} (averaged for stability)`);
  console.log(`─────────────────────────────────────────────`);

  // Step 1: Fetch early memories (cold start simulation)
  console.log(`\nFetching first ${INITIAL_MEMORY_LIMIT} memories...`);
  const earlyMemories = await fetchEarlyMemories(TEST_USER_ID, INITIAL_MEMORY_LIMIT);
  if (earlyMemories.length === 0) {
    console.error('No memories found for test user.');
    console.log('coldstart_quality_score: 0.000000');
    process.exit(1);
  }

  // Log type distribution of early memories
  const typeDist = {};
  for (const m of earlyMemories) {
    const t = m.memory_type || 'unknown';
    typeDist[t] = (typeDist[t] || 0) + 1;
  }
  console.log(`Early memories: ${earlyMemories.length} — types: ${JSON.stringify(typeDist)}`);

  // Step 2: Fetch core memory blocks
  const coreBlocks = await fetchCoreBlocks(TEST_USER_ID);
  console.log(`Core blocks: ${coreBlocks ? coreBlocks.split('\n\n').length + ' blocks' : 'none'}`);

  // Step 3: Generate cold start summary
  console.log(`\nGenerating cold start summary...`);
  const genStart = Date.now();
  const coldStartSummary = await generateColdStartSummary(earlyMemories, coreBlocks);
  const genTimeMs = Date.now() - genStart;
  console.log(`Generated in ${genTimeMs}ms (${coldStartSummary.length} chars)`);
  console.log(`Summary preview: "${coldStartSummary.slice(0, 200)}..."`);

  // Step 4: Fetch full ground truth
  console.log(`\nFetching ground truth...`);
  const { summary: fullSummary, reflections: fullReflections } = await fetchFullSoulSignature(TEST_USER_ID);
  if (!fullSummary && !fullReflections) {
    console.error('No ground truth found (no twin summary or reflections).');
    console.log('coldstart_quality_score: 0.000000');
    process.exit(1);
  }
  console.log(`Ground truth: summary=${fullSummary.length} chars, reflections=${fullReflections.length} chars`);

  // Step 5: Judge (multiple rounds for stability)
  console.log(`\nJudging (${NUM_EVAL_ROUNDS} rounds)...`);
  const allScores = [];
  for (let round = 0; round < NUM_EVAL_ROUNDS; round++) {
    if (Date.now() - startTime > EVAL_TIMEOUT_MS) {
      console.log(`Timeout after round ${round}`);
      break;
    }

    const scores = await judgeColdStart(coldStartSummary, fullSummary, fullReflections);
    allScores.push(scores);
    console.log(`  Round ${round + 1}: C=${scores.coverage.toFixed(2)} A=${scores.accuracy.toFixed(2)} W=${scores.wow_factor.toFixed(2)} — ${scores.reasoning}`);
  }

  if (allScores.length === 0) {
    console.error('No judge rounds completed.');
    console.log('coldstart_quality_score: 0.000000');
    process.exit(1);
  }

  // Average across rounds
  const avgCoverage = allScores.reduce((s, r) => s + r.coverage, 0) / allScores.length;
  const avgAccuracy = allScores.reduce((s, r) => s + r.accuracy, 0) / allScores.length;
  const avgWow = allScores.reduce((s, r) => s + r.wow_factor, 0) / allScores.length;

  const coldstartQualityScore = 0.40 * avgCoverage + 0.35 * avgAccuracy + 0.25 * avgWow;

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`─────────────────────────────────────────────`);
  console.log(`coverage:               ${avgCoverage.toFixed(6)}`);
  console.log(`accuracy:               ${avgAccuracy.toFixed(6)}`);
  console.log(`wow_factor:             ${avgWow.toFixed(6)}`);
  console.log(`───`);
  console.log(`coldstart_quality_score: ${coldstartQualityScore.toFixed(6)}`);
  console.log(`generation_time_ms:     ${genTimeMs}`);
  console.log(`summary_length_chars:   ${coldStartSummary.length}`);
  console.log(`memories_used:          ${earlyMemories.length}`);
  console.log(`judge_rounds:           ${allScores.length}`);
  console.log(`eval_seconds:           ${elapsed}`);

  // Append to results TSV
  const tsvHeader = 'timestamp\tcoldstart_quality_score\tcoverage\taccuracy\twow_factor\tgeneration_time_ms\tmemories_used\teval_seconds\tdescription\n';
  const tsvRow = `${new Date().toISOString()}\t${coldstartQualityScore.toFixed(6)}\t${avgCoverage.toFixed(6)}\t${avgAccuracy.toFixed(6)}\t${avgWow.toFixed(6)}\t${genTimeMs}\t${earlyMemories.length}\t${elapsed}\tbaseline\n`;

  if (!existsSync(RESULTS_FILE)) {
    appendFileSync(RESULTS_FILE, tsvHeader);
  }
  appendFileSync(RESULTS_FILE, tsvRow);

  return {
    coldstart_quality_score: coldstartQualityScore,
    coverage: avgCoverage,
    accuracy: avgAccuracy,
    wow_factor: avgWow,
    generation_time_ms: genTimeMs,
    memories_used: earlyMemories.length,
    eval_seconds: parseFloat(elapsed),
  };
}

// Run evaluation
evaluate()
  .then(result => {
    process.exit(result.coldstart_quality_score > 0 ? 0 : 1);
  })
  .catch(err => {
    console.error('Fatal eval error:', err);
    process.exit(1);
  });
