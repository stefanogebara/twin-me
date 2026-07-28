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
const SNAPSHOT_METRIC_PATTERNS = [
  // Gmail absolute inbox state — the "40,000 unread emails" class.
  // Deliberately excludes "Inbox grew by N" / "Cleared N" (transitions) and
  // "Practices inbox zero" (a habit, and zero cannot go stale misleadingly).
  /^Has (?:a backlog of |a moderate pile of )?[\d,]+ unread emails? in inbox/i,
  /^Reads \d+% of incoming email/i,
  /^Manages an? .*mailbox/i,

  // Device and biometric readings — true for hours at most.
  /^Android screen-on time in last 24h:/i,
  /^Unlocked phone [\d,]+ times today/i,
  /^Phone battery (?:very )?low \(/i,
  /^Whoop stress score today:/i,

  // Momentary media state.
  /^Music mood right now:/i,

  // Rolling-window aggregates. Recomputed every cycle over "this week" / "the
  // last 30 days" / "2026", so an old copy describes a window that has moved on.
  // Distinct from an event that merely quotes numbers: "Slept 7.1 hours" is a
  // specific night that stays true and must NOT be demoted.
  /^Your GitHub \d{4} activity:/i,
  /^Committed code on \d+ days in the last \d+ days/i,
  /^Receives email from [\d,]+ distinct senders/i,
  /^Most frequent email senders this week:/i,
  /^Your email mix this week:/i,
  /^YouTube subscription topics:/i,
  /^YouTube subscription tenure:/i,
  /^Outlook inbox contains approximately/i,
];

/**
 * True when the observation reports mutable state at a moment rather than an
 * event or a durable trait.
 *
 * @param {string} content
 * @returns {boolean}
 */
function isSnapshotMetric(content) {
  if (!content || typeof content !== 'string') return false;
  return SNAPSHOT_METRIC_PATTERNS.some(rx => rx.test(content));
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
  if (!isSnapshotMetric(a) || !isSnapshotMetric(b)) return false;
  const strippedA = stripDigitsForDedup(a);
  const strippedB = stripDigitsForDedup(b);
  if (strippedA && strippedA === strippedB) return true;
  // The Gmail urgency adjective changes with the value ("a moderate pile of"
  // at 21-50, "a backlog of" above 50), so a crossing reading differs in words
  // too. Fall back to matching the pattern that classified them.
  return SNAPSHOT_METRIC_PATTERNS.some(rx => rx.test(a) && rx.test(b));
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
  if (!isSnapshotMetric(content)) return null;
  if (!/\d/.test(content)) return null;
  return String(content)
    .replace(/([\\%_])/g, '\\$1')
    .replace(/\d[\d,.]*/g, '%');
}

export {
  SNAPSHOT_METRIC_SCORE,
  SNAPSHOT_METRIC_PATTERNS,
  isSnapshotMetric,
  snapshotMetricScore,
  stripDigitsForDedup,
  isSameMetricReading,
  buildMetricLikePattern,
};
