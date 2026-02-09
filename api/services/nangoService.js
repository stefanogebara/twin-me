/**
 * NANGO UNIFIED API SERVICE (v3.0 - Dynamic connections, retry logic, error handling)
 *
 * Manages OAuth connections and data extraction for 14 platforms:
 * 1. Spotify - Music/entertainment patterns
 * 2. Google Calendar - Schedule/productivity
 * 3. Whoop - Health/biometrics
 * 4. Discord - Social/gaming
 * 5. GitHub - Professional/coding
 * 6. LinkedIn - Professional/career
 * 7. YouTube - Entertainment/learning
 * 8. Reddit - Social/interests
 * 9. Gmail - Communication patterns
 * 10. Twitch - Entertainment/gaming
 * 11. Outlook - Communication patterns
 * 12. Garmin - Health/fitness (NEW)
 * 13. Strava - Health/fitness (NEW)
 * 14. Fitbit - Health/fitness (NEW)
 */

import { Nango } from '@nangohq/node';
import { getConnectionId as getDbConnectionId, updateLastSynced } from './connectionMappingService.js';
import { withRetry } from './retryService.js';
import { formatExtractionResult, categorizeError } from './extractionErrorHandler.js';
import { supabaseAdmin } from './database.js';

// Initialize Nango client
const nango = new Nango({
  secretKey: process.env.NANGO_SECRET_KEY
});

// Fallback connection IDs (for backwards compatibility during migration)
// These are the actual connection IDs for the stefanogebara@gmail.com user
const FALLBACK_CONNECTION_IDS = {
  'spotify': '3e7a5d77-4e87-4af4-bdac-c9c817955037',
  'google-calendar': 'a8902250-3d55-4aca-8f5e-e5dbd54cd2c5',
  'whoop': '21d7e76c-41e9-4119-b953-7f9872f3db62',
  'discord': '74263fd1-b2e2-4a31-b4b3-c6917dcebff1',
  'github': 'd983f21d-0648-462d-8168-ade982c0d4d3',
  'github-getting-started': 'd983f21d-0648-462d-8168-ade982c0d4d3',
  'linkedin': 'f2c0b934-10d9-4aaf-ae22-6010762c90be',
  'youtube': 'aa34e681-f825-432f-954f-c400ce6f6597',
  'reddit': 'd0ff07a2-437d-4ee2-a073-c097682809ac',
  'google-mail': 'bedc8ec1-4c7a-44ca-8e73-e0b62d50fdd9',
  'twitch': 'a1e97928-3191-4a2c-98a2-e0433356942a',
  'outlook': 'e4ed0f1b-c626-496a-8cbf-83f5f3635358'
};

// Helper to get connection ID - checks database first, falls back to hardcoded
async function getConnectionId(platform, userId) {
  // Try database first (for new users)
  const dbConnectionId = await getDbConnectionId(userId, platform);
  if (dbConnectionId) {
    return dbConnectionId;
  }

  // Fall back to hardcoded IDs (for existing test user)
  if (FALLBACK_CONNECTION_IDS[platform]) {
    return FALLBACK_CONNECTION_IDS[platform];
  }

  // Last resort: use userId
  return userId;
}

// Platform configurations with API endpoints for soul signature extraction
export const PLATFORM_CONFIGS = {
  spotify: {
    providerConfigKey: 'spotify',
    name: 'Spotify',
    category: 'entertainment',
    baseUrl: 'https://api.spotify.com/v1',
    endpoints: {
      profile: '/me',
      recentTracks: '/me/player/recently-played?limit=50',
      topTracks: '/me/top/tracks?time_range=medium_term&limit=50',
      topArtists: '/me/top/artists?time_range=medium_term&limit=50',
      savedTracks: '/me/tracks?limit=50',
      playlists: '/me/playlists?limit=50',
      currentlyPlaying: '/me/player/currently-playing'
    },
    soulDataPoints: ['music_taste', 'listening_patterns', 'mood_indicators', 'genre_preferences']
  },

  'google-calendar': {
    providerConfigKey: 'google-calendar',
    name: 'Google Calendar',
    category: 'productivity',
    baseUrl: 'https://www.googleapis.com/calendar/v3',
    endpoints: {
      calendars: '/users/me/calendarList',
      events: '/calendars/primary/events?maxResults=100&orderBy=startTime&singleEvents=true',
      upcomingEvents: '/calendars/primary/events?maxResults=50&timeMin={now}&orderBy=startTime&singleEvents=true'
    },
    soulDataPoints: ['schedule_patterns', 'work_life_balance', 'social_frequency', 'productivity_style']
  },

  whoop: {
    providerConfigKey: 'whoop',
    name: 'Whoop',
    category: 'health',
    baseUrl: 'https://api.prod.whoop.com/developer/v2',
    endpoints: {
      profile: '/user/profile/basic',
      cycles: '/cycle',
      recovery: '/recovery',
      sleep: '/activity/sleep',
      workout: '/activity/workout'
    },
    soulDataPoints: ['health_metrics', 'recovery_patterns', 'sleep_quality', 'fitness_activities']
  },

  discord: {
    providerConfigKey: 'discord',
    name: 'Discord',
    category: 'social',
    baseUrl: 'https://discord.com/api/v10',
    endpoints: {
      profile: '/users/@me',
      guilds: '/users/@me/guilds',
      connections: '/users/@me/connections'
    },
    soulDataPoints: ['community_involvement', 'gaming_interests', 'social_connections']
  },

  github: {
    providerConfigKey: 'github-getting-started',  // Nango uses this provider key for GitHub
    name: 'GitHub',
    category: 'professional',
    baseUrl: 'https://api.github.com',
    endpoints: {
      profile: '/user',
      repos: '/user/repos?sort=updated&per_page=50',
      events: '/users/{username}/events?per_page=100',
      starred: '/user/starred?per_page=50',
      // Note: Contributions data is not available via GitHub API
      // It's only visible on GitHub profile pages
      gists: '/gists?per_page=30'
    },
    soulDataPoints: ['coding_style', 'tech_interests', 'collaboration_patterns', 'project_types']
  },

  linkedin: {
    providerConfigKey: 'linkedin',
    name: 'LinkedIn',
    category: 'professional',
    // LinkedIn v2 API requires Marketing Developer Platform access
    // Use OpenID Connect userinfo endpoint which works with basic OAuth
    baseUrl: 'https://api.linkedin.com',
    endpoints: {
      // OpenID Connect userinfo - works with basic Sign In with LinkedIn
      profile: '/v2/userinfo'
    },
    soulDataPoints: ['professional_identity', 'career_context'],
    note: 'Full LinkedIn API access requires Marketing Developer Platform approval'
  },

  youtube: {
    providerConfigKey: 'youtube',
    name: 'YouTube',
    category: 'entertainment',
    baseUrl: 'https://www.googleapis.com/youtube/v3',
    endpoints: {
      channels: '/channels?part=snippet,statistics&mine=true',
      subscriptions: '/subscriptions?part=snippet&mine=true&maxResults=50',
      likedVideos: '/videos?part=snippet&myRating=like&maxResults=50',
      playlists: '/playlists?part=snippet&mine=true&maxResults=50',
      watchHistory: '/activities?part=snippet&mine=true&maxResults=50'
    },
    soulDataPoints: ['content_interests', 'learning_topics', 'entertainment_preferences']
  },

  reddit: {
    providerConfigKey: 'reddit',
    name: 'Reddit',
    category: 'social',
    baseUrl: 'https://oauth.reddit.com',
    endpoints: {
      profile: '/api/v1/me',
      savedPosts: '/user/{username}/saved?limit=50',
      upvoted: '/user/{username}/upvoted?limit=50',
      subreddits: '/subreddits/mine/subscriber?limit=100',
      comments: '/user/{username}/comments?limit=50'
    },
    soulDataPoints: ['interests', 'discussion_topics', 'community_engagement', 'expertise_areas']
  },

  'google-mail': {
    providerConfigKey: 'google-mail',
    name: 'Gmail',
    category: 'communication',
    baseUrl: 'https://gmail.googleapis.com/gmail/v1',
    endpoints: {
      profile: '/users/me/profile',
      labels: '/users/me/labels',
      threads: '/users/me/threads?maxResults=50',
      messages: '/users/me/messages?maxResults=50'
    },
    soulDataPoints: ['communication_patterns', 'response_time', 'email_volume', 'contact_network']
  },

  twitch: {
    providerConfigKey: 'twitch',
    name: 'Twitch',
    category: 'entertainment',
    baseUrl: 'https://api.twitch.tv/helix',
    endpoints: {
      user: '/users',
      followedChannels: '/channels/followed?user_id={userId}&first=100',
      streams: '/streams/followed?user_id={userId}&first=100'
    },
    soulDataPoints: ['gaming_preferences', 'content_interests', 'community_involvement']
  },

  outlook: {
    providerConfigKey: 'outlook',
    name: 'Microsoft Outlook',
    category: 'communication',
    baseUrl: 'https://graph.microsoft.com/v1.0',
    endpoints: {
      profile: '/me',
      mailFolders: '/me/mailFolders',
      messages: '/me/messages?$top=100&$orderby=receivedDateTime desc',
      recentMessages: '/me/mailFolders/inbox/messages?$top=50&$orderby=receivedDateTime desc',
      calendarEvents: '/me/events?$top=100&$orderby=start/dateTime',
      calendars: '/me/calendars',
      contacts: '/me/contacts?$top=100'
    },
    soulDataPoints: ['communication_patterns', 'email_frequency', 'calendar_commitments', 'contact_network', 'work_life_balance']
  },

  // ============================================================================
  // HEALTH & FITNESS PLATFORMS (NEW)
  // ============================================================================

  garmin: {
    providerConfigKey: 'garmin',
    name: 'Garmin Connect',
    category: 'health',
    baseUrl: 'https://apis.garmin.com',
    endpoints: {
      userProfile: '/wellness-api/rest/user/id',
      dailySummary: '/wellness-api/rest/dailies',
      activities: '/wellness-api/rest/activities',
      sleepData: '/wellness-api/rest/sleepData',
      heartRate: '/wellness-api/rest/heartRate/latest'
    },
    soulDataPoints: ['fitness_activities', 'sleep_patterns', 'heart_rate_trends', 'training_load']
  },

  strava: {
    providerConfigKey: 'strava',
    name: 'Strava',
    category: 'health',
    baseUrl: 'https://www.strava.com/api/v3',
    endpoints: {
      athlete: '/athlete',
      activities: '/athlete/activities?per_page=50',
      stats: '/athletes/{athleteId}/stats',
      zones: '/athlete/zones'
    },
    soulDataPoints: ['running_patterns', 'cycling_habits', 'training_consistency', 'social_fitness']
  },

  fitbit: {
    providerConfigKey: 'fitbit',
    name: 'Fitbit',
    category: 'health',
    baseUrl: 'https://api.fitbit.com',
    endpoints: {
      profile: '/1/user/-/profile.json',
      activities: '/1/user/-/activities/date/today.json',
      sleep: '/1.2/user/-/sleep/date/today.json',
      heartRate: '/1/user/-/activities/heart/date/today/1d.json',
      weight: '/1/user/-/body/log/weight/date/today.json'
    },
    soulDataPoints: ['daily_activity', 'sleep_quality', 'heart_health', 'weight_trends']
  }
};

/**
 * Create a connect session for OAuth flow
 */
export async function createConnectSession(userId, userEmail, options = {}) {
  try {
    // Build allowed integrations - if a specific integration is requested, only allow that one
    const allowedIntegrations = options.integrationId
      ? [options.integrationId]
      : (options.allowedIntegrations || Object.keys(PLATFORM_CONFIGS));

    const sessionParams = {
      end_user: {
        id: userId,
        email: userEmail,
        display_name: userEmail.split('@')[0]
      },
      allowed_integrations: allowedIntegrations
    };

    console.log(`[Nango] Creating connect session for user ${userId} with integrations:`, allowedIntegrations);

    const response = await nango.createConnectSession(sessionParams);

    // The response can be in different formats depending on SDK version
    const sessionData = response.data || response;
    const token = sessionData.token || sessionData.connect_token;
    const connectLink = sessionData.connect_link || `https://connect.nango.dev?session_token=${token}`;

    console.log(`[Nango] Created connect session for user ${userId}, token: ${token?.substring(0, 20)}...`);
    return { success: true, token, connectLink };
  } catch (error) {
    console.error('[Nango] Error creating connect session:', error.message, error.response?.data || '');
    return { success: false, error: error.message };
  }
}

/**
 * Get connection status for a platform
 */
export async function getConnection(userId, platform) {
  try {
    const config = PLATFORM_CONFIGS[platform];
    if (!config) {
      return { success: false, error: `Unknown platform: ${platform}` };
    }

    // Use the connection ID mapping
    const connectionId = getConnectionId(platform, userId);
    const connection = await nango.getConnection(config.providerConfigKey, connectionId);

    return {
      success: true,
      connected: true,
      platform,
      connectionId: connection.connection_id,
      createdAt: connection.created_at,
      credentials: {
        hasAccessToken: !!connection.credentials?.access_token,
        expiresAt: connection.credentials?.expires_at
      }
    };
  } catch (error) {
    if (error.message?.includes('not found') || error.status === 404) {
      return { success: true, connected: false, platform };
    }
    console.error(`[Nango] Error getting connection for ${platform}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Get all connections for a user
 */
export async function getAllConnections(userId) {
  const connections = {};

  for (const platform of Object.keys(PLATFORM_CONFIGS)) {
    const result = await getConnection(userId, platform);
    connections[platform] = result;
  }

  return connections;
}

/**
 * Delete a connection
 */
export async function deleteConnection(userId, platform) {
  try {
    const config = PLATFORM_CONFIGS[platform];
    if (!config) {
      return { success: false, error: `Unknown platform: ${platform}` };
    }

    // Use the connection ID mapping
    const connectionId = getConnectionId(platform, userId);
    await nango.deleteConnection(config.providerConfigKey, connectionId);
    console.log(`[Nango] Deleted connection for ${platform} (user: ${userId})`);
    return { success: true };
  } catch (error) {
    console.error(`[Nango] Error deleting connection for ${platform}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Make a proxy request to an API
 * @param {string} userId - The app user ID
 * @param {string} platform - Platform key or custom provider config key
 * @param {string} endpoint - API endpoint
 * @param {object} options - Optional: method, params, data, headers, connectionId, baseUrl (overrides)
 */
export async function proxyRequest(userId, platform, endpoint, options = {}) {
  const config = PLATFORM_CONFIGS[platform];

  // Allow custom provider keys not in PLATFORM_CONFIGS (for legacy connections)
  const providerConfigKey = config?.providerConfigKey || platform;

  // Use the connection ID mapping, with override option for special cases
  const connectionId = options.connectionId || await getConnectionId(platform, userId);

  const requestConfig = {
    providerConfigKey,
    connectionId,
    endpoint,
    method: options.method || 'GET',
    retries: 0, // We handle retries ourselves
    ...(options.params && { params: options.params }),
    ...(options.data && { data: options.data }),
    ...(options.headers && { headers: options.headers }),
    ...((options.baseUrl || config?.baseUrl) && { baseUrlOverride: options.baseUrl || config.baseUrl })
  };

  const makeRequest = async () => {
    console.log(`[Nango] Proxy request to ${platform}: ${endpoint} (connectionId: ${connectionId})`);
    const response = await nango.proxy(requestConfig);

    // Check if response is HTML (error page) instead of JSON
    if (typeof response.data === 'string' && response.data.includes('<!DOCTYPE') || response.data?.includes?.('<html')) {
      console.error(`[Nango] Received HTML response instead of JSON for ${platform}`);
      throw new Error(`${platform} connection may be invalid or expired. Please reconnect.`);
    }

    return { success: true, data: response.data };
  };

  try {
    return await withRetry(makeRequest, {
      maxRetries: options.maxRetries || 3,
      baseDelay: 1000,
      onRetry: (attempt, error) => {
        console.log(`[Nango] Retry ${attempt + 1} for ${platform}:${endpoint} after error: ${error.message}`);
      }
    });
  } catch (error) {
    console.error(`[Nango] Proxy request failed for ${platform}:`, error.message);

    // Detect HTML error responses
    const errorData = error.response?.data;
    if (typeof errorData === 'string' && (errorData.includes('<!DOCTYPE') || errorData.includes('<html'))) {
      return {
        success: false,
        error: `${platform} connection appears invalid. Please reconnect to ${platform}.`,
        needsReconnect: true,
        status: error.response?.status
      };
    }

    return {
      success: false,
      error: error.message,
      status: error.response?.status
    };
  }
}

/**
 * Extract all data from a platform for soul signature
 * Returns structured result with error categorization
 */
export async function extractPlatformData(userId, platform) {
  const config = PLATFORM_CONFIGS[platform];
  if (!config) {
    return { success: false, error: `Unknown platform: ${platform}` };
  }

  console.log(`[Nango] Extracting data from ${platform} for user ${userId}`);

  const data = {};
  const errors = [];

  // Platform-specific options
  const platformOptions = {};

  // Twitch requires Client-Id header
  if (platform === 'twitch') {
    platformOptions.headers = { 'Client-Id': process.env.TWITCH_CLIENT_ID };
  }

  // For Reddit, we need to get the actual username first
  let redditUsername = null;
  if (platform === 'reddit') {
    const profileResult = await proxyRequest(userId, platform, '/api/v1/me', platformOptions);
    if (profileResult.success && profileResult.data?.name) {
      redditUsername = profileResult.data.name;
      data.profile = profileResult.data;
    } else {
      errors.push({ endpoint: 'profile', error: profileResult });
    }
  }

  // For Twitch, we need to get the user ID first
  let twitchUserId = null;
  if (platform === 'twitch') {
    const userResult = await proxyRequest(userId, platform, '/users', platformOptions);
    if (userResult.success && userResult.data?.data?.[0]?.id) {
      twitchUserId = userResult.data.data[0].id;
      data.user = userResult.data;
    } else {
      errors.push({ endpoint: 'user', error: userResult });
    }
  }

  // Fetch all endpoints
  for (const [key, endpoint] of Object.entries(config.endpoints)) {
    try {
      // Skip if we already fetched this endpoint
      if (platform === 'reddit' && key === 'profile') continue;
      if (platform === 'twitch' && key === 'user') continue;

      // Replace placeholders in endpoint
      let finalEndpoint = endpoint
        .replace('{now}', new Date().toISOString());

      // Handle username placeholder for Reddit
      if (platform === 'reddit' && endpoint.includes('{username}')) {
        if (!redditUsername) {
          errors.push({ endpoint: key, error: { message: 'Could not get Reddit username' } });
          continue;
        }
        finalEndpoint = finalEndpoint.replace('{username}', redditUsername);
      }

      // Handle userId placeholder for Twitch
      if (platform === 'twitch' && endpoint.includes('{userId}')) {
        if (!twitchUserId) {
          errors.push({ endpoint: key, error: { message: 'Could not get Twitch user ID' } });
          continue;
        }
        finalEndpoint = finalEndpoint.replace('{userId}', twitchUserId);
      }

      // Handle username placeholder for GitHub
      if (platform === 'github' && endpoint.includes('{username}')) {
        // For GitHub, we need to get the username from the profile first
        if (!data.profile?.login) {
          const profileResult = await proxyRequest(userId, platform, '/user', platformOptions);
          if (profileResult.success) {
            data.profile = profileResult.data;
          }
        }
        if (data.profile?.login) {
          finalEndpoint = finalEndpoint.replace('{username}', data.profile.login);
        } else {
          errors.push({ endpoint: key, error: { message: 'Could not get GitHub username' } });
          continue;
        }
      }

      const result = await proxyRequest(userId, platform, finalEndpoint, platformOptions);

      if (result.success) {
        data[key] = result.data;
      } else {
        errors.push({ endpoint: key, error: result });
      }
    } catch (error) {
      errors.push({ endpoint: key, error: { message: error.message } });
    }
  }

  // Update last synced timestamp in nango_connection_mappings
  await updateLastSynced(userId, platform).catch(() => {});

  // Also update platform_connections.last_sync_at so the status endpoint reflects the sync
  const platformKeyMap = {
    'spotify': 'spotify', 'google-calendar': 'google_calendar', 'whoop': 'whoop',
    'discord': 'discord', 'github': 'github', 'youtube': 'youtube',
    'reddit': 'reddit', 'twitch': 'twitch', 'outlook': 'outlook',
    'linkedin': 'linkedin', 'google-mail': 'google_gmail'
  };
  const dbPlatformKey = platformKeyMap[platform] || platform;
  if (supabaseAdmin) {
    try {
      await supabaseAdmin
        .from('platform_connections')
        .update({
          last_sync_at: new Date().toISOString(),
          last_sync_status: errors.length > 0 ? 'partial' : 'success'
        })
        .eq('user_id', userId)
        .eq('platform', dbPlatformKey);
    } catch (err) {
      console.warn(`[Nango] Failed to update platform_connections sync status:`, err.message);
    }
  }

  // Return formatted result with error categorization
  const result = formatExtractionResult(platform, data, errors);

  // Add metadata
  result.category = config.category;
  result.soulDataPoints = config.soulDataPoints;

  return result;
}

/**
 * Store extraction results to user_platform_data table
 * Called after extractPlatformData() to persist data for downstream systems
 * (context aggregator, soul signature, insights pages)
 */
export async function storeNangoExtractionData(userId, platform, extractionResult) {
  if (!supabaseAdmin || !extractionResult?.success || !extractionResult.data) return;

  const platformKeyMap = {
    'youtube': 'youtube', 'twitch': 'twitch', 'spotify': 'spotify',
    'discord': 'discord', 'github': 'github', 'reddit': 'reddit',
    'google-calendar': 'google_calendar', 'whoop': 'whoop',
    'google-mail': 'google_gmail', 'linkedin': 'linkedin',
    'outlook': 'outlook'
  };
  const dbPlatform = platformKeyMap[platform] || platform;

  const dataKeys = Object.keys(extractionResult.data);

  // Delete existing rows for this platform so we don't accumulate stale data
  try {
    await supabaseAdmin
      .from('user_platform_data')
      .delete()
      .eq('user_id', userId)
      .eq('platform', dbPlatform)
      .in('data_type', dataKeys);
  } catch (err) {
    console.warn(`[Nango] Failed to clean old ${dbPlatform} data:`, err.message);
  }

  // Insert fresh data
  for (const [key, responseData] of Object.entries(extractionResult.data)) {
    try {
      const { error } = await supabaseAdmin.from('user_platform_data').insert({
        user_id: userId,
        platform: dbPlatform,
        data_type: key,
        raw_data: responseData,
        processed: false,
        extracted_at: new Date().toISOString()
      });
      if (error) {
        console.warn(`[Nango] Failed to store ${dbPlatform}/${key}:`, error.message);
      }
    } catch (err) {
      console.warn(`[Nango] Failed to store ${dbPlatform}/${key}:`, err.message);
    }
  }
  console.log(`[Nango] Stored ${dataKeys.length} data types for ${dbPlatform}`);
}

/**
 * Extract data from all connected platforms
 */
export async function extractAllPlatformData(userId) {
  const connections = await getAllConnections(userId);
  const results = {
    timestamp: new Date().toISOString(),
    platforms: {}
  };

  for (const [platform, connection] of Object.entries(connections)) {
    if (connection.connected) {
      const data = await extractPlatformData(userId, platform);
      results.platforms[platform] = data;
    } else {
      results.platforms[platform] = { connected: false };
    }
  }

  return results;
}

// Convenience methods for specific platforms
export const spotify = {
  getProfile: (userId) => proxyRequest(userId, 'spotify', '/me'),
  getRecentTracks: (userId, limit = 50) => proxyRequest(userId, 'spotify', `/me/player/recently-played?limit=${limit}`),
  getTopTracks: (userId, timeRange = 'medium_term') => proxyRequest(userId, 'spotify', `/me/top/tracks?time_range=${timeRange}&limit=50`),
  getTopArtists: (userId, timeRange = 'medium_term') => proxyRequest(userId, 'spotify', `/me/top/artists?time_range=${timeRange}&limit=50`),
  getCurrentlyPlaying: (userId) => proxyRequest(userId, 'spotify', '/me/player/currently-playing'),
  getPlaylists: (userId) => proxyRequest(userId, 'spotify', '/me/playlists?limit=50')
};

export const whoop = {
  getProfile: (userId) => proxyRequest(userId, 'whoop', '/user/profile/basic'),
  getCycles: (userId, limit = 7) => proxyRequest(userId, 'whoop', `/cycle?limit=${limit}`),
  getRecovery: (userId, limit = 7) => proxyRequest(userId, 'whoop', `/recovery?limit=${limit}`),
  getSleep: (userId, limit = 5) => proxyRequest(userId, 'whoop', `/activity/sleep?limit=${limit}`),
  getWorkout: (userId, limit = 30) => proxyRequest(userId, 'whoop', `/activity/workout?limit=${limit}`)
};

export const calendar = {
  getCalendars: (userId) => proxyRequest(userId, 'google-calendar', '/users/me/calendarList'),
  getEvents: (userId, maxResults = 100) => {
    const now = new Date().toISOString();
    return proxyRequest(userId, 'google-calendar', `/calendars/primary/events?maxResults=${maxResults}&timeMin=${now}&orderBy=startTime&singleEvents=true`);
  }
};

// GitHub connection from Nango (uses 'github-getting-started' provider key)
const GITHUB_CONNECTION_ID = 'd983f21d-0648-462d-8168-ade982c0d4d3';
const GITHUB_PROVIDER_KEY = 'github-getting-started';

export const github = {
  getProfile: (userId) => proxyRequest(userId, GITHUB_PROVIDER_KEY, '/user', { connectionId: GITHUB_CONNECTION_ID }),
  getRepos: (userId) => proxyRequest(userId, GITHUB_PROVIDER_KEY, '/user/repos?sort=updated&per_page=50', { connectionId: GITHUB_CONNECTION_ID }),
  getEvents: (userId, username) => proxyRequest(userId, GITHUB_PROVIDER_KEY, `/users/${username}/events?per_page=100`, { connectionId: GITHUB_CONNECTION_ID }),
  getStarred: (userId) => proxyRequest(userId, GITHUB_PROVIDER_KEY, '/user/starred?per_page=50', { connectionId: GITHUB_CONNECTION_ID })
};

export const discord = {
  getProfile: (userId) => proxyRequest(userId, 'discord', '/users/@me'),
  getGuilds: (userId) => proxyRequest(userId, 'discord', '/users/@me/guilds'),
  getConnections: (userId) => proxyRequest(userId, 'discord', '/users/@me/connections')
};

export const youtube = {
  getChannels: (userId) => proxyRequest(userId, 'youtube', '/channels?part=snippet,statistics&mine=true'),
  getSubscriptions: (userId) => proxyRequest(userId, 'youtube', '/subscriptions?part=snippet&mine=true&maxResults=50'),
  getLikedVideos: (userId) => proxyRequest(userId, 'youtube', '/videos?part=snippet&myRating=like&maxResults=50')
};

export const reddit = {
  getProfile: (userId) => proxyRequest(userId, 'reddit', '/api/v1/me'),
  getSubreddits: (userId) => proxyRequest(userId, 'reddit', '/subreddits/mine/subscriber?limit=100')
};

export const linkedin = {
  getProfile: (userId) => proxyRequest(userId, 'linkedin', '/me')
};

// Twitch connection_id from Nango (different from end_user.id)
// TODO: Implement dynamic lookup of connection_id based on user
const TWITCH_CONNECTION_ID = 'a1e97928-3191-4a2c-98a2-e0433356942a';

export const twitch = {
  getUser: (userId) => proxyRequest(userId, 'twitch', '/users', {
    headers: { 'Client-Id': process.env.TWITCH_CLIENT_ID },
    connectionId: TWITCH_CONNECTION_ID
  }),
  getFollowedChannels: (userId, twitchUserId) => proxyRequest(userId, 'twitch', `/channels/followed?user_id=${twitchUserId}&first=100`, {
    headers: { 'Client-Id': process.env.TWITCH_CLIENT_ID },
    connectionId: TWITCH_CONNECTION_ID
  })
};

export const gmail = {
  getProfile: (userId) => proxyRequest(userId, 'google-mail', '/users/me/profile'),
  getLabels: (userId) => proxyRequest(userId, 'google-mail', '/users/me/labels'),
  getThreads: (userId) => proxyRequest(userId, 'google-mail', '/users/me/threads?maxResults=50')
};

// Outlook connection_id from Nango
const OUTLOOK_CONNECTION_ID = 'e4ed0f1b-c626-496a-8cbf-83f5f3635358';

export const outlook = {
  getProfile: (userId) => proxyRequest(userId, 'outlook', '/me', { connectionId: OUTLOOK_CONNECTION_ID }),
  getMailFolders: (userId) => proxyRequest(userId, 'outlook', '/me/mailFolders', { connectionId: OUTLOOK_CONNECTION_ID }),
  getRecentMessages: (userId, limit = 50) => proxyRequest(userId, 'outlook', `/me/mailFolders/inbox/messages?$top=${limit}&$orderby=receivedDateTime desc`, { connectionId: OUTLOOK_CONNECTION_ID }),
  getCalendarEvents: (userId, limit = 100) => proxyRequest(userId, 'outlook', `/me/events?$top=${limit}&$orderby=start/dateTime`, { connectionId: OUTLOOK_CONNECTION_ID }),
  getCalendars: (userId) => proxyRequest(userId, 'outlook', '/me/calendars', { connectionId: OUTLOOK_CONNECTION_ID }),
  getContacts: (userId, limit = 100) => proxyRequest(userId, 'outlook', `/me/contacts?$top=${limit}`, { connectionId: OUTLOOK_CONNECTION_ID })
};

// ============================================================================
// HEALTH & FITNESS PLATFORM CONVENIENCE METHODS (NEW)
// ============================================================================

export const garmin = {
  getUserProfile: (userId) => proxyRequest(userId, 'garmin', '/wellness-api/rest/user/id'),
  getDailySummary: (userId) => proxyRequest(userId, 'garmin', '/wellness-api/rest/dailies'),
  getActivities: (userId) => proxyRequest(userId, 'garmin', '/wellness-api/rest/activities'),
  getSleepData: (userId) => proxyRequest(userId, 'garmin', '/wellness-api/rest/sleepData'),
  getHeartRate: (userId) => proxyRequest(userId, 'garmin', '/wellness-api/rest/heartRate/latest')
};

export const strava = {
  getAthlete: (userId) => proxyRequest(userId, 'strava', '/athlete'),
  getActivities: (userId, page = 1) => proxyRequest(userId, 'strava', `/athlete/activities?per_page=50&page=${page}`),
  getStats: (userId, athleteId) => proxyRequest(userId, 'strava', `/athletes/${athleteId}/stats`),
  getZones: (userId) => proxyRequest(userId, 'strava', '/athlete/zones')
};

export const fitbit = {
  getProfile: (userId) => proxyRequest(userId, 'fitbit', '/1/user/-/profile.json'),
  getActivities: (userId, date = 'today') => proxyRequest(userId, 'fitbit', `/1/user/-/activities/date/${date}.json`),
  getSleep: (userId, date = 'today') => proxyRequest(userId, 'fitbit', `/1.2/user/-/sleep/date/${date}.json`),
  getHeartRate: (userId, date = 'today') => proxyRequest(userId, 'fitbit', `/1/user/-/activities/heart/date/${date}/1d.json`)
};

export default {
  createConnectSession,
  getConnection,
  getAllConnections,
  deleteConnection,
  proxyRequest,
  extractPlatformData,
  extractAllPlatformData,
  storeNangoExtractionData,
  PLATFORM_CONFIGS,
  spotify,
  whoop,
  calendar,
  github,
  discord,
  youtube,
  reddit,
  linkedin,
  twitch,
  gmail,
  outlook,
  garmin,
  strava,
  fitbit
};
