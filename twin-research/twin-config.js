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
 * BASELINE: twin_quality_score = 0.740165
 * SESSION 1 BEST: 0.827608 (identity {recency:0.0, importance:2.0, relevance:1.2} + MMR=0.5) — DB state 2026-03-11
 * SESSION 2 BEST: 0.801600 (+ recent recency=0.0) — DB state 2026-03-12 (q13 recall fixed, q18 structural gap)
 * SESSION 3 BEST: 0.837 (25 queries, type-aware MMR, q18 gold fix, DB dedup, eval v2) — DB state 2026-03-12
 * SESSION 4 BEST: 0.845 (conversation boost: confidence 0.60→0.75, decay 3→14d, direct retrieval) — DB state 2026-03-12
 * Key insight: recency=0 consistently wins. Reflection decay_rate=90 makes recency bias favor reflections.
 * Type-aware MMR: TYPE_DIVERSITY_WEIGHT=0.25 breaks diversity ceiling from 0.46 → 0.49 without hurting precision.
 * Conversation boost: direct importance+recency queries instead of semantic search (reflections dominated). Conv share 2.4%→21.6%.
 * SESSION 5 BEST: 0.852 (TYPE_DIVERSITY_WEIGHT 0.25->0.35) — DB state 2026-03-13 (5237 memories)
 * Session 5: TDW=0.35 only clear win. Eval variance ~+-0.014. All weight presets near-optimal.
 * SESSION 6: Wired config into live memoryStreamService.js (TDW 0.25→0.35 live fix).
 * SESSION 7: LLM-as-judge chat eval added (DeepSeek gen+judge, 15 fast / 25 full prompts).
 *   Combined score: 0.4*retrieval + 0.6*chat. Chat baseline: 0.870.
 *   Only win: presence_penalty_delta +0.15 → 0.875 (knowledge +0.039, confirmed).
 *   10 experiments: sampling params, oracle, budgets, neuropils, neurotransmitters — all near-optimal.
 *   Eval variance ~+-0.014. Config parameter space exhausted for single-param changes.
 * SESSION 8: System prompt engineering — targeting knowledge accuracy (weakest at 0.793).
 */

// ─── Retrieval Weights ────────────────────────────────────────────────────────
// Three-factor scoring: score = w_recency * norm(recency)
//                             + w_importance * norm(importance)
//                             + w_relevance * norm(relevance)
// Each weight can be [0.0, 2.0]. Values outside this range may destabilize retrieval.

export const RETRIEVAL_WEIGHTS = {
  // Balanced weights — general conversation
  default: { recency: 0.0, importance: 1.0, relevance: 1.0 },

  // Identity queries (who is this person?) — relevance+importance dominant, no recency.
  // Used by: twin summary generation, personality queries
  identity: { recency: 0.0, importance: 2.0, relevance: 1.2 },

  // Recent context — counterintuitively, recency=0 works best.
  // Reflection decay_rate=90 makes recency bias bury platform_data/conversations.
  // Pure semantic matching surfaces diverse types. (Session 2 finding: +2pts)
  recent: { recency: 0.0, importance: 0.5, relevance: 1.0 },

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

// Type diversity weight for MMR reranking.
// Penalizes selecting memories of a type already over-represented in the selected set.
// Penalty = TYPE_DIVERSITY_WEIGHT * (count_same_type / selected_so_far)
// 0.0 = no type penalty (original MMR). Higher = stronger type diversity pressure.
// Range: [0.0, 0.5]
export const TYPE_DIVERSITY_WEIGHT = 0.55;

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
  facts:         5,
  conversations: 6,
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

// ─── Sampling Parameter Overrides ─────────────────────────────────────────────
// Additive deltas applied on top of OCEAN-derived personality params.
// Lets the research agent fine-tune the twin's voice without retraining OCEAN.
// Range: [-0.2, +0.2] for each
export const SAMPLING_OVERRIDES = {
  temperature_delta: 0.0,
  top_p_delta: 0.0,
  frequency_penalty_delta: 0.0,
  presence_penalty_delta: 0.15,
};

// ─── Oracle Integration ───────────────────────────────────────────────────────
// Controls personality oracle draft injection strength.
// 0.0 = oracle block omitted from system prompt entirely
// 1.0 = full oracle block injected as-is
// Range: [0.0, 1.0]
export const ORACLE_INTEGRATION_STRENGTH = 1.0;

// ─── Chat Eval Weights ──────────────────────────────────────────────────────
// Combined score = retrieval_weight * retrieval_score + chat_weight * chat_score
export const EVAL_WEIGHTS = {
  retrieval: 0.4,
  chat: 0.6,
};
