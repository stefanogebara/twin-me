/**
 * Twitter/X Provider — discover profile via Brave Search.
 * Uses existing Brave Search API key. No separate Twitter API needed.
 * Extracts handle, bio, display name from search snippets.
 */

import { createLogger } from '../logger.js';

const log = createLogger('TwitterBrave');
const TIMEOUT_MS = 4000;

// X/Twitter serves a "JavaScript is disabled" fallback page to non-JS clients,
// and Brave sometimes indexes THAT as the profile description. Without this
// guard the boilerplate ("We've detected that JavaScript is disabled… switch to
// a supported browser… Help Center") gets captured as the user's bio and shows
// up verbatim in the discovery reveal. Reject that and similar chrome so the bio
// is null rather than junk (callers already handle a null bio gracefully).
const JUNK_BIO_PATTERNS = [
  /javascript is disabled/i,
  /enable javascript/i,
  /supported browser/i,
  /switch to a supported/i,
  /list of supported browsers/i,
  /help cent(?:er)?\b/i,
  /log ?in to (?:twitter|x)\b/i,
  /^(?:see )?(?:the latest |new )?(?:tweets|posts) (?:from|by)\b/i,
];

export function cleanBio(raw) {
  if (typeof raw !== 'string') return null;
  const bio = raw.trim();
  if (bio.length < 3) return null;
  if (JUNK_BIO_PATTERNS.some((re) => re.test(bio))) return null;
  return bio;
}

export async function lookupTwitterViaBrave(username, name = null) {
  if (!username || username.length < 2) return null;

  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) return null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    // Search for Twitter/X profile
    const query = name
      ? `"${name}" site:twitter.com OR site:x.com`
      : `"${username}" site:twitter.com OR site:x.com`;

    const searchUrl = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`;
    const res = await fetch(searchUrl, {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': apiKey,
      },
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) return null;

    const json = await res.json();
    const results = json?.web?.results || [];

    // Find the actual profile page (not a tweet or search)
    const profileResult = results.find(r => {
      const url = r.url?.toLowerCase() || '';
      return (url.includes('twitter.com/') || url.includes('x.com/'))
        && !url.includes('/status/')
        && !url.includes('/search')
        && !url.includes('/hashtag');
    });

    if (!profileResult) return null;

    // Extract handle from URL
    const urlMatch = profileResult.url.match(/(?:twitter\.com|x\.com)\/(@?[\w]+)/i);
    const handle = urlMatch?.[1]?.replace(/^@/, '') || null;
    if (!handle) return null;

    // Extract bio from snippet (Twitter snippets typically show: "@handle · bio text")
    let bio = null;
    const snippet = profileResult.description || '';
    // Try to extract bio after the handle mention
    const bioMatch = snippet.match(/(?:@\w+\s*[·\-—]\s*)(.*?)(?:\.\s|$)/);
    if (bioMatch?.[1]) {
      bio = bioMatch[1].trim();
    } else if (snippet.length > 20 && !snippet.startsWith('http')) {
      bio = snippet.slice(0, 200).trim();
    }
    // Drop X.com's no-JS fallback boilerplate + similar chrome (see above).
    bio = cleanBio(bio);

    // Display name from title (format: "Display Name (@handle) / X")
    let displayName = null;
    const titleMatch = profileResult.title?.match(/^(.+?)\s*\(@?\w+\)/);
    if (titleMatch?.[1]) {
      displayName = titleMatch[1].trim();
    }

    log.info('Twitter/X found via Brave', { handle, displayName, hasBio: !!bio });

    return {
      handle,
      profileUrl: profileResult.url,
      bio,
      displayName,
    };
  } catch (err) {
    if (err.name !== 'AbortError') log.warn('Twitter Brave lookup failed', { error: err.message });
    return null;
  }
}
