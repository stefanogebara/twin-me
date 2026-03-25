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
 * BASELINE: insight_quality_score = 0.631 (peak), 0.592 (mean over 85 runs)
 * Variance band: 0.549 – 0.631 (stochastic LLM judge, Mistral Small Creative)
 *
 * RESEARCH FINDINGS (2026-03-25, 85 eval runs across 6 experiments):
 *   - Eval judges EXISTING insights from DB; config does NOT affect eval scores
 *   - Score variance is ~0.08 range per run (LLM judge non-determinism)
 *   - PARSE_FAILED (judge wraps JSON in markdown) drops score ~0.03-0.04
 *   - Dimension averages: specificity=0.54, actionability=0.44, personality=0.85, timing=0.52
 *   - Biggest improvement levers: specificity (35% weight) and actionability (25% weight)
 *   - "briefing" insights score 0.78 avg; "celebration" insights score 0.45 avg
 *
 * RECOMMENDED PRODUCTION CONFIG (changes from original baseline):
 *   - Stronger specificity: 3 data citations mandatory (was 2)
 *   - Explicit actions: "do X tonight" not "consider X"
 *   - Cross-platform requirement: 2+ sources per insight
 *   - Quality gate: reject vague language ("lately", "patterns suggest")
 *   - Temperature 0.65 (slightly more focused than 0.7)
 *   - Stricter dedup 0.50 (was 0.40, filters repetitive vague insights)
 *   - More memory context: 250 memories (was 200), 12 reflections (was 10)
 */

// ─── Insight Generation Prompt ──────────────────────────────────────────────
// The system prompt template used to generate proactive insights.
// {observations} and {reflections} are replaced with actual data at runtime.
// The research agent can modify this to improve specificity, actionability, etc.
export const INSIGHT_PROMPT_TEMPLATE = `You are a digital twin that deeply knows this person. Generate 2-3 proactive insights based on their recent activity and patterns.

STRUCTURE EACH INSIGHT AS: [observation with data] + [concrete action to take now]

HARD REQUIREMENTS:
1. EVERY insight MUST cite at least 3 specific data points: exact numbers ("42% recovery", "3 meetings"), real names ("Radiohead", "Seatable"), dates ("last Tuesday", "past 3 days"), or platform names ("your Spotify", "GitHub").
2. EVERY insight MUST end with a concrete action: "do X tonight", "try Y tomorrow", "block Z hours this weekend". No "consider" or "maybe" — state what to do.
3. EVERY insight MUST connect data from 2+ sources (music + health, calendar + sleep, GitHub + energy, etc.).
4. Tone: close friend texting — casual, warm, slightly teasing. Never clinical, never jargon.
5. Time-aware: reference morning/evening/day-of-week. Make advice timely.
6. Max 2 sentences. No bullet points, no headers.

QUALITY GATE — reject any insight that:
- Uses vague words: "lately", "sometimes", "patterns suggest", "might benefit"
- Has zero numbers
- References only one platform
- Offers no specific next step

Examples:
  "you've had 3 meetings before 9am this week and your recovery dropped to 42% — push tomorrow's standup to 10"
  "noticed you saved OK Computer last Tuesday but haven't played it — tonight after 7 your calendar is clear, put it on"
  "your GitHub commits jumped 40% this weekend while Spotify went full lo-fi — deep work mode, but block 2 hours Sunday for a real break"

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
export const INSIGHT_TEMPERATURE = 0.65;

// Max tokens for the insight generation response.
// Range: [100, 500]
export const INSIGHT_MAX_TOKENS = 200;

// ─── Quality Gates ──────────────────────────────────────────────────────────

// Minimum number of specific data citations (numbers, names, dates) required
// in an insight for it to be considered "specific enough".
// Range: [0, 5]
export const MIN_DATA_POINTS_REQUIRED = 3;

// How strongly the user's personality/soul signature is injected into the
// generation prompt. 0.0 = generic tone, 1.0 = full personality injection.
// Range: [0.0, 1.5]
export const PERSONALITY_INJECTION_STRENGTH = 1.0;

// ─── Memory Retrieval for Insight Generation ────────────────────────────────

// How many recent memories to scan when building insight context.
// Higher = more data to work with, but more noise and cost.
// Range: [50, 500]
export const MEMORIES_TO_SCAN = 250;

// How many reflections to include as "known patterns" context.
// Range: [3, 20]
export const REFLECTIONS_TO_INCLUDE = 12;

// ─── Dedup and Filtering ────────────────────────────────────────────────────

// Cosine similarity threshold for deduplicating insights against recent ones.
// Higher = stricter dedup (fewer duplicates, but may reject good insights).
// Range: [0.3, 0.8]
export const DEDUP_THRESHOLD = 0.50;
