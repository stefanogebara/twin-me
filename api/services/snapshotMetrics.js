/**
 * Volatile snapshot metrics.
 *
 * A platform observation is either a TRANSITION ("cleared 300 unread emails
 * since yesterday") or a SNAPSHOT ("has 40,000 unread emails in inbox").
 * Transitions describe something that happened and stay true forever.
 * Snapshots describe mutable state at one instant and are wrong within hours —
 * but the pipeline stored both as timeless present-tense facts, so the twin
 * went on asserting a months-old inbox count as current.
 *
 * Two consequences are handled here:
 *   1. Importance — addPlatformObservation floors platform_data at 6, while
 *      Tier 2 archival collects only rows at <= 4, so a snapshot could never
 *      be archived. Snapshots are clamped below that floor instead.
 *   2. Dedup — the content hash is digit-sensitive, so every new reading
 *      inserted a fresh row and the previous one was never retired. Comparing
 *      digit-stripped text collapses re-readings of the same metric.
 *
 * Full analysis: .claude/plans/2026-07-27-optmem-brain/README.md (Phase 0).
 * Superseding stale rows outright is Phase 1; this module only stops them
 * outranking and outliving fresher data.
 */

/**
 * Importance assigned to a snapshot reading. Must stay <= 4: that is the
 * ceiling Tier 2 archival (cron-memory-forgetting.js) filters on, and the
 * whole point is to land underneath it rather than on the platform_data
 * floor of 6.
 */
const SNAPSHOT_METRIC_SCORE = 4;

/**
 * Point-in-time readings of mutable state. Anchored with ^ so these match the
 * observation templates the fetchers emit, not an incidental mention inside a
 * longer narrative memory.
 */
/**
 * Point-in-time readings of mutable state, each paired with the SQL LIKE pattern
 * that finds a PRIOR reading of the same metric.
 *
 * The `like` is a fixed literal rather than something derived from the content,
 * and that matters twice over:
 *
 *  - Correctness. Deriving it by wildcarding digit runs left every varying WORD
 *    embedded literally, so "Music mood right now: melancholy" could never match
 *    the previous "…: upbeat" and the in-place refresh silently never fired for
 *    the most volatile metrics in the list.
 *  - Safety. A derived pattern is attacker-influenced text going into a query
 *    filter. PostgREST also maps '*' to '%' in LIKE with no escape available.
 *    A constant sidesteps both concerns entirely.
 *
 * `rx` classifies; `like` locates siblings. Two observations are the same metric
 * when the same entry classifies both.
 */
const SNAPSHOT_METRICS = [
  // Gmail absolute inbox state — the "40,000 unread emails" class.
  // Deliberately excludes "Inbox grew by N" / "Cleared N" (transitions) and
  // "Practices inbox zero" (a habit, and zero cannot go stale misleadingly).
  { rx: /^Has (?:a backlog of |a moderate pile of )?[\d,]+ unread emails? in inbox/i,
    like: 'Has %unread emails in inbox%' },
  { rx: /^Reads \d+% of incoming email/i,
    // Doubled backslash on purpose: in a JS string '\%' collapses to '%', which
    // would leave the literal percent acting as a LIKE wildcard.
    like: 'Reads %\\% of incoming email%' },
  { rx: /^Manages an? .*mailbox/i,
    like: 'Manages a%mailbox%' },

  // Device and biometric readings — true for hours at most.
  { rx: /^Android screen-on time in last 24h:/i,  like: 'Android screen-on time in last 24h:%' },
  { rx: /^Unlocked phone [\d,]+ times today/i,    like: 'Unlocked phone %times today%' },
  { rx: /^Phone battery (?:very )?low \(/i,       like: 'Phone battery %low (%' },
  { rx: /^Whoop stress score today:/i,            like: 'Whoop stress score today:%' },

  // Momentary media state.
  { rx: /^Music mood right now:/i,                like: 'Music mood right now:%' },

  // Rolling-window aggregates. Recomputed every cycle over "this week" / "the
  // last 30 days" / "2026", so an old copy describes a window that has moved on.
  // Distinct from an event that merely quotes numbers: "Slept 7.1 hours" is a
  // specific night that stays true and must NOT be demoted.
  { rx: /^Your GitHub \d{4} activity:/i,                    like: 'Your GitHub % activity:%' },
  { rx: /^Committed code on \d+ days in the last \d+ days/i, like: 'Committed code on %days in the last %days%' },
  { rx: /^Receives email from [\d,]+ distinct senders/i,     like: 'Receives email from %distinct senders%' },
  { rx: /^Most frequent email senders this week:/i,          like: 'Most frequent email senders this week:%' },
  { rx: /^Your email mix this week:/i,                       like: 'Your email mix this week:%' },
  { rx: /^YouTube subscription topics:/i,                    like: 'YouTube subscription topics:%' },
  { rx: /^YouTube subscription tenure:/i,                    like: 'YouTube subscription tenure:%' },
  { rx: /^Outlook inbox contains approximately/i,            like: 'Outlook inbox contains approximately%' },
];

/** Regexes alone, for callers that only need classification. */
const SNAPSHOT_METRIC_PATTERNS = SNAPSHOT_METRICS.map(m => m.rx);

/** The entry that classifies this content, or null. */
function matchSnapshotMetric(content) {
  if (!content || typeof content !== 'string') return null;
  return SNAPSHOT_METRICS.find(m => m.rx.test(content)) ?? null;
}

/**
 * True when the observation reports mutable state at a moment rather than an
 * event or a durable trait.
 *
 * @param {string} content
 * @returns {boolean}
 */
function isSnapshotMetric(content) {
  return matchSnapshotMetric(content) !== null;
}

/**
 * Importance clamp for snapshot readings, or null when the content is not a
 * snapshot (leaving it to the normal LLM rater).
 *
 * @param {string} content
 * @returns {number|null}
 */
function snapshotMetricScore(content) {
  return isSnapshotMetric(content) ? SNAPSHOT_METRIC_SCORE : null;
}

/**
 * Strip digit runs (including thousand separators and decimals) to build a
 * comparison key. A daily-incrementing count ("40,381 unread" -> "40,448
 * unread") otherwise defeats every lexical dedup layer, so the same stat ships
 * again and again. Digits carry no theme identity; the words do.
 *
 * Originally written for insight dedup in proactiveInsights.js, which now
 * delegates here so the two cannot drift.
 *
 * @param {string} text
 * @returns {string}
 */
function stripDigitsForDedup(text) {
  return String(text || '')
    .replace(/\d[\d,.]*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * True when two observations are the same snapshot metric carrying different
 * readings ("40,381 unread" vs "40,448 unread"). Both sides must be snapshots:
 * two transitions with different numbers are two separate events and must both
 * survive.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function isSameMetricReading(a, b) {
  const ma = matchSnapshotMetric(a);
  const mb = matchSnapshotMetric(b);
  // Same template = same metric. This is deliberately not digit-stripped
  // equality: the varying part is often a WORD, not a number — Gmail's urgency
  // adjective flips at 50, the mood label is the whole point of the mood metric,
  // the mailbox size word changes with the count.
  return ma !== null && ma === mb;
}

/**
 * Build a SQL LIKE pattern that finds a prior reading of the same metric, by
 * replacing each numeric run with a wildcard. Used to locate the row to update
 * in place instead of inserting yet another increasingly-stale duplicate.
 *
 * Literal `%` and `_` are escaped first (Postgres LIKE defaults to backslash
 * as the escape character) — "Reads 8% of incoming email" contains a literal
 * percent sign that would otherwise match almost anything.
 *
 * @param {string} content
 * @returns {string|null} pattern, or null when the content is not a snapshot
 *   metric or has no numeric part to generalize over
 */
function buildMetricLikePattern(content) {
  return matchSnapshotMetric(content)?.like ?? null;
}

export {
  SNAPSHOT_METRIC_SCORE,
  SNAPSHOT_METRICS,
  matchSnapshotMetric,
  SNAPSHOT_METRIC_PATTERNS,
  isSnapshotMetric,
  snapshotMetricScore,
  stripDigitsForDedup,
  isSameMetricReading,
  buildMetricLikePattern,
};
