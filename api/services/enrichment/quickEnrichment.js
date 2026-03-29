import { createLogger } from '../logger.js';
import { lookupReddit } from './redditProvider.js';
import { lookupHackerNews } from './hackerNewsProvider.js';
import { lookupHunter } from './hunterProvider.js';
import { probeSpotify } from './spotifyProbeProvider.js';
import { lookupTwitterViaBrave } from './twitterBraveProvider.js';
import { enrichFromPDL } from './pdlProvider.js';
import { discoverPlatforms } from './holeheProvider.js';
import { enrichFromEmailRep } from './emailRepProvider.js';
import { enrichFromHIBP } from './hibpProvider.js';
import { mapBreachesToIntegrations } from './breachPlatformMapper.js';

const log = createLogger('Quickenrichment');

/**
 * Quick Enrichment Functions
 *
 * Free, instant API lookups for the "wow moment" during onboarding.
 * Sources: Gravatar, GitHub (email + username), Social profile probing.
 * Returns in ~2 seconds with profile data that works for ALL user types.
 */

/**
 * Quick enrichment using only free, instant APIs.
 * Returns in ~2 seconds with profile data.
 * Used for the "wow moment" during onboarding.
 */
export async function quickEnrich(email, name = null) {
  log.info(`Quick enrichment starting`);
  const startTime = Date.now();
  const username = email.split('@')[0];

  // Run all providers in parallel (13 lookups, each with own timeout)
  const [
    gravatarResult, githubEmailResult, githubUsernameResult, socialResult,
    redditResult, hnResult, hunterResult, spotifyResult, twitterResult,
    pdlResult, holeheResult, emailRepResult, hibpResult,
  ] = await Promise.allSettled([
    lookupGravatar(email),
    lookupGitHub(email),
    lookupGitHubByUsername(username),
    probeSocialProfiles(username),
    lookupReddit(username),
    lookupHackerNews(username),
    lookupHunter(email),
    probeSpotify(username),
    lookupTwitterViaBrave(username, name),
    enrichFromPDL(email),
    discoverPlatforms(email),
    enrichFromEmailRep(email),
    enrichFromHIBP(email),
  ]);

  const gravatar = gravatarResult.status === 'fulfilled' ? gravatarResult.value : null;
  const githubByEmail = githubEmailResult.status === 'fulfilled' ? githubEmailResult.value : null;
  const githubByUsername = githubUsernameResult.status === 'fulfilled' ? githubUsernameResult.value : null;
  const socialProfiles = socialResult.status === 'fulfilled' ? socialResult.value : [];
  const reddit = redditResult.status === 'fulfilled' ? redditResult.value : null;
  const hackerNews = hnResult.status === 'fulfilled' ? hnResult.value : null;
  const hunter = hunterResult.status === 'fulfilled' ? hunterResult.value : null;
  const spotify = spotifyResult.status === 'fulfilled' ? spotifyResult.value : null;
  const twitterBrave = twitterResult.status === 'fulfilled' ? twitterResult.value : null;
  const pdl = pdlResult.status === 'fulfilled' ? pdlResult.value : null;
  const discoveredPlatforms = holeheResult.status === 'fulfilled' ? holeheResult.value : [];
  const emailRep = emailRepResult.status === 'fulfilled' ? emailRepResult.value : null;
  const hibp = hibpResult.status === 'fulfilled' ? hibpResult.value : null;

  // Map breach services to TwinMe integrations
  const allBreachServices = [
    ...(hibp?.breachServices || []),
    ...(emailRep?.profiles || []),
  ];
  const breachMapping = mapBreachesToIntegrations(allBreachServices);

  // Use email-matched GitHub if found, otherwise username-matched
  const github = githubByEmail || githubByUsername;

  // Build social links from all sources
  const allSocialLinks = [
    ...(gravatar?.socialLinks || []),
    github?.profileUrl ? { platform: 'github', url: github.profileUrl } : null,
    ...socialProfiles.map(s => ({ platform: s.platform, url: s.url })),
    reddit?.profileUrl ? { platform: 'reddit', url: reddit.profileUrl } : null,
    hackerNews?.profileUrl ? { platform: 'hackernews', url: hackerNews.profileUrl } : null,
    spotify?.profileUrl ? { platform: 'spotify', url: spotify.profileUrl } : null,
    twitterBrave?.profileUrl ? { platform: 'twitter', url: twitterBrave.profileUrl } : null,
    hunter?.linkedInUrl ? { platform: 'linkedin', url: hunter.linkedInUrl } : null,
    pdl?.linkedin_url ? { platform: 'linkedin', url: pdl.linkedin_url } : null,
    pdl?.github_url ? { platform: 'github', url: pdl.github_url } : null,
    pdl?.twitter_url ? { platform: 'twitter', url: pdl.twitter_url } : null,
    pdl?.facebook_url ? { platform: 'facebook', url: pdl.facebook_url } : null,
  ].filter(Boolean);

  // Deduplicate by platform
  const seen = new Set();
  const uniqueSocialLinks = allSocialLinks.filter(link => {
    const key = link.platform.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Merge results — priority: GitHub > PDL > Hunter > Gravatar > Reddit/HN/Twitter for each field
  const data = {
    discovered_name: github?.name || pdl?.name || (hunter?.firstName ? `${hunter.firstName} ${hunter.lastName || ''}`.trim() : null) || gravatar?.name || name,
    discovered_photo: github?.avatar || gravatar?.photo || null,
    discovered_company: github?.company || pdl?.company || hunter?.company || null,
    discovered_location: github?.location || pdl?.location || gravatar?.location || null,
    discovered_bio: github?.bio || reddit?.bio || hackerNews?.bio || twitterBrave?.bio || null,
    discovered_github_url: github?.profileUrl || pdl?.github_url || null,
    discovered_twitter_url: twitterBrave?.profileUrl || pdl?.twitter_url || (github?.twitter ? `https://twitter.com/${github.twitter}` : null),
    github_repos: github?.publicRepos || null,
    github_followers: github?.followers || null,
    github_languages: github?.languages || null,
    github_top_repos: github?.topRepos || null,
    // Reddit data
    reddit_interests: reddit?.topSubreddits || null,
    reddit_karma: reddit ? { link: reddit.karma.link, comment: reddit.karma.comment } : null,
    reddit_bio: reddit?.bio || null,
    // Hacker News data
    hn_karma: hackerNews?.karma || null,
    hn_topics: hackerNews?.topTopics || null,
    hn_bio: hackerNews?.bio || null,
    // Hunter.io data
    hunter_company: hunter?.company || null,
    hunter_position: hunter?.position || null,
    hunter_seniority: hunter?.seniority || null,
    // Spotify probe
    spotify_exists: spotify?.exists || false,
    // Twitter/X via Brave
    twitter_bio: twitterBrave?.bio || null,
    twitter_handle: twitterBrave?.handle || null,
    // PDL professional data
    pdl_headline: pdl?.headline || null,
    pdl_industry: pdl?.industry || null,
    pdl_experience: pdl?.experience || null,
    pdl_education: pdl?.education || null,
    pdl_skills: pdl?.skills || null,
    pdl_interests: pdl?.interests || null,
    pdl_linkedin_url: pdl?.linkedin_url || null,
    // Holehe discovered platforms
    discovered_platforms: discoveredPlatforms.length > 0 ? discoveredPlatforms : null,
    // emailrep.io data
    email_reputation: emailRep?.reputation || null,
    email_age_days: emailRep?.emailAge || null,
    email_first_seen: emailRep?.firstSeen || null,
    credentials_leaked: emailRep?.credentialsLeaked || false,
    // HIBP breach data
    breach_count: hibp?.breachCount ?? (emailRep?.breachCount ?? null),
    breach_services: allBreachServices.length > 0 ? allBreachServices : null,
    breach_mapped_integrations: breachMapping.integrations.length > 0 ? breachMapping.integrations : null,
    breach_social_profiles: breachMapping.socialProfiles.length > 0 ? breachMapping.socialProfiles : null,
    digital_footprint_score: breachMapping.totalDigitalFootprint || 0,
    // Source tracking
    source: [
      gravatar ? 'gravatar' : null,
      github ? 'github' : null,
      socialProfiles.length > 0 ? 'social_probe' : null,
      reddit ? 'reddit' : null,
      hackerNews ? 'hn' : null,
      hunter ? 'hunter' : null,
      spotify ? 'spotify' : null,
      twitterBrave ? 'twitter' : null,
      pdl ? 'pdl' : null,
      discoveredPlatforms.length > 0 ? 'holehe' : null,
      emailRep ? 'emailrep' : null,
      hibp ? 'hibp' : null,
    ].filter(Boolean).join('+') || 'none',
    social_links: uniqueSocialLinks,
  };

  const elapsed = Date.now() - startTime;
  log.info(`Quick enrichment done in ${elapsed}ms:`, {
    hasPhoto: !!data.discovered_photo,
    hasName: !!data.discovered_name,
    hasBio: !!data.discovered_bio,
    hasCompany: !!data.discovered_company,
    socialCount: uniqueSocialLinks.length,
    languages: data.github_languages?.join(', ') || 'none',
    reddit: reddit ? `${reddit.topSubreddits.length} subs` : 'miss',
    hn: hackerNews ? `${hackerNews.karma} karma` : 'miss',
    hunter: hunter ? hunter.company : 'miss',
    spotify: spotify ? 'found' : 'miss',
    twitter: twitterBrave ? twitterBrave.handle : 'miss',
    pdl: pdl ? `${pdl.company || 'no-company'}` : 'miss',
    holehe: discoveredPlatforms.length > 0 ? `${discoveredPlatforms.length} platforms` : 'miss',
    emailRep: emailRep ? `${emailRep.reputation}` : 'miss',
    hibp: hibp ? `${hibp.breachCount} breaches` : 'miss',
    breachIntegrations: breachMapping.integrations.join(',') || 'none',
    source: data.source,
  });

  return { success: true, data, elapsed };
}

/**
 * Lookup Gravatar profile by email hash.
 * FREE, no API key needed, returns in ~200ms.
 * Provides: photo URL, display name, location, social links.
 */
export async function lookupGravatar(email) {
  try {
    const { createHash } = await import('crypto');
    const hash = createHash('md5').update(email.trim().toLowerCase()).digest('hex');
    const url = `https://en.gravatar.com/${hash}.json`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) return null; // 404 = no Gravatar profile

    const json = await response.json();
    const entry = json?.entry?.[0];
    if (!entry) return null;

    // Extract social links from verified accounts
    const socialLinks = (entry.accounts || []).map(a => ({
      platform: a.shortname || a.domain,
      url: a.url,
      username: a.display,
    }));

    return {
      photo: entry.thumbnailUrl ? entry.thumbnailUrl.replace('s=80', 's=400') : null,
      name: entry.displayName || entry.name?.formatted || null,
      location: entry.currentLocation || null,
      aboutMe: entry.aboutMe || null,
      socialLinks,
    };
  } catch (err) {
    log.info('Gravatar lookup failed:', err.message);
    return null;
  }
}

/**
 * Lookup GitHub profile by searching for email.
 * FREE (5000 req/hr with token, 60 req/hr without).
 * Provides: name, bio, company, location, avatar, repos, twitter.
 */
export async function lookupGitHub(email) {
  try {
    const headers = getGitHubHeaders();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const searchUrl = `https://api.github.com/search/users?q=${encodeURIComponent(email)}+in:email&per_page=1`;
    const searchResponse = await fetch(searchUrl, { headers, signal: controller.signal });
    clearTimeout(timeout);

    if (!searchResponse.ok) return null;
    const searchData = await searchResponse.json();
    if (!searchData.items?.length) return null;

    // Fetch full profile + repos
    const login = searchData.items[0].login;
    return fetchGitHubProfile(login, headers);
  } catch (err) {
    log.info('GitHub email lookup failed:', err.message);
    return null;
  }
}

/**
 * Lookup GitHub profile by username (email prefix).
 * FREE. Catches users whose email is private but username matches.
 */
export async function lookupGitHubByUsername(username) {
  try {
    const headers = getGitHubHeaders();
    return fetchGitHubProfile(username, headers);
  } catch (err) {
    log.info('GitHub username lookup failed:', err.message);
    return null;
  }
}

/**
 * Fetch full GitHub profile + repos for a given login.
 */
async function fetchGitHubProfile(login, headers) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);

  try {
    const [profileR, reposR] = await Promise.all([
      fetch(`https://api.github.com/users/${login}`, { headers, signal: controller.signal }),
      fetch(`https://api.github.com/users/${login}/repos?sort=updated&per_page=10`, { headers, signal: controller.signal }),
    ]);
    clearTimeout(timeout);

    if (!profileR.ok) return null;
    const user = await profileR.json();
    if (!user.login) return null;

    const repos = reposR.ok ? await reposR.json() : [];
    const validRepos = Array.isArray(repos) ? repos : [];

    return {
      name: user.name || null,
      bio: user.bio || null,
      company: user.company?.replace(/^@/, '') || null,
      location: user.location || null,
      avatar: user.avatar_url || null,
      profileUrl: user.html_url || null,
      publicRepos: user.public_repos || 0,
      followers: user.followers || 0,
      twitter: user.twitter_username || null,
      blog: user.blog || null,
      languages: [...new Set(validRepos.map(r => r.language).filter(Boolean))],
      topRepos: validRepos.slice(0, 5).map(r => ({
        name: r.name,
        description: r.description,
        language: r.language,
        stars: r.stargazers_count,
      })),
    };
  } catch (err) {
    clearTimeout(timeout);
    log.info('GitHub profile fetch failed:', err.message);
    return null;
  }
}

function getGitHubHeaders() {
  const headers = { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'TwinMe-App' };
  const ghToken = process.env.GITHUB_TOKEN || process.env.GITHUB_CLIENT_ID;
  if (ghToken && !ghToken.startsWith('your_')) {
    headers['Authorization'] = `token ${ghToken}`;
  }
  return headers;
}

/**
 * Probe social platforms for username existence using HEAD requests.
 * FREE, instant (~1-2s for all platforms in parallel).
 * Works for ALL user types — not just developers.
 */
export async function probeSocialProfiles(username) {
  const platforms = [
    { platform: 'Instagram', url: `https://www.instagram.com/${username}/` },
    { platform: 'TikTok', url: `https://www.tiktok.com/@${username}` },
    { platform: 'Reddit', url: `https://www.reddit.com/user/${username}` },
    { platform: 'Twitch', url: `https://www.twitch.tv/${username}` },
    { platform: 'Medium', url: `https://medium.com/@${username}` },
    { platform: 'Pinterest', url: `https://www.pinterest.com/${username}/` },
    { platform: 'SoundCloud', url: `https://soundcloud.com/${username}` },
    { platform: 'LinkedIn', url: `https://www.linkedin.com/in/${username}` },
    { platform: 'Dev.to', url: `https://dev.to/${username}` },
    { platform: 'YouTube', url: `https://www.youtube.com/@${username}` },
  ];

  const results = await Promise.allSettled(
    platforms.map(async (probe) => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        const r = await fetch(probe.url, {
          method: 'HEAD',
          redirect: 'follow',
          signal: controller.signal,
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        });
        clearTimeout(timer);
        if (r && r.ok) {
          return { platform: probe.platform, url: probe.url, exists: true };
        }
        return null;
      } catch {
        return null;
      }
    })
  );

  return results
    .filter(r => r.status === 'fulfilled' && r.value)
    .map(r => r.value);
}
