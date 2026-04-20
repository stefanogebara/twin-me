/**
 * GitHub observation fetcher.
 * Extracted from observationIngestion.js — do not change function signatures.
 */

import axios from 'axios';
import { getValidAccessToken } from '../tokenRefreshService.js';
import { createLogger } from '../logger.js';
import { sanitizeExternal, getSupabase } from '../observationUtils.js';

const log = createLogger('ObservationIngestion');

/**
 * Classify a list of repo names/topics into broad project type categories.
 * Returns the dominant category label or null if none match.
 */
function detectGitHubProjectType(repoNames) {
  const patterns = {
    'web development':   /\b(web|frontend|backend|api|server|client|react|vue|angular|next|express|fastapi|django|rails|node)\b/i,
    'mobile':            /\b(mobile|android|ios|react.native|flutter|swift|kotlin|expo)\b/i,
    'data science / ML': /\b(ml|ai|data|model|notebook|pytorch|tensorflow|sklearn|pandas|kaggle|analysis|predict)\b/i,
    'DevOps / infra':    /\b(docker|k8s|kubernetes|terraform|ansible|infra|deploy|ci|cd|helm|aws|gcp|azure|ops)\b/i,
    'CLI / tooling':     /\b(cli|tool|script|util|helper|gen|generator|automation|bot|plugin)\b/i,
    'game dev':          /\b(game|unity|godot|unreal|engine|shader|rpg|fps)\b/i,
    'open source libs':  /\b(lib|library|sdk|framework|package|npm|pypi|crate|gem)\b/i,
  };
  const counts = {};
  for (const name of repoNames) {
    for (const [label, re] of Object.entries(patterns)) {
      if (re.test(name)) counts[label] = (counts[label] || 0) + 1;
    }
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return sorted.length > 0 ? sorted[0][0] : null;
}

/**
 * Mark a GitHub connection as needing re-authentication in platform_connections.
 * Mirrors the same pattern used in cron-platform-polling.js lines 168-182.
 */
async function _markGitHubNeedsReauth(supabase, userId) {
  const { error } = await supabase
    .from('platform_connections')
    .update({
      status: 'expired',
      last_sync_status: 'auth_error',
      last_sync_error: 'Authentication failed - please reconnect GitHub',
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('platform', 'github');
  if (error) {
    log.warn('Failed to mark needs_reauth', { error });
  }
}

/**
 * Fetch recent GitHub activity and convert to NL observations.
 *
 * Auth priority:
 *  1. OAuth token via getValidAccessToken(userId, 'github')  — standard platform flow
 *  2. PAT from user_github_config table                      — legacy / power-user path
 *
 * Username resolution order:
 *  1. platform_connections.platform_user_id  (set during OAuth callback)
 *  2. GET /user with the token               (live API call)
 *  3. user_github_config.github_username     (PAT config fallback)
 *
 * @param {string} userId
 * @returns {Promise<Array<string|{content:string,contentType:string}>>} NL observation array
 */
async function fetchGitHubObservations(userId) {
  const supabase = await getSupabase();
  if (!supabase) return [];

  const observations = [];

  // ── 1. Resolve access token (OAuth-first, PAT fallback) ───────────────────
  let accessToken = null;
  let githubUsername = null;

  // Try OAuth connection first
  const tokenResult = await getValidAccessToken(userId, 'github');
  if (tokenResult.success && tokenResult.accessToken) {
    accessToken = tokenResult.accessToken;

    // Try to get username from platform_connections metadata (set during OAuth)
    const { data: conn } = await supabase
      .from('platform_connections')
      .select('platform_user_id, metadata')
      .eq('user_id', userId)
      .eq('platform', 'github')
      .single();
    githubUsername = conn?.platform_user_id || conn?.metadata?.login || conn?.metadata?.username || null;
  } else {
    // Fall back to PAT from user_github_config
    const { data: patConfig } = await supabase
      .from('user_github_config')
      .select('github_username, access_token')
      .eq('user_id', userId)
      .single();

    if (patConfig?.access_token) {
      accessToken = patConfig.access_token;
      githubUsername = patConfig.github_username || null;
    }
  }

  if (!accessToken) {
    log.warn('No valid token (OAuth or PAT)', { userId });
    return observations;
  }

  const headers = {
    Authorization: `token ${accessToken}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'TwinMe/1.0',
  };

  // ── 2. Resolve username if still unknown ──────────────────────────────────
  if (!githubUsername) {
    try {
      const userRes = await axios.get('https://api.github.com/user', { headers, timeout: 10000 });
      githubUsername = userRes.data?.login || null;
    } catch (err) {
      if (err.response?.status === 401) {
        await _markGitHubNeedsReauth(supabase, userId);
        log.warn('401 fetching /user — marked needs_reauth', { userId });
        return observations;
      }
      log.warn('Could not resolve username', { error: err });
    }
  }

  if (!githubUsername) {
    log.warn('Username could not be determined', { userId });
    return observations;
  }

  // ── 3. Fetch events (last 100) ────────────────────────────────────────────
  let events = [];
  try {
    const eventsRes = await axios.get(
      `https://api.github.com/users/${githubUsername}/events?per_page=100`,
      { headers, timeout: 10000 }
    );
    events = eventsRes.data || [];
  } catch (err) {
    if (err.response?.status === 401) {
      await _markGitHubNeedsReauth(supabase, userId);
      log.warn('401 on events — marked needs_reauth', { userId });
      return observations;
    }
    log.warn('Events fetch error', { error: err });
  }

  // ── 4. Fetch repos (most recently updated, up to 30) ─────────────────────
  let repos = [];
  try {
    const reposRes = await axios.get(
      'https://api.github.com/user/repos?sort=updated&per_page=30',
      { headers, timeout: 10000 }
    );
    repos = reposRes.data || [];
  } catch (err) {
    if (err.response?.status === 401) {
      await _markGitHubNeedsReauth(supabase, userId);
      log.warn('401 on repos — marked needs_reauth', { userId });
      return observations;
    }
    log.warn('Repos fetch error (non-fatal)', { error: err });
  }

  // ── 4b. GraphQL contribution calendar (full 365-day heatmap) ─────────────
  // Uses ~2 rate-limit points. Gracefully degrades to REST-only on failure.
  let contribCalendar = null;
  try {
    const gqlQuery = `query($login: String!) {
      user(login: $login) {
        contributionsCollection {
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                date
                contributionCount
                weekday
              }
            }
          }
          totalCommitContributions
          totalIssueContributions
          totalPullRequestContributions
          totalPullRequestReviewContributions
        }
      }
    }`;
    const gqlRes = await axios.post(
      'https://api.github.com/graphql',
      { query: gqlQuery, variables: { login: githubUsername } },
      {
        headers: {
          Authorization: `bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'User-Agent': 'TwinMe/1.0',
        },
        timeout: 15000,
      }
    );
    const cc = gqlRes.data?.data?.user?.contributionsCollection;
    if (cc?.contributionCalendar) {
      contribCalendar = {
        totalContributions: cc.contributionCalendar.totalContributions || 0,
        totalCommits: cc.totalCommitContributions || 0,
        totalPRs: cc.totalPullRequestContributions || 0,
        totalReviews: cc.totalPullRequestReviewContributions || 0,
        totalIssues: cc.totalIssueContributions || 0,
        weeks: cc.contributionCalendar.weeks || [],
      };
    }
  } catch (err) {
    log.warn('GitHub GraphQL contribution calendar failed (non-fatal)', { error: err?.message });
  }

  // ── 4c. Flatten calendar + compute streaks / distributions ───────────────
  if (contribCalendar) {
    const days = [];
    for (const w of contribCalendar.weeks) {
      for (const d of (w.contributionDays || [])) {
        days.push({
          date: d.date,
          count: d.contributionCount || 0,
          weekday: d.weekday, // 0=Sunday ... 6=Saturday
        });
      }
    }
    // Ensure chronological order
    days.sort((a, b) => a.date.localeCompare(b.date));

    // Year summary
    const year = new Date().getFullYear();
    observations.push({
      content: `Your GitHub ${year} activity: ${contribCalendar.totalContributions} contributions — ${contribCalendar.totalCommits} commits, ${contribCalendar.totalPRs} PRs, ${contribCalendar.totalReviews} reviews, ${contribCalendar.totalIssues} issues`,
      contentType: 'annual_summary',
    });

    // Longest streak
    let longestStreak = 0;
    let longestStreakEnd = null;
    let currentRun = 0;
    let currentRunEnd = null;
    for (const d of days) {
      if (d.count > 0) {
        currentRun++;
        currentRunEnd = d.date;
        if (currentRun > longestStreak) {
          longestStreak = currentRun;
          longestStreakEnd = currentRunEnd;
        }
      } else {
        currentRun = 0;
        currentRunEnd = null;
      }
    }
    if (longestStreak >= 3) {
      observations.push({
        content: `Longest GitHub contribution streak in the past year: ${longestStreak} consecutive days${longestStreakEnd ? ` (ending ${longestStreakEnd})` : ''}`,
        contentType: 'annual_summary',
      });
    }

    // Current streak (consecutive days ending today/yesterday with contributions)
    let curStreak = 0;
    for (let i = days.length - 1; i >= 0; i--) {
      if (days[i].count > 0) curStreak++;
      else break;
    }
    if (curStreak >= 2) {
      observations.push({
        content: `Current GitHub contribution streak: ${curStreak} consecutive day${curStreak !== 1 ? 's' : ''}`,
        contentType: 'current_state',
      });
    }

    // Day-of-week distribution (weekday coder vs weekend tinkerer)
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const weekdayTotals = [0, 0, 0, 0, 0, 0, 0];
    for (const d of days) weekdayTotals[d.weekday] += d.count;
    const weekdaySum = weekdayTotals[1] + weekdayTotals[2] + weekdayTotals[3] + weekdayTotals[4] + weekdayTotals[5];
    const weekendSum = weekdayTotals[0] + weekdayTotals[6];
    const totalAll = weekdaySum + weekendSum;
    if (totalAll > 20) {
      const peakIdx = weekdayTotals.indexOf(Math.max(...weekdayTotals));
      const weekendPct = Math.round((weekendSum / totalAll) * 100);
      const persona = weekendPct >= 35 ? 'weekend tinkerer' : weekendPct <= 15 ? 'strict weekday coder' : 'weekday coder';
      observations.push({
        content: `GitHub rhythm: ${persona} — peak day is ${dayNames[peakIdx]} (${weekdayTotals[peakIdx]} contributions), ${weekendPct}% of activity on weekends`,
        contentType: 'annual_summary',
      });
    }

    // Peak month
    const monthTotals = {};
    for (const d of days) {
      const ym = d.date.slice(0, 7); // YYYY-MM
      monthTotals[ym] = (monthTotals[ym] || 0) + d.count;
    }
    const peakMonthEntry = Object.entries(monthTotals).sort(([, a], [, b]) => b - a)[0];
    if (peakMonthEntry && peakMonthEntry[1] > 0) {
      const [ym, count] = peakMonthEntry;
      const [yy, mm] = ym.split('-');
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      observations.push({
        content: `Most active GitHub month in the past year: ${monthNames[parseInt(mm, 10) - 1]} ${yy} with ${count} contributions`,
        contentType: 'annual_summary',
      });
    }
  }

  // ── 4d. Language bytes from top starred repos (authoritative vs name-guess) ──
  let languageBytes = null;
  if (repos.length > 0) {
    try {
      const topByStars = [...repos]
        .sort((a, b) => (b.stargazers_count || 0) - (a.stargazers_count || 0))
        .slice(0, 5);
      const langResults = await Promise.all(
        topByStars.map(r =>
          r.owner?.login && r.name
            ? axios
                .get(`https://api.github.com/repos/${r.owner.login}/${r.name}/languages`, {
                  headers,
                  timeout: 10000,
                })
                .then(res => res.data || {})
                .catch(() => ({}))
            : Promise.resolve({})
        )
      );
      const agg = {};
      for (const byLang of langResults) {
        for (const [lang, bytes] of Object.entries(byLang)) {
          agg[lang] = (agg[lang] || 0) + (bytes || 0);
        }
      }
      const total = Object.values(agg).reduce((a, b) => a + b, 0);
      if (total > 0) {
        languageBytes = Object.entries(agg)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 4)
          .map(([lang, bytes]) => ({ lang, pct: Math.round((bytes / total) * 100) }));
      }
    } catch (err) {
      log.debug('GitHub language bytes fetch failed (non-fatal)', { error: err?.message });
    }
  }
  if (languageBytes && languageBytes.length > 0) {
    const parts = languageBytes.map(({ lang, pct }) => `${lang} (${pct}%)`).join(', ');
    observations.push({
      content: `Your GitHub language distribution: ${parts}`,
      contentType: 'annual_summary',
    });
  }

  // ── 5. Build event-based observations ────────────────────────────────────
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  const pushByRepo = new Map();   // repo → [commit messages]
  const pushByRepo30d = new Map(); // repo → commitCount (last 30 days, for streak)
  const prsSeen = new Set();
  const activeDays = new Set();   // YYYY-MM-DD strings for commit streak

  for (const event of events) {
    const eventTime = new Date(event.created_at).getTime();
    const repo = sanitizeExternal(event.repo?.name || '', 80).replace(/^[^/]+\//, ''); // strip "owner/"

    // Track active commit days over last 30 days for streak
    if (event.type === 'PushEvent' && eventTime > thirtyDaysAgo) {
      const day = event.created_at.slice(0, 10);
      activeDays.add(day);
      const commitCount = (event.payload?.commits || []).length;
      pushByRepo30d.set(repo, (pushByRepo30d.get(repo) || 0) + commitCount);
    }

    // Only generate per-event observations for last 24h
    if (eventTime < oneDayAgo) continue;

    switch (event.type) {
      case 'PushEvent': {
        const commits = event.payload?.commits || [];
        if (commits.length === 0) break;
        const branch = sanitizeExternal(event.payload?.ref?.replace('refs/heads/', '') || '', 60);
        if (!pushByRepo.has(repo)) pushByRepo.set(repo, { branch, messages: [] });
        for (const c of commits.slice(0, 3)) {
          const msg = sanitizeExternal(c.message?.split('\n')[0] || '', 80);
          if (msg) pushByRepo.get(repo).messages.push(msg);
        }
        break;
      }
      case 'PullRequestEvent': {
        const pr = event.payload?.pull_request;
        if (!pr || prsSeen.has(pr.number)) break;
        prsSeen.add(pr.number);
        const action = event.payload?.action;
        if (!['opened', 'closed'].includes(action)) break;
        const isMerged = action === 'closed' && pr.merged;
        const verb = isMerged ? 'Merged' : action === 'opened' ? 'Opened' : 'Closed';
        const title = sanitizeExternal(pr.title || '', 80);
        observations.push(`${verb} PR in ${repo}: "${title}"`);
        break;
      }
      case 'IssuesEvent': {
        const issue = event.payload?.issue;
        const action = event.payload?.action;
        if (!issue || action !== 'opened') break;
        const title = sanitizeExternal(issue.title || '', 80);
        observations.push(`Opened GitHub issue in ${repo}: "${title}"`);
        break;
      }
      case 'CreateEvent': {
        const refType = event.payload?.ref_type;
        if (refType === 'repository') {
          observations.push(`Created new GitHub repository: ${repo}`);
        } else if (refType === 'branch') {
          const branch = sanitizeExternal(event.payload?.ref || '', 60);
          if (branch) observations.push(`Created branch "${branch}" in ${repo}`);
        }
        break;
      }
      case 'WatchEvent': {
        if (event.payload?.action === 'started') {
          observations.push(`Starred GitHub repository: ${repo}`);
        }
        break;
      }
      case 'ForkEvent': {
        observations.push(`Forked GitHub repository: ${repo}`);
        break;
      }
    }
  }

  // Summarize pushes per repo (last 24h)
  for (const [repo, { branch, messages }] of pushByRepo) {
    const count = messages.length;
    const msgPreview = messages.slice(0, 2).map(m => `"${m}"`).join(', ');
    const branchPart = branch ? ` on ${branch}` : '';
    observations.push(`Pushed ${count} commit${count !== 1 ? 's' : ''} to ${repo}${branchPart} — ${msgPreview}`);
  }

  // ── 6. Weekly coding summary ──────────────────────────────────────────────
  const weekEvents = events.filter(e => e.type === 'PushEvent' && new Date(e.created_at).getTime() > sevenDaysAgo);
  const weekCommits = weekEvents.reduce((sum, e) => sum + (e.payload?.commits?.length || 0), 0);
  const weekRepos = new Set(weekEvents.map(e => e.repo?.name)).size;
  if (weekCommits > 0) {
    observations.push({
      content: `Made ${weekCommits} commit${weekCommits !== 1 ? 's' : ''} across ${weekRepos} repo${weekRepos !== 1 ? 's' : ''} on GitHub this week`,
      contentType: 'weekly_summary',
    });
  }

  // ── 7. Commit streak / frequency (last 30 days) ───────────────────────────
  const activeDayCount = activeDays.size;
  if (activeDayCount > 0) {
    observations.push({
      content: `Committed code on ${activeDayCount} day${activeDayCount !== 1 ? 's' : ''} in the last 30 days on GitHub`,
      contentType: 'weekly_summary',
    });
  }

  // ── 8. Activity pattern — busiest day of week ─────────────────────────────
  if (events.length >= 5) {
    const dayCounts = [0, 0, 0, 0, 0, 0, 0]; // Sun–Sat
    for (const event of events) {
      if (new Date(event.created_at).getTime() > thirtyDaysAgo) {
        dayCounts[new Date(event.created_at).getDay()]++;
      }
    }
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const busiestIdx = dayCounts.indexOf(Math.max(...dayCounts));
    if (dayCounts[busiestIdx] >= 3) {
      observations.push({
        content: `Most active on GitHub on ${dayNames[busiestIdx]}s based on recent activity patterns`,
        contentType: 'weekly_summary',
      });
    }
  }

  // ── 9. Repo-based observations ────────────────────────────────────────────
  if (repos.length > 0) {
    // Primary tech stack from repo languages
    const languageCounts = {};
    for (const repo of repos) {
      if (repo.language) {
        languageCounts[repo.language] = (languageCounts[repo.language] || 0) + 1;
      }
    }
    const topLanguages = Object.entries(languageCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([lang]) => lang);
    if (topLanguages.length > 0) {
      observations.push({
        content: `Primary GitHub tech stack: ${topLanguages.join(', ')} based on recent repositories`,
        contentType: 'weekly_summary',
      });
    }

    // Project type classification
    const repoNamesAndDescriptions = repos.map(r =>
      `${r.name || ''} ${r.description || ''}`
    );
    const projectType = detectGitHubProjectType(repoNamesAndDescriptions);
    const publicCount = repos.filter(r => !r.private).length;
    const privateCount = repos.filter(r => r.private).length;

    if (projectType) {
      const pubPart = publicCount > 0 ? `${publicCount} public` : '';
      const privPart = privateCount > 0 ? `${privateCount} private` : '';
      const repoParts = [pubPart, privPart].filter(Boolean).join(', ');
      observations.push({
        content: `Working on ${repoParts} GitHub repos, primarily focused on ${projectType}`,
        contentType: 'weekly_summary',
      });
    } else if (publicCount + privateCount > 0) {
      const pubPart = publicCount > 0 ? `${publicCount} public` : '';
      const privPart = privateCount > 0 ? `${privateCount} private` : '';
      const repoParts = [pubPart, privPart].filter(Boolean).join(', ');
      observations.push({
        content: `Active on GitHub with ${repoParts} repositories`,
        contentType: 'weekly_summary',
      });
    }
  }

  log.info('Generated GitHub observations', { count: observations.length, githubUsername, userId });

  // Update last_synced_at in user_github_config if row exists (non-blocking)
  supabase
    .from('user_github_config')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('user_id', userId)
    .then(() => {})
    .catch(() => {});

  return observations;
}

export default fetchGitHubObservations;
export { fetchGitHubObservations };
