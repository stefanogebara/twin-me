/**
 * GitHub recent activity aggregator. Fetches /users/:user/events/public
 * (last 100 events, ~30 days for active users) and breaks them down by
 * type, repo, and day.
 *
 * The endpoint is paginated (90 events max per response). We only pull
 * the first page since the user's analytical questions are almost
 * always about the recent window, and the rate-limit cost compounds
 * with pagination.
 *
 * Returns:
 *   - totals: events, repos touched, commits (from PushEvents)
 *   - by_type: PushEvent ×N, PullRequestEvent ×M, ...
 *   - by_repo: top repos by event count
 *   - by_day: per-day event count
 *   - languages: primary language per touched repo (from a separate
 *                /repos/:owner/:repo fetch — bounded to 3 to keep
 *                rate-limit usage flat)
 */

const DEFAULT_DAYS = 30;
const MAX_DAYS = 90;
const LANGUAGE_LOOKUP_LIMIT = 3;

function dayKey(iso) {
  return (iso ?? '').slice(0, 10);
}

/**
 * @param {object} client — { get(path) -> Promise<any> }
 * @param {{ username?: string, days?: number }} params
 *
 * If username is omitted, resolves it from /user (requires an
 * authenticated client — public-client callers must pass username
 * explicitly).
 */
export async function getRecentActivity(client, params = {}) {
  let username = params.username;
  if (!username) {
    try {
      const me = await client.get('/user');
      username = me?.login;
    } catch {
      // No way to know who to query for. Surface empty result rather
      // than throwing — caller (the per-turn analytics dispatcher) will
      // skip the prompt-line injection.
      return null;
    }
  }
  if (!username) return null;

  const days = Math.min(params.days ?? DEFAULT_DAYS, MAX_DAYS);
  const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;

  const events = await client
    .get(`/users/${encodeURIComponent(username)}/events/public?per_page=100`)
    .catch(() => []);
  const list = Array.isArray(events) ? events : [];

  // Filter to the requested window. GitHub returns most-recent first;
  // older events past the cutoff are dropped.
  const inWindow = list.filter((e) => {
    const t = new Date(e.created_at).getTime();
    return Number.isFinite(t) && t >= cutoffMs;
  });

  const byType = new Map();
  const byRepo = new Map();
  const byDay = new Map();
  let commitCount = 0;

  for (const e of inWindow) {
    byType.set(e.type, (byType.get(e.type) ?? 0) + 1);

    const repo = e.repo?.name ?? 'unknown';
    const repoEntry = byRepo.get(repo) || { repo, events: 0, commits: 0 };
    repoEntry.events += 1;
    if (e.type === 'PushEvent') {
      const c = e.payload?.commits?.length ?? 0;
      commitCount += c;
      repoEntry.commits += c;
    }
    byRepo.set(repo, repoEntry);

    const dk = dayKey(e.created_at);
    byDay.set(dk, (byDay.get(dk) ?? 0) + 1);
  }

  const topRepos = [...byRepo.values()]
    .sort((a, b) => b.events - a.events)
    .slice(0, 5);

  // Resolve primary language for the top-3 repos. Best-effort — if a
  // single /repos lookup fails we skip it; the report is still useful
  // without languages.
  const languageLookups = topRepos.slice(0, LANGUAGE_LOOKUP_LIMIT).map(async (r) => {
    try {
      const info = await client.get(`/repos/${r.repo}`);
      return { repo: r.repo, language: info?.language ?? null };
    } catch {
      return { repo: r.repo, language: null };
    }
  });
  const languageResults = await Promise.all(languageLookups);
  const repoLanguages = languageResults.reduce((acc, r) => {
    if (r.language) acc[r.repo] = r.language;
    return acc;
  }, {});

  const langCounts = new Map();
  for (const lang of Object.values(repoLanguages)) {
    langCounts.set(lang, (langCounts.get(lang) ?? 0) + 1);
  }
  const topLanguages = [...langCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([language, count]) => ({ language, count }));

  const days_array = [...byDay.entries()]
    .map(([day, count]) => ({ day, count }))
    .sort((a, b) => a.day.localeCompare(b.day));

  return {
    period: { days, cutoff: new Date(cutoffMs).toISOString() },
    totals: {
      events: inWindow.length,
      repos_touched: byRepo.size,
      commits: commitCount,
    },
    by_type: [...byType.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count),
    top_repos: topRepos,
    top_languages: topLanguages,
    by_day: days_array,
  };
}
