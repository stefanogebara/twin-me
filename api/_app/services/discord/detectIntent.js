/**
 * Discord intent detector. 'activity' | 'snapshot' | null.
 *
 * Activity-class questions ("top servers", "how many messages", "am I a
 * lurker") trigger the rich dispatcher that aggregates the cached OAuth
 * guild list + extension-driven channel_dwell + message_sent counts.
 *
 * Snapshot-class questions ("what's my discord username") are handled
 * by the generic memory-stream context — no separate fetch needed.
 *
 * Naming distinction with discord_export (the GDPR-upload adapter): that
 * one only fires when the user has uploaded a zip. This detector fires
 * for ANY Discord question and the dispatcher reads whatever data is
 * actually in user_platform_data + user_memories.
 */

const DISCORD_NOUN_PATTERNS = [
  /\bdiscord\b/i,
  /\bserver(s)?\b/i,
  /\bguild(s)?\b/i,
  /\bDMs?\b/i,
];

const ACTIVITY_PATTERNS = [
  /\b(my )?discord (activity|history|usage|stats?|breakdown|patterns?|habits?|engagement)\b/i,
  /\b(top|most active|favorite) (discord )?(servers?|guilds?|communities)\b/i,
  /\bwhat (discord )?(servers?|guilds?|communities) (am I in|do I (use|chat in|hang out in))\b/i,
  /\bam I (a )?(discord )?(lurker|chatter|active|poster|contributor)\b/i,
  /\bhow many (discord )?(messages|servers|guilds)/i,
  /\b(my )?(discord )?(chronotype|when I chat on discord|when do I message)\b/i,
];

function any(patterns, text) {
  return patterns.some((re) => re.test(text));
}

/**
 * @param {string} message
 * @returns {{kind: 'activity'|'snapshot'|null}}
 */
export function detectDiscordIntent(message) {
  const text = String(message ?? '').trim();
  if (text.length === 0) return { kind: null };

  if (any(ACTIVITY_PATTERNS, text) && any(DISCORD_NOUN_PATTERNS, text)) {
    return { kind: 'activity' };
  }
  if (any(ACTIVITY_PATTERNS, text)) {
    return { kind: 'activity' };
  }
  if (any(DISCORD_NOUN_PATTERNS, text)) {
    return { kind: 'snapshot' };
  }
  return { kind: null };
}
