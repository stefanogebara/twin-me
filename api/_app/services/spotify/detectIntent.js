/**
 * Spotify query intent detector — same shape as the Whoop one. Returns
 * { kind } where kind is 'recent_listening' | 'snapshot' | null.
 *
 * Priority order: recent_listening > snapshot > null. Snapshot is the
 * lowest bar (any Spotify noun) and just means "the message is music-
 * adjacent but doesn't warrant an extra API roundtrip".
 *
 * Distinct from Whoop in that there's no trend/weekly/compare kind yet
 * — those need historical audio-features fetching to be useful and
 * that's a separate work item.
 *
 * @typedef {'recent_listening'|'snapshot'|null} SpotifyIntentKind
 * @typedef {{ kind: SpotifyIntentKind }} SpotifyIntent
 */

// Music-domain nouns. Anything music-shaped triggers at least snapshot.
const MUSIC_NOUN_PATTERNS = [
  /\bspotify\b/i,
  /\bmusic\b/i,
  /\bsong(s)?\b/i,
  /\btrack(s)?\b/i,
  /\bartist(s)?\b/i,
  /\balbum(s)?\b/i,
  /\bplaylist(s)?\b/i,
  /\blisten(ing|ed)?\b/i,
  /\bplay(ed|ing|s)?\b/i,
  /\bband(s)?\b/i,
  /\bgenre(s)?\b/i,
];

// Words that say "show me my activity" specifically — these warrant
// the live recently-played + top-artists fetch rather than just the
// snapshot we already pre-load on every chat turn.
const RECENT_PATTERNS = [
  /\bwhat (have I been|am I|did I) (listen|play|hear)/i,
  /\bwhat'?s (on|in) (my )?(rotation|playlist|library|spotify)/i,
  /\bshow me (my )?(recent|last|recently)/i,
  /\b(recent|last|today'?s|this week'?s) (songs?|tracks?|plays?|listens?|music)/i,
  /\btop (artists?|tracks?|songs?|genres?)/i,
  /\bwho (am I|have I been) listening to/i,
  /\bwhat genre(s)?\b/i,
  /\bmusic (mood|vibes?|taste|history|breakdown)/i,
  /\b(my )?listening (habits?|history|patterns?|trend)/i,
];

function any(patterns, text) {
  return patterns.some((re) => re.test(text));
}

/**
 * @param {string} message
 * @returns {SpotifyIntent}
 */
export function detectSpotifyIntent(message) {
  const text = String(message ?? '').trim();
  if (text.length === 0) return { kind: null };

  // 1. Recent listening — needs the noun gate to avoid "what music
  //    festivals are happening" → not a query about user's plays.
  if (any(RECENT_PATTERNS, text) && any(MUSIC_NOUN_PATTERNS, text)) {
    return { kind: 'recent_listening' };
  }
  // Also fire on bare "recent music" / "top artists" without explicit
  // first-person framing.
  if (any(RECENT_PATTERNS, text)) {
    return { kind: 'recent_listening' };
  }

  // 2. Snapshot — music-noun but no analytics ask.
  if (any(MUSIC_NOUN_PATTERNS, text)) {
    return { kind: 'snapshot' };
  }

  // 3. Not music-related.
  return { kind: null };
}
