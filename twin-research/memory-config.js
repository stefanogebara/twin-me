/**
 * Memory Retrieval Relevance — Research Config
 * ==============================================
 * This is the ONLY file the research agent modifies for retrieval relevance experiments.
 * All tunable hyperparameters for memory retrieval quality live here.
 *
 * Modified by: twin-research agent (autonomous loop)
 * Evaluated by: memory-eval.js (DO NOT MODIFY memory-eval.js)
 * Metric: memory_relevance_score (0.0 – 1.0, HIGHER = better)
 *
 * NOTE: This is SEPARATE from twin-config.js which tunes the existing twin-eval.js
 * (type distribution metrics). This config tunes CONTENT relevance of retrieved memories.
 *
 * BASELINE: memory_relevance_score = 0.490 (original)
 * PREVIOUS BEST: 0.522-0.530 (relevance-dominant config, 2026-03-25)
 * CURRENT BEST: 0.540 (reduced diversity + faster freshness decay, 2026-03-26)
 */

// ─── Retrieval Parameters ───────────────────────────────────────────────────

// Number of memories to retrieve per query.
// Range: [5, 30]
export const RETRIEVAL_LIMIT = 10;

// Minimum cosine similarity score to include a memory in results.
// Lower = more results but more noise. Higher = fewer but more precise.
// Range: [0.0, 0.7]
export const RELEVANCE_THRESHOLD = 0.45;

// ─── Freshness Control ──────────────────────────────────────────────────────

// Exponential decay rate for memory freshness.
// Applied as: freshness = FRESHNESS_DECAY_RATE ^ days_since_last_access
// 1.0 = no decay (all equally fresh). 0.99 = gentle decay. 0.95 = aggressive decay.
// Range: [0.95, 1.0]
export const FRESHNESS_DECAY_RATE = 0.990;

// ─── Reranking ──────────────────────────────────────────────────────────────

// Whether to apply type-based reranking after retrieval.
// When true, adjusts scores to promote diversity of memory types.
export const TYPE_RERANKING_ENABLED = true;

// Weight for diversity in the reranking formula.
// 0.0 = pure relevance ranking. 1.0 = maximum diversity pressure.
// Range: [0.0, 1.0]
export const DIVERSITY_RERANKING_WEIGHT = 0.3;

// ─── Retrieval Weights ──────────────────────────────────────────────────────
// Three-factor scoring weights for the search_memory_stream RPC.
// Format: { recency, importance, relevance }

export const RETRIEVAL_WEIGHTS = {
  recency: 0.0,
  importance: 0.4,
  relevance: 2.2,
};

// ─── BM25 Lexical Scoring (TiMem) ───────────────────────────────────────
// Mirrors twin-config.js defaults for the memory eval harness.
export const BM25_BLEND_WEIGHT = 0.10;
export const BM25_K1 = 1.5;
export const BM25_B = 0.75;

// ─── Temporal Context Model (TCM) ──────────────────────────────────────
export const TCM_WEIGHT = 0.15;
export const TCM_DRIFT_RATE = 0.85;

// ─── STDP Co-Retrieval Boost ───────────────────────────────────────────
export const STDP_CORETRIEVAL_BOOST = 0.10;

// ─── MMR Parameters ─────────────────────────────────────────────────────────

// MMR lambda for content relevance evaluation.
// 0.0 = pure diversity, 1.0 = pure relevance.
// Range: [0.0, 1.0]
export const MMR_LAMBDA = 0.8;

// Type diversity weight in MMR reranking.
// Range: [0.0, 0.8]
export const TYPE_DIVERSITY_WEIGHT = 0.1;
