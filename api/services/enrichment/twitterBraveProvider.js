/**
 * Twitter/X Provider — discover profile via Brave Search.
 * Uses existing Brave Search API key. No separate Twitter API needed.
 * Extracts handle, bio, display name from search snippets.
 */

import { createLogger } from '../logger.js';

const log = createLogger('TwitterBrave');
const TIMEOUT_MS = 4000;

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
