/**
 * LinkedIn intent detector. 'activity' | 'snapshot' | null.
 *
 * Like Discord, the dispatcher reads from cached OAuth profile +
 * extension-driven page_dwell/profile_view/search_query/reaction_click
 * aggregates. Doesn't depend on a GDPR upload.
 */

const LINKEDIN_NOUN_PATTERNS = [
  /\blinkedin\b/i,
  /\bnetwork\b/i,
  /\bconnections?\b/i,
  /\bheadline\b/i,
];

const ACTIVITY_PATTERNS = [
  /\b(my )?linkedin (activity|history|usage|profile|engagement|stats?|patterns?|behavior|cadence)\b/i,
  /\b(top|most common) (companies?|positions?|roles?|titles?) (in (my )?network|on linkedin)\b/i,
  /\bwhat (do I|am I) (do |post |search |react |scroll )?on linkedin\b/i,
  /\bhow (many|much) (time on |linkedin|connections|posts)/i,
  /\b(my )?linkedin (reaction|search|posting|feed|profile-?view) (style|cadence|patterns?|topics?)\b/i,
  /\bwhat's? my linkedin (headline|industry|title|role)\b/i,
];

function any(patterns, text) {
  return patterns.some((re) => re.test(text));
}

/**
 * @param {string} message
 * @returns {{kind: 'activity'|'snapshot'|null}}
 */
export function detectLinkedInIntent(message) {
  const text = String(message ?? '').trim();
  if (text.length === 0) return { kind: null };

  if (any(ACTIVITY_PATTERNS, text) && any(LINKEDIN_NOUN_PATTERNS, text)) {
    return { kind: 'activity' };
  }
  if (any(ACTIVITY_PATTERNS, text)) {
    return { kind: 'activity' };
  }
  if (any(LINKEDIN_NOUN_PATTERNS, text)) {
    return { kind: 'snapshot' };
  }
  return { kind: null };
}
