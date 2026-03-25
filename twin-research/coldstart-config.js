/**
 * Cold Start Quality — Research Config
 * ======================================
 * This is the ONLY file the research agent modifies for cold start experiments.
 * All tunable hyperparameters for first-60-seconds experience live here.
 *
 * Modified by: twin-research agent (autonomous loop)
 * Evaluated by: coldstart-eval.js (DO NOT MODIFY coldstart-eval.js)
 * Metric: coldstart_quality_score (0.0 – 1.0, HIGHER = better)
 *
 * BASELINE: coldstart_quality_score = 0.790 (original)
 * BEST:     coldstart_quality_score = 0.935 (exp8: accuracy-guard prompt, enrichment=0.3, temp=0.3, max_per_type=20)
 */

// ─── Memory Limits ──────────────────────────────────────────────────────────

// How many of the user's earliest memories (by created_at ASC) to use
// when simulating the cold start experience.
// Lower = harder challenge (less data to work with).
// Range: [10, 200]
export const INITIAL_MEMORY_LIMIT = 75;

// ─── Data Weighting ─────────────────────────────────────────────────────────

// How much to weight enrichment data (email lookup, GitHub, social profiles)
// vs platform data (Spotify, Calendar, Whoop) when building initial profile.
// 0.0 = platform data only, 1.0 = enrichment only, 0.5 = equal blend.
// Range: [0.0, 1.0]
export const ENRICHMENT_WEIGHT = 0.3;

// ─── Soul Signature Summary Prompt ──────────────────────────────────────────
// The prompt used to generate the initial soul signature from limited data.
// {memories} is replaced with the first N memories at runtime.
// {core_blocks} is replaced with any core memory blocks available.
export const SUMMARY_PROMPT_TEMPLATE = `You are building a first impression of someone based on limited data. Your goal is to create a soul signature that would make this person say "wow, it already gets me" within 60 seconds.

RULES:
- Lead with the most SURPRISING or NON-OBVIOUS insight you can extract
- Use specific details from the data — names, numbers, patterns
- Write in second person ("you") as if speaking directly to the person
- Keep it to 3-5 sentences that capture their ESSENCE, not a resume
- Prioritize personality patterns over factual lists
- If you see platform data, connect it to personality traits
- Sound warm and perceptive, like a friend who just "gets" them
- ACCURACY GUARD: Every claim must trace to specific data below. Do not invent traits, overstate intentionality, or attribute motivations not evidenced. If unsure, omit rather than guess.
- Do NOT reference raw OCEAN scores or technical metadata — translate patterns into natural language only.

Available data (early memories — this is all we have):
{memories}

Core identity blocks:
{core_blocks}

Write a soul signature summary that would impress this person on first sight:`;

// ─── Sampling Parameters ────────────────────────────────────────────────────

// Temperature for soul signature generation.
// Higher = more creative/surprising, lower = more safe/predictable.
// Range: [0.3, 0.9]
export const SUMMARY_TEMPERATURE = 0.3;

// Max tokens for the summary response.
// Range: [100, 800]
export const SUMMARY_MAX_TOKENS = 500;

// ─── Memory Selection Strategy ──────────────────────────────────────────────

// Whether to prioritize diverse memory types in the cold start window.
// true = ensure mix of facts, platform_data, observations.
// false = take whatever comes first chronologically.
export const PRIORITIZE_TYPE_DIVERSITY = true;

// If PRIORITIZE_TYPE_DIVERSITY is true, max memories of any single type.
// Prevents the cold start from being all facts or all platform_data.
// Range: [5, 30]
export const MAX_PER_TYPE = 20;
