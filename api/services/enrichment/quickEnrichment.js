/**
 * Quick Enrichment Functions
 *
 * Free, instant API lookups (Gravatar + GitHub) for the "wow moment" during onboarding.
 * Returns in < 1 second with basic profile data.
 */

/**
 * Quick enrichment using only free, instant APIs.
 * Returns in < 1 second with basic profile data.
 * Used for the "wow moment" during onboarding.
 */
export async function quickEnrich(email, name = null) {
  console.log(`[ProfileEnrichment] Quick enrichment starting`);
  const startTime = Date.now();

  // Run Gravatar + GitHub in parallel (both are free and fast)
  const [gravatarResult, githubResult] = await Promise.allSettled([
    lookupGravatar(email),
    lookupGitHub(email),
  ]);

  const gravatar = gravatarResult.status === 'fulfilled' ? gravatarResult.value : null;
  const github = githubResult.status === 'fulfilled' ? githubResult.value : null;

  // Merge results (GitHub is richer, Gravatar has photo fallback)
  const data = {
    discovered_name: github?.name || gravatar?.name || name,
    discovered_photo: github?.avatar || gravatar?.photo || null,
    discovered_company: github?.company || null,
    discovered_location: github?.location || gravatar?.location || null,
    discovered_bio: github?.bio || null,
    discovered_github_url: github?.profileUrl || null,
    discovered_twitter_url: github?.twitter ? `https://twitter.com/${github.twitter}` : null,
    github_repos: github?.publicRepos || null,
    github_followers: github?.followers || null,
    source: [gravatar ? 'gravatar' : null, github ? 'github' : null].filter(Boolean).join('+') || 'none',
    social_links: [
      ...(gravatar?.socialLinks || []),
      github?.profileUrl ? { platform: 'github', url: github.profileUrl } : null,
    ].filter(Boolean),
  };

  const elapsed = Date.now() - startTime;
  console.log(`[ProfileEnrichment] Quick enrichment done in ${elapsed}ms:`, {
    hasPhoto: !!data.discovered_photo,
    hasName: !!data.discovered_name,
    hasBio: !!data.discovered_bio,
    hasCompany: !!data.discovered_company,
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
    console.log('[ProfileEnrichment] Gravatar lookup failed:', err.message);
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
    // Search GitHub users by email
    const headers = { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'TwinMe-App' };
    // Use GitHub token if available for higher rate limits
    const ghToken = process.env.GITHUB_TOKEN || process.env.GITHUB_CLIENT_ID;
    if (ghToken && !ghToken.startsWith('your_')) {
      headers['Authorization'] = `token ${ghToken}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const searchUrl = `https://api.github.com/search/users?q=${encodeURIComponent(email)}+in:email&per_page=1`;
    const searchResponse = await fetch(searchUrl, { headers, signal: controller.signal });
    clearTimeout(timeout);

    if (!searchResponse.ok) return null;
    const searchData = await searchResponse.json();
    if (!searchData.items?.length) return null;

    // Fetch full profile for the matched user
    const userUrl = searchData.items[0].url;
    const controller2 = new AbortController();
    const timeout2 = setTimeout(() => controller2.abort(), 3000);

    const userResponse = await fetch(userUrl, { headers, signal: controller2.signal });
    clearTimeout(timeout2);

    if (!userResponse.ok) return null;
    const user = await userResponse.json();

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
    };
  } catch (err) {
    console.log('[ProfileEnrichment] GitHub lookup failed:', err.message);
    return null;
  }
}
