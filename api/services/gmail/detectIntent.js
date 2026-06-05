/**
 * Gmail intent detector. 'behavior' | 'snapshot' | null.
 *
 * 'behavior' = the user wants an actual analytical answer about their
 *              email patterns (volume, chronotype, top contacts,
 *              label structure).
 * 'snapshot' = generic email mention; the snapshot path that already
 *              runs every chat turn covers it.
 */

const EMAIL_NOUN_PATTERNS = [
  /\bemail(s)?\b/i,
  /\bgmail\b/i,
  /\binbox\b/i,
  /\bmessage(s)?\b/i,
  /\bcorrespondence\b/i,
];

const BEHAVIOR_PATTERNS = [
  /\b(how many|how much) (emails?|messages?)\b/i,
  /\b(my )?email (patterns?|habits?|behaviou?r|history|breakdown|stats?|volume|recap|summary)\b/i,
  /\b(who|whom) (do I|am I) email(ing)? (most|the most)\b/i,
  /\b(top|most frequent) (\w+\s+)?(correspondents?|contacts?|senders?|recipients?)\b/i,
  /\b(my )?inbox (patterns?|habits?|stats?|breakdown|summary)\b/i,
  /\b(when|what time) (do I|am I) (send|email)\b/i,
  /\b(am I a |are you a )?(night owl|early bird)\b/i,
  /\bemail (chronotype|chronobiology|time)\b/i,
  /\b(my )?email labels?\b/i,
  /\b(how |how )?organi[sz]ed is my (inbox|email)\b/i,
];

function any(patterns, text) {
  return patterns.some((re) => re.test(text));
}

/**
 * @param {string} message
 * @returns {{kind: 'behavior'|'snapshot'|null}}
 */
export function detectGmailIntent(message) {
  const text = String(message ?? '').trim();
  if (text.length === 0) return { kind: null };

  if (any(BEHAVIOR_PATTERNS, text) && any(EMAIL_NOUN_PATTERNS, text)) {
    return { kind: 'behavior' };
  }
  if (any(BEHAVIOR_PATTERNS, text)) {
    return { kind: 'behavior' };
  }
  if (any(EMAIL_NOUN_PATTERNS, text)) {
    return { kind: 'snapshot' };
  }
  return { kind: null };
}
