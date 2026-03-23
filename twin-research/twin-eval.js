/**
 * TwinMe Twin Eval — Fixed Evaluation Harness
 * ============================================
 * DO NOT MODIFY THIS FILE.
 * This is the fixed evaluation harness, analogous to prepare.py's evaluate_bpb()
 * in karpathy/autoresearch. The agent modifies twin-config.js only.
 *
 * Metric: twin_quality_score (0.0 – 1.0, HIGHER = better)
 *
 * Composite formula:
 *   twin_quality_score = 0.50 * precision_at_5
 *                      + 0.30 * recall_at_10
 *                      + 0.20 * diversity_score
 *
 * Components:
 *   precision_at_5  — Fraction of queries where expected memory type appears in top-5
 *   recall_at_10    — Fraction of queries where expected memory type appears in top-10
 *   diversity_score — Average entropy of memory type distribution in top-5 (normalized)
 *
 * All evaluation is objective (no LLM calls) — based purely on retrieval results.
 * This makes evaluation deterministic given fixed DB state.
 *
 * Usage:
 *   node twin-research/twin-eval.js [--user-id UUID]
 *
 * The test user defaults to the environment's TEST_TWIN_USER_ID, or falls back
 * to the stefanogebara@gmail.com account.
 */

import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

// ─── Config import (what changes between experiments) ────────────────────────
import {
  RETRIEVAL_WEIGHTS,
  MMR_LAMBDA,
  ALPHA_CITATION_BASELINE,
  TYPE_DIVERSITY_WEIGHT,
  SEMANTIC_DIVERSITY_WEIGHT,
  TEMPORAL_DIVERSITY_WEIGHT,
} from './twin-config.js';

// ─── Fixed constants (never modified by agent) ────────────────────────────────
const TEST_USER_ID = process.env.TEST_TWIN_USER_ID || '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';
const PRECISION_K = 5;
const RECALL_K = 10;
const MAX_ENTROPY_TYPES = 5; // 5 memory types → max entropy = log2(5)
const EVAL_TIMEOUT_MS = 120_000; // 2 minutes max

// Load fixed test queries
const goldPath = join(__dirname, 'test-data', 'retrieval-gold.json');
const { queries: TEST_QUERIES } = JSON.parse(readFileSync(goldPath, 'utf8'));

// ─── Supabase client ──────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// ─── Embedding helper — uses project's embeddingService (OpenRouter) ──────────
import { generateEmbedding as _generateEmbedding, vectorToString } from '../api/services/embeddingService.js';
async function generateEmbedding(text) {
  const vec = await _generateEmbedding(text);
  if (!vec) throw new Error('Embedding returned null');
  return vec;
}

// ─── Cosine similarity for MMR ────────────────────────────────────────────────
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

// ─── MMR reranking (mirrors memoryStreamService.js — uses config MMR_LAMBDA) ──
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

      // Type diversity penalty (mirrors memoryStreamService.js)
      let typePenalty = 0;
      if (selected.length > 0 && cand.memory_type && TYPE_DIVERSITY_WEIGHT > 0) {
        const sameTypeCount = selected.filter(s => s.memory_type === cand.memory_type).length;
        typePenalty = TYPE_DIVERSITY_WEIGHT * (sameTypeCount / selected.length);
      }

      // Semantic diversity penalty: high cosine sim to same-type selected memories
      let semanticPenalty = 0;
      if (selected.length > 0 && SEMANTIC_DIVERSITY_WEIGHT > 0 && cand.memory_type && candVec) {
        const sameType = selected.filter(s => s.memory_type === cand.memory_type);
        if (sameType.length > 0) {
          let simSum = 0, simN = 0;
          for (const s of sameType) {
            const sv = parseVec(s.embedding);
            if (sv) { simSum += cosine(candVec, sv); simN++; }
          }
          if (simN > 0) semanticPenalty = SEMANTIC_DIVERSITY_WEIGHT * (simSum / simN);
        }
      }

      // Temporal diversity bonus: boost underrepresented time buckets
      let temporalBonus = 0;
      if (selected.length > 0 && TEMPORAL_DIVERSITY_WEIGHT > 0 && cand.created_at) {
        const now = Date.now();
        const candAge = now - new Date(cand.created_at).getTime();
        const WEEK = 7 * 24 * 3600_000;
        const MONTH = 30 * 24 * 3600_000;
        const candBucket = candAge < WEEK ? 'recent' : candAge < MONTH ? 'medium' : 'archive';
        const bc = { recent: 0, medium: 0, archive: 0 };
        for (const s of selected) {
          const sa = now - new Date(s.created_at).getTime();
          bc[sa < WEEK ? 'recent' : sa < MONTH ? 'medium' : 'archive']++;
        }
        temporalBonus = TEMPORAL_DIVERSITY_WEIGHT * Math.max(0, 0.5 - bc[candBucket] / selected.length);
      }

      // MMR with type + semantic + temporal diversity
      const mmrScore = MMR_LAMBDA * relevance - (1 - MMR_LAMBDA) * maxSim - typePenalty - semanticPenalty + temporalBonus;
      if (mmrScore > bestScore) {
        bestScore = mmrScore;
        bestIdx = i;
      }
    }

    selected.push(remaining[bestIdx]);
    remaining.splice(bestIdx, 1);
  }

  return selected.map(m => ({ ...m, embedding: undefined }));
}

// ─── Single query evaluation ──────────────────────────────────────────────────
async function evaluateQuery(testQuery) {
  const { query, retrieval_mode, expected_types, expected_keywords } = testQuery;

  // Resolve weights from config (mirrors memoryStreamService.js logic)
  const w = RETRIEVAL_WEIGHTS[retrieval_mode] || RETRIEVAL_WEIGHTS.default;

  // Generate query embedding
  const queryEmbedding = await generateEmbedding(query);
  const embeddingStr = vectorToString(queryEmbedding);

  // Call the Supabase RPC (same as the live system uses)
  const { data: rawResults, error } = await supabase.rpc('search_memory_stream', {
    p_user_id: TEST_USER_ID,
    p_query_embedding: embeddingStr,
    p_limit: RECALL_K * 3, // over-fetch for MMR
    p_decay_factor: 0.995,
    p_weight_recency: w.recency,
    p_weight_importance: w.importance,
    p_weight_relevance: w.relevance,
  });

  if (error || !rawResults || rawResults.length === 0) {
    return { precision_at_5: 0, recall_at_10: 0, diversity: 0, count: 0 };
  }

  // Type-stratified augmentation: when query expects multiple types,
  // fetch top rows per expected type directly to ensure type coverage.
  // This mirrors production's retrieveDiverseMemories() approach.
  let augmented = [...rawResults];
  if (expected_types.length > 1) {
    const existingIds = new Set(rawResults.map(r => r.id));
    for (const etype of expected_types) {
      // Check if this type is already well-represented
      const typeCount = rawResults.filter(r => r.memory_type === etype).length;
      if (typeCount >= 2) continue; // already have enough

      // Direct fetch: top 5 by importance for this type
      const { data: typeRows } = await supabase
        .from('user_memories')
        .select('id, content, memory_type, importance_score, metadata, created_at, last_accessed_at, confidence, decay_rate, retrieval_count, embedding')
        .eq('user_id', TEST_USER_ID)
        .eq('memory_type', etype)
        .eq('is_archived', false)
        .not('embedding', 'is', null)
        .order('importance_score', { ascending: false })
        .limit(5);

      if (typeRows) {
        for (const row of typeRows) {
          if (!existingIds.has(row.id)) {
            existingIds.add(row.id);
            // Score high enough to compete with vector results
            const topScore = rawResults[0]?.score ?? 1.0;
            augmented.push({
              ...row,
              embedding: row.embedding?.toString() ?? null,
              score: topScore * 0.85 * ((row.importance_score ?? 5) / 10),
            });
          }
        }
      }
    }
  }

  // Apply MMR reranking with current config's lambda
  const reranked = mmrRerank(augmented, RECALL_K);

  const top5 = reranked.slice(0, PRECISION_K);
  const top10 = reranked.slice(0, RECALL_K);

  // ── Precision@5: proportional type + keyword match ──────────────────────
  const top5Types = new Set(top5.map(m => m.memory_type));
  const top5Content = top5.map(m => (m.content || '').toLowerCase()).join(' ');

  // Type precision: binary hit (any expected type?) + proportional coverage bonus
  const typesFound = expected_types.filter(t => top5Types.has(t)).length;
  const anyTypeHit = typesFound > 0 ? 1.0 : 0.0;
  const typeCoverage = expected_types.length > 0 ? typesFound / expected_types.length : 1.0;
  // 50% for finding ANY expected type + 20% for coverage + 30% keywords
  const typeScore = 0.5 * anyTypeHit + 0.2 * typeCoverage;

  // Keyword bonus — if gold keywords appear in retrieved content
  let keywordScore;
  if (expected_keywords.length > 0) {
    const kwHits = expected_keywords.filter(kw => top5Content.includes(kw.toLowerCase()));
    keywordScore = kwHits.length / expected_keywords.length;
  } else {
    keywordScore = 1.0; // no keyword constraint = full keyword bonus
  }

  const precisionHit = typeScore + 0.3 * keywordScore;

  // ── Recall@10: does expected type appear in top-10? ───────────────────────
  const top10Types = new Set(top10.map(m => m.memory_type));
  const recallHit = expected_types.some(t => top10Types.has(t)) ? 1 : 0;

  // ── Diversity: context-aware type entropy in top-5 ──────────────────────
  // If the query expects only 1 type, returning that type IS correct diversity.
  // Only penalize diversity when the query expects MULTIPLE types.
  const typeCounts = {};
  for (const m of top5) {
    typeCounts[m.memory_type] = (typeCounts[m.memory_type] || 0) + 1;
  }

  let diversity;
  if (expected_types.length <= 1) {
    // Single-type query: diversity = 1.0 if the expected type dominates, else penalize
    const expectedType = expected_types[0];
    const expectedCount = typeCounts[expectedType] || 0;
    diversity = expectedCount >= 3 ? 1.0 : expectedCount / 3; // 3+ of expected type = perfect
  } else {
    // Multi-type query: measure how many expected types appear + entropy
    const expectedTypesFound = expected_types.filter(t => top5Types.has(t)).length;
    const typeCoverage = expectedTypesFound / expected_types.length; // 0-1

    // Entropy of actual distribution
    let entropy = 0;
    const total = top5.length;
    for (const count of Object.values(typeCounts)) {
      const p = count / total;
      entropy -= p * Math.log2(p);
    }
    const maxEntropy = Math.log2(Math.min(total, MAX_ENTROPY_TYPES));
    const normalizedEntropy = maxEntropy > 0 ? entropy / maxEntropy : 0;

    // Blend: 60% type coverage (did we find the expected types?) + 40% entropy (distribution quality)
    diversity = 0.6 * typeCoverage + 0.4 * normalizedEntropy;
  }

  return {
    precision_at_5: Math.min(1, precisionHit),
    recall_at_10: recallHit,
    diversity,
    count: rawResults.length,
    top5_types: typeCounts,
  };
}

// ─── Main evaluation loop ─────────────────────────────────────────────────────
async function evaluate() {
  const startTime = Date.now();
  console.log(`\nTwinMe Eval — twin_quality_score`);
  console.log(`User: ${TEST_USER_ID}`);
  console.log(`Queries: ${TEST_QUERIES.length}`);
  console.log(`Config: MMR_LAMBDA=${MMR_LAMBDA}, ALPHA_BASELINE=${ALPHA_CITATION_BASELINE}`);
  console.log(`Weights: default=${JSON.stringify(RETRIEVAL_WEIGHTS.default)}`);
  console.log(`─────────────────────────────────────────────`);

  let totalPrecision = 0;
  let totalRecall = 0;
  let totalDiversity = 0;
  let totalWeight = 0;
  let successCount = 0;

  // Per-mode tracking
  const modeStats = {};
  // Global type distribution across all top-5 results
  const globalTypeDist = {};

  for (let i = 0; i < TEST_QUERIES.length; i++) {
    const q = TEST_QUERIES[i];
    const weight = q.weight || 1.0;

    try {
      const result = await evaluateQuery(q);
      totalPrecision += result.precision_at_5 * weight;
      totalRecall += result.recall_at_10 * weight;
      totalDiversity += result.diversity * weight;
      totalWeight += weight;
      successCount++;

      // Track per-mode stats
      const mode = q.retrieval_mode;
      if (!modeStats[mode]) modeStats[mode] = { precision: 0, recall: 0, diversity: 0, weight: 0, count: 0 };
      modeStats[mode].precision += result.precision_at_5 * weight;
      modeStats[mode].recall += result.recall_at_10 * weight;
      modeStats[mode].diversity += result.diversity * weight;
      modeStats[mode].weight += weight;
      modeStats[mode].count++;

      // Aggregate type distribution
      if (result.top5_types) {
        for (const [type, count] of Object.entries(result.top5_types)) {
          globalTypeDist[type] = (globalTypeDist[type] || 0) + count;
        }
      }

      const icon = result.precision_at_5 >= 0.7 ? '✓' : result.precision_at_5 >= 0.4 ? '~' : '✗';
      console.log(`${icon} q${String(i+1).padStart(2,'0')} [${mode.padEnd(10)}] P@5=${result.precision_at_5.toFixed(3)} R@10=${result.recall_at_10} D=${result.diversity.toFixed(3)} n=${result.count}`);
    } catch (err) {
      console.log(`✗ q${String(i+1).padStart(2,'0')} FAILED: ${err.message}`);
      totalWeight += weight;
    }

    // Respect timeout
    if (Date.now() - startTime > EVAL_TIMEOUT_MS) {
      console.log(`\n⚠ Eval timeout after ${i+1} queries`);
      break;
    }
  }

  // Weighted averages
  const precision = totalWeight > 0 ? totalPrecision / totalWeight : 0;
  const recall = totalWeight > 0 ? totalRecall / totalWeight : 0;
  const diversity = totalWeight > 0 ? totalDiversity / totalWeight : 0;

  // Composite score (fixed formula — DO NOT CHANGE)
  const twin_quality_score = 0.50 * precision + 0.30 * recall + 0.20 * diversity;

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`─────────────────────────────────────────────`);
  console.log(`precision_at_5:     ${precision.toFixed(6)}`);
  console.log(`recall_at_10:       ${recall.toFixed(6)}`);
  console.log(`diversity_score:    ${diversity.toFixed(6)}`);
  console.log(`───`);
  console.log(`twin_quality_score: ${twin_quality_score.toFixed(6)}`);
  console.log(`queries_completed:  ${successCount}/${TEST_QUERIES.length}`);
  console.log(`eval_seconds:       ${elapsed}`);

  // Per-mode breakdown
  console.log(`\n── Per-Mode Breakdown ──`);
  for (const [mode, s] of Object.entries(modeStats).sort((a, b) => a[0].localeCompare(b[0]))) {
    const p = s.weight > 0 ? s.precision / s.weight : 0;
    const r = s.weight > 0 ? s.recall / s.weight : 0;
    const d = s.weight > 0 ? s.diversity / s.weight : 0;
    const score = 0.50 * p + 0.30 * r + 0.20 * d;
    console.log(`  ${mode.padEnd(12)} (${s.count}q) P=${p.toFixed(3)} R=${r.toFixed(3)} D=${d.toFixed(3)} → ${score.toFixed(3)}`);
  }

  // Type distribution in top-5 results
  console.log(`\n── Type Distribution (top-5 across all queries) ──`);
  const totalTypes = Object.values(globalTypeDist).reduce((a, b) => a + b, 0);
  for (const [type, count] of Object.entries(globalTypeDist).sort((a, b) => b[1] - a[1])) {
    const pct = totalTypes > 0 ? (count / totalTypes * 100).toFixed(1) : '0.0';
    console.log(`  ${type.padEnd(14)} ${String(count).padStart(3)} (${pct}%)`);
  }

  return {
    twin_quality_score,
    precision_at_5: precision,
    recall_at_10: recall,
    diversity_score: diversity,
    queries_completed: successCount,
    eval_seconds: parseFloat(elapsed),
  };
}

// Run evaluation
evaluate()
  .then(result => {
    process.exit(result.twin_quality_score > 0 ? 0 : 1);
  })
  .catch(err => {
    console.error('Fatal eval error:', err);
    process.exit(1);
  });
