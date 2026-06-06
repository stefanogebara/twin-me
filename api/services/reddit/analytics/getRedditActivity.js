/**
 * Reddit user activity aggregator.
 *
 * Reddit subscriptions are the cleanest "what is this person genuinely
 * interested in" signal anywhere — people don't subscribe to subreddits
 * to impress anyone. The recent comment+submission history adds posting
 * frequency and which interests they ACT on (vs just lurk in).
 *
 * Endpoints used:
 *   - /api/v1/me                       — username + total karma
 *   - /api/v1/me/karma                 — per-subreddit karma split
 *   - /subreddits/mine/subscriber?limit=100  — subscriptions (mysubreddits scope)
 *   - /user/{username}/comments?limit=50     — recent comments (history scope)
 *   - /user/{username}/submitted?limit=50    — recent submissions
 *
 * Returns aggregates that map cleanly to the personality / interest
 * model the twin already builds:
 *   - subscriptions: count + names of subscribed subs (interest map)
 *   - activity_split: comment_count vs submission_count + ratio
 *                     (lurker vs contributor signal)
 *   - top_active_subs: where the user actually posts/comments,
 *                     sorted by activity volume
 *   - karma: total + per-sub karma top 5 (engagement strength signal)
 *   - posting_cadence: posts per day in the recent window
 *
 * No body content beyond reddit's already-public comment text.
 */

const ENDPOINT_ME = '/api/v1/me';
const ENDPOINT_KARMA = '/api/v1/me/karma';
const ENDPOINT_SUBSCRIPTIONS = '/subreddits/mine/subscriber?limit=100';

const RECENT_HISTORY_LIMIT = 50;
const TOP_SUBS_FOR_RENDER = 8;
const TOP_KARMA_FOR_RENDER = 5;

function dayKey(unixSeconds) {
  if (!unixSeconds) return '';
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

/**
 * Reddit's listing endpoints wrap responses as { kind, data: { children: [{ kind, data: {...} }] } }.
 * Unwrap to plain array of inner data objects.
 */
function unwrapListing(resp) {
  const children = resp?.data?.children;
  if (!Array.isArray(children)) return [];
  return children.map((c) => c?.data).filter(Boolean);
}

/**
 * @param {object} client  { get(path) -> Promise<any> }
 * @param {object} [params]
 */
export async function getRedditActivity(client) {
  // Identity + subscriptions can be parallelised cleanly — they don't
  // depend on each other and Reddit's rate limit is per-user so a
  // small Promise.all is fine.
  const [meResp, karmaResp, subsResp] = await Promise.all([
    client.get(ENDPOINT_ME).catch(() => null),
    client.get(ENDPOINT_KARMA).catch(() => null),
    client.get(ENDPOINT_SUBSCRIPTIONS).catch(() => null),
  ]);

  const username = meResp?.name ?? null;
  if (!username) {
    // No identity = no point fetching user-specific history. Surface
    // an empty result so the caller can no-op gracefully.
    return null;
  }

  const totalKarma = meResp?.total_karma ?? meResp?.link_karma + meResp?.comment_karma ?? null;

  const karmaPerSub = Array.isArray(karmaResp?.data) ? karmaResp.data : [];
  const topKarmaSubs = [...karmaPerSub]
    .sort(
      (a, b) =>
        (b.link_karma ?? 0) + (b.comment_karma ?? 0) -
        ((a.link_karma ?? 0) + (a.comment_karma ?? 0)),
    )
    .slice(0, TOP_KARMA_FOR_RENDER)
    .map((k) => ({
      subreddit: k.sr,
      link_karma: k.link_karma ?? 0,
      comment_karma: k.comment_karma ?? 0,
    }));

  const subscriptions = unwrapListing(subsResp).map((s) => s.display_name).filter(Boolean);

  // History endpoints — sequential to keep total fetches per-user
  // under the 100/min free-tier limit and to make rate-limit failures
  // partial rather than total.
  let comments = [];
  try {
    const commentsResp = await client.get(
      `/user/${encodeURIComponent(username)}/comments?limit=${RECENT_HISTORY_LIMIT}`,
    );
    comments = unwrapListing(commentsResp);
  } catch {
    comments = [];
  }

  let submissions = [];
  try {
    const subsHistory = await client.get(
      `/user/${encodeURIComponent(username)}/submitted?limit=${RECENT_HISTORY_LIMIT}`,
    );
    submissions = unwrapListing(subsHistory);
  } catch {
    submissions = [];
  }

  // Per-sub activity aggregation across both content types.
  const subActivity = new Map();
  const days = new Set();
  for (const c of comments) {
    const sr = c.subreddit ?? 'unknown';
    const entry = subActivity.get(sr) || { subreddit: sr, comments: 0, submissions: 0 };
    entry.comments += 1;
    subActivity.set(sr, entry);
    const dk = dayKey(c.created_utc);
    if (dk) days.add(dk);
  }
  for (const s of submissions) {
    const sr = s.subreddit ?? 'unknown';
    const entry = subActivity.get(sr) || { subreddit: sr, comments: 0, submissions: 0 };
    entry.submissions += 1;
    subActivity.set(sr, entry);
    const dk = dayKey(s.created_utc);
    if (dk) days.add(dk);
  }
  const topActiveSubs = [...subActivity.values()]
    .map((s) => ({ ...s, total: s.comments + s.submissions }))
    .sort((a, b) => b.total - a.total)
    .slice(0, TOP_SUBS_FOR_RENDER);

  // Date range — newest history item to oldest.
  const allTimes = [...comments, ...submissions]
    .map((x) => x.created_utc)
    .filter(Number.isFinite);
  const newestUtc = allTimes.length > 0 ? Math.max(...allTimes) : null;
  const oldestUtc = allTimes.length > 0 ? Math.min(...allTimes) : null;
  const windowDays =
    newestUtc && oldestUtc
      ? Math.max(1, Math.round((newestUtc - oldestUtc) / 86400))
      : null;

  return {
    identity: {
      username,
      total_karma: totalKarma,
    },
    subscriptions: {
      count: subscriptions.length,
      list: subscriptions.slice(0, 50), // truncate so we don't bloat the prompt
    },
    activity_split: {
      comments: comments.length,
      submissions: submissions.length,
      // > 1 means more submissions per comment (poster); < 1 means
      // more comments per submission (engager).
      ratio:
        comments.length > 0
          ? +(submissions.length / comments.length).toFixed(2)
          : null,
    },
    top_active_subs: topActiveSubs,
    karma: {
      top_subs: topKarmaSubs,
    },
    posting_cadence: {
      active_days: days.size,
      window_days: windowDays,
      posts_per_day:
        windowDays && comments.length + submissions.length > 0
          ? +((comments.length + submissions.length) / windowDays).toFixed(2)
          : null,
    },
  };
}
