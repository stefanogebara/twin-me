/**
 * TwinMe Memory Retrieval Relevance Eval — Fixed Evaluation Harness
 * ==================================================================
 * DO NOT MODIFY THIS FILE.
 * This is the fixed evaluation harness for memory retrieval CONTENT relevance.
 * The agent modifies memory-config.js only.
 *
 * SEPARATE from twin-eval.js (which tests type distribution / precision / recall).
 * This tests whether retrieved memories are actually USEFUL for answering queries.
 *
 * Metric: memory_relevance_score (0.0 – 1.0, HIGHER = better)
 *
 * Composite formula:
 *   memory_relevance_score = avg(relevance) * (1 - avg(noise)) * freshness_boost
 *
 * Components (each 0.0 – 1.0):
 *   relevance      — Is this memory actually useful for answering this query?
 *   freshness      — Is this memory from a relevant time period?
 *   noise          — Is this a distractor that shouldn't have been retrieved? (inverted)
 *
 * Evaluation uses LLM-as-judge (DeepSeek via TIER_EXTRACTION for cost).
 *
 * Usage:
 *   node --env-file=.env twin-research/memory-eval.js
 */

import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, appendFileSync, existsSync } from 'fs';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

// ─── Config import (what changes between experiments) ────────────────────────
import {
  RETRIEVAL_LIMIT,
  RELEVANCE_THRESHOLD,
  FRESHNESS_DECAY_RATE,
  TYPE_RERANKING_ENABLED,
  DIVERSITY_RERANKING_WEIGHT,
  RETRIEVAL_WEIGHTS,
  MMR_LAMBDA,
  TYPE_DIVERSITY_WEIGHT,
} from './memory-config.js';

// ─── Services ───────────────────────────────────────────────────────────────
import { complete, TIER_EXTRACTION } from '../api/services/llmGateway.js';
import { generateEmbedding, vectorToString } from '../api/services/embeddingService.js';
import { supabaseAdmin } from '../api/services/database.js';

// ─── Fixed constants (never modified by agent) ──────────────────────────────
const TEST_USER_ID = process.env.TEST_TWIN_USER_ID || '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';
const EVAL_TIMEOUT_MS = 120_000;
const RESULTS_FILE = join(__dirname, 'memory-results.tsv');
const JUDGE_CONCURRENCY = 3;
const MEMORIES_PER_JUDGE_CALL = 5; // Judge 5 memories at once to reduce LLM calls

// Load test queries (same gold file as twin-eval.js)
const goldPath = join(__dirname, 'test-data', 'retrieval-gold.json');
const { queries: TEST_QUERIES } = JSON.parse(readFileSync(goldPath, 'utf8'));

// ─── Cosine similarity for MMR ──────────────────────────────────────────────
function cosine(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-8);
}

function parseVec(str) {
  if (!str) return null;
  try { return str.slice(1, -1).split(',').map(Number); } catch { return null; }
}

// ─── MMR reranking (matches twin-eval.js pattern) ───────────────────────────
function mmrRerank(candidates, k) {
  if (!candidates.length) return [];
  const selected = [];
  const remaining = [...candidates];

  while (selected.length < k && remaining.length > 0) {
    let bestIdx = 0;
    let bestScore = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const cand = remaining[i];
      const relevance = cand.score ?? 0;
      const candVec = parseVec(cand.embedding);

      let maxSim = 0;
      if (selected.length > 0 && candVec) {
        for (const sel of selected) {
          const selVec = parseVec(sel.embedding);
          if (selVec) maxSim = Math.max(maxSim, cosine(candVec, selVec));
        }
      }

      let typePenalty = 0;
      if (selected.length > 0 && cand.memory_type && TYPE_DIVERSITY_WEIGHT > 0) {
        const sameTypeCount = selected.filter(s => s.memory_type === cand.memory_type).length;
        typePenalty = TYPE_DIVERSITY_WEIGHT * (sameTypeCount / selected.length);
      }

      const mmrScore = MMR_LAMBDA * relevance - (1 - MMR_LAMBDA) * maxSim - typePenalty;
      if (mmrScore > bestScore) {
        bestScore = mmrScore;
        bestIdx = i;
      }
    }

    selected.push(remaining[bestIdx]);
    remaining.splice(bestIdx, 1);
  }

  return selected;
}

// ─── Retrieve memories for a query ──────────────────────────────────────────
async function retrieveForQuery(query, retrievalMode = 'default') {
  const queryEmbedding = await generateEmbedding(query);
  if (!queryEmbedding) throw new Error('Embedding returned null');
  const embeddingStr = vectorToString(queryEmbedding);

  // Per-mode weight selection: use mode-specific preset if available, else default
  const w = RETRIEVAL_WEIGHTS[retrievalMode] || RETRIEVAL_WEIGHTS.default || RETRIEVAL_WEIGHTS;

  const { data: rawResults, error } = await supabaseAdmin.rpc('search_memory_stream', {
    p_user_id: TEST_USER_ID,
    p_query_embedding: embeddingStr,
    p_limit: RETRIEVAL_LIMIT * 3, // over-fetch for MMR
    p_decay_factor: FRESHNESS_DECAY_RATE,
    p_weight_recency: w.recency ?? 0,
    p_weight_importance: w.importance ?? 0.3,
    p_weight_relevance: w.relevance ?? 2.8,
  });

  if (error || !rawResults || rawResults.length === 0) return [];

  // Apply MMR reranking
  const reranked = mmrRerank(rawResults, RETRIEVAL_LIMIT);

  // Strip embeddings for output
  return reranked.map(m => ({ ...m, embedding: undefined }));
}

// ─── Judge relevance of retrieved memories (FIXED — do not modify) ──────────
function buildRelevanceJudgePrompt(query, memories) {
  const memoryList = memories.map((m, i) => {
    const ageStr = m.created_at
      ? `${Math.floor((Date.now() - new Date(m.created_at).getTime()) / (24 * 3600_000))}d ago`
      : 'unknown age';
    return `  [${i + 1}] (${m.memory_type || '?'}, ${ageStr}) ${(m.content || '').slice(0, 300)}`;
  }).join('\n');

  return {
    system: `You are an expert evaluator of memory retrieval systems. You judge whether retrieved memories are relevant to a given query. Score strictly. Return ONLY valid JSON.`,
    user: `QUERY: "${query}"

RETRIEVED MEMORIES:
${memoryList}

For EACH memory (1-${memories.length}), score on 3 dimensions (0-10 each, integers):

1. RELEVANCE: Is this memory actually USEFUL for answering or addressing the query? 0 = completely irrelevant, 10 = directly answers the query.

2. FRESHNESS: Is the age of this memory appropriate for the query? Recent queries need recent data (old = penalize). Timeless identity queries don't care about age (neutral = 5). 0 = stale/outdated, 10 = perfectly timed.

3. NOISE: Is this a DISTRACTOR that adds confusion rather than clarity? 0 = clean signal (good), 10 = pure noise that should not have been retrieved.

Return ONLY this JSON array (no markdown fences), one object per memory:
[{"id":1,"relevance":X,"freshness":X,"noise":X},{"id":2,...}]`,
  };
}

async function judgeRelevance(query, memories) {
  if (memories.length === 0) return [];

  const { system, user } = buildRelevanceJudgePrompt(query, memories);

  const result = await complete({
    system,
    messages: [{ role: 'user', content: user }],
    maxTokens: 500,
    temperature: 0,
    tier: TIER_EXTRACTION,
    serviceName: 'memory-eval-judge',
  });

  const raw = (result?.content || '').trim();
  const jsonStr = raw.replace(/^```json?\n?/i, '').replace(/\n?```$/i, '').trim();

  try {
    const scores = JSON.parse(jsonStr);
    if (!Array.isArray(scores)) throw new Error('Expected array');
    return scores.map(s => ({
      relevance: Math.min(10, Math.max(0, s.relevance ?? 0)) / 10,
      freshness: Math.min(10, Math.max(0, s.freshness ?? 0)) / 10,
      noise: Math.min(10, Math.max(0, s.noise ?? 0)) / 10,
    }));
  } catch {
    console.error(`  Judge JSON parse failed: ${raw.slice(0, 200)}`);
    return memories.map(() => ({ relevance: 0, freshness: 0.5, noise: 0.5 }));
  }
}

// ─── Single query evaluation ────────────────────────────────────────────────
async function evaluateQuery(testQuery) {
  const { query, retrieval_mode } = testQuery;

  // Retrieve memories using current config (per-mode weights)
  const memories = await retrieveForQuery(query, retrieval_mode || 'default');
  if (memories.length === 0) {
    return { relevance: 0, freshness: 0, noise: 1, count: 0 };
  }

  // Judge all retrieved memories
  const judgments = await judgeRelevance(query, memories);

  // Compute averages
  const avgRelevance = judgments.reduce((s, j) => s + j.relevance, 0) / judgments.length;
  const avgFreshness = judgments.reduce((s, j) => s + j.freshness, 0) / judgments.length;
  const avgNoise = judgments.reduce((s, j) => s + j.noise, 0) / judgments.length;

  return {
    relevance: avgRelevance,
    freshness: avgFreshness,
    noise: avgNoise,
    count: memories.length,
  };
}

// ─── Main evaluation loop ───────────────────────────────────────────────────
async function evaluate() {
  const startTime = Date.now();
  console.log(`\nTwinMe Memory Relevance Eval — memory_relevance_score`);
  console.log(`User: ${TEST_USER_ID}`);
  console.log(`Queries: ${TEST_QUERIES.length}`);
  console.log(`Config: limit=${RETRIEVAL_LIMIT}, threshold=${RELEVANCE_THRESHOLD}, decay=${FRESHNESS_DECAY_RATE}`);
  console.log(`Config: weights=${JSON.stringify(RETRIEVAL_WEIGHTS)}`);
  console.log(`Config: mmr_lambda=${MMR_LAMBDA}, type_diversity=${TYPE_DIVERSITY_WEIGHT}`);
  console.log(`Config: type_reranking=${TYPE_RERANKING_ENABLED}, diversity_weight=${DIVERSITY_RERANKING_WEIGHT}`);
  console.log(`─────────────────────────────────────────────`);

  let totalRelevance = 0;
  let totalFreshness = 0;
  let totalNoise = 0;
  let totalWeight = 0;
  let successCount = 0;

  // Per-mode tracking
  const modeStats = {};

  for (let i = 0; i < TEST_QUERIES.length; i++) {
    const q = TEST_QUERIES[i];
    const weight = q.weight || 1.0;

    try {
      const result = await evaluateQuery(q);
      totalRelevance += result.relevance * weight;
      totalFreshness += result.freshness * weight;
      totalNoise += result.noise * weight;
      totalWeight += weight;
      successCount++;

      // Track per-mode stats
      const mode = q.retrieval_mode;
      if (!modeStats[mode]) modeStats[mode] = { relevance: 0, freshness: 0, noise: 0, weight: 0, count: 0 };
      modeStats[mode].relevance += result.relevance * weight;
      modeStats[mode].freshness += result.freshness * weight;
      modeStats[mode].noise += result.noise * weight;
      modeStats[mode].weight += weight;
      modeStats[mode].count++;

      const composite = result.relevance * (1 - result.noise) * (0.5 + 0.5 * result.freshness);
      const icon = composite >= 0.5 ? '+' : composite >= 0.25 ? '~' : '-';
      console.log(`${icon} q${String(i + 1).padStart(2, '0')} [${(q.retrieval_mode || '?').padEnd(10)}] R=${result.relevance.toFixed(3)} F=${result.freshness.toFixed(3)} N=${result.noise.toFixed(3)} => ${composite.toFixed(3)} (n=${result.count})`);
    } catch (err) {
      console.log(`- q${String(i + 1).padStart(2, '0')} FAILED: ${err.message}`);
      totalWeight += weight;
    }

    // Respect timeout
    if (Date.now() - startTime > EVAL_TIMEOUT_MS) {
      console.log(`\nEval timeout after ${i + 1} queries`);
      break;
    }
  }

  // Weighted averages
  const avgRelevance = totalWeight > 0 ? totalRelevance / totalWeight : 0;
  const avgFreshness = totalWeight > 0 ? totalFreshness / totalWeight : 0;
  const avgNoise = totalWeight > 0 ? totalNoise / totalWeight : 0;

  // Composite score (fixed formula — DO NOT CHANGE)
  // freshness_boost: 0.5 base + 0.5 * freshness (so freshness adds up to 50% bonus)
  const freshnessBoost = 0.5 + 0.5 * avgFreshness;
  const memoryRelevanceScore = avgRelevance * (1 - avgNoise) * freshnessBoost;

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`─────────────────────────────────────────────`);
  console.log(`avg_relevance:          ${avgRelevance.toFixed(6)}`);
  console.log(`avg_freshness:          ${avgFreshness.toFixed(6)}`);
  console.log(`avg_noise:              ${avgNoise.toFixed(6)}`);
  console.log(`freshness_boost:        ${freshnessBoost.toFixed(6)}`);
  console.log(`───`);
  console.log(`memory_relevance_score: ${memoryRelevanceScore.toFixed(6)}`);
  console.log(`queries_completed:      ${successCount}/${TEST_QUERIES.length}`);
  console.log(`eval_seconds:           ${elapsed}`);

  // Per-mode breakdown
  console.log(`\n── Per-Mode Breakdown ──`);
  for (const [mode, s] of Object.entries(modeStats).sort((a, b) => a[0].localeCompare(b[0]))) {
    const r = s.weight > 0 ? s.relevance / s.weight : 0;
    const f = s.weight > 0 ? s.freshness / s.weight : 0;
    const n = s.weight > 0 ? s.noise / s.weight : 0;
    const fb = 0.5 + 0.5 * f;
    const score = r * (1 - n) * fb;
    console.log(`  ${mode.padEnd(12)} (${s.count}q) R=${r.toFixed(3)} F=${f.toFixed(3)} N=${n.toFixed(3)} => ${score.toFixed(3)}`);
  }

  // Append to results TSV
  const tsvHeader = 'timestamp\tmemory_relevance_score\tavg_relevance\tavg_freshness\tavg_noise\tqueries_completed\teval_seconds\tdescription\n';
  const tsvRow = `${new Date().toISOString()}\t${memoryRelevanceScore.toFixed(6)}\t${avgRelevance.toFixed(6)}\t${avgFreshness.toFixed(6)}\t${avgNoise.toFixed(6)}\t${successCount}\t${elapsed}\tbaseline\n`;

  if (!existsSync(RESULTS_FILE)) {
    appendFileSync(RESULTS_FILE, tsvHeader);
  }
  appendFileSync(RESULTS_FILE, tsvRow);

  return {
    memory_relevance_score: memoryRelevanceScore,
    avg_relevance: avgRelevance,
    avg_freshness: avgFreshness,
    avg_noise: avgNoise,
    queries_completed: successCount,
    eval_seconds: parseFloat(elapsed),
  };
}

// Run evaluation
evaluate()
  .then(result => {
    process.exit(result.memory_relevance_score > 0 ? 0 : 1);
  })
  .catch(err => {
    console.error('Fatal eval error:', err);
    process.exit(1);
  });
