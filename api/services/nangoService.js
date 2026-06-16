/**
 * NANGO UNIFIED API SERVICE (v3.0 - Dynamic connections, retry logic, error handling)
 *
 * Manages OAuth connections and data extraction for the kept platforms
 * (replan-2026-06-10 Track C portfolio cut removed linkedin, reddit, twitch,
 * garmin, strava, fitbit, oura):
 * 1. Spotify - Music/entertainment patterns
 * 2. Google Calendar - Schedule/productivity
 * 3. Whoop - Health/biometrics
 * 4. Discord - Social/gaming
 * 5. GitHub - Professional/coding
 * 6. YouTube - Entertainment/learning
 * 7. Gmail - Communication patterns
 * 8. Outlook - Communication patterns
 */

import { Nango } from '@nangohq/node';
import { getConnectionId as getDbConnectionId, updateLastSynced, markConnectionNeedsReconnect } from './connectionMappingService.js';
import { withRetry } from './retryService.js';
import { formatExtractionResult, categorizeError } from './extractionErrorHandler.js';
import { supabaseAdmin } from './database.js';
import { createLogger } from './logger.js';

const log = createLogger('Nango');

// Initialize Nango client (lazy - only if secret key is available)
let nango = null;
if (process.env.NANGO_SECRET_KEY) {
  nango = new Nango({
    secretKey: process.env.NANGO_SECRET_KEY
  });
} else {
  log.warn('NANGO_SECRET_KEY not configured - Nango integrations disabled');
}

let configuredIntegrationCache = {
  ids: null,
  fetchedAt: 0
};

// Fallback connection IDs (for backwards compatibility during migration)
// These are the actual connection IDs for the stefanogebara@gmail.com user
const FALLBACK_CONNECTION_IDS = {
  'spotify': '3e7a5d77-4e87-4af4-bdac-c9c817955037',
  'google-calendar': 'a8902250-3d55-4aca-8f5e-e5dbd54cd2c5',
  'whoop': '51cce4e6-41e9-4119-b953-7f9872f3db62',
  'discord': '74263fd1-b2e2-4a31-b4b3-c6917dcebff1',
  'github': 'd983f21d-0648-462d-8168-ade982c0d4d3',
  'github-getting-started': 'd983f21d-0648-462d-8168-ade982c0d4d3',
  'youtube': 'aa34e681-f825-432f-954f-c400ce6f6597',
  'google-mail': 'bedc8ec1-4c7a-44ca-8e73-e0b62d50fdd9',
  'outlook': 'e4ed0f1b-c626-496a-8cbf-83f5f3635358'
};

// Helper to get connection ID - checks database first, falls back to hardcoded test IDs
async function getConnectionId(platform, userId) {
  // Try database first (for new users)
  const dbConnectionId = await getDbConnectionId(userId, platform);
  if (dbConnectionId) {
    return dbConnectionId;
  }

  // Fall back to hardcoded IDs for the dev/test user ONLY — never for other users
  // (prevents IDOR: other users would otherwise get the dev user's OAuth credentials)
  // Only active in development to avoid shipping test account data to production
  if (process.env.NODE_ENV !== 'production') {
    const DEV_USER_ID = process.env.DEV_USER_ID;
    if (!DEV_USER_ID) {
      // No fallback UUID — require explicit env var to prevent accidental credential exposure
      return null;
    }
    if (userId === DEV_USER_ID && FALLBACK_CONNECTION_IDS[platform]) {
      return FALLBACK_CONNECTION_IDS[platform];
    }
  }

  // No connection found — return null so callers can fail gracefully
  // (Previously returned userId as last resort, which could cause IDOR if Nango
  //  accepted any UUID as connection ID)
  return null;
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
};

/**
 * Create a connect session for OAuth flow
 */
function requireNango() {
  if (!nango) {
    throw new Error('Nango is not configured (NANGO_SECRET_KEY missing)');
  }
  return nango;
}

async function listConfiguredIntegrationIds() {
  requireNango();

  const now = Date.now();
  if (configuredIntegrationCache.ids && now - configuredIntegrationCache.fetchedAt < 60_000) {
    return configuredIntegrationCache.ids;
  }

  const { configs = [] } = await nango.listIntegrations();
  const ids = new Set(
    configs
      .map((config) => config.unique_key || config.provider_config_key || config.id)
      .filter(Boolean)
  );

  configuredIntegrationCache = {
    ids,
    fetchedAt: now
  };

  return ids;
}

export async function createConnectSession(userId, userEmail, options = {}) {
  try {
    requireNango();
    // Build allowed integrations - if a specific integration is requested, only allow that one
    const allowedIntegrations = options.integrationId
      ? [options.integrationId]
      : (options.allowedIntegrations || Object.keys(PLATFORM_CONFIGS));

    const displayName = userEmail ? userEmail.split('@')[0] : userId.slice(0, 8);
    const configuredIntegrationIds = await listConfiguredIntegrationIds();
    const missingIntegrations = allowedIntegrations.filter((integrationId) => !configuredIntegrationIds.has(integrationId));

    if (missingIntegrations.length > 0) {
      const integrationList = missingIntegrations.join(', ');
      return {
        success: false,
        error: `Nango integration not configured: ${integrationList}`,
        code: 'INTEGRATION_NOT_CONFIGURED',
        statusCode: 503
      };
    }

    const sessionParams = {
      end_user: {
        id: userId,
        ...(userEmail ? { email: userEmail } : {}),
        display_name: displayName,
      },
      allowed_integrations: allowedIntegrations
    };

    log.info(`Creating connect session for user ${userId} with integrations:`, allowedIntegrations);

    const response = await nango.createConnectSession(sessionParams);

    // The response can be in different formats depending on SDK version
    const sessionData = response.data || response;
    const token = sessionData.token || sessionData.connect_token;
    const connectLink = sessionData.connect_link || `https://connect.nango.dev?session_token=${token}`;

    log.info(`Created connect session for user ${userId}, token: ${token?.substring(0, 20)}...`);
    return { success: true, token, connectLink };
  } catch (error) {
    const responseData = error.response?.data;
    // Nango returns structured errors as { error: { code, message } }. Earlier
    // this passed responseData.error (an OBJECT) straight through, so the
    // frontend toast rendered "[object Object]" and hid real causes like
    // resource_capped ("Reached maximum number of allowed connections").
    // Always resolve to a STRING message + a separate code.
    const rawErr = responseData?.error;
    const upstreamMessage =
      (typeof responseData === 'string' && responseData) ||
      (typeof rawErr === 'string' && rawErr) ||
      rawErr?.message ||
      responseData?.message ||
      responseData?.details ||
      error.message ||
      'Connect session failed';
    const upstreamCode = responseData?.code || rawErr?.code;

    log.error('Error creating connect session:', upstreamMessage, responseData || '');
    return {
      success: false,
      error: typeof upstreamMessage === 'string' ? upstreamMessage : JSON.stringify(upstreamMessage),
      code: upstreamCode,
      statusCode: error.response?.status || 400
    };
  }
}

/**
 * Get connection status for a platform
 */
export async function getConnection(userId, platform) {
  try {
    requireNango();
    const config = PLATFORM_CONFIGS[platform];
    if (!config) {
      return { success: false, error: `Unknown platform: ${platform}` };
    }

    // Use the connection ID mapping
    const connectionId = await getConnectionId(platform, userId);
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
    log.error(`Error getting connection for ${platform}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Get a valid access token from Nango for a NANGO_MANAGED connection.
 * Nango handles token refresh automatically.
 */
export async function getAccessToken(userId, platform) {
  try {
    requireNango();
    const config = PLATFORM_CONFIGS[platform];
    if (!config) {
      return { success: false, error: `Unknown platform: ${platform}` };
    }

    const connectionId = await getConnectionId(platform, userId);
    const connection = await nango.getConnection(config.providerConfigKey, connectionId);

    if (connection?.credentials?.access_token) {
      return {
        success: true,
        accessToken: connection.credentials.access_token,
        expiresAt: connection.credentials.expires_at
      };
    }

    return { success: false, error: `No access token in Nango connection for ${platform}` };
  } catch (error) {
    log.error(`Error getting access token for ${platform}:`, error.message);
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
    requireNango();
    const config = PLATFORM_CONFIGS[platform];
    if (!config) {
      return { success: false, error: `Unknown platform: ${platform}` };
    }

    // Use the connection ID mapping
    const connectionId = await getConnectionId(platform, userId);
    await nango.deleteConnection(config.providerConfigKey, connectionId);
    log.info(`Deleted connection for ${platform} (user: ${userId})`);
    return { success: true };
  } catch (error) {
    log.error(`Error deleting connection for ${platform}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Delete a Nango connection by its raw provider_config_key + connection_id,
 * bypassing PLATFORM_CONFIGS.
 *
 * Why this exists: when a platform is RETIRED (twitch/reddit/linkedin/…) it is
 * removed from PLATFORM_CONFIGS, so deleteConnection() returns "Unknown
 * platform" and can NEVER free that platform's orphaned Nango slots — which is
 * how the account hits its global connection cap (resource_capped). The
 * nango_connection_mappings row still carries provider_config_key +
 * nango_connection_id, so we can delete directly. A 404 means it's already gone
 * (slot already free) — treated as success.
 */
export async function deleteNangoConnectionRaw(providerConfigKey, connectionId) {
  if (!providerConfigKey || !connectionId) {
    return { success: false, error: 'missing providerConfigKey or connectionId' };
  }
  try {
    requireNango();
    await nango.deleteConnection(providerConfigKey, connectionId);
    log.info('Deleted Nango connection (raw)', { providerConfigKey, connectionId });
    return { success: true };
  } catch (error) {
    const status = error.response?.status;
    const msg = error.response?.data?.message || error.response?.data?.error || error.message || '';
    // 404, or a 400 that says the connection doesn't exist, both mean the slot
    // is already free — treat as success so cleanup drops the stale bookkeeping
    // instead of retrying a delete that can never succeed.
    if (status === 404 || (status === 400 && /not\s*found|does\s*not\s*exist|unknown\s*connection/i.test(String(msg)))) {
      return { success: true, alreadyGone: true };
    }
    return { success: false, error: typeof msg === 'string' ? msg : JSON.stringify(msg), status };
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
  requireNango();
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
    log.info(`Proxy request to ${platform}: ${endpoint} (connectionId: ${connectionId})`);
    const response = await nango.proxy(requestConfig);

    // Check if response is HTML (error page) instead of JSON
    if (typeof response.data === 'string' && response.data.includes('<!DOCTYPE') || response.data?.includes?.('<html')) {
      log.error(`Received HTML response instead of JSON for ${platform}`);
      throw new Error(`${platform} connection may be invalid or expired. Please reconnect.`);
    }

    return { success: true, data: response.data };
  };

  try {
    return await withRetry(makeRequest, {
      maxRetries: options.maxRetries || 3,
      baseDelay: 1000,
      onRetry: (attempt, error) => {
        log.info(`Retry ${attempt + 1} for ${platform}:${endpoint} after error: ${error.message}`);
      }
    });
  } catch (error) {
    const status = error.response?.status;

    // 401: nango.proxy() doesn't auto-refresh for all providers (Twitch tokens
    // expire every ~4h and Nango proxy uses the stale cached token). Force-refresh
    // the connection once and retry the proxy call.
    if (status === 401 && !options._isRefreshRetry) {
      try {
        log.warn(`401 for ${platform} — force-refreshing token and retrying once`);
        await nango.getConnection(providerConfigKey, connectionId, true);
        return await proxyRequest(userId, platform, endpoint, { ...options, _isRefreshRetry: true });
      } catch (retryErr) {
        log.warn(`${platform} refresh-retry failed: ${retryErr.message}`);
      }
    }

    // After a refresh-retry, a continued 401 means the refresh token itself is
    // dead (revoked at the provider) and the user must re-authorize. Mirror
    // the 424 flip below so the amber pill fires automatically.
    if (status === 401 && options._isRefreshRetry) {
      markConnectionNeedsReconnect(userId, platform, '401 after refresh-retry').catch(() => {});
    }

    log.error(`Proxy request failed for ${platform}:`, error.message);

    // Detect HTML error responses
    const errorData = error.response?.data;
    if (typeof errorData === 'string' && (errorData.includes('<!DOCTYPE') || errorData.includes('<html'))) {
      return {
        success: false,
        error: `${platform} connection appears invalid. Please reconnect to ${platform}.`,
        needsReconnect: true,
        status
      };
    }

    // 424 = Nango says the upstream connection failed (expired/revoked token)
    if (status === 424) {
      log.warn(`424 for ${platform} — marking connection as needs_reconnect`);
      if (supabaseAdmin) {
        supabaseAdmin
          .from('nango_connection_mappings')
          .update({ status: 'needs_reconnect' })
          .eq('user_id', userId)
          .eq('platform', platform)
          .then(({ error: dbErr }) => {
            if (dbErr) log.warn(`Failed to mark ${platform} needs_reconnect:`, dbErr.message);
          });
      }
      return {
        success: false,
        error: `${platform} connection expired. Please reconnect to ${platform}.`,
        needsReconnect: true,
        status
      };
    }

    return {
      success: false,
      error: error.message,
      status
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

  log.info(`Extracting data from ${platform} for user ${userId}`);

  const data = {};
  const errors = [];

  // Platform-specific options
  const platformOptions = {};

  // Fetch all endpoints
  for (const [key, endpoint] of Object.entries(config.endpoints)) {
    try {
      // Replace placeholders in endpoint
      let finalEndpoint = endpoint
        .replace('{now}', new Date().toISOString());

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
      } else if ((result.statusCode ?? result.status) === 404) {
        // Account-level 404 — the endpoint exists but THIS account doesn't
        // support it. The two known cases (audit 2026-05-22):
        //   - Outlook /me/mailFolders 404s for personal Microsoft accounts
        //     without an Exchange mailbox (Stefano's case). Calendar +
        //     contacts work fine on the same connection.
        //   - LinkedIn /v2/connections 404s for accounts without the
        //     r_network scope or the basic-tier API access.
        // Treating this as an error marks the whole sync as 'partial' and
        // shoves a noisy last_sync_error in the UI. Skip it instead.
        log.info(`Skipping ${platform}/${key}: not supported by this account (404)`);
        data[key] = null;
      } else {
        errors.push({ endpoint: key, error: result });
      }
    } catch (error) {
      errors.push({ endpoint: key, error: { message: error.message } });
    }
  }

  // Update last synced timestamp in nango_connection_mappings
  await updateLastSynced(userId, platform).catch(err => log.warn(`updateLastSynced failed for ${platform}:`, err.message));

  // Also update platform_connections.last_sync_at so the status endpoint reflects the sync
  const platformKeyMap = {
    'spotify': 'spotify', 'google-calendar': 'google_calendar', 'whoop': 'whoop',
    'discord': 'discord', 'github': 'github', 'youtube': 'youtube',
    'outlook': 'outlook', 'google-mail': 'google_gmail'
  };
  const dbPlatformKey = platformKeyMap[platform] || platform;
  if (supabaseAdmin) {
    try {
      const { error: syncErr } = await supabaseAdmin
        .from('platform_connections')
        .update({
          last_sync_at: new Date().toISOString(),
          last_sync_status: errors.length > 0 ? 'partial' : 'success',
          last_sync_error: errors.length > 0 ? errors[0] : null,
        })
        .eq('user_id', userId)
        .eq('platform', dbPlatformKey);
      if (syncErr) {
        log.warn(`Failed to update platform_connections sync status:`, syncErr.message);
      }
    } catch (err) {
      log.warn(`Failed to update platform_connections sync status:`, err.message);
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
  if (!supabaseAdmin || (!extractionResult?.success && !extractionResult?.partial) || !extractionResult.data) return;

  const platformKeyMap = {
    'youtube': 'youtube', 'spotify': 'spotify',
    'discord': 'discord', 'github': 'github',
    'google-calendar': 'google_calendar', 'whoop': 'whoop',
    'google-mail': 'google_gmail', 'outlook': 'outlook'
  };
  const dbPlatform = platformKeyMap[platform] || platform;

  const dataKeys = Object.keys(extractionResult.data);

  // Delete existing rows for this platform so we don't accumulate stale data
  try {
    const { error: deleteErr } = await supabaseAdmin
      .from('user_platform_data')
      .delete()
      .eq('user_id', userId)
      .eq('platform', dbPlatform)
      .in('data_type', dataKeys);
    if (deleteErr) {
      log.warn(`Failed to clean old ${dbPlatform} data:`, deleteErr.message);
    }
  } catch (err) {
    log.warn(`Failed to clean old ${dbPlatform} data:`, err.message);
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
        log.warn(`Failed to store ${dbPlatform}/${key}:`, error.message);
      }
    } catch (err) {
      log.warn(`Failed to store ${dbPlatform}/${key}:`, err.message);
    }
  }
  log.info(`Stored ${dataKeys.length} data types for ${dbPlatform}`);
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
  getWorkout: (userId, limit = 25) => proxyRequest(userId, 'whoop', `/activity/workout?limit=${limit}`)
};

export const calendar = {
  getCalendars: (userId) => proxyRequest(userId, 'google-calendar', '/users/me/calendarList'),
  getEvents: (userId, maxResults = 100) => {
    const now = new Date().toISOString();
    return proxyRequest(userId, 'google-calendar', `/calendars/primary/events?maxResults=${maxResults}&timeMin=${now}&orderBy=startTime&singleEvents=true`);
  }
};

export const github = {
  getProfile: (userId) => proxyRequest(userId, 'github', '/user'),
  getRepos: (userId) => proxyRequest(userId, 'github', '/user/repos?sort=updated&per_page=50'),
  getEvents: (userId, username) => proxyRequest(userId, 'github', `/users/${username}/events?per_page=100`),
  getStarred: (userId) => proxyRequest(userId, 'github', '/user/starred?per_page=50')
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

export const gmail = {
  getProfile: (userId) => proxyRequest(userId, 'google-mail', '/users/me/profile'),
  getLabels: (userId) => proxyRequest(userId, 'google-mail', '/users/me/labels'),
  getThreads: (userId) => proxyRequest(userId, 'google-mail', '/users/me/threads?maxResults=50')
};

export const outlook = {
  getProfile: (userId) => proxyRequest(userId, 'outlook', '/me'),
  getMailFolders: (userId) => proxyRequest(userId, 'outlook', '/me/mailFolders'),
  getRecentMessages: (userId, limit = 50) => proxyRequest(userId, 'outlook', `/me/mailFolders/inbox/messages?$top=${limit}&$orderby=receivedDateTime desc`),
  getCalendarEvents: (userId, limit = 100) => proxyRequest(userId, 'outlook', `/me/events?$top=${limit}&$orderby=start/dateTime`),
  getCalendars: (userId) => proxyRequest(userId, 'outlook', '/me/calendars'),
  getContacts: (userId, limit = 100) => proxyRequest(userId, 'outlook', `/me/contacts?$top=${limit}`)
};

export default {
  createConnectSession,
  getConnection,
  getAccessToken,
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
  gmail,
  outlook
};
