/**
 * Activity Scorer Service
 *
 * Calculates platform engagement scores (0-100) to determine user activity levels.
 * Prevents false insights from inactive platforms (e.g., connected Reddit with 0 posts).
 *
 * Activity Levels:
 * - none (0-5): Connected but no usage - DO NOT analyze
 * - minimal (5-25): Barely used - SKIP in analysis
 * - moderate (25-50): Regular user - Analyze with caution
 * - active (50-75): Daily engagement - High confidence
 * - power_user (75-100): Heavy user - Highest confidence
 */

/**
 * Platform-specific scoring configurations
 * Each metric has:
 * - weight: Importance in overall score (should sum to 1.0)
 * - scale: [min, max] values for normalization
 */
const PLATFORM_CONFIGS = {
  spotify: {
    metrics: {
      recently_played_count: { weight: 0.3, scale: [0, 50] },
      top_tracks_count: { weight: 0.15, scale: [0, 50] },
      playlists_count: { weight: 0.2, scale: [0, 20] },
      saved_tracks_count: { weight: 0.2, scale: [0, 500] },
      listening_hours_30d: { weight: 0.15, scale: [0, 100] }
    }
  },

  youtube: {
    metrics: {
      videos_watched_30d: { weight: 0.4, scale: [0, 100] },
      watch_time_hours_30d: { weight: 0.3, scale: [0, 50] },
      subscriptions_active: { weight: 0.15, scale: [0, 100] },
      playlists_updated_30d: { weight: 0.1, scale: [0, 10] },
      liked_videos_30d: { weight: 0.05, scale: [0, 20] }  // Low weight - vanity metric
    }
  },

  reddit: {
    metrics: {
      comments_30d: { weight: 0.4, scale: [0, 50] },
      posts_30d: { weight: 0.3, scale: [0, 10] },
      saved_posts: { weight: 0.15, scale: [0, 100] },
      subreddits_active: { weight: 0.15, scale: [0, 20] }
    }
  },

  github: {
    metrics: {
      commits_30d: { weight: 0.4, scale: [0, 100] },
      issues_comments_30d: { weight: 0.2, scale: [0, 30] },
      pull_requests_30d: { weight: 0.2, scale: [0, 20] },
      repos_contributed_30d: { weight: 0.1, scale: [0, 10] },
      stars_given_30d: { weight: 0.1, scale: [0, 30] }
    }
  },

  discord: {
    metrics: {
      messages_sent_30d: { weight: 0.5, scale: [0, 500] },
      servers_active: { weight: 0.2, scale: [0, 20] },
      voice_hours_30d: { weight: 0.2, scale: [0, 50] },
      reactions_given_30d: { weight: 0.1, scale: [0, 100] }
    }
  },

  gmail: {
    metrics: {
      emails_sent_30d: { weight: 0.4, scale: [0, 200] },
      emails_received_30d: { weight: 0.2, scale: [0, 500] },
      threads_active_30d: { weight: 0.3, scale: [0, 100] },
      labels_used: { weight: 0.1, scale: [0, 50] }
    }
  }
};

/**
 * Activity level thresholds (same for all platforms)
 */
const ACTIVITY_LEVELS = {
  none: { min: 0, max: 5, label: 'Connected but inactive' },
  minimal: { min: 5, max: 25, label: 'Rarely used' },
  moderate: { min: 25, max: 50, label: 'Regular user' },
  active: { min: 50, max: 75, label: 'Daily engagement' },
  power_user: { min: 75, max: 100, label: 'Heavy user' }
};

/**
 * Calculate activity score for a platform
 *
 * @param {string} platform - Platform name (spotify, youtube, etc.)
 * @param {object} metrics - Raw metrics from platform API
 * @returns {object} { score: 0-100, level: 'none'|'minimal'|'moderate'|'active'|'power_user', breakdown: {} }
 */
export function calculateActivityScore(platform, metrics) {
  const config = PLATFORM_CONFIGS[platform.toLowerCase()];

  if (!config) {
    console.warn(`[ActivityScorer] No config for platform: ${platform}`);
    return {
      score: 0,
      level: 'none',
      label: 'Unknown platform',
      breakdown: {},
      analyzed: false
    };
  }

  let totalScore = 0;
  const breakdown = {};

  // Calculate weighted score for each metric
  for (const [metricName, metricConfig] of Object.entries(config.metrics)) {
    const rawValue = metrics[metricName] || 0;
    const [min, max] = metricConfig.scale;

    // Normalize to 0-1 scale
    const normalized = Math.min(Math.max((rawValue - min) / (max - min), 0), 1);

    // Apply weight
    const weightedScore = normalized * metricConfig.weight * 100;
    totalScore += weightedScore;

    breakdown[metricName] = {
      raw: rawValue,
      normalized: normalized,
      weighted_score: weightedScore
    };
  }

  // Determine activity level
  const level = getActivityLevel(totalScore);

  return {
    score: Math.round(totalScore),
    level: level.name,
    label: level.label,
    breakdown,
    analyzed: true,
    calculated_at: new Date().toISOString()
  };
}

/**
 * Get activity level from score
 */
function getActivityLevel(score) {
  for (const [name, config] of Object.entries(ACTIVITY_LEVELS)) {
    if (score >= config.min && score <= config.max) {
      return { name, ...config };
    }
  }

  // Fallback
  return { name: 'none', ...ACTIVITY_LEVELS.none };
}

/**
 * Extract metrics from platform-specific soul data
 *
 * @param {string} platform - Platform name
 * @param {array} soulData - Array of soul_data records for this platform
 * @returns {object} Metrics object for activity scoring
 */
export function extractPlatformMetrics(platform, soulData) {
  const now = new Date();
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

  // Filter to last 30 days
  const recent = soulData.filter(item =>
    new Date(item.created_at) >= thirtyDaysAgo
  );

  switch (platform.toLowerCase()) {
    case 'spotify':
      return extractSpotifyMetrics(recent, soulData);
    case 'youtube':
      return extractYoutubeMetrics(recent, soulData);
    case 'reddit':
      return extractRedditMetrics(recent, soulData);
    case 'github':
      return extractGithubMetrics(recent, soulData);
    case 'discord':
      return extractDiscordMetrics(recent, soulData);
    case 'gmail':
      return extractGmailMetrics(recent, soulData);
    default:
      return {};
  }
}

/**
 * Platform-specific metric extractors
 */

function extractSpotifyMetrics(recent, all) {
  const recentlyPlayed = recent.filter(d => d.data_type === 'recently_played');
  const topTracks = all.filter(d => d.data_type === 'top_tracks');
  const playlists = all.filter(d => d.data_type === 'playlists');
  const savedTracks = all.filter(d => d.data_type === 'saved_tracks');

  // Calculate listening hours from recently_played
  const listeningMinutes = recentlyPlayed.reduce((sum, item) => {
    const tracks = item.raw_data?.items || [];
    return sum + tracks.reduce((trackSum, track) => {
      return trackSum + (track.track?.duration_ms || 0) / 60000;
    }, 0);
  }, 0);

  return {
    recently_played_count: recentlyPlayed.length,
    top_tracks_count: topTracks.reduce((sum, item) => sum + (item.raw_data?.items?.length || 0), 0),
    playlists_count: playlists.reduce((sum, item) => sum + (item.raw_data?.items?.length || 0), 0),
    saved_tracks_count: savedTracks.reduce((sum, item) => sum + (item.raw_data?.items?.length || 0), 0),
    listening_hours_30d: listeningMinutes / 60
  };
}

function extractYoutubeMetrics(recent, all) {
  const subscriptions = all.filter(d => d.data_type === 'subscriptions');
  const playlists = recent.filter(d => d.data_type === 'playlists');
  const likedVideos = recent.filter(d => d.data_type === 'liked_videos');

  // Count unique videos from all data types
  const videoIds = new Set();
  recent.forEach(item => {
    const items = item.raw_data?.items || [];
    items.forEach(video => {
      if (video.id || video.contentDetails?.videoId) {
        videoIds.add(video.id || video.contentDetails.videoId);
      }
    });
  });

  // Estimate watch time (rough: 10 min avg per video)
  const estimatedWatchHours = (videoIds.size * 10) / 60;

  return {
    videos_watched_30d: videoIds.size,
    watch_time_hours_30d: estimatedWatchHours,
    subscriptions_active: subscriptions.reduce((sum, item) => sum + (item.raw_data?.items?.length || 0), 0),
    playlists_updated_30d: playlists.length,
    liked_videos_30d: likedVideos.reduce((sum, item) => sum + (item.raw_data?.items?.length || 0), 0)
  };
}

function extractRedditMetrics(recent, all) {
  const comments = recent.filter(d => d.data_type === 'comments');
  const posts = recent.filter(d => d.data_type === 'submitted');
  const saved = all.filter(d => d.data_type === 'saved');

  // Count unique subreddits user is active in
  const activeSubreddits = new Set();
  [...comments, ...posts].forEach(item => {
    const items = item.raw_data?.data?.children || [];
    items.forEach(post => {
      if (post.data?.subreddit) {
        activeSubreddits.add(post.data.subreddit);
      }
    });
  });

  return {
    comments_30d: comments.reduce((sum, item) => sum + (item.raw_data?.data?.children?.length || 0), 0),
    posts_30d: posts.reduce((sum, item) => sum + (item.raw_data?.data?.children?.length || 0), 0),
    saved_posts: saved.reduce((sum, item) => sum + (item.raw_data?.data?.children?.length || 0), 0),
    subreddits_active: activeSubreddits.size
  };
}

function extractGithubMetrics(recent, all) {
  const events = recent.filter(d => d.data_type === 'events');

  let commits = 0;
  let issuesComments = 0;
  let pullRequests = 0;
  let stars = 0;
  const reposContributed = new Set();

  events.forEach(item => {
    const eventList = item.raw_data || [];
    eventList.forEach(event => {
      switch (event.type) {
        case 'PushEvent':
          commits += event.payload?.commits?.length || 0;
          if (event.repo?.name) reposContributed.add(event.repo.name);
          break;
        case 'IssueCommentEvent':
        case 'CommitCommentEvent':
          issuesComments++;
          break;
        case 'PullRequestEvent':
          pullRequests++;
          if (event.repo?.name) reposContributed.add(event.repo.name);
          break;
        case 'WatchEvent':
          stars++;
          break;
      }
    });
  });

  return {
    commits_30d: commits,
    issues_comments_30d: issuesComments,
    pull_requests_30d: pullRequests,
    repos_contributed_30d: reposContributed.size,
    stars_given_30d: stars
  };
}

function extractDiscordMetrics(recent, all) {
  // Discord metrics would come from Discord API or browser extension
  // For now, return empty metrics
  return {
    messages_sent_30d: 0,
    servers_active: 0,
    voice_hours_30d: 0,
    reactions_given_30d: 0
  };
}

function extractGmailMetrics(recent, all) {
  const emails = recent.filter(d => d.data_type === 'messages');
  const threads = recent.filter(d => d.data_type === 'threads');
  const labels = all.filter(d => d.data_type === 'labels');

  // Separate sent vs received
  const sent = emails.filter(item => {
    const msg = item.raw_data;
    return msg?.labelIds?.includes('SENT');
  });

  return {
    emails_sent_30d: sent.length,
    emails_received_30d: emails.length - sent.length,
    threads_active_30d: threads.length,
    labels_used: labels.reduce((sum, item) => sum + (item.raw_data?.labels?.length || 0), 0)
  };
}

/**
 * Batch calculate activity scores for all user platforms
 *
 * @param {string} userId - User ID
 * @param {object} supabase - Supabase client
 * @returns {Promise<Array>} Array of { platform, score, level, metrics }
 */
export async function calculateAllPlatformScores(userId, supabase) {
  console.log(`📊 [ActivityScorer] Calculating scores for user ${userId}`);

  try {
    // Get all platform connections
    const { data: connections, error: connError } = await supabase
      .from('platform_connections')
      .select('*')
      .eq('user_id', userId);

    if (connError) throw connError;

    // Get all soul data
    const { data: soulData, error: soulError } = await supabase
      .from('soul_data')
      .select('*')
      .eq('user_id', userId);

    if (soulError) throw soulError;

    const scores = [];

    for (const connection of connections) {
      const platform = connection.platform;
      const platformData = soulData.filter(d => d.platform === platform);

      // Extract metrics from soul data
      const metrics = extractPlatformMetrics(platform, platformData);

      // Calculate activity score
      const activityResult = calculateActivityScore(platform, metrics);

      scores.push({
        platform,
        ...activityResult,
        metrics,
        connection_id: connection.id
      });

      console.log(`  ${platform}: ${activityResult.score}/100 (${activityResult.level})`);
    }

    return scores;

  } catch (error) {
    console.error('❌ [ActivityScorer] Error calculating scores:', error);
    throw error;
  }
}

/**
 * Calculate activity score for a single platform (after extraction)
 * @param {string} userId - User ID
 * @param {string} platform - Platform name (e.g., 'spotify', 'youtube')
 * @param {object} supabase - Supabase client
 * @returns {Promise<object>} Score data for the platform
 */
export async function calculateActivityScoreForPlatform(userId, platform, supabase) {
  console.log(`📊 [ActivityScorer] Calculating score for ${platform}, user ${userId}`);

  // Get platform connection
  const { data: connection, error: connError } = await supabase
    .from('platform_connections')
    .select('id, platform')
    .eq('user_id', userId)
    .eq('platform', platform)
    .single();

  if (connError || !connection) {
    console.error(`❌ Platform connection not found for ${platform}`);
    throw new Error(`Platform connection not found for ${platform}`);
  }

  // Get soul data for this platform
  const { data: soulData, error: soulError } = await supabase
    .from('soul_data')
    .select('data')
    .eq('user_id', userId)
    .eq('platform', platform)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (soulError || !soulData) {
    console.warn(`⚠️ No soul data found for ${platform}, defaulting to 0 score`);

    // Platform is connected but has no extracted data yet
    const scoreData = {
      platform,
      connection_id: connection.id,
      score: 0,
      level: 'none',
      label: 'Connected but inactive',
      metrics: {},
      analyzed: false
    };

    // Update database immediately
    await supabase
      .from('platform_connections')
      .update({
        activity_score: 0,
        activity_level: 'none',
        activity_label: 'Connected but inactive',
        activity_metrics: {},
        content_volume: 0,
        activity_calculated_at: new Date().toISOString()
      })
      .eq('id', connection.id);

    return scoreData;
  }

  // Extract metrics from soul data
  const metrics = extractPlatformMetrics(platform, soulData.data);

  // Calculate activity score
  const activityResult = calculateActivityScore(platform, metrics);

  const scoreData = {
    platform,
    connection_id: connection.id,
    score: activityResult.score,
    level: activityResult.level,
    label: activityResult.label,
    metrics: activityResult.breakdown || metrics,
    analyzed: activityResult.analyzed
  };

  // Update database with new score
  const { error: updateError } = await supabase
    .from('platform_connections')
    .update({
      activity_score: scoreData.score,
      activity_level: scoreData.level,
      activity_label: scoreData.label,
      activity_metrics: scoreData.metrics,
      content_volume: Math.round(Object.values(metrics).reduce((sum, val) => sum + (typeof val === 'number' ? val : 0), 0)),
      activity_calculated_at: new Date().toISOString()
    })
    .eq('id', connection.id);

  if (updateError) {
    console.error(`❌ Error updating activity score for ${platform}:`, JSON.stringify(updateError, null, 2));
    throw new Error(`Failed to update activity score: ${updateError.message}`);
  }

  console.log(`✅ Activity score updated for ${platform}: ${scoreData.score}/100 (${scoreData.level})`);

  return scoreData;
}

export default {
  calculateActivityScore,
  extractPlatformMetrics,
  calculateAllPlatformScores,
  calculateActivityScoreForPlatform,
  ACTIVITY_LEVELS
};
