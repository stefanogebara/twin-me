/**
 * Hacker News Provider — lookup user profile + submitted stories via Algolia API.
 * FREE, no API key needed. Very generous rate limit (10k req/hr).
 */

import { createLogger } from '../logger.js';

const log = createLogger('HNProvider');
const TIMEOUT_MS = 4000;

export async function lookupHackerNews(username) {
  if (!username || username.length < 2) return null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    // Fetch user profile
    const userRes = await fetch(
      `https://hn.algolia.com/api/v1/users/${encodeURIComponent(username)}`,
      { signal: controller.signal }
    );

    if (!userRes.ok) { clearTimeout(timer); return null; }

    const user = await userRes.json();
    if (!user || !user.username) { clearTimeout(timer); return null; }

    // Strip HTML from about field
    const bio = user.about
      ? user.about.replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim().slice(0, 500)
      : null;

    // Fetch submitted stories for topic extraction
    let topTopics = [];
    let storyCount = 0;
    let commentCount = 0;
    try {
      const storiesRes = await fetch(
        `https://hn.algolia.com/api/v1/search?tags=author_${encodeURIComponent(username)}&hitsPerPage=30`,
        { signal: controller.signal }
      );
      if (storiesRes.ok) {
        const storiesJson = await storiesRes.json();
        storyCount = storiesJson.nbHits || 0;

        // Extract topics from story titles
        const stories = (storiesJson.hits || []).filter(h => h.title);
        const words = {};
        for (const story of stories) {
          // Extract meaningful words from titles (skip short/common words)
          const titleWords = story.title.toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .split(/\s+/)
            .filter(w => w.length > 3 && !STOP_WORDS.has(w));
          for (const w of titleWords) words[w] = (words[w] || 0) + 1;
        }
        topTopics = Object.entries(words)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([word]) => word);

        // Count comments separately
        const commentsRes = await fetch(
          `https://hn.algolia.com/api/v1/search?tags=author_${encodeURIComponent(username)},comment&hitsPerPage=0`,
          { signal: controller.signal }
        );
        if (commentsRes.ok) {
          const commentsJson = await commentsRes.json();
          commentCount = commentsJson.nbHits || 0;
        }
      }
    } catch {
      // Stories fetch failed — profile data still useful
    }

    clearTimeout(timer);

    const accountAgeDays = user.created_at
      ? Math.floor((Date.now() - new Date(user.created_at).getTime()) / 86400000)
      : null;

    log.info('HN found', { username, karma: user.karma, stories: storyCount });

    return {
      username: user.username,
      karma: user.karma || 0,
      bio,
      accountAgeDays,
      storyCount,
      commentCount,
      topTopics,
      profileUrl: `https://news.ycombinator.com/user?id=${user.username}`,
    };
  } catch (err) {
    if (err.name !== 'AbortError') log.warn('HN lookup failed', { username, error: err.message });
    return null;
  }
}

const STOP_WORDS = new Set([
  'this', 'that', 'with', 'from', 'have', 'been', 'will', 'would', 'could',
  'should', 'about', 'which', 'their', 'there', 'what', 'when', 'where',
  'your', 'more', 'some', 'than', 'them', 'into', 'only', 'other', 'also',
  'just', 'most', 'like', 'make', 'know', 'take', 'come', 'want', 'give',
  'show', 'tell', 'work', 'call', 'after', 'year', 'they', 'does', 'being',
  'very', 'much', 'then', 'here', 'well', 'were', 'said', 'each', 'over',
]);
