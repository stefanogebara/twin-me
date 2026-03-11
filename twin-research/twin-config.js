/**
 * TwinMe Research Config
 * ======================
 * This is the ONLY file the research agent modifies.
 * All tunable hyperparameters for twin quality live here.
 *
 * Modified by: twin-research agent (autonomous loop)
 * Evaluated by: twin-eval.js (DO NOT MODIFY twin-eval.js)
 * Metric: twin_quality_score (0.0 – 1.0, HIGHER = better)
 *
 * HOW IT WORKS:
 *   api/services/*.js imports constants from this file instead of
 *   hardcoding them. The agent changes values here → re-runs eval →
 *   keeps changes if score improves, otherwise git reset.
 *
 * SIMPLICITY CRITERION:
 *   All else equal, simpler is better. A tiny gain that adds ugly
 *   complexity is not worth it. Removing parameters and matching or
 *   beating the score is a simplification win.
 *
 * BASELINE: twin_quality_score = 0.740165 → BEST: 0.827608 (identity {recency:0.0, importance:2.0, relevance:1.2} + MMR=0.5)
 * Perfect recall (1.000) achieved. Search space converged — any perturbation breaks recall gate.
 */

// ─── Retrieval Weights ────────────────────────────────────────────────────────
// Three-factor scoring: score = w_recency * norm(recency)
//                             + w_importance * norm(importance)
//                             + w_relevance * norm(relevance)
// Each weight can be [0.0, 2.0]. Values outside this range may destabilize retrieval.

export const RETRIEVAL_WEIGHTS = {
  // Balanced weights — general conversation
  default: { recency: 1.0, importance: 1.0, relevance: 1.0 },

  // Identity queries (who is this person?) — relevance+importance dominant, no recency.
  // Used by: twin summary generation, personality queries
  identity: { recency: 0.0, importance: 2.0, relevance: 1.2 },

  // Recent context (what's happening now?) — recency dominant.
  // Used by: proactive insights, "how are you?" queries
  recent: { recency: 1.0, importance: 0.5, relevance: 0.7 },

  // Deep pattern analysis — no recency bias (Paper 2 style).
  // Used by: reflection engine expert personas
  reflection: { recency: 0.0, importance: 0.5, relevance: 1.5 },
};

// ─── MMR Diversity ───────────────────────────────────────────────────────────
// Maximum Marginal Relevance lambda.
// 0.0 = pure diversity (maximize spread across topics)
// 1.0 = pure relevance (return top-ranked by score only)
// Range: [0.0, 1.0]
export const MMR_LAMBDA = 0.5;

// ─── Alpha Blending ───────────────────────────────────────────────────────────
// Baseline for computeAlpha() citation boost.
// Formula: confidence * (importance/10) * min(1, CITATION_BASELINE + 0.05 * retrieval_count)
// Higher baseline = first-retrieval memories get more weight in context.
// Range: [0.5, 1.0]
export const ALPHA_CITATION_BASELINE = 0.85;

// ─── Memory Context Budgets ───────────────────────────────────────────────────
// Max memories of each type to include in the twin's context window.
// Total should stay around 20-25 to avoid context overflow.
export const MEMORY_CONTEXT_BUDGETS = {
  reflections:   5,
  platform_data: 4,
  facts:         6,
  conversations: 4,
};

// ─── Reflection Engine ────────────────────────────────────────────────────────
export const REFLECTION_CONFIG = {
  // Trigger reflection after this much accumulated importance in recent memories.
  // Lower = more frequent reflections (more insights, more cost).
  // Higher = deeper accumulation before insight (coarser but richer).
  // Range: [20, 80]
  importance_threshold: 40,

  // Max recursive reflection depth (reflections generating reflections).
  // Range: [1, 5]
  max_depth: 3,

  // Min memories an expert needs to generate useful insights.
  // Range: [3, 10]
  min_evidence_memories: 5,

  // Memories fetched per expert domain during reflection.
  // Range: [10, 40]
  memories_per_expert: 20,
};

// ─── Neuropil Routing Weights ─────────────────────────────────────────────────
// Per-domain retrieval weight overrides for the 5 brain neuropils.
// Format: [recency, importance, relevance]
export const NEUROPIL_WEIGHTS = {
  personality: [0.3, 0.8, 1.0],
  lifestyle:   [1.0, 0.5, 0.8],
  cultural:    [0.5, 0.7, 1.0],
  social:      [0.7, 0.6, 1.0],
  motivation:  [0.8, 0.7, 1.0],
};

// ─── Neurotransmitter Modulation ──────────────────────────────────────────────
// Additive parameter deltas on top of OCEAN-derived personality params.
// Detected by keyword matching (min_keyword_matches required to activate).
export const NEUROTRANSMITTER_CONFIG = {
  min_keyword_matches: 2,
  serotonin:     { temp_delta: +0.05, freq_pen_delta: -0.08, pres_pen_delta: +0.05 },
  dopamine:      { temp_delta: -0.08, top_p_delta: -0.03, freq_pen_delta: +0.08, pres_pen_delta: -0.05 },
  noradrenaline: { temp_delta: +0.10, top_p_delta: +0.05, freq_pen_delta: +0.03, pres_pen_delta: +0.03 },
};

// ─── Proactive Insights ───────────────────────────────────────────────────────
export const PROACTIVE_INSIGHTS_CONFIG = {
  // How many recent memories to scan when generating insights.
  max_memories_scan: 200,

  // Max insights generated per invocation.
  max_insights_per_run: 3,

  // Dedup threshold — insights with cosine similarity above this are skipped.
  // Range: [0.3, 0.8]
  dedup_threshold: 0.50,
};
