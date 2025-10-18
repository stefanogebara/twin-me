/**
 * GitHub Data Extraction & Soul Signature Analysis
 *
 * Extracts technical skills, coding patterns, and calculates Big Five personality traits
 * based on repositories, contributions, stars, pull requests, and issues.
 */

import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { decryptToken } from './encryption.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Main extraction function - retrieves all GitHub data
 */
export async function extractGitHubData(userId) {
  try {
    // Get platform connection with encrypted tokens
    const { data: connection, error: connectionError } = await supabase
      .from('data_connectors')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', 'github')
      .single();

    if (connectionError || !connection) {
      throw new Error('GitHub not connected for this user');
    }

    if (!connection.access_token) {
      throw new Error('No access token found for GitHub');
    }

    // Decrypt access token
    const accessToken = decryptToken(connection.access_token);

    const headers = {
      'Authorization': `token ${accessToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'TwinMe-App'
    };

    console.log(`🐙 Extracting GitHub data for user ${userId}...`);

    // Extract multiple data types in parallel for performance
    const [
      userResponse,
      reposResponse,
      starredResponse,
      eventsResponse,
      followingResponse,
      followersResponse
    ] = await Promise.all([
      // Get user profile
      axios.get('https://api.github.com/user', { headers }),

      // Get user's repositories
      axios.get('https://api.github.com/user/repos?per_page=100&sort=updated', { headers }),

      // Get starred repositories
      axios.get('https://api.github.com/user/starred?per_page=100', { headers }),

      // Get recent events (contributions)
      axios.get('https://api.github.com/users/USER/events?per_page=100', { headers })
        .catch(() => ({ data: [] })),

      // Get following
      axios.get('https://api.github.com/user/following?per_page=100', { headers }),

      // Get followers
      axios.get('https://api.github.com/user/followers?per_page=100', { headers })
    ]);

    // Fix events URL with actual username
    const username = userResponse.data.login;
    const actualEventsResponse = await axios.get(
      `https://api.github.com/users/${username}/events?per_page=100`,
      { headers }
    ).catch(() => ({ data: [] }));

    // Get languages from repositories
    const languageStats = await extractLanguageStats(reposResponse.data, headers);

    // Transform to soul signature format
    const soulData = transformGitHubToSoulSignature({
      user: userResponse.data,
      repos: reposResponse.data,
      starred: starredResponse.data,
      events: actualEventsResponse.data,
      following: followingResponse.data,
      followers: followersResponse.data,
      languageStats
    });

    // Calculate total items extracted
    const totalItems =
      soulData.repos.length +
      soulData.starred.length +
      soulData.events.length;

    console.log(`✅ Extracted ${totalItems} GitHub items`);

    // Save extracted data to soul_data table
    const { error: insertError } = await supabase
      .from('soul_data')
      .insert({
        user_id: userId,
        platform: 'github',
        data_type: 'comprehensive_github_profile',
        raw_data: {
          user: userResponse.data,
          repos: reposResponse.data,
          starred: starredResponse.data,
          events: actualEventsResponse.data,
          following: followingResponse.data,
          followers: followersResponse.data,
          languageStats
        },
        extracted_patterns: soulData,
        extracted_at: new Date()
      });

    if (insertError) {
      console.error('Error saving GitHub data:', insertError);
    }

    // Update connection status
    await supabase
      .from('data_connectors')
      .update({
        last_synced_at: new Date(),
        last_sync_status: 'success'
      })
      .eq('user_id', userId)
      .eq('provider', 'github');

    return {
      success: true,
      itemsExtracted: totalItems,
      platform: 'github',
      insights: soulData.insights,
      profile: soulData.profile
    };

  } catch (error) {
    console.error('GitHub extraction error:', error);

    // Handle token expiration
    if (error.response?.status === 401) {
      await supabase
        .from('data_connectors')
        .update({
          last_sync_status: 'requires_reauth'
        })
        .eq('user_id', userId)
        .eq('provider', 'github');

      return {
        success: false,
        requiresReauth: true,
        error: 'Token expired - reconnection required'
      };
    }

    // Handle rate limiting
    if (error.response?.status === 403 && error.response.headers['x-ratelimit-remaining'] === '0') {
      const resetTime = error.response.headers['x-ratelimit-reset'];
      return {
        success: false,
        rateLimited: true,
        retryAfter: parseInt(resetTime) - Math.floor(Date.now() / 1000),
        error: 'Rate limit exceeded'
      };
    }

    // Update connection with error status
    await supabase
      .from('data_connectors')
      .update({
        last_sync_status: 'failed'
      })
      .eq('user_id', userId)
      .eq('provider', 'github');

    throw error;
  }
}

/**
 * Extract language statistics from repositories
 */
async function extractLanguageStats(repos, headers) {
  const languageTotals = {};

  // Sample up to 20 repos to avoid rate limits
  const reposToAnalyze = repos.slice(0, 20);

  for (const repo of reposToAnalyze) {
    if (repo.fork) continue; // Skip forked repos

    try {
      const { data: languages } = await axios.get(repo.languages_url, { headers });

      Object.entries(languages).forEach(([lang, bytes]) => {
        languageTotals[lang] = (languageTotals[lang] || 0) + bytes;
      });
    } catch (err) {
      // Skip repo if languages API fails
      continue;
    }
  }

  return Object.entries(languageTotals)
    .sort((a, b) => b[1] - a[1])
    .map(([language, bytes]) => ({ language, bytes }));
}

/**
 * Transform GitHub data to soul signature format with Big Five personality traits
 */
function transformGitHubToSoulSignature(githubData) {
  const {
    user,
    repos,
    starred,
    events,
    following,
    followers,
    languageStats
  } = githubData;

  // Filter own repos (non-forked)
  const ownRepos = repos.filter(r => !r.fork);
  const forkedRepos = repos.filter(r => r.fork);

  // Analyze contribution patterns
  const contributionPatterns = analyzeContributionPatterns(events, repos);

  // Analyze coding expertise
  const expertiseAreas = analyzeCodingExpertise(languageStats, repos);

  return {
    profile: {
      username: user.login,
      name: user.name,
      bio: user.bio,
      company: user.company,
      location: user.location,
      blog: user.blog,
      email: user.email,
      publicRepos: user.public_repos,
      publicGists: user.public_gists,
      followers: user.followers,
      following: user.following,
      accountCreated: user.created_at,
      profileUpdated: user.updated_at
    },

    repos: repos.slice(0, 50).map(repo => ({
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description,
      language: repo.language,
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      watchers: repo.watchers_count,
      openIssues: repo.open_issues_count,
      size: repo.size,
      isFork: repo.fork,
      isPrivate: repo.private,
      created: repo.created_at,
      updated: repo.updated_at,
      topics: repo.topics || []
    })),

    starred: starred.slice(0, 50).map(repo => ({
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description,
      language: repo.language,
      stars: repo.stargazers_count
    })),

    events: events.slice(0, 50).map(event => ({
      type: event.type,
      repo: event.repo?.name,
      created: event.created_at,
      payload: {
        action: event.payload?.action,
        ref: event.payload?.ref,
        size: event.payload?.size
      }
    })),

    insights: {
      totalRepos: repos.length,
      ownRepos: ownRepos.length,
      forkedRepos: forkedRepos.length,
      totalStars: starred.length,
      totalFollowers: followers.length,
      totalFollowing: following.length,

      topLanguages: languageStats.slice(0, 10),

      repoStats: {
        totalStars: repos.reduce((sum, r) => sum + r.stargazers_count, 0),
        totalForks: repos.reduce((sum, r) => sum + r.forks_count, 0),
        averageRepoSize: Math.round(repos.reduce((sum, r) => sum + r.size, 0) / Math.max(repos.length, 1))
      },

      contributionStyle: contributionPatterns.contributionStyle,
      activityLevel: contributionPatterns.activityLevel,
      primaryLanguage: languageStats[0]?.language || 'Unknown',

      expertiseAreas: expertiseAreas.slice(0, 5),

      // Big Five Personality Traits (0-100 scale)
      traits: {
        openness: calculateOpenness(languageStats, starred),
        extraversion: calculateExtraversion(repos, events, followers),
        agreeableness: calculateAgreeableness(events, forkedRepos),
        conscientiousness: calculateConscientiousness(repos, events),
        neuroticism: calculateNeuroticism(repos, events)
      },

      // Additional personality indicators
      developerPersonality: determineDeveloperPersonality({
        languages: languageStats,
        ownRepos: ownRepos.length,
        stars: starred.length,
        contributions: events.length,
        activity: contributionPatterns.activityLevel
      })
    }
  };
}

/**
 * Analyze contribution patterns from events
 */
function analyzeContributionPatterns(events, repos) {
  const eventTypes = {};
  events.forEach(event => {
    eventTypes[event.type] = (eventTypes[event.type] || 0) + 1;
  });

  const pushEvents = eventTypes['PushEvent'] || 0;
  const prEvents = (eventTypes['PullRequestEvent'] || 0) + (eventTypes['PullRequestReviewEvent'] || 0);
  const issueEvents = eventTypes['IssuesEvent'] || 0;
  const totalEvents = events.length;

  // Determine contribution style
  let contributionStyle = 'Observer';
  if (pushEvents > prEvents && pushEvents > 10) contributionStyle = 'Solo Developer';
  if (prEvents > pushEvents && prEvents > 5) contributionStyle = 'Collaborator';
  if (issueEvents > 10) contributionStyle = 'Issue Tracker';
  if (repos.length > 20 && pushEvents > 30) contributionStyle = 'Prolific Creator';

  // Determine activity level
  let activityLevel = 'Low';
  if (totalEvents > 20) activityLevel = 'Medium';
  if (totalEvents > 50) activityLevel = 'High';
  if (totalEvents > 100) activityLevel = 'Very High';

  return {
    contributionStyle,
    activityLevel,
    eventBreakdown: eventTypes
  };
}

/**
 * Analyze coding expertise from languages and repos
 */
function analyzeCodingExpertise(languageStats, repos) {
  const expertise = [];

  // Primary language expertise
  if (languageStats.length > 0) {
    const primaryLang = languageStats[0];
    const reposUsingLang = repos.filter(r => r.language === primaryLang.language).length;

    expertise.push({
      area: primaryLang.language,
      level: reposUsingLang > 10 ? 'Expert' : reposUsingLang > 5 ? 'Proficient' : 'Familiar',
      repoCount: reposUsingLang
    });
  }

  // Secondary languages
  languageStats.slice(1, 5).forEach((lang, index) => {
    const reposUsingLang = repos.filter(r => r.language === lang.language).length;
    expertise.push({
      area: lang.language,
      level: reposUsingLang > 5 ? 'Proficient' : 'Familiar',
      repoCount: reposUsingLang
    });
  });

  return expertise;
}

/**
 * Big Five Personality Trait: Openness to Experience
 * Based on language diversity and exploration of new technologies
 */
function calculateOpenness(languageStats, starred) {
  const languageDiversity = languageStats.length;
  const diversityScore = Math.min((languageDiversity / 10) * 60, 60); // Max 10 languages = 60 points

  const explorationScore = Math.min((starred.length / 100) * 40, 40); // Curiosity via stars

  return Math.round(diversityScore + explorationScore);
}

/**
 * Big Five Personality Trait: Extraversion
 * Based on public repos, events, and social connections
 */
function calculateExtraversion(repos, events, followers) {
  const repoScore = Math.min((repos.length / 30) * 40, 40); // Public sharing
  const eventScore = Math.min((events.length / 100) * 30, 30); // Activity
  const followerScore = Math.min((followers.length / 50) * 30, 30); // Social

  return Math.round(repoScore + eventScore + followerScore);
}

/**
 * Big Five Personality Trait: Agreeableness
 * Based on collaboration (PRs, forks, contributions to others)
 */
function calculateAgreeableness(events, forkedRepos) {
  const prEvents = events.filter(e => e.type === 'PullRequestEvent' || e.type === 'PullRequestReviewEvent').length;
  const collaborationScore = Math.min((prEvents / 20) * 50, 50);

  const forkScore = Math.min((forkedRepos.length / 20) * 50, 50); // Contributing to others

  return Math.round((collaborationScore + forkScore) / 2);
}

/**
 * Big Five Personality Trait: Conscientiousness
 * Based on repo maintenance, documentation, and commit consistency
 */
function calculateConscientiousness(repos, events) {
  // Repos with descriptions and topics show organization
  const documentedRepos = repos.filter(r => r.description || (r.topics && r.topics.length > 0)).length;
  const documentationScore = Math.min((documentedRepos / Math.max(repos.length, 1)) * 50, 50);

  // Regular commits show consistency
  const pushEvents = events.filter(e => e.type === 'PushEvent').length;
  const consistencyScore = Math.min((pushEvents / 50) * 50, 50);

  return Math.round((documentationScore + consistencyScore) / 2);
}

/**
 * Big Five Personality Trait: Neuroticism
 * Based on issue creation and repo activity volatility
 */
function calculateNeuroticism(repos, events) {
  const issueEvents = events.filter(e => e.type === 'IssuesEvent').length;
  const totalEvents = Math.max(events.length, 1);

  const issueRatio = issueEvents / totalEvents;

  // Lower neuroticism = more stable, fewer issues
  return Math.round((1 - issueRatio) * 100);
}

/**
 * Helper: Determine overall developer personality archetype
 */
function determineDeveloperPersonality(metrics) {
  const { languages, ownRepos, stars, contributions, activity } = metrics;

  const topLang = languages[0]?.language || '';

  if (topLang === 'JavaScript' || topLang === 'TypeScript') return 'Full-Stack Developer';
  if (topLang === 'Python' && stars > 30) return 'Data Scientist';
  if (topLang === 'Rust' || topLang === 'Go') return 'Systems Programmer';
  if (ownRepos > 20 && contributions > 50) return 'Open Source Enthusiast';
  if (languages.length > 8) return 'Polyglot Developer';
  if (topLang === 'Java' || topLang === 'C++') return 'Enterprise Developer';
  if (activity === 'Very High') return 'Active Contributor';
  if (stars > 50) return 'Technology Explorer';

  return 'Software Developer';
}

export default {
  extractGitHubData
};
