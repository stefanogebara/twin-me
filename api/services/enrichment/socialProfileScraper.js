/**
 * Social Profile Scraper — Deep Enrichment Second Pass
 *
 * Takes social profile URLs discovered by quickEnrich and extracts
 * actual content from each platform. Uses free APIs where available,
 * light scraping (fetch + meta tag parsing) for the rest.
 *
 * Runs AFTER quickEnrich but BEFORE Brave Search deep dive.
 * All requests in parallel with 10s timeout per platform.
 * Graceful degradation — partial results always returned.
 */

import { createLogger } from '../logger.js';

const log = createLogger('SocialProfileScraper');

const REQUEST_TIMEOUT_MS = 10_000;
const REDDIT_USER_AGENT = 'TwinMe/1.0 (deep-enrichment; +https://twinme.me)';
const GITHUB_USER_AGENT = 'TwinMe-App';

// ============================================================
// Platform Extractors
// ============================================================

/**
 * Extract rich data from a GitHub profile URL.
 * Uses GitHub REST API (free, 60 req/hr unauthenticated, 5000 with token).
 */
async function extractGitHub(url, existingData) {
  const username = extractUsernameFromUrl(url, /github\.com\/([^/?#]+)/i);
  if (!username) return null;

  // Skip if quickEnrich already fetched comprehensive GitHub data
  if (existingData.github_top_repos?.length >= 5 && existingData.github_languages?.length > 0) {
    log.info('GitHub: skipping, quickEnrich already has full data');
    return null;
  }

  const headers = buildGitHubHeaders();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const [profileRes, reposRes] = await Promise.all([
      fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, {
        headers,
        signal: controller.signal,
      }),
      fetch(`https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=stars&per_page=10`, {
        headers,
        signal: controller.signal,
      }),
    ]);

    clearTimeout(timer);

    if (!profileRes.ok) return null;
    const user = await profileRes.json();
    if (!user.login) return null;

    const repos = reposRes.ok ? await reposRes.json() : [];
    const validRepos = Array.isArray(repos) ? repos : [];

    // Sort by stars (API should already, but be safe)
    const sortedRepos = [...validRepos].sort((a, b) => (b.stargazers_count || 0) - (a.stargazers_count || 0));

    const languages = [...new Set(validRepos.map(r => r.language).filter(Boolean))];
    const topRepoDescriptions = sortedRepos
      .slice(0, 5)
      .map(r => {
        const lang = r.language ? ` (${r.language})` : '';
        const stars = r.stargazers_count > 0 ? ` [${r.stargazers_count} stars]` : '';
        return `${r.name}${lang}${stars}${r.description ? ' — ' + r.description : ''}`;
      });

    log.info('GitHub: extracted', { username, repos: topRepoDescriptions.length, languages: languages.length });

    return {
      github_bio: user.bio || null,
      github_company: user.company?.replace(/^@/, '') || null,
      github_location: user.location || null,
      github_blog: user.blog || null,
      github_top_repos: topRepoDescriptions,
      github_languages: languages,
      github_followers: user.followers || 0,
      github_public_repos: user.public_repos || 0,
      github_created: user.created_at || null,
    };
  } catch (err) {
    clearTimeout(timer);
    if (err.name !== 'AbortError') log.warn('GitHub extraction failed', { username, error: err.message });
    return null;
  }
}

/**
 * Extract rich data from a Reddit profile URL.
 * Uses Reddit JSON API (free, requires custom User-Agent).
 */
async function extractReddit(url, existingData) {
  const username = extractUsernameFromUrl(url, /reddit\.com\/user\/([^/?#]+)/i);
  if (!username) return null;

  // Skip if quickEnrich already has comprehensive Reddit data
  if (existingData.reddit_karma && existingData.reddit_interests?.length > 0) {
    log.info('Reddit: skipping, quickEnrich already has data');
    return null;
  }

  const headers = { 'User-Agent': REDDIT_USER_AGENT };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    // Fetch profile + submitted posts in parallel
    const [profileRes, submittedRes] = await Promise.all([
      fetch(`https://www.reddit.com/user/${encodeURIComponent(username)}/about.json`, {
        headers,
        signal: controller.signal,
      }),
      fetch(`https://www.reddit.com/user/${encodeURIComponent(username)}/submitted.json?limit=15&sort=top`, {
        headers,
        signal: controller.signal,
      }),
    ]);

    clearTimeout(timer);

    if (!profileRes.ok) return null;

    const profileJson = await profileRes.json();
    const user = profileJson?.data;
    if (!user || user.is_suspended) return null;

    const totalKarma = (user.link_karma || 0) + (user.comment_karma || 0);
    const bio = user.subreddit?.public_description?.trim() || null;

    // Extract submitted posts
    let topPosts = [];
    let topSubreddits = [];
    if (submittedRes.ok) {
      const submittedJson = await submittedRes.json();
      const posts = submittedJson?.data?.children || [];

      topPosts = posts
        .filter(p => p.data?.title)
        .sort((a, b) => (b.data.score || 0) - (a.data.score || 0))
        .slice(0, 10)
        .map(p => ({
          title: p.data.title,
          subreddit: p.data.subreddit,
          score: p.data.score || 0,
        }));

      // Aggregate subreddit frequency from posts
      const subCounts = {};
      for (const p of posts) {
        const sub = p.data?.subreddit;
        if (sub) subCounts[sub] = (subCounts[sub] || 0) + 1;
      }
      topSubreddits = Object.entries(subCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name]) => 'r/' + name);
    }

    // Derive interests from subreddit names
    const interests = topSubreddits.length > 0
      ? topSubreddits.map(s => s.replace('r/', '')).join(', ')
      : null;

    log.info('Reddit: extracted', { username, karma: totalKarma, posts: topPosts.length, subs: topSubreddits.length });

    return {
      reddit_karma: totalKarma,
      reddit_bio: bio,
      reddit_top_subreddits: topSubreddits,
      reddit_top_posts: topPosts.map(p => p.title + ' (r/' + p.subreddit + ', ' + p.score + ' pts)'),
      reddit_interests: interests,
    };
  } catch (err) {
    clearTimeout(timer);
    if (err.name !== 'AbortError') log.warn('Reddit extraction failed', { username, error: err.message });
    return null;
  }
}

/**
 * Extract rich data from a Hacker News profile URL.
 * Uses HN Firebase API (free, very generous limits).
 * Fetches actual story titles for the user's top submissions.
 */
async function extractHackerNews(url, existingData) {
  const username = extractUsernameFromUrl(url, /news\.ycombinator\.com\/user\?id=([^&#]+)/i);
  if (!username) return null;

  // Skip if quickEnrich already has comprehensive HN data with topics
  if (existingData.hn_karma && existingData.hn_topics?.length >= 5) {
    log.info('HN: skipping, quickEnrich already has data');
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    // Fetch user profile
    const userRes = await fetch(
      'https://hacker-news.firebaseio.com/v0/user/' + encodeURIComponent(username) + '.json',
      { signal: controller.signal }
    );

    if (!userRes.ok) { clearTimeout(timer); return null; }

    const user = await userRes.json();
    if (!user || !user.id) { clearTimeout(timer); return null; }

    // Strip HTML from about field
    const bio = user.about
      ? user.about.replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim().slice(0, 500)
      : null;

    // Fetch top story IDs and resolve their titles
    const submittedIds = (user.submitted || []).slice(0, 30);
    let topStories = [];

    if (submittedIds.length > 0) {
      // Fetch items in parallel (limit to 15 to stay fast)
      const itemPromises = submittedIds.slice(0, 15).map(id =>
        fetch('https://hacker-news.firebaseio.com/v0/item/' + id + '.json', { signal: controller.signal })
          .then(r => r.ok ? r.json() : null)
          .catch(() => null)
      );

      const items = await Promise.all(itemPromises);

      // Filter to stories (not comments) and sort by score
      topStories = items
        .filter(item => item && item.type === 'story' && item.title)
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, 5)
        .map(item => ({
          title: item.title,
          score: item.score || 0,
          url: item.url || ('https://news.ycombinator.com/item?id=' + item.id),
        }));
    }

    clearTimeout(timer);

    log.info('HN: extracted', { username, karma: user.karma, stories: topStories.length });

    return {
      hn_bio: bio,
      hn_karma: user.karma || 0,
      hn_top_stories: topStories.map(s => s.title + ' (' + s.score + ' pts)'),
      hn_account_created: user.created ? new Date(user.created * 1000).toISOString() : null,
    };
  } catch (err) {
    clearTimeout(timer);
    if (err.name !== 'AbortError') log.warn('HN extraction failed', { username, error: err.message });
    return null;
  }
}

/**
 * Extract data from a Medium profile URL.
 * Fetches the profile page and extracts meta tags + article titles.
 * Medium serves meta tags even without JavaScript rendering.
 */
async function extractMedium(url, _existingData) {
  const username = extractUsernameFromUrl(url, /medium\.com\/@?([^/?#]+)/i);
  if (!username) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const profileUrl = 'https://medium.com/@' + encodeURIComponent(username);
    const res = await fetch(profileUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) return null;

    const html = await res.text();

    // Extract bio from meta tags
    const bio = extractMetaContent(html, 'description')
      || extractMetaContent(html, 'og:description')
      || null;

    // Extract display name from og:title or <title>
    const displayName = extractMetaContent(html, 'og:title')
      || extractFromTag(html, 'title')
      || null;

    // Extract article titles from the page
    const articles = extractMediumArticles(html);

    if (!bio && !displayName && articles.length === 0) return null;

    log.info('Medium: extracted', { username, hasBio: !!bio, articles: articles.length });

    return {
      medium_bio: bio ? bio.slice(0, 500) : null,
      medium_display_name: displayName,
      medium_articles: articles.slice(0, 10),
    };
  } catch (err) {
    clearTimeout(timer);
    if (err.name !== 'AbortError') log.warn('Medium extraction failed', { username, error: err.message });
    return null;
  }
}

/**
 * Extract data from a Dev.to profile URL.
 * Dev.to has a public API (free, no auth needed).
 */
async function extractDevTo(url, _existingData) {
  const username = extractUsernameFromUrl(url, /dev\.to\/([^/?#]+)/i);
  if (!username) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const [userRes, articlesRes] = await Promise.all([
      fetch('https://dev.to/api/users/by_username?url=' + encodeURIComponent(username), {
        signal: controller.signal,
      }),
      fetch('https://dev.to/api/articles?username=' + encodeURIComponent(username) + '&per_page=5', {
        signal: controller.signal,
      }),
    ]);

    clearTimeout(timer);

    if (!userRes.ok) return null;
    const user = await userRes.json();

    const articles = articlesRes.ok ? await articlesRes.json() : [];
    const validArticles = Array.isArray(articles) ? articles : [];

    log.info('Dev.to: extracted', { username, articles: validArticles.length });

    return {
      devto_bio: user.summary || null,
      devto_location: user.location || null,
      devto_articles: validArticles.slice(0, 5).map(a => a.title),
      devto_tags: [...new Set(validArticles.flatMap(a => a.tag_list || []))].slice(0, 10),
    };
  } catch (err) {
    clearTimeout(timer);
    if (err.name !== 'AbortError') log.warn('Dev.to extraction failed', { username, error: err.message });
    return null;
  }
}

// ============================================================
// Synthesis
// ============================================================

/**
 * Synthesize a career/interests summary from all extracted data.
 * Pure string analysis — no LLM call (keep it free and instant).
 */
function synthesizeSummary(extracted) {
  const signals = [];

  // Career/role signals
  if (extracted.github_bio) signals.push(extracted.github_bio);
  if (extracted.github_company) signals.push('Works at ' + extracted.github_company);
  if (extracted.hn_bio) signals.push(extracted.hn_bio);
  if (extracted.medium_bio) signals.push(extracted.medium_bio);
  if (extracted.devto_bio) signals.push(extracted.devto_bio);
  if (extracted.reddit_bio) signals.push(extracted.reddit_bio);

  // Tech stack signals
  const languages = extracted.github_languages || [];
  const devtoTags = extracted.devto_tags || [];
  const allTech = [...new Set([...languages, ...devtoTags])];

  // Interest signals from Reddit + HN
  const redditSubs = (extracted.reddit_top_subreddits || []).map(s => s.replace('r/', ''));
  const hnStories = (extracted.hn_top_stories || []).map(s => s.replace(/\s*\(\d+ pts\)$/, ''));

  // Build career summary
  let careerSummary = null;
  if (signals.length > 0 || allTech.length > 0) {
    const parts = [];
    if (extracted.github_company) parts.push('works at ' + extracted.github_company);
    if (allTech.length > 0) parts.push('codes in ' + allTech.slice(0, 5).join(', '));
    if (extracted.github_public_repos > 0) parts.push(extracted.github_public_repos + ' public repos on GitHub');
    if (extracted.hn_karma > 100) parts.push('active on Hacker News (' + extracted.hn_karma + ' karma)');
    if (extracted.reddit_karma > 100) parts.push('active on Reddit (' + extracted.reddit_karma + ' karma)');
    if (extracted.medium_articles?.length > 0) parts.push('writes on Medium');
    if (extracted.devto_articles?.length > 0) parts.push('writes on Dev.to');
    careerSummary = parts.length > 0 ? parts.join('. ') + '.' : null;
  }

  // Build interests summary
  const interestParts = [...new Set([...redditSubs, ...devtoTags])];
  const interestsSummary = interestParts.length > 0 ? interestParts.join(', ') : null;

  // Personality signals (heuristic)
  const personalitySignals = [];
  if (extracted.github_public_repos > 5 || extracted.medium_articles?.length > 0 || extracted.devto_articles?.length > 0) {
    personalitySignals.push('builder/creator');
  }
  if (allTech.length > 0) personalitySignals.push('tech-focused');
  if (extracted.github_public_repos > 20) personalitySignals.push('prolific open-source contributor');
  if (extracted.hn_karma > 500) personalitySignals.push('thought leader');
  if (extracted.reddit_karma > 1000) personalitySignals.push('community-engaged');
  if (extracted.medium_articles?.length > 3) personalitySignals.push('writer/communicator');

  return {
    career_summary: careerSummary,
    interests_summary: interestsSummary,
    personality_signals: personalitySignals.length > 0 ? personalitySignals : null,
  };
}

// ============================================================
// Main Entry Point
// ============================================================

/**
 * Deep enrichment second pass: visit discovered social profile URLs
 * and extract actual content from each platform.
 *
 * @param {Array<{platform: string, url: string}>} socialLinks - URLs from quickEnrich
 * @param {Object} existingData - Data quickEnrich already found (to skip redundant fetches)
 * @returns {Promise<Object>} Enriched data with content from each platform
 */
export async function deepEnrichFromProfiles(socialLinks, existingData = {}) {
  if (!socialLinks || socialLinks.length === 0) {
    log.info('No social links to deep enrich');
    return {};
  }

  log.info('Deep enrichment starting for ' + socialLinks.length + ' social links');
  const startTime = Date.now();

  // Map platform names to extractor functions
  const extractors = {
    github: extractGitHub,
    reddit: extractReddit,
    hackernews: extractHackerNews,
    medium: extractMedium,
    'dev.to': extractDevTo,
    devto: extractDevTo,
  };

  // Platforms we skip entirely (require login or not worth scraping)
  const skipPlatforms = new Set(['linkedin', 'instagram', 'tiktok', 'facebook', 'pinterest']);

  // Run all extractors in parallel
  const tasks = socialLinks
    .filter(link => {
      const platform = link.platform.toLowerCase();
      if (skipPlatforms.has(platform)) {
        log.info('Skipping ' + link.platform + ' (requires login or not supported)');
        return false;
      }
      if (!extractors[platform]) {
        log.info('No extractor for ' + link.platform);
        return false;
      }
      return true;
    })
    .map(link => {
      const platform = link.platform.toLowerCase();
      const extractor = extractors[platform];
      return extractor(link.url, existingData)
        .then(result => ({ platform, result }))
        .catch(err => {
          log.warn('Extractor failed for ' + platform, { error: err.message });
          return { platform, result: null };
        });
    });

  const results = await Promise.allSettled(tasks);

  // Merge all successful results into a single object
  const merged = {};
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value?.result) {
      Object.assign(merged, r.value.result);
    }
  }

  // Synthesize summaries from extracted data
  const synthesis = synthesizeSummary(merged);
  Object.assign(merged, synthesis);

  // Track which platforms contributed
  const sources = results
    .filter(r => r.status === 'fulfilled' && r.value?.result)
    .map(r => r.value.platform);

  const elapsed = Date.now() - startTime;
  log.info('Deep enrichment done in ' + elapsed + 'ms', {
    sources: sources.join('+') || 'none',
    fieldsExtracted: Object.keys(merged).length,
  });

  return merged;
}

// ============================================================
// Helpers
// ============================================================

/**
 * Extract a username from a URL using a regex pattern.
 * Returns null if the URL doesn't match or username is invalid.
 */
function extractUsernameFromUrl(url, pattern) {
  if (!url) return null;
  const match = url.match(pattern);
  const username = match?.[1];
  if (!username || username.length < 1 || username.length > 100) return null;
  // Filter out common non-usernames
  const reserved = new Set(['about', 'help', 'settings', 'search', 'explore', 'trending', 'topics']);
  if (reserved.has(username.toLowerCase())) return null;
  return username;
}

/**
 * Build GitHub API headers with optional auth token.
 */
function buildGitHubHeaders() {
  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': GITHUB_USER_AGENT,
  };
  const ghToken = process.env.GITHUB_TOKEN;
  if (ghToken && !ghToken.startsWith('your_')) {
    headers['Authorization'] = 'token ' + ghToken;
  }
  return headers;
}

/**
 * Extract content from a meta tag in HTML.
 */
function extractMetaContent(html, nameOrProperty) {
  // Try name="..." first, then property="..."
  const escaped = nameOrProperty.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp('<meta[^>]+(?:name|property)=["\']' + escaped + '["\'][^>]+content=["\']([^"\']+)["\']', 'i'),
    new RegExp('<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:name|property)=["\']' + escaped + '["\']', 'i'),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHTMLEntities(match[1].trim());
  }
  return null;
}

/**
 * Extract text content from an HTML tag.
 */
function extractFromTag(html, tagName) {
  const pattern = new RegExp('<' + tagName + '[^>]*>([^<]+)</' + tagName + '>', 'i');
  const match = html.match(pattern);
  return match?.[1] ? decodeHTMLEntities(match[1].trim()) : null;
}

/**
 * Extract article titles from Medium HTML page.
 * Medium uses various structures; we try multiple approaches.
 */
function extractMediumArticles(html) {
  const articles = new Set();

  // Method 1: Look for article titles in h2/h3 tags
  const headingPattern = /<h[23][^>]*>([^<]{10,200})<\/h[23]>/gi;
  let match;
  while ((match = headingPattern.exec(html)) !== null) {
    const title = decodeHTMLEntities(match[1].trim());
    if (title.length >= 10 && !isNavigationText(title)) {
      articles.add(title);
    }
  }

  // Method 2: Look for titles in structured data (JSON-LD)
  const jsonLdPattern = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  while ((match = jsonLdPattern.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      if (data.headline) articles.add(decodeHTMLEntities(data.headline));
      if (Array.isArray(data.itemListElement)) {
        for (const item of data.itemListElement) {
          if (item.name) articles.add(decodeHTMLEntities(item.name));
        }
      }
    } catch {
      // Invalid JSON-LD, skip
    }
  }

  // Method 3: og:title or article:title meta tags
  const articleTitlePattern = /<meta[^>]+property=["'](?:og:title|article:title)["'][^>]+content=["']([^"']+)["']/gi;
  while ((match = articleTitlePattern.exec(html)) !== null) {
    const title = decodeHTMLEntities(match[1].trim());
    if (title.length >= 10 && !isNavigationText(title)) {
      articles.add(title);
    }
  }

  return [...articles].slice(0, 10);
}

/**
 * Check if text looks like navigation/UI rather than article title.
 */
function isNavigationText(text) {
  const navPatterns = /^(home|about|contact|sign in|sign up|get started|read more|follow|subscribe|membership|write|help|status|blog)/i;
  return navPatterns.test(text);
}

/**
 * Decode common HTML entities.
 */
function decodeHTMLEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&nbsp;/g, ' ');
}
