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
