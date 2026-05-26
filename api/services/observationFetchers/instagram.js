/**
 * Instagram observation fetcher
 * ==============================
 * Reads from user_platform_data WHERE platform='instagram' (where the browser
 * extension stores collected data — see browser-extension/collectors/instagram.js)
 * and turns it into natural-language observation strings.
 *
 * Architecture decision (after Sparticuz/Chromium spike proved unreliable):
 * IG binds session cookies to device fingerprint. Server-side scraping with
 * injected cookies fails because Vercel/Sparticuz Chromium ≠ the device that
 * created the session. Solution: extension runs in user's real browser with
 * their real session. Backend just reads what the extension collected.
 *
 * Data shape the extension sends (browser-extension/collectors/instagram.js):
 *   {
 *     savedPosts:   [{ postUrl, imageUrl, altText, savedAt }],
 *     userPosts:    [{ postUrl, imageUrl, altText, caption, likeCount, postedAt }],
 *     following:    [{ username, displayName, profileUrl, timestamp }],
 *     likedPosts:   [{ postId, shortcode, caption, imageUrl, likedAt }],
 *     storiesViewed:[{ userId, username, storyId, timestamp }],
 *     profileInfo:  { username, followers, following, posts, bio, ... },
 *     interests:    ['#hashtag', ...]
 *   }
 *
 * We map this into the normalizer's expected shape:
 *   { saved_posts, own_posts, follows }
 * (matching the original Playwright scraper's output for code reuse).
 */

import { createLogger } from '../logger.js';
import { getSupabase } from '../observationUtils.js';
import { normalizeInstagramScrape } from '../instagramObservationNormalizer.js';

const log = createLogger('ObservationIngestion');

const LOOKBACK_HOURS = 48; // sample the last 48h of extension captures
const MAX_OBSERVATIONS = 80;

/**
 * Read raw Instagram data the extension collected and turn it into observations.
 * @param {string} userId
 * @returns {Promise<Array<{content: string, contentType: string}>>}
 */
async function fetchInstagramObservations(userId) {
  const observations = [];
  let supabase;
  try {
    supabase = await getSupabase();
  } catch (e) {
    log.warn('Instagram fetcher: supabase unavailable', { error: e?.message });
    return observations;
  }
  if (!supabase) return observations;

  // Pull recent rows the extension wrote.
  const since = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
  let rows;
  try {
    const { data, error } = await supabase
      .from('user_platform_data')
      .select('raw_data, extracted_at')
      .eq('user_id', userId)
      .eq('platform', 'instagram')
      .gte('extracted_at', since)
      .order('extracted_at', { ascending: false })
      .limit(20);
    if (error) {
      log.warn('Instagram fetcher: query error', { error: error.message });
      return observations;
    }
    rows = data || [];
  } catch (e) {
    log.warn('Instagram fetcher: unexpected query failure', { error: e?.message });
    return observations;
  }

  if (rows.length === 0) {
    return observations;
  }

  // Aggregate across rows, deduplicating by URL/username so multiple
  // extension snapshots of the same data don't produce duplicate observations.
  const savedSeen = new Set();
  const ownSeen = new Set();
  const followsSeen = new Set();

  const aggregate = {
    saved_posts: [],
    own_posts: [],
    follows: [],
  };

  for (const row of rows) {
    const r = row.raw_data || {};

    // Saved posts (extension key: savedPosts; sometimes also likedPosts becomes saved-shaped)
    for (const p of (r.savedPosts || [])) {
      const url = p.postUrl || p.url;
      if (!url || savedSeen.has(url)) continue;
      savedSeen.add(url);
      aggregate.saved_posts.push({
        url,
        alt: p.altText || p.caption || null,
        kind: 'post',
      });
    }

    // User's own posts
    for (const p of (r.userPosts || [])) {
      const url = p.postUrl || p.url;
      if (!url || ownSeen.has(url)) continue;
      ownSeen.add(url);
      aggregate.own_posts.push({
        url,
        alt: p.caption || p.altText || null,
        kind: 'post',
      });
    }

    // Following
    for (const f of (r.following || [])) {
      const username = f.username;
      if (!username || followsSeen.has(username)) continue;
      followsSeen.add(username);
      aggregate.follows.push({
        username,
        display_name: f.displayName || null,
      });
    }

    // Liked posts — treat as saved-like for now (intentional engagement signal)
    for (const p of (r.likedPosts || [])) {
      const url = p.shortcode ? `https://www.instagram.com/p/${p.shortcode}/` : null;
      if (!url || savedSeen.has(url)) continue;
      savedSeen.add(url);
      aggregate.saved_posts.push({
        url,
        alt: p.caption || null,
        kind: 'post',
      });
    }
  }

  log.info('Instagram fetcher: aggregated extension data', {
    userId: userId.slice(0, 8),
    rows_scanned: rows.length,
    saved_count: aggregate.saved_posts.length,
    own_count: aggregate.own_posts.length,
    follows_count: aggregate.follows.length,
  });

  if (
    aggregate.saved_posts.length === 0 &&
    aggregate.own_posts.length === 0 &&
    aggregate.follows.length === 0
  ) {
    return observations;
  }

  // Normalize via the pure-function normalizer we already have.
  const normalized = normalizeInstagramScrape(aggregate, {
    maxObservations: MAX_OBSERVATIONS,
  });

  return normalized;
}

export default fetchInstagramObservations;
export { fetchInstagramObservations };
