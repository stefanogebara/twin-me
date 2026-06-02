/**
 * Whoop query intent detector.
 *
 * Routes a user message to one of four analytics intents, in priority
 * order — compare > trend > weekly > snapshot > null. Returns the
 * arguments the analytics tool needs (metric, days, period expressions)
 * pre-extracted, but leaves date *resolution* to the caller so we don't
 * have to mock the clock here.
 *
 * Design goals:
 *   1. Don't over-trigger. The default (no analytics) is a token-cheap
 *      snapshot section in the system prompt; we only escalate when the
 *      user clearly wants more than that.
 *   2. Keep it pure + regex-only. No LLM round-trips. ~30 lines of regex
 *      classifies the question, and we let the existing analytics tools
 *      do the actual work.
 *   3. Output shape stable across kinds. Callers do
 *      `if (intent.kind === 'trend') ...` — never check field presence.
 *
 * @typedef {'compare'|'trend'|'weekly'|'snapshot'|null} WhoopIntentKind
 *
 * @typedef {object} WhoopIntent
 * @property {WhoopIntentKind} kind
 * @property {string} [metric]     — trend only; one of recovery|hrv|rhr|sleep_duration|sleep_performance|strain
 * @property {number} [days]       — trend only; defaults to 30 if omitted
 * @property {string} [weekStart]  — weekly only; raw expression (e.g. "last week", "this week")
 * @property {string} [periodA]    — compare only; raw expression for the OLDER period
 * @property {string} [periodB]    — compare only; raw expression for the NEWER period
 */

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

// "vs", "versus", "compare", "compared to", "better than", "worse than" —
// any of these flips the message into a compare intent. The standalone
// "v" between two tokens (e.g. "this week v last week") is also caught.
const COMPARE_PATTERNS = [
  /\bcompare(d)?\b/i,
  /\bversus\b/i,
  /\bvs\.?\b/i,
  /\s+v\s+/i,
  /\bcompared to\b/i,
  /\b(better|worse) than\b/i,
  /\b(different|change) (from|since)\b/i,
];

// Trend signals — explicit trend words OR direction verbs ("improving",
// "declining"). "over the last/past" is a tell too: "how am I doing over
// the last month?" is a trend question even without the word "trend".
const TREND_PATTERNS = [
  /\btrend(ing|s)?\b/i,
  /\btrajectory\b/i,
  /\b(improving|declining|getting (better|worse))\b/i,
  /\bover (the )?(last|past)\b/i,
  /\bacross (the )?(last|past)\b/i,
];

// Weekly signals — note we DON'T fire on bare "week" since that catches
// "next week", "two weeks ago" etc; we require "this/last/past week" or
// "weekly" / "past 7 days" / "last 7 days".
const WEEKLY_PATTERNS = [
  /\b(this|last|past) week\b/i,
  /\bweekly\b/i,
  /\b(this|last|past)\s+7\s+days?\b/i,
];

// Whoop-domain nouns. Snapshot is the lowest-bar intent — any of these
// turns the message into a Whoop-relevant one. Without any of these AND
// no other intent matches, we return null and let the twin answer
// without bothering Whoop at all.
const WHOOP_NOUN_PATTERNS = [
  /\brecovery\b/i,
  /\bhrv\b/i,
  /\bheart rate variability\b/i,
  /\brhr\b/i,
  /\bresting heart rate\b/i,
  /\bresting hr\b/i,
  /\bsleep\b/i,
  /\bstrain\b/i,
  /\bspo2\b/i,
  /\brespiratory rate\b/i,
  /\bwhoop\b/i,
];

// Metric extraction for trend. Order matters — "sleep performance"
// must beat plain "sleep" so we put longer matches first.
const METRIC_PATTERNS = [
  { metric: 'sleep_performance', re: /\bsleep (performance|quality|score)\b/i },
  { metric: 'sleep_duration', re: /\b(sleep duration|hours of sleep|how (long|much) (i|i'?ve been) sleep|sleep length)\b/i },
  { metric: 'rhr', re: /\b(rhr|resting heart rate|resting hr)\b/i },
  { metric: 'hrv', re: /\b(hrv|heart rate variability)\b/i },
  { metric: 'recovery', re: /\brecovery\b/i },
  { metric: 'strain', re: /\bstrain\b/i },
  { metric: 'sleep_duration', re: /\bsleep\b/i }, // fallback — "sleep" alone → duration
];

// Days extraction for trend. Looks for "last/past N days|weeks|months".
const DAYS_PATTERNS = [
  { re: /\b(last|past)\s+(\d+)\s+days?\b/i, mul: 1 },
  { re: /\b(last|past)\s+(\d+)\s+weeks?\b/i, mul: 7 },
  { re: /\b(last|past)\s+(\d+)\s+months?\b/i, mul: 30 },
  { re: /\b(last|past)\s+week\b/i, mul: 0, value: 7 },
  { re: /\b(last|past)\s+month\b/i, mul: 0, value: 30 },
];

// Period expressions we know how to resolve via dateUtils. Order matters
// — longer phrases first so "last week" beats "last".
const PERIOD_EXPRESSIONS = [
  'last 30 days',
  'last 14 days',
  'last 7 days',
  'past 30 days',
  'past 14 days',
  'past 7 days',
  'this quarter',
  'last quarter',
  'this month',
  'last month',
  'this week',
  'last week',
  'past week',
  'last year',
  'yesterday',
  'today',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function any(patterns, text) {
  return patterns.some((re) => re.test(text));
}

function extractMetric(text) {
  for (const { metric, re } of METRIC_PATTERNS) {
    if (re.test(text)) return metric;
  }
  return 'recovery';
}

function extractDays(text) {
  for (const { re, mul, value } of DAYS_PATTERNS) {
    const m = text.match(re);
    if (m) {
      if (mul === 0) return value;
      const n = parseInt(m[2], 10);
      if (Number.isFinite(n) && n > 0) return n * mul;
    }
  }
  return 30;
}

/**
 * Find up to two period expressions in the text, returning them in
 * chronological order (older → newer). If only one is found, the second
 * defaults to "last 30 days" so we always have a valid compare pair.
 */
function extractPeriodPair(text) {
  // First pass — collect ALL matches with their indices, in document
  // order. Then dedupe overlapping matches (longer wins).
  const hits = [];
  for (const expr of PERIOD_EXPRESSIONS) {
    const re = new RegExp(`\\b${expr.replace(/ /g, '\\s+')}\\b`, 'i');
    const m = text.match(re);
    if (m && m.index !== undefined) {
      hits.push({ expr, index: m.index, length: m[0].length });
    }
  }
  // Sort by index, then prefer longer at same index.
  hits.sort((a, b) => a.index - b.index || b.length - a.length);

  // Dedupe overlapping: keep the first (longest at that index), drop any
  // later hit whose start falls inside the previous match's span.
  const kept = [];
  for (const h of hits) {
    const last = kept[kept.length - 1];
    if (last && h.index < last.index + last.length) continue;
    kept.push(h);
  }

  if (kept.length === 0) return null;
  if (kept.length === 1) {
    // Only ONE period named — we deliberately bail. Any default partner
    // we invent ("last 30 days", "the week before", etc.) either overlaps
    // the named period or projects a frame the user didn't ask for. The
    // caller (detectWhoopIntent) sees `null` here and falls through to
    // trend, which delivers the named period's stats — enough info for
    // the twin to frame the answer as a comparison in prose.
    return null;
  }

  // Two+ periods named. Order chronologically — for our supported
  // expressions, "this X" is always newer than "last X", and "today" is
  // newer than "yesterday", etc. Build a coarse age rank.
  const age = (e) => {
    if (e.startsWith('this ')) return 0;
    if (e === 'today') return 0;
    if (e.startsWith('past ') || e.startsWith('last 7') || e.startsWith('last 14') || e.startsWith('last 30')) return 1;
    if (e === 'last week' || e === 'last month' || e === 'last quarter' || e === 'last year') return 2;
    if (e === 'yesterday') return 1;
    return 1;
  };
  const [first, second] = [kept[0].expr, kept[1].expr];
  if (age(first) <= age(second)) {
    // first is newer or equal — swap so older is A
    return { periodA: second, periodB: first };
  }
  return { periodA: first, periodB: second };
}

function extractWeekStart(text) {
  if (/\blast week\b/i.test(text)) return 'last week';
  if (/\bthis week\b/i.test(text)) return 'this week';
  if (/\bpast week\b/i.test(text)) return 'last week';
  if (/\b(last|past)\s+7\s+days?\b/i.test(text)) return 'last week';
  return 'this week';
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Classify a user message into a Whoop analytics intent.
 *
 * @param {string} message
 * @returns {WhoopIntent}
 */
export function detectWhoopIntent(message) {
  const text = String(message ?? '').trim();
  if (text.length === 0) return { kind: null };

  // 1. Compare — highest precedence. Requires BOTH a compare signal AND
  //    at least one Whoop-domain noun, otherwise "I prefer cats vs dogs"
  //    would route here.
  if (any(COMPARE_PATTERNS, text) && any(WHOOP_NOUN_PATTERNS, text)) {
    const pair = extractPeriodPair(text);
    if (pair) {
      return {
        kind: 'compare',
        periodA: pair.periodA,
        periodB: pair.periodB,
        metric: extractMetric(text),
      };
    }
    // Single (or zero) period named. We deliberately don't invent a
    // partner — see extractPeriodPair for the rationale. Frame the
    // question as a trend over whatever period IS named (extractDays
    // pulls "last week" → 7, "last month" → 30, etc.) so the twin still
    // gets numbers to reason about even though we can't compute the
    // delta. If the user really wanted a comparison they can name both
    // periods in the next turn.
    return {
      kind: 'trend',
      metric: extractMetric(text),
      days: extractDays(text),
    };
  }

  // 2. Trend. Same noun-gate as compare.
  if (any(TREND_PATTERNS, text) && any(WHOOP_NOUN_PATTERNS, text)) {
    return {
      kind: 'trend',
      metric: extractMetric(text),
      days: extractDays(text),
    };
  }

  // 3. Weekly. Triggered by "this week" / "last week" / "weekly" plus a
  //    Whoop noun. Without the noun gate, "what did I do last week" is
  //    not a Whoop query.
  if (any(WEEKLY_PATTERNS, text) && any(WHOOP_NOUN_PATTERNS, text)) {
    return { kind: 'weekly', weekStart: extractWeekStart(text) };
  }

  // 4. Snapshot. Any Whoop noun. Today's data is already in the system
  //    prompt by default, so this kind is mostly a hint to the caller
  //    that the message IS about Whoop and the existing context is
  //    relevant.
  if (any(WHOOP_NOUN_PATTERNS, text)) {
    return { kind: 'snapshot' };
  }

  // 5. Nothing Whoop-related.
  return { kind: null };
}
