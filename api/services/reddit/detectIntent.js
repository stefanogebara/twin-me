/**
 * Reddit intent detector. 'activity' | 'snapshot' | null.
 */

const REDDIT_NOUN_PATTERNS = [
  /\breddit\b/i,
  /\bsubreddit(s)?\b/i,
  /\br\/[a-z0-9_]+/i, // subreddit shorthand
  /\bkarma\b/i,
];

const ACTIVITY_PATTERNS = [
  /\b(what|which) subreddit/i,
  /\b(my )?(reddit|subreddit) (activity|interests?|patterns?|history|breakdown|stats?|habits?)\b/i,
  /\bhow active (am I|on reddit)\b/i,
  /\bmy reddit (subscriptions?|subs?)\b/i,
  /\bwhat (do I|am I) (post|comment|browse|lurk) (on reddit|about)\b/i,
  /\b(top|most active) (subreddits?|subs?|reddit communities)\b/i,
  /\b(am I a |are you a )?(reddit )?(lurker|poster|commenter|contributor)\b/i,
  /\b(my )?reddit (karma|engagement)\b/i,
];

function any(patterns, text) {
  return patterns.some((re) => re.test(text));
}

/**
 * @param {string} message
 * @returns {{kind: 'activity'|'snapshot'|null}}
 */
export function detectRedditIntent(message) {
  const text = String(message ?? '').trim();
  if (text.length === 0) return { kind: null };

  if (any(ACTIVITY_PATTERNS, text) && any(REDDIT_NOUN_PATTERNS, text)) {
    return { kind: 'activity' };
  }
  if (any(ACTIVITY_PATTERNS, text)) {
    return { kind: 'activity' };
  }
  if (any(REDDIT_NOUN_PATTERNS, text)) {
    return { kind: 'snapshot' };
  }
  return { kind: null };
}
