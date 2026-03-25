/**
 * Proactive Insight Quality — Research Config
 * =============================================
 * This is the ONLY file the research agent modifies for insight quality experiments.
 * All tunable hyperparameters for proactive insight generation live here.
 *
 * Modified by: twin-research agent (autonomous loop)
 * Evaluated by: insight-eval.js (DO NOT MODIFY insight-eval.js)
 * Metric: insight_quality_score (0.0 – 1.0, HIGHER = better)
 *
 * BASELINE: insight_quality_score = TBD (run first eval to establish)
 */

// ─── Insight Generation Prompt ──────────────────────────────────────────────
// The system prompt template used to generate proactive insights.
// {observations} and {reflections} are replaced with actual data at runtime.
// The research agent can modify this to improve specificity, actionability, etc.
export const INSIGHT_PROMPT_TEMPLATE = `You are a digital twin that deeply knows this person. Generate 2-3 proactive insights based on their recent activity and patterns.

RULES:
- Cite SPECIFIC data points: numbers, dates, names, platforms, songs, events
- Make each insight ACTIONABLE — the user should be able to DO something with it
- Sound like a close friend who genuinely knows them, not a wellness app
- Reference the TIME context — what's relevant right now (morning, evening, weekday, weekend)
- Max 2 sentences per insight. No bullet points, no headers, no jargon.
- Connect dots across platforms when possible (music + health, calendar + sleep, etc.)

Good examples:
  "you've had 3 meetings before 9am this week and your recovery dropped to 42% — maybe push tomorrow's standup to 10?"
  "noticed you saved that Radiohead album last Tuesday but never played it — tonight might be a good time"
  "your GitHub commits spiked this weekend while your Spotify went full lo-fi — deep work mode activated"

Bad examples (too generic):
  "you should take care of yourself"
  "your patterns suggest you might benefit from more rest"
  "consider adjusting your schedule"

Recent observations:
{observations}

Known patterns:
{reflections}

Return ONLY a JSON array:
[{"insight": "...", "urgency": "low|medium|high", "category": "trend|anomaly|nudge|celebration|concern"}]`;

// ─── Sampling Parameters ────────────────────────────────────────────────────

// Temperature for insight generation LLM call.
// Higher = more creative/varied insights, lower = more predictable/safe.
// Range: [0.3, 1.0]
export const INSIGHT_TEMPERATURE = 0.7;

// Max tokens for the insight generation response.
// Range: [100, 500]
export const INSIGHT_MAX_TOKENS = 200;

// ─── Quality Gates ──────────────────────────────────────────────────────────

// Minimum number of specific data citations (numbers, names, dates) required
// in an insight for it to be considered "specific enough".
// Range: [0, 5]
export const MIN_DATA_POINTS_REQUIRED = 2;

// How strongly the user's personality/soul signature is injected into the
// generation prompt. 0.0 = generic tone, 1.0 = full personality injection.
// Range: [0.0, 1.5]
export const PERSONALITY_INJECTION_STRENGTH = 1.0;

// ─── Memory Retrieval for Insight Generation ────────────────────────────────

// How many recent memories to scan when building insight context.
// Higher = more data to work with, but more noise and cost.
// Range: [50, 500]
export const MEMORIES_TO_SCAN = 200;

// How many reflections to include as "known patterns" context.
// Range: [3, 20]
export const REFLECTIONS_TO_INCLUDE = 10;

// ─── Dedup and Filtering ────────────────────────────────────────────────────

// Cosine similarity threshold for deduplicating insights against recent ones.
// Higher = stricter dedup (fewer duplicates, but may reject good insights).
// Range: [0.3, 0.8]
export const DEDUP_THRESHOLD = 0.40;
