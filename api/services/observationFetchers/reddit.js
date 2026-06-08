/**
 * Reddit observation fetcher.
 * Extracted from observationIngestion.js — do not change function signatures.
 */

import axios from 'axios';
import { getValidAccessToken } from '../tokenRefreshService.js';
import { markConnectionNeedsReconnect } from '../connectionMappingService.js';
import { createLogger } from '../logger.js';
import { sanitizeExternal } from '../observationUtils.js';

const log = createLogger('ObservationIngestion');

/**
 * Fetch Reddit subscribed-subreddit data and return natural-language observations.
 * Groups subreddits by topic category to surface interest patterns.
 */
async function fetchRedditObservations(userId) {
  const observations = [];

  const tokenResult = await getValidAccessToken(userId, 'reddit');
  if (!tokenResult.success || !tokenResult.accessToken) {
    // Phase 2 (2026-06-08): throw a tagged error instead of silently returning []
    // so observationIngestion records auth_failed and surfaces a Reconnect CTA
    // (matches spotify.js). Silent [] was masked as no_new_data.
    const err = new Error(tokenResult.error || 'Reddit token unavailable');
    err.code = tokenResult.requiresReauth ? 'AUTH_FAILED' : 'TOKEN_UNAVAILABLE';
    throw err;
  }

  const headers = {
    Authorization: `Bearer ${tokenResult.accessToken}`,
    'User-Agent': 'TwinMe/1.0',
  };

  // Fetch subscribed subreddits (top 20)
  let subreddits = [];
  try {
    const subRes = await axios.get(
      'https://oauth.reddit.com/subreddits/mine/subscriber?limit=20',
      { headers, timeout: 10000 }
    );
    subreddits = (subRes.data?.data?.children || []).map(c => c.data);
  } catch (e) {
    // Audit 2026-05-22: this previously logged just `error: e`, which
    // serialized to `{}` for axios errors and made debugging impossible.
    // Reddit was 33 days stale with last_sync_status='success' and no
    // recorded error — the legacy fetcher fails silently on auth/scope
    // issues. Capture status + body so the next cron run surfaces the
    // real cause in logs.
    const status = e?.response?.status;
    const body = e?.response?.data;
    log.warn('Reddit subreddits error', {
      userId,
      status,
      message: e?.message,
      bodyExcerpt: typeof body === 'string' ? body.slice(0, 200) : JSON.stringify(body || {}).slice(0, 200),
    });
    // Surface terminal cases. 401/403 = token revoked or insufficient
    // scope; flip the connection status so the frontend amber pill fires
    // and `getConnectionId` (filters status='active') stops finding it,
    // halting silent retry loops until the user reconnects.
    if (status === 401 || status === 403) {
      await markConnectionNeedsReconnect(userId, 'reddit', `subreddits ${status}`);
    }
    return observations;
  }

  if (subreddits.length === 0) {
    log.info('Reddit returned 0 subscribed subreddits (user may have unsubscribed all)', { userId });
    return observations;
  }

  const names = subreddits.map(s => sanitizeExternal(s.display_name || s.name, 60)).filter(Boolean);
  const top3 = names.slice(0, 3).map(n => `r/${n}`).join(', ');

  observations.push({
    content: `Subscribed to ${names.length} subreddits including ${top3}`,
    contentType: 'weekly_summary',
  });

  // Group subreddits into broad topic categories
  const categoryPatterns = {
    'programming/tech': /\b(programming|coding|code|software|dev|web|python|javascript|typescript|linux|open.?source|cyber|ai|ml|data|cloud|backend|frontend|rust|golang|java|csharp|dotnet|devops|sysadmin|netsec|hacking|compsci|computerscience)\b/i,
    'gaming':           /\b(gaming|gamer|game|games|rpg|mmo|fps|strategy|indie|minecraft|valorant|league|fortnite|apex|steam|roblox|overwatch|wow|warcraft|dota|hearthstone|pokemon|nintendo|playstation|xbox)\b/i,
    'finance/investing': /\b(finance|invest|investing|stocks|trading|forex|crypto|bitcoin|ethereum|defi|web3|personalfinance|wallstreet|options|etf|realestate|entrepreneur)\b/i,
    'science/learning': /\b(science|physics|math|biology|chemistry|neuroscience|space|astronomy|history|philosophy|psychology|sociology|learn|askscience|explainlikeimfive|todayilearned|futurology)\b/i,
    'fitness/health':   /\b(fitness|gym|workout|running|yoga|meditation|nutrition|diet|weightlifting|bodybuilding|cycling|hiking|health|mentalhealth|loseit|gainit)\b/i,
    'creative/art':     /\b(art|design|creative|writing|fiction|draw|illustration|photography|film|animation|3d|poetry|music|piano|guitar|diy|crafts|woodworking)\b/i,
    'news/politics':    /\b(news|politics|world|geopolitics|economics|policy|government|law|legal|environment|climate)\b/i,
    'entertainment':    /\b(movies|tv|television|anime|manga|books|reading|music|podcasts|comedy|humor|aww|funny|memes|pop)\b/i,
  };

  const categoryHits = {};
  for (const name of names) {
    for (const [category, pattern] of Object.entries(categoryPatterns)) {
      if (pattern.test(name)) {
        categoryHits[category] = (categoryHits[category] || 0) + 1;
      }
    }
  }

  const topCategories = Object.entries(categoryHits)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([cat]) => cat);

  if (topCategories.length > 0) {
    observations.push({
      content: `Reddit community interests span: ${topCategories.join(', ')}`,
      contentType: 'weekly_summary',
    });
  }

  // ── Reddit username + comment/post history ────────────────────────────────
  let redditUsername = null;
  try {
    const meRes = await axios.get('https://oauth.reddit.com/api/v1/me', { headers, timeout: 8000 });
    redditUsername = meRes.data?.name;
  } catch (e) {
    log.warn('Reddit identity error', { error: e.message });
  }

  if (redditUsername) {
    // Recent comments (metadata only — no body content)
    try {
      const commentsRes = await axios.get(
        `https://oauth.reddit.com/user/${redditUsername}/comments?limit=25&sort=new&t=week`,
        { headers, timeout: 10000 }
      );
      const comments = (commentsRes.data?.data?.children || []).map(c => c.data);
      if (comments.length > 0) {
        const commentSubs = [...new Set(comments.map(c => c.subreddit).filter(Boolean))];
        const avgLen = Math.round(comments.reduce((sum, c) => sum + (c.body?.length || 0), 0) / comments.length);
        const style = avgLen > 300 ? 'verbose' : avgLen > 100 ? 'moderate' : 'concise';
        observations.push({
          content: `Commented ${comments.length} times on Reddit this week, mostly in ${commentSubs.slice(0, 3).map(s => 'r/' + s).join(', ')}`,
          contentType: 'weekly_summary',
        });
        observations.push({
          content: `Reddit commenting style: ${style} (avg ${avgLen} characters per comment)`,
          contentType: 'weekly_summary',
        });
      }
    } catch (e) {
      log.warn('Reddit comments error', { error: e.message });
    }

    // Recent posts/submissions
    try {
      const postsRes = await axios.get(
        `https://oauth.reddit.com/user/${redditUsername}/submitted?limit=25&sort=new&t=month`,
        { headers, timeout: 10000 }
      );
      const posts = (postsRes.data?.data?.children || []).map(c => c.data);
      if (posts.length > 0) {
        const postTitles = posts.slice(0, 3).map(p => sanitizeExternal(p.title, 80)).filter(Boolean);
        observations.push({
          content: `Posted ${posts.length} times on Reddit this month: ${postTitles.map(t => `"${t}"`).join(', ')}`,
          contentType: 'weekly_summary',
        });
        const topPost = posts.reduce((best, p) => (p.score > (best?.score || 0)) ? p : best, null);
        if (topPost && topPost.score > 10) {
          observations.push({
            content: `Most upvoted recent Reddit post: "${sanitizeExternal(topPost.title, 80)}" in r/${topPost.subreddit} (${topPost.score} upvotes)`,
            contentType: 'weekly_summary',
          });
        }
      }
    } catch (e) {
      log.warn('Reddit posts error', { error: e.message });
    }
  }

  return observations;
}

export default fetchRedditObservations;
export { fetchRedditObservations };
