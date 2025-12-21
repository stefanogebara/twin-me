/**
 * Token Refresh Service
 * Handles automatic refresh of OAuth access tokens for all supported platforms
 *
 * Supports:
 * - Google OAuth (YouTube, Gmail, Calendar)
 * - Spotify
 * - GitHub (GitHub Apps only)
 * - Discord
 * - LinkedIn
 * - Slack
 * - Whoop (health/fitness data)
 * - Oura (sleep/recovery data)
 */

import { encryptToken, decryptToken } from './encryption.js';

// Lazy load to avoid circular dependency issues
let supabaseAdmin = null;
async function getSupabaseClient() {
  if (!supabaseAdmin) {
    const module = await import('../config/supabase.js');
    supabaseAdmin = module.supabaseAdmin;
  }
  return supabaseAdmin;
}

/**
 * Platform-specific token refresh configurations
 */
const REFRESH_CONFIGS = {
  // Google OAuth platforms (YouTube, Gmail, Calendar)
  youtube: {
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    buildBody: (clientId, clientSecret, refreshToken) =>
      `grant_type=refresh_token&refresh_token=${refreshToken}&client_id=${clientId}&client_secret=${clientSecret}`
  },
  google_gmail: {
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    buildBody: (clientId, clientSecret, refreshToken) =>
      `grant_type=refresh_token&refresh_token=${refreshToken}&client_id=${clientId}&client_secret=${clientSecret}`
  },
  google_calendar: {
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    buildBody: (clientId, clientSecret, refreshToken) =>
      `grant_type=refresh_token&refresh_token=${refreshToken}&client_id=${clientId}&client_secret=${clientSecret}`
  },

  // Spotify
  spotify: {
    tokenEndpoint: 'https://accounts.spotify.com/api/token',
    method: 'POST',
    headers: (clientId, clientSecret) => ({
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
    }),
    buildBody: (clientId, clientSecret, refreshToken) =>
      `grant_type=refresh_token&refresh_token=${refreshToken}`
  },

  // GitHub (GitHub Apps only - traditional OAuth Apps don't expire)
  github: {
    tokenEndpoint: 'https://github.com/login/oauth/access_token',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json'
    },
    buildBody: (clientId, clientSecret, refreshToken) =>
      `grant_type=refresh_token&refresh_token=${refreshToken}&client_id=${clientId}&client_secret=${clientSecret}`
  },

  // Discord
  discord: {
    tokenEndpoint: 'https://discord.com/api/oauth2/token',
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    buildBody: (clientId, clientSecret, refreshToken) =>
      `grant_type=refresh_token&refresh_token=${refreshToken}&client_id=${clientId}&client_secret=${clientSecret}`
  },

  // LinkedIn
  linkedin: {
    tokenEndpoint: 'https://www.linkedin.com/oauth/v2/accessToken',
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    buildBody: (clientId, clientSecret, refreshToken) =>
      `grant_type=refresh_token&refresh_token=${refreshToken}&client_id=${clientId}&client_secret=${clientSecret}`
  },

  // Slack
  slack: {
    tokenEndpoint: 'https://slack.com/api/oauth.v2.access',
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    buildBody: (clientId, clientSecret, refreshToken) =>
      `grant_type=refresh_token&refresh_token=${refreshToken}&client_id=${clientId}&client_secret=${clientSecret}`
  },

  // Whoop
  whoop: {
    tokenEndpoint: 'https://api.prod.whoop.com/oauth/oauth2/token',
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    buildBody: (clientId, clientSecret, refreshToken) =>
      `grant_type=refresh_token&refresh_token=${refreshToken}&client_id=${clientId}&client_secret=${clientSecret}`
  },

  // Oura
  oura: {
    tokenEndpoint: 'https://api.ouraring.com/oauth/token',
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    buildBody: (clientId, clientSecret, refreshToken) =>
      `grant_type=refresh_token&refresh_token=${refreshToken}&client_id=${clientId}&client_secret=${clientSecret}`
  }
};

/**
 * Environment variable mappings for client credentials
 */
const CLIENT_CREDENTIALS = {
  youtube: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET
  },
  google_gmail: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET
  },
  google_calendar: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET
  },
  spotify: {
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET
  },
  github: {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET
  },
  discord: {
    clientId: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET
  },
  linkedin: {
    clientId: process.env.LINKEDIN_CLIENT_ID,
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET
  },
  slack: {
    clientId: process.env.SLACK_CLIENT_ID,
    clientSecret: process.env.SLACK_CLIENT_SECRET
  },
  whoop: {
    clientId: process.env.WHOOP_CLIENT_ID,
    clientSecret: process.env.WHOOP_CLIENT_SECRET
  },
  oura: {
    clientId: process.env.OURA_CLIENT_ID,
    clientSecret: process.env.OURA_CLIENT_SECRET
  }
};

/**
 * Main function to refresh an access token
 *
 * @param {string} userId - User ID (UUID)
 * @param {string} provider - Platform provider name
 * @returns {Promise<{success: boolean, accessToken?: string, error?: string}>}
 */
export async function refreshAccessToken(userId, provider) {
  try {
    console.log(`🔄 Attempting to refresh ${provider} token for user ${userId}`);

    // Get refresh configuration for this provider
    const config = REFRESH_CONFIGS[provider];
    if (!config) {
      throw new Error(`No refresh configuration for provider: ${provider}`);
    }

    // Get client credentials from environment
    const credentials = CLIENT_CREDENTIALS[provider];
    if (!credentials || !credentials.clientId || !credentials.clientSecret) {
      throw new Error(`Missing OAuth credentials for provider: ${provider}`);
    }

    // Fetch connection from database
    const supabase = await getSupabaseClient();
    const { data: connection, error: dbError } = await supabase
      .from('platform_connections')
      .select('refresh_token, token_expires_at, access_token')
      .eq('user_id', userId)
      .eq('platform', provider)
      .eq('connected', true)
      .single();

    if (dbError || !connection) {
      throw new Error(`No active connection found for ${provider}: ${dbError?.message || 'Not found'}`);
    }

    if (!connection.refresh_token) {
      throw new Error(`No refresh token available for ${provider}. User must reconnect.`);
    }

    // Decrypt refresh token with error handling
    let refreshToken;
    try {
      refreshToken = decryptToken(connection.refresh_token);
    } catch (decryptError) {
      console.error(`❌ Failed to decrypt refresh token for ${provider}:`, decryptError.message);
      throw new Error(`Token decryption failed - user must reconnect ${provider}`);
    }

    // Build request headers
    const headers = typeof config.headers === 'function'
      ? config.headers(credentials.clientId, credentials.clientSecret)
      : config.headers;

    // Build request body
    const body = config.buildBody(credentials.clientId, credentials.clientSecret, refreshToken);

    console.log(`🌐 Calling ${provider} token endpoint: ${config.tokenEndpoint}`);

    // Make token refresh request
    const response = await fetch(config.tokenEndpoint, {
      method: config.method,
      headers: headers,
      body: body
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Token refresh failed for ${provider}:`, response.status, errorText);
      throw new Error(`Token refresh failed: ${response.status} ${errorText}`);
    }

    const tokenData = await response.json();

    // Extract new access token (different providers use different field names)
    const newAccessToken = tokenData.access_token;
    const newRefreshToken = tokenData.refresh_token || refreshToken; // Some providers send new refresh token
    const expiresIn = tokenData.expires_in || 3600; // Default to 1 hour if not provided

    if (!newAccessToken) {
      throw new Error(`No access token in refresh response from ${provider}`);
    }

    // Calculate new expiry time
    const newExpiryTime = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Update database with new tokens
    const supabaseUpdate = await getSupabaseClient();
    const { error: updateError } = await supabaseUpdate
      .from('platform_connections')
      .update({
        access_token: encryptToken(newAccessToken),
        refresh_token: encryptToken(newRefreshToken),
        token_expires_at: newExpiryTime,
        metadata: {
          ...connection.metadata,
          last_token_refresh: new Date().toISOString(),
          token_refresh_count: (connection.metadata?.token_refresh_count || 0) + 1
        }
      })
      .eq('user_id', userId)
      .eq('platform', provider);

    if (updateError) {
      console.error(`❌ Failed to update tokens in database:`, updateError);
      throw new Error(`Database update failed: ${updateError.message}`);
    }

    console.log(`✅ Successfully refreshed ${provider} token for user ${userId}`);
    console.log(`📅 New token expires at: ${newExpiryTime}`);

    return {
      success: true,
      accessToken: newAccessToken,
      expiresAt: newExpiryTime
    };

  } catch (error) {
    console.error(`❌ Token refresh error for ${provider}:`, error.message);

    // Update error count in database
    try {
      const supabaseClient = await getSupabaseClient();
      await supabaseClient
        .from('platform_connections')
        .update({
          error_count: supabase.raw('COALESCE(error_count, 0) + 1'),
          last_sync_status: 'token_refresh_failed',
          metadata: {
            last_error: error.message,
            last_error_at: new Date().toISOString()
          }
        })
        .eq('user_id', userId)
        .eq('platform', provider);
    } catch (updateError) {
      console.error(`Failed to update error count:`, updateError);
    }

    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get a valid access token, refreshing if expired
 * This is the main function to use in data extraction endpoints
 *
 * @param {string} userId - User ID (UUID)
 * @param {string} provider - Platform provider name
 * @returns {Promise<{success: boolean, accessToken?: string, error?: string}>}
 */
export async function getValidAccessToken(userId, provider) {
  try {
    console.log(`🔑 Getting valid access token for ${provider}`);

    // Fetch connection from database
    const supabase = await getSupabaseClient();
    const { data: connection, error: dbError } = await supabase
      .from('platform_connections')
      .select('access_token, token_expires_at, connected')
      .eq('user_id', userId)
      .eq('platform', provider)
      .eq('connected', true)
      .single();

    if (dbError || !connection) {
      return {
        success: false,
        error: `No active connection found for ${provider}`
      };
    }

    if (!connection.access_token) {
      return {
        success: false,
        error: `No access token available for ${provider}. User must connect.`
      };
    }

    // Decrypt current access token with error handling
    let currentAccessToken;
    try {
      currentAccessToken = decryptToken(connection.access_token);
    } catch (decryptError) {
      console.error(`❌ Failed to decrypt access token for ${provider}:`, decryptError.message);
      console.log(`🔄 Token decryption failed, will attempt to refresh...`);

      // If we can't decrypt the access token, we need to refresh it
      // But refreshAccessToken will also fail if refresh_token can't be decrypted
      // So we return an error that will prompt re-authentication
      return {
        success: false,
        error: `Token decryption failed - user must reconnect ${provider}`,
        requiresReauth: true
      };
    }

    // Check if token is expired or will expire in the next 5 minutes
    const expiryTime = connection.token_expires_at ? new Date(connection.token_expires_at) : null;
    const now = new Date();
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

    if (!expiryTime) {
      console.log(`⚠️ No expiry time set for ${provider}, assuming token is valid`);
      return {
        success: true,
        accessToken: currentAccessToken
      };
    }

    if (expiryTime > fiveMinutesFromNow) {
      console.log(`✅ Token for ${provider} is still valid (expires at ${expiryTime.toISOString()})`);
      return {
        success: true,
        accessToken: currentAccessToken
      };
    }

    console.log(`⏰ Token for ${provider} is expired or expiring soon, refreshing...`);

    // Token is expired or expiring soon, refresh it
    const refreshResult = await refreshAccessToken(userId, provider);

    if (!refreshResult.success) {
      return {
        success: false,
        error: `Token refresh failed: ${refreshResult.error}. User may need to reconnect.`
      };
    }

    return {
      success: true,
      accessToken: refreshResult.accessToken
    };

  } catch (error) {
    console.error(`❌ Error getting valid access token for ${provider}:`, error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Check if a provider requires token refresh (some platforms have non-expiring tokens)
 *
 * @param {string} provider - Platform provider name
 * @returns {boolean}
 */
export function requiresTokenRefresh(provider) {
  return REFRESH_CONFIGS.hasOwnProperty(provider);
}

/**
 * Batch refresh tokens for multiple providers
 * Useful for background jobs or scheduled refresh
 *
 * @param {string} userId - User ID (UUID)
 * @param {string[]} providers - Array of provider names
 * @returns {Promise<{success: boolean, results: Object}>}
 */
export async function batchRefreshTokens(userId, providers) {
  console.log(`🔄 Batch refreshing tokens for user ${userId}: ${providers.join(', ')}`);

  const results = {};

  for (const provider of providers) {
    try {
      const result = await refreshAccessToken(userId, provider);
      results[provider] = result;
    } catch (error) {
      results[provider] = {
        success: false,
        error: error.message
      };
    }
  }

  const successCount = Object.values(results).filter(r => r.success).length;
  const failureCount = providers.length - successCount;

  console.log(`✅ Batch refresh complete: ${successCount} succeeded, ${failureCount} failed`);

  return {
    success: failureCount === 0,
    successCount,
    failureCount,
    results
  };
}

export default {
  refreshAccessToken,
  getValidAccessToken,
  requiresTokenRefresh,
  batchRefreshTokens
};
