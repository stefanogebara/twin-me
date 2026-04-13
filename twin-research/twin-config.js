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
 * SESSION 8: Sampling parameter tuning — targeting chat quality (knowledge accuracy weakest at 0.766).
 *   Best win: temp_delta -0.05 + freq_penalty_delta +0.10 → chat=0.912 (baseline 0.865, +0.047).
 *   Knowledge accuracy 0.766→0.845, authenticity 0.959→1.000, personality fidelity 0.852→0.900.
 *   8 experiments: temp, freq_pen, oracle strength, budgets (2x), neurotransmitter, temp/freq extremes.
 *   Discarded: oracle 0.8 (needs full strength), budget shifts (reflections>facts), extreme sampling.
 * SESSION 9: Phase A param tuning. Retrieval baseline ~0.871 (25 queries, DB state 2026-03-26).
 *   BM25/TCM/STDP params not used by eval (only live service) — skipped.
 *   Best win: MMR_LAMBDA 0.30→0.35 → avg ~0.876 (+0.005, 3 runs: 0.884/0.869/0.876).
 *   Eval variance ~±0.015 per run (embedding API non-determinism on q10/q14/q25).
 *   9 experiments: MMR_LAMBDA (0.35 kept, 0.40 too far), TDW (0.55/0.75 both worse),
 *   temporal (0.10/0.20 worse), semantic (0.05 worse), identity importance (1.8 worse),
 *   default weight swap (worse), recent importance 0.8 (worse).
 *   Config space near-exhausted for single-param changes on retrieval eval.
 * SESSION 10: Retrieval baseline 0.866 avg (main branch, DB state 2026-04-13).
 *   Confirmed: HYDE/STDP/BM25/TCM/MIN_COSINE not used by eval — only 6 params matter.
 *   Key insight: importance=0.0 for identity mode = pure semantic → +0.007 diversity gain.
 *   Key insight: TDW 0.65→0.55 better with pure-semantic identity weights (+0.004 combined).
 *   27 experiments. Kept: identity { importance:0.0 relevance:1.5 }, TDW 0.55, default/recent relevance bumps.
 *   Session best: 0.8745 avg (3 runs: 0.8738/0.8760/0.8738). DB state 2026-04-13 (main branch).
 * SESSION 11: 68 experiments. Score plateau 0.874628 fully mapped. All 6 params exhausted.
 *   Simplifications: identity 1.5→1.2 (same as default/recent), reflection 1.8→1.5 (same range).
 *   Flat zones confirmed: MMR [0.30, 0.37], TDW [0.52, 0.60], TEMPORAL [0.07, 0.20].
 *   Narrow optima: ALPHA=0.90 (0.85/0.95 regress), TEMPORAL>0 required (0.0 regresses).
 *   To break plateau: new gold queries, DB state change, or eval methodology change required.
 * SESSION 12 BEST: 0.8818 (precision=0.882, recall=1.000, diversity=0.704) — DB state 2026-04-13.
 *   KEY DISCOVERIES: previous session mapped "flat zones" but missed the global optima outside those zones.
 *   Win 1: TEMPORAL 0.15→0.30 (at max of defined range) → avg 0.8768 (+0.003). Sharp peak — 0.28/0.32 both worse.
 *   Win 2: MMR_LAMBDA 0.35→0.15 → avg 0.8818 (+0.005). Flat zone [0.30,0.37] was local plateau, global optimum at 0.15.
 *     MMR sweep: 0.10(worse), 0.12(worse), 0.15(PEAK, flat [0.15,0.17]), 0.20(slight worse), 0.25(worse).
 *   Win 3: TDW 0.55→0.70 → marginal +0.0002. Flat zone [0.65, 0.75]. 0.80+ hurts diversity (pool constraint).
 *   Simplification: reflection relevance 1.5→1.2 — with MMR=0.15, all 4 modes now uniform at 1.2 (same score).
 *   TEMPORAL flat zone widened: with MMR=0.15+TDW=0.70, TEMPORAL [0.25,0.35] all give 0.8818 (was sharp peak at 0.30).
 *   ALPHA=0.90 still narrow optimum. SEMANTIC=0.0 still best. MIN_COSINE=0.0 (filter has no effect).
 *   Insight: lower MMR lambda (more diversity pressure) consistently helps until floor at 0.15. Below=precision loss.
 */

// ─── Retrieval Weights ────────────────────────────────────────────────────────
// Three-factor scoring: score = w_recency * norm(recency)
//                             + w_importance * norm(importance)
//                             + w_relevance * norm(relevance)
// Each weight can be [0.0, 2.0]. Values outside this range may destabilize retrieval.

export const RETRIEVAL_WEIGHTS = {
  // All general modes: pure semantic, relevance=1.2 (no recency, no importance).
  // Identity/default/recent are all equivalent — the relevance multiplier only scales cosine
  // similarity, which doesn't change ranking within a mode. Only reflection is special (1.8).
  default:    { recency: 0.0, importance: 0.0, relevance: 1.2 },
  identity:   { recency: 0.0, importance: 0.0, relevance: 1.2 },
  recent:     { recency: 0.0, importance: 0.0, relevance: 1.2 },

  // Deep pattern analysis — reflection mode needs higher relevance than general modes.
  // Range [1.5, 1.8] gives same score; outside this range hurts precision.
  reflection: { recency: 0.0, importance: 0.0, relevance: 1.2 },
};

// ─── MMR Diversity ───────────────────────────────────────────────────────────
// Maximum Marginal Relevance lambda.
// 0.0 = pure diversity (maximize spread across topics)
// 1.0 = pure relevance (return top-ranked by score only)
// Range: [0.0, 1.0]
export const MMR_LAMBDA = 0.15;

// Type diversity weight for MMR reranking.
// Penalizes selecting memories of a type already over-represented in the selected set.
// Penalty = TYPE_DIVERSITY_WEIGHT * (count_same_type / selected_so_far)
// 0.0 = no type penalty (original MMR). Higher = stronger type diversity pressure.
// Range: [0.0, 0.5]
export const TYPE_DIVERSITY_WEIGHT = 0.70;

// ─── HyDE (Hypothetical Document Embedding) ──────────────────────────────────
// Generate a hypothetical memory that answers the query, embed THAT alongside
// the raw query. Dual-embedding retrieval surfaces diverse memory types.
// Cost: ~$0.0001 per query (1 EXTRACTION_TIER LLM call).
export const HYDE_ENABLED = true;

// ─── Semantic Diversity ───────────────────────────────────────────────────────
// Penalize selecting memories with high cosine similarity to already-selected
// memories of the SAME TYPE. Breaks intra-type clustering in MMR.
// 0.0 = disabled. Range: [0.0, 0.5]
export const SEMANTIC_DIVERSITY_WEIGHT = 0.0;

// ─── Temporal Diversity ──────────────────────────────────────────────────────
// Bonus for selecting memories from underrepresented time buckets in MMR.
// Buckets: recent (0-7d), medium (7-30d), archive (30+d).
// 0.0 = disabled. Range: [0.0, 0.3]
export const TEMPORAL_DIVERSITY_WEIGHT = 0.30;

// ─── Post-Retrieval Cosine Filter ────────────────────────────────────────────
// Drop candidates whose raw cosine similarity to the query embedding falls below
// this minimum BEFORE BM25/TCM/STDP rescoring and MMR reranking.
// Removes noisy low-relevance memories from the candidate pool.
// 0.0 = disabled (no filtering). Range: [0.0, 0.5]
export const MIN_COSINE_SIMILARITY = 0.0;

// ─── Alpha Blending ───────────────────────────────────────────────────────────
// Baseline for computeAlpha() citation boost.
// Formula: confidence * (importance/10) * min(1, CITATION_BASELINE + 0.05 * retrieval_count)
// Higher baseline = first-retrieval memories get more weight in context.
// Range: [0.5, 1.0]
export const ALPHA_CITATION_BASELINE = 0.90;

// ─── Memory Context Budgets ───────────────────────────────────────────────────
// Max memories of each type to include in the twin's context window.
// Total should stay around 20-25 to avoid context overflow.
export const MEMORY_CONTEXT_BUDGETS = {
  reflections:   3,
  platform_data: 6,
  facts:         5,
  conversations: 10,
};

// ─── LLM Memory Reranker ─────────────────────────────────────────────────────
// Post-MMR reranking pass using a lightweight LLM to select the most relevant
// memories from candidates. Adds ~1-2s latency per retrieval (cached).
// Cost: ~$0.0001 per query (EXTRACTION_TIER, Mistral Small).
export const LLM_RERANKER_ENABLED = false;

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
  dedup_threshold: 0.40,
};

// ─── Sampling Parameter Overrides ─────────────────────────────────────────────
// Additive deltas applied on top of OCEAN-derived personality params.
// Lets the research agent fine-tune the twin's voice without retraining OCEAN.
// Range: [-0.2, +0.2] for each
export const SAMPLING_OVERRIDES = {
  temperature_delta: -0.05,
  top_p_delta: -0.03,
  frequency_penalty_delta: 0.10,
  presence_penalty_delta: 0.20,
};

// ─── BM25 Lexical Scoring (TiMem, arXiv 2601.02845) ──────────────────────────
// Weight of BM25 lexical score blended with semantic cosine similarity.
// Combined: relevance = (1 - BM25_BLEND) * semantic + BM25_BLEND * lexical
// Range: [0.0, 0.3]. Higher = more lexical influence.
export const BM25_BLEND_WEIGHT = 0.10;
export const BM25_K1 = 1.5;   // term frequency saturation
export const BM25_B = 0.75;   // length normalization strength

// ─── Temporal Context Model (TCM, TRIBE v2-inspired) ──────────────────────────
// Weight of TCM contextual similarity in the final scoring formula.
// 0.0 = disabled (pure 3-factor). Range: [0.0, 0.5].
export const TCM_WEIGHT = 0.15;
// Drift rate: how fast the running context vector moves toward new retrieval.
// 1.0 = full history (no drift). 0.0 = only latest retrieval.
export const TCM_DRIFT_RATE = 0.85;

// ─── STDP Co-Retrieval Boost ──────────────────────────────────────────────────
// Boost to importance for memories with strong co-citation links
// to other memories in the current retrieval set.
// 0.0 = disabled. Range: [0.0, 0.3].
export const STDP_CORETRIEVAL_BOOST = 0.10;

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
