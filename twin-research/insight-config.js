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
 * SESSION 2 FINDINGS (2026-03-26, 9 eval runs across 7 experiments):
 *   - Confirmed: ALL config changes produce scores within noise band (0.603-0.624)
 *   - Baseline score today: 0.6155 (consistent with historical mean ~0.592)
 *   - temp=0.50: 0.604 (WORSE — less creative, specificity dropped)
 *   - max_tokens=300: 0.607 (NO EFFECT — only affects future generation)
 *   - temp=0.75+personality=1.3: 0.618 avg over 2 runs (NOISE — within band)
 *   - Aggressive prompt rewrite: 0.603 (WORSE — personality dropped to 0.83)
 *   - memories=400+reflections=18: 0.615 (NO EFFECT on existing insights)
 *   - min_data=4+dedup=0.60: 0.615 (NO EFFECT on existing insights)
 *   - Balanced config (temp=0.70/pers=1.1/dedup=0.55/mem=300/ref=15): 0.616 (NOISE)
 *   - CONCLUSION: Current config is optimal. To improve score, generate NEW insights
 *     with these config settings and let them replace old DB entries. The eval harness
 *     cannot differentiate configs because it judges a fixed set of DB insights.
 *
 * RECOMMENDED PRODUCTION CONFIG (changes from original baseline):
 *   - Stronger specificity: 3 data citations mandatory (was 2)
 *   - Explicit actions: "do X tonight" not "consider X"
 *   - Cross-platform requirement: 2+ sources per insight
 *   - Quality gate: reject vague language ("lately", "patterns suggest")
 *   - Temperature 0.65 (slightly more focused than 0.7)
 *   - Stricter dedup 0.50 (was 0.40, filters repetitive vague insights)
 *   - More memory context: 250 memories (was 200), 12 reflections (was 10)
 *
 * SESSION 3 FINDINGS (2026-04-07, 12 eval runs across 7 experiments):
 *   - Score dropped to ~0.48 from ~0.59 (March baseline). Root cause: DB insights
 *     now contain 5 "email_notification_sent" + 1 "briefing_email" entries (score ~0.20 each)
 *     that drag the 20-insight average down significantly.
 *   - Real insights (nudge/concern/trend) still score 0.52-0.66, consistent with March.
 *   - Baseline: 0.499, 0.487, 0.481 (mean=0.489, range=0.018)
 *   - Exp1 personality=1.5: 0.477 (NOISE)
 *   - Exp2 temp=0.3+min_data=5: 0.483 (NOISE)
 *   - Exp3 anti-notification prompt: 0.485 (NOISE — prompt doesn't affect DB insights)
 *   - Exp4 max_tokens=350+mem=400+ref=15: 0.473 (NOISE)
 *   - Exp5 temp=0.9+personality=1.3: 0.484 (NOISE)
 *   - Exp6 temp=0.55+personality=1.1+dedup=0.60: 0.468 (NOISE)
 *   - Exp7 final config (3 runs): 0.489, 0.502, 0.492 (mean=0.494)
 *   - CONCLUSION: Score fully determined by DB insight content. The 6 notification/briefing
 *     artifacts score ~0.20 and pull the mean down ~0.11 vs March (when they weren't present).
 *     To restore 0.59+ scores: purge email_notification_sent/briefing_email rows from
 *     proactive_insights table, or generate new high-quality insights to replace them.
 *   - PROMPT IMPROVEMENT KEPT: Added "NEVER GENERATE" section with anti-notification rules
 *     and bad examples. This prevents future generation of system-log-style insights.
 *   - CONFIG CHANGES KEPT: max_tokens 200->250, memories 250->300, reflections 12->15,
 *     dedup 0.50->0.55 (better for production quality, no eval impact).
 */

// ─── Insight Generation Prompt ──────────────────────────────────────────────
// The system prompt template used to generate proactive insights.
// {observations} and {reflections} are replaced with actual data at runtime.
// The research agent can modify this to improve specificity, actionability, etc.
export const INSIGHT_PROMPT_TEMPLATE = `You are a digital twin that deeply knows this person. Generate 2-3 proactive insights based on their recent activity and patterns.

STRUCTURE EACH INSIGHT AS: [observation with specific data] + [concrete action they should take right now]

HARD REQUIREMENTS:
1. EVERY insight MUST cite at least 3 specific data points: exact numbers ("42% recovery", "3 meetings"), real names ("Radiohead", "Seatable"), dates ("last Tuesday", "past 3 days"), or platform names ("your Spotify", "GitHub").
2. EVERY insight MUST end with a concrete, time-bound action: "do X tonight", "try Y tomorrow morning", "block Z hours this weekend". Never say "consider" or "maybe" — tell them what to do and when.
3. EVERY insight MUST connect data from 2+ platforms (music + health, calendar + sleep, GitHub + energy, etc.).
4. Tone: close friend texting — casual, warm, slightly teasing. Use "you" and "your". Never clinical, never jargon, never robotic.
5. Time-aware: reference morning/evening/day-of-week explicitly. Make advice feel urgent and timely.
6. Max 2 sentences per insight. No bullet points, no headers, no system-speak.

NEVER GENERATE:
- System notifications ("email sent", "briefing delivered", "notification sent")
- Status updates about what the system did — only insights about the USER's life
- Generic wellness advice without specific data backing it up
- Anything that sounds like a log message or automated confirmation

QUALITY GATE — reject any insight that:
- Uses vague words: "lately", "sometimes", "patterns suggest", "might benefit", "it seems"
- Has zero numbers or dates
- References only one platform
- Offers no specific next step with a timeframe
- Reads like a notification or system message rather than a friend's observation

Examples of GREAT insights:
  "you've had 3 meetings before 9am this week and your recovery dropped to 42% — push tomorrow's standup to 10"
  "noticed you saved OK Computer last Tuesday but haven't played it — tonight after 7 your calendar is clear, put it on"
  "your GitHub commits jumped 40% this weekend while Spotify went full lo-fi — deep work mode, but block 2 hours Sunday for a real break"

Examples of BAD insights (NEVER generate these):
  "Your morning briefing email has been sent successfully" — this is a system log, not an insight
  "Email notification delivered to your inbox" — this is a notification, not an insight
  "You seem to be doing well lately" — too vague, no data, no action

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
export const INSIGHT_MAX_TOKENS = 250;

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
export const MEMORIES_TO_SCAN = 300;

// How many reflections to include as "known patterns" context.
// Range: [3, 20]
export const REFLECTIONS_TO_INCLUDE = 15;

// ─── Dedup and Filtering ────────────────────────────────────────────────────

// Cosine similarity threshold for deduplicating insights against recent ones.
// Higher = stricter dedup (fewer duplicates, but may reject good insights).
// Range: [0.3, 0.8]
export const DEDUP_THRESHOLD = 0.55;
