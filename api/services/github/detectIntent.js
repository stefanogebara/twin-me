/**
 * GitHub query intent detector. 'activity' | 'snapshot' | null.
 */

const GITHUB_NOUN_PATTERNS = [
  /\bgithub\b/i,
  /\bcommit(s|ted)?\b/i,
  /\b(pull )?request(s)?\b/i,
  /\bpr(s)?\b/i,
  /\b(open|merged|review) pr(s)?\b/i,
  /\brepo(s|sitor(y|ies))?\b/i,
  /\bbranch(es)?\b/i,
  /\bcode (review|commit|push|repo)\b/i,
];

const ACTIVITY_PATTERNS = [
  /\b(how|what'?s) (my|been) (coding|github|work|developer)\b/i,
  /\b(my )?(coding|github|developer) (activity|history|work|patterns?|stats?)\b/i,
  /\b(recent|last|this week|this month) (commits|prs|pull requests?|repos)\b/i,
  /\bwhat (have I been|am I) (coding|building|working on|committing)\b/i,
  /\b(top|most active) (repos?|projects?)\b/i,
  /\bcommit (count|history|frequency|streak)\b/i,
  /\b(my )?language (mix|usage|breakdown)\b/i,
];

function any(patterns, text) {
  return patterns.some((re) => re.test(text));
}

/**
 * @param {string} message
 * @returns {{kind: 'activity'|'snapshot'|null}}
 */
export function detectGithubIntent(message) {
  const text = String(message ?? '').trim();
  if (text.length === 0) return { kind: null };

  if (any(ACTIVITY_PATTERNS, text) && any(GITHUB_NOUN_PATTERNS, text)) {
    return { kind: 'activity' };
  }
  if (any(ACTIVITY_PATTERNS, text)) {
    return { kind: 'activity' };
  }
  if (any(GITHUB_NOUN_PATTERNS, text)) {
    return { kind: 'snapshot' };
  }
  return { kind: null };
}
