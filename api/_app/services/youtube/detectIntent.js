/**
 * YouTube query intent detector. 'watching' | 'snapshot' | null.
 */

const YOUTUBE_NOUN_PATTERNS = [
  /\byoutube\b/i,
  /\bvideo(s)?\b/i,
  /\bchannel(s)?\b/i,
  /\bsubscription(s)?\b/i,
  /\bwatch(ed|ing|history)?\b/i,
  /\blike(d|s)?\b/i, // "what have I liked"
];

const WATCHING_PATTERNS = [
  /\bwhat (have I been|am I|did I) (watch|view)/i,
  /\b(my )?(top|favorite) (channels?|videos?|topics?)\b/i,
  /\bwhat'?s (in my|on my) (youtube|subscriptions?|watchlist)\b/i,
  /\b(recent|recently|last) (watched|viewed|liked) (videos?|channels?)/i,
  /\b(my )?(youtube|video) (history|patterns?|breakdown|recap|library)\b/i,
  /\bwhat (channels|topics) have I been (into|watching|exploring)\b/i,
];

function any(patterns, text) {
  return patterns.some((re) => re.test(text));
}

/**
 * @param {string} message
 * @returns {{kind: 'watching'|'snapshot'|null}}
 */
export function detectYoutubeIntent(message) {
  const text = String(message ?? '').trim();
  if (text.length === 0) return { kind: null };

  if (any(WATCHING_PATTERNS, text) && any(YOUTUBE_NOUN_PATTERNS, text)) {
    return { kind: 'watching' };
  }
  if (any(WATCHING_PATTERNS, text)) {
    return { kind: 'watching' };
  }
  if (any(YOUTUBE_NOUN_PATTERNS, text)) {
    return { kind: 'snapshot' };
  }
  return { kind: null };
}
