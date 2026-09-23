/**
 * Reddit Provider — lookup public profile + top subreddits by username.
 * FREE, no API key needed. Requires custom User-Agent.
 */

import { createLogger } from '../logger.js';

const log = createLogger('RedditProvider');
const USER_AGENT = 'TwinMe/1.0 (enrichment; +https://twinme.me)';
const TIMEOUT_MS = 4000;

export async function lookupReddit(username) {
  if (!username || username.length < 2) return null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    // Fetch user profile
    const profileRes = await fetch(`https://www.reddit.com/user/${encodeURIComponent(username)}/about.json`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });

    if (!profileRes.ok) { clearTimeout(timer); return null; }

    const profileJson = await profileRes.json();
    const user = profileJson?.data;
    if (!user || user.is_suspended) { clearTimeout(timer); return null; }

    // Fetch top comments for subreddit extraction
    let topSubreddits = [];
    try {
      const commentsRes = await fetch(
        `https://www.reddit.com/user/${encodeURIComponent(username)}/comments.json?limit=50&sort=top`,
        { headers: { 'User-Agent': USER_AGENT }, signal: controller.signal }
      );
      if (commentsRes.ok) {
        const commentsJson = await commentsRes.json();
        const comments = commentsJson?.data?.children || [];
        // Count subreddit frequency
        const subCounts = {};
        for (const c of comments) {
          const sub = c.data?.subreddit;
          if (sub) subCounts[sub] = (subCounts[sub] || 0) + 1;
        }
        topSubreddits = Object.entries(subCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([name]) => name);
      }
    } catch {
      // Comments fetch failed — profile data still useful
    }

    clearTimeout(timer);

    const accountAgeDays = user.created_utc
      ? Math.floor((Date.now() / 1000 - user.created_utc) / 86400)
      : null;

    log.info('Reddit found', { username, karma: user.link_karma + user.comment_karma, subreddits: topSubreddits.length });

    return {
      username: user.name,
      karma: { link: user.link_karma || 0, comment: user.comment_karma || 0 },
      accountAgeDays,
      bio: user.subreddit?.public_description?.trim() || null,
      topSubreddits,
      profileUrl: `https://reddit.com/user/${user.name}`,
    };
  } catch (err) {
    if (err.name !== 'AbortError') log.warn('Reddit lookup failed', { username, error: err.message });
    return null;
  }
}
