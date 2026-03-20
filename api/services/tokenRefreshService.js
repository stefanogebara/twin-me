/**
 * Token Refresh Service (canonical)
 *
 * Handles both proactive background token refresh and on-demand token retrieval.
 * Consolidated from tokenRefresh.js (on-demand, object return) and the original
 * tokenRefreshService.js (background cron, raw-string ensureFreshToken).
 *
 * Exports:
 *   ensureFreshToken(userId, platform) -> string   — raw token, throws on failure
 *   getValidAccessToken(userId, provider) -> {success, accessToken, ...} — safe object return
 *   refreshAccessToken(platform, refreshToken, userId) -> {accessToken, refreshToken, expiresIn}|null
 *   startTokenRefreshService() — cron-based background refresh
 *   requiresTokenRefresh(provider) -> boolean
 *   batchRefreshTokens(userId, providers) -> {success, results}
 */

import cron from 'node-cron';
import { supabaseAdmin } from './database.js';
import axios from 'axios';
import { encryptToken, decryptToken } from './encryption.js';
import { createLogger } from './logger.js';

const log = createLogger('TokenRefreshService');

// In-memory lock to prevent concurrent token refresh attempts
// Key: `${userId}:${platform}`, Value: Promise that resolves when refresh completes
const refreshLocks = new Map();

// Safety valve: clear stale locks every 5 minutes (handles hung refreshes)
const LOCK_MAX_AGE_MS = 60_000; // 60s max lock lifetime
const lockTimestamps = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [key, ts] of lockTimestamps.entries()) {
    if (now - ts > LOCK_MAX_AGE_MS) {
      refreshLocks.delete(key);
      lockTimestamps.delete(key);
    }
  }
}, 5 * 60_000);

// Platform-specific OAuth configurations
// Using a getter function to ensure env vars are read at runtime, not at module load time
function getPlatformRefreshConfig(platform) {
  const configs = {
    spotify: {
      tokenUrl: 'https://accounts.spotify.com/api/token',
      clientId: process.env.SPOTIFY_CLIENT_ID,
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    },
    youtube: {
      tokenUrl: 'https://oauth2.googleapis.com/token',
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    },
    google_gmail: {
      tokenUrl: 'https://oauth2.googleapis.com/token',
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    },
    google_calendar: {
      tokenUrl: 'https://oauth2.googleapis.com/token',
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    },
    github: {
      // GitHub tokens don't expire, but we check their validity
      checkUrl: 'https://api.github.com/user',
    },
    discord: {
      tokenUrl: 'https://discord.com/api/oauth2/token',
      clientId: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET,
    },
    linkedin: {
      tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
      clientId: process.env.LINKEDIN_CLIENT_ID,
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
    },
    // Whoop: support legacy connections (not yet migrated to Nango)
    whoop: {
      tokenUrl: 'https://api.prod.whoop.com/oauth/oauth2/token',
      clientId: process.env.WHOOP_CLIENT_ID,
      clientSecret: process.env.WHOOP_CLIENT_SECRET,
    },

    // Slack
    slack: {
      tokenUrl: 'https://slack.com/api/oauth.v2.access',
      clientId: process.env.SLACK_CLIENT_ID,
      clientSecret: process.env.SLACK_CLIENT_SECRET,
    },

    // Twitch
    twitch: {
      tokenUrl: 'https://id.twitch.tv/oauth2/token',
      clientId: process.env.TWITCH_CLIENT_ID,
      clientSecret: process.env.TWITCH_CLIENT_SECRET,
    },

    // Reddit - uses HTTP Basic Auth (same pattern as Spotify)
    reddit: {
      tokenUrl: 'https://www.reddit.com/api/v1/access_token',
      clientId: process.env.REDDIT_CLIENT_ID,
      clientSecret: process.env.REDDIT_CLIENT_SECRET,
      useBasicAuth: true,
      omitCredentialsFromBody: true,
    },

    // Oura
    oura: {
      tokenUrl: 'https://api.ouraring.com/oauth/token',
      clientId: process.env.OURA_CLIENT_ID,
      clientSecret: process.env.OURA_CLIENT_SECRET,
    },
  };
  return configs[platform];
}

// Encryption/decryption functions now imported from encryption.js service

/**
 * Refresh access token using refresh token
 */
async function refreshAccessToken(platform, refreshToken, userId) {
  const config = getPlatformRefreshConfig(platform);

  if (!config || !config.tokenUrl) {
    log.info(`Platform ${platform} doesn't support token refresh`);
    return null;
  }

  try {
    log.info(`Refreshing token for ${platform} (user: ${userId})`);
    log.info(`Config for ${platform}:`, {
      hasTokenUrl: !!config?.tokenUrl,
      hasClientId: !!config?.clientId,
      hasClientSecret: !!config?.clientSecret,
      clientSecretLength: config?.clientSecret?.length
    });

    // Build base params
    const paramsObj = {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    };

    // Build headers
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    // Spotify and Reddit use HTTP Basic Auth for client credentials
    if (platform === 'spotify' || config.useBasicAuth) {
      const basicAuth = Buffer.from(
        `${config.clientId}:${config.clientSecret}`
      ).toString('base64');
      headers['Authorization'] = `Basic ${basicAuth}`;
      // Some platforms (Reddit) don't include credentials in body when using Basic Auth
      if (!config.omitCredentialsFromBody) {
        paramsObj.client_id = config.clientId;
      }
    } else {
      // Most platforms use client_secret_post (credentials in body)
      paramsObj.client_id = config.clientId;
      paramsObj.client_secret = config.clientSecret;

      // Whoop requires scope: 'offline' for refresh token requests
      // Per docs: https://developer.whoop.com/docs/tutorials/refresh-token-javascript/
      if (platform === 'whoop') {
        paramsObj.scope = 'offline';
      }
    }

    const params = new URLSearchParams(paramsObj);

    // Debug: log the exact params being sent (mask secrets)
    log.info(`Request params for ${platform}:`, {
      grant_type: paramsObj.grant_type,
      has_refresh_token: !!paramsObj.refresh_token,
      refresh_token_length: paramsObj.refresh_token?.length,
      has_client_id: !!paramsObj.client_id,
      has_client_secret: !!paramsObj.client_secret,
      scope: paramsObj.scope,
      redirect_uri: paramsObj.redirect_uri,
    });

    const response = await axios.post(config.tokenUrl, params.toString(), {
      headers,
    });

    const { access_token, refresh_token: newRefreshToken, expires_in } = response.data;

    if (!access_token) {
      throw new Error('No access token in refresh response');
    }

    log.info(`Token refreshed successfully for ${platform}`);

    return {
      accessToken: access_token,
      refreshToken: newRefreshToken || refreshToken, // Some platforms don't return new refresh token
      expiresIn: expires_in || 3600, // Default 1 hour
    };
  } catch (error) {
    log.error(`Token refresh failed for ${platform}:`, error.response?.data || error.message);

    // Mark connection as expired (database constraint allows: connected, disconnected, error, pending, expired)
    const { error: expiredErr } = await supabaseAdmin
      .from('platform_connections')
      .update({
        status: 'expired',
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('platform', platform);

    if (expiredErr) {
      log.warn(`Failed to mark ${platform} token as expired:`, expiredErr.message);
    }

    return null;
  }
}

// Nango-managed tokens use placeholder values - don't try to refresh them ourselves
const NANGO_PLACEHOLDER_TOKENS = ['NANGO_MANAGED', 'nango_managed', 'managed_by_nango'];

/**
 * Check if a token value is a Nango placeholder (not a real encrypted token)
 */
function isNangoManagedToken(token) {
  if (!token) return false;
  // Nango placeholders are short strings, real encrypted tokens are 100+ chars
  if (token.length < 50 && NANGO_PLACEHOLDER_TOKENS.some(p => token.toLowerCase().includes(p.toLowerCase()))) {
    return true;
  }
  return false;
}

/**
 * Check and refresh tokens that are about to expire
 * Runs every 5 minutes
 */
async function checkAndRefreshExpiringTokens() {
  try {
    log.info('Checking for expiring tokens...');

    // Get all connections that expire in the next 10 minutes
    // Include both 'connected' and 'token_expired' status (tokens can be refreshed even if expired)
    const tenMinutesFromNow = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { data: connections, error } = await supabaseAdmin
      .from('platform_connections')
      .select('*')
      .in('status', ['connected', 'token_expired', 'expired'])
      .not('refresh_token', 'is', null)
      .lt('token_expires_at', tenMinutesFromNow);

    if (error) {
      log.error('Error fetching connections:', error);
      return;
    }

    if (!connections || connections.length === 0) {
      log.info('No tokens expiring soon');
      return;
    }

    // Filter out Nango-managed connections
    const refreshableConnections = connections.filter(conn => {
      if (isNangoManagedToken(conn.refresh_token) || isNangoManagedToken(conn.access_token)) {
        log.info(`Skipping ${conn.platform} - Nango-managed token`);
        return false;
      }
      return true;
    });

    if (refreshableConnections.length === 0) {
      log.info('No tokens need refresh (all Nango-managed)');
      return;
    }

    log.info(`Found ${refreshableConnections.length} tokens expiring soon`);

    // Refresh each token
    for (const connection of refreshableConnections) {
      let decryptedRefreshToken;
      try {
        decryptedRefreshToken = decryptToken(connection.refresh_token);
      } catch (decryptErr) {
        log.error(`Decryption failed for ${connection.platform} (user ${connection.user_id}) — marking needs_reauth:`, decryptErr.message);
        // Mark connection as needing re-auth so frontend can prompt user to reconnect
        await supabaseAdmin
          .from('platform_connections')
          .update({ status: 'needs_reauth', updated_at: new Date().toISOString() })
          .eq('id', connection.id);
        continue;
      }

      if (!decryptedRefreshToken) {
        log.error(`Could not decrypt refresh token for ${connection.platform}`);
        continue;
      }

      const newTokens = await refreshAccessToken(
        connection.platform,
        decryptedRefreshToken,
        connection.user_id
      );

      if (newTokens) {
        // Encrypt and save new tokens
        const encryptedAccessToken = encryptToken(newTokens.accessToken);
        const encryptedRefreshToken = encryptToken(newTokens.refreshToken);

        const newExpiryTime = new Date(Date.now() + newTokens.expiresIn * 1000).toISOString();

        const { error: saveErr } = await supabaseAdmin
          .from('platform_connections')
          .update({
            access_token: encryptedAccessToken,
            refresh_token: encryptedRefreshToken,
            token_expires_at: newExpiryTime,
            status: 'connected', // Reset status to 'connected' after successful refresh
            updated_at: new Date().toISOString(),
          })
          .eq('id', connection.id);

        if (saveErr) {
          log.error(`Failed to persist refreshed tokens for ${connection.platform} (user: ${connection.user_id}):`, saveErr.message);
        } else {
          log.info(`Updated tokens for ${connection.platform} (user: ${connection.user_id})`);
        }
      }
    }
  } catch (error) {
    log.error('Error in token refresh check:', error);
  }
}

/**
 * Start the automatic token refresh service
 * Runs every 5 minutes to check for expiring tokens
 */
function startTokenRefreshService() {
  log.info('Starting automatic token refresh service...');

  // Run immediately on startup
  checkAndRefreshExpiringTokens();

  // Schedule to run every 5 minutes
  cron.schedule('*/5 * * * *', () => {
    log.info('Running scheduled token refresh check');
    checkAndRefreshExpiringTokens();
  });

  log.info('Token refresh service started (runs every 5 minutes)');
}

/**
 * Middleware to automatically refresh token on API call if expired
 * Use this in API routes that make platform API calls
 *
 * IMPORTANT: Uses locking to prevent race conditions when multiple requests
 * try to refresh the same token simultaneously. Whoop tokens are single-use,
 * so concurrent refreshes would cause one to fail.
 */
async function ensureFreshToken(userId, platform) {
  const lockKey = `${userId}:${platform}`;

  // Check if a refresh is already in progress for this user+platform
  if (refreshLocks.has(lockKey)) {
    log.info(`Waiting for existing ${platform} refresh to complete...`);
    try {
      await refreshLocks.get(lockKey);
      // After waiting, re-fetch the connection to get the updated token
      const { data: updatedConnection, error: updConnErr } = await supabaseAdmin
        .from('platform_connections')
        .select('access_token, status')
        .eq('user_id', userId)
        .eq('platform', platform)
        .single();
      if (updConnErr && updConnErr.code !== 'PGRST116') log.warn('Failed to re-fetch connection after lock:', updConnErr.message);

      if (updatedConnection?.status === 'connected') {
        log.info(`Using token from completed ${platform} refresh`);
        return decryptToken(updatedConnection.access_token);
      }
    } catch {
      // Previous refresh failed, we'll try our own below
      log.info(`Previous ${platform} refresh failed, attempting new refresh...`);
    }
  }

  try {
    const { data: connection } = await supabaseAdmin
      .from('platform_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('platform', platform)
      .single();

    if (!connection) {
      throw new Error('Platform not connected');
    }

    // If status is 'expired', we should still TRY to refresh using the refresh_token
    // Only if the refresh fails do we require re-authorization
    const isExpiredStatus = connection.status === 'expired' || connection.status === 'token_expired';

    // Check if token is expired or about to expire (within 5 minutes)
    // Also refresh if status is 'expired' - the refresh token might still be valid
    const now = new Date();
    const expiresAt = new Date(connection.token_expires_at);
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
    const needsRefresh = isExpiredStatus || expiresAt <= fiveMinutesFromNow;

    if (needsRefresh) {
      // Check if this is a Nango-managed connection - if so, we can't refresh it ourselves
      if (isNangoManagedToken(connection.access_token) || isNangoManagedToken(connection.refresh_token)) {
        log.info(`${platform} is Nango-managed - token refresh must happen through Nango`);
        throw new Error(`${platform} token expired. This platform is managed by Nango - please reconnect.`);
      }

      log.info(`Token ${isExpiredStatus ? 'expired' : 'expiring'} for ${platform}, attempting refresh...`);

      // Create a promise that we'll resolve when refresh completes
      let resolveRefresh, rejectRefresh;
      const refreshPromise = new Promise((resolve, reject) => {
        resolveRefresh = resolve;
        rejectRefresh = reject;
      });
      refreshLocks.set(lockKey, refreshPromise);
      lockTimestamps.set(lockKey, Date.now());

      try {
        const decryptedRefreshToken = decryptToken(connection.refresh_token);

        if (!decryptedRefreshToken) {
          throw new Error('Could not decrypt refresh token');
        }

        const newTokens = await refreshAccessToken(platform, decryptedRefreshToken, userId);

        if (!newTokens) {
          throw new Error('Token refresh failed');
        }

        // Encrypt and save new tokens
        const encryptedAccessToken = encryptToken(newTokens.accessToken);
        const encryptedRefreshToken = encryptToken(newTokens.refreshToken);
        const newExpiryTime = new Date(Date.now() + newTokens.expiresIn * 1000).toISOString();

        const { error: saveErr } = await supabaseAdmin
          .from('platform_connections')
          .update({
            access_token: encryptedAccessToken,
            refresh_token: encryptedRefreshToken,
            token_expires_at: newExpiryTime,
            status: 'connected', // Reset status to 'connected' after successful refresh
            updated_at: new Date().toISOString(),
          })
          .eq('id', connection.id);

        if (saveErr) {
          log.error(`Failed to persist refreshed tokens for ${platform}:`, saveErr.message);
          throw new Error(`Token refresh succeeded but failed to persist: ${saveErr.message}`);
        }

        log.info(`Token refreshed for ${platform}`);
        resolveRefresh(newTokens.accessToken);
        return newTokens.accessToken;
      } catch (refreshError) {
        rejectRefresh(refreshError);
        throw refreshError;
      } finally {
        // Clean up lock after a short delay to handle rapid subsequent requests
        setTimeout(() => {
          refreshLocks.delete(lockKey);
          lockTimestamps.delete(lockKey);
        }, 1000);
      }
    }

    // Token is still valid, decrypt and return
    return decryptToken(connection.access_token);
  } catch (error) {
    log.error(`Error ensuring fresh token for ${platform}:`, error.message);
    throw error;
  }
}

// =========================================================================
// Object-returning token getter (replaces tokenRefresh.js getValidAccessToken)
// Returns {success, accessToken, expiresAt?, requiresReauth?, source?, error?}
// =========================================================================

/**
 * Get a valid access token, refreshing if expired.
 * Returns a structured result object — safe to use without try/catch.
 *
 * This is the recommended function for routes and services that need
 * a token and want to handle failures gracefully via result.success.
 *
 * @param {string} userId - User ID (UUID)
 * @param {string} provider - Platform provider name
 * @returns {Promise<{success: boolean, accessToken?: string, error?: string, requiresReauth?: boolean, source?: string}>}
 */
export async function getValidAccessToken(userId, provider) {
  try {
    log.info(`Getting valid access token for ${provider} (user: ${userId})`);

    const { data: connection, error: dbError } = await supabaseAdmin
      .from('platform_connections')
      .select('access_token, refresh_token, token_expires_at, connected_at, status')
      .eq('user_id', userId)
      .eq('platform', provider)
      .not('connected_at', 'is', null)
      .single();

    if (dbError || !connection) {
      return { success: false, error: `No active connection found for ${provider}` };
    }

    if (!connection.access_token) {
      return { success: false, error: `No access token available for ${provider}. User must connect.` };
    }

    // Nango-managed connections: delegate to nangoService
    if (isNangoManagedToken(connection.access_token) || isNangoManagedToken(connection.refresh_token)) {
      log.info(`${provider} is Nango-managed, fetching token from Nango`);
      try {
        const nangoService = await import('./nangoService.js');
        const nangoResult = await nangoService.getAccessToken(userId, provider);
        if (nangoResult.success) {
          return { success: true, accessToken: nangoResult.accessToken, source: 'nango' };
        }
        return { success: false, error: `Nango connection for ${provider} has no valid token: ${nangoResult.error}` };
      } catch (nangoErr) {
        log.error(`Nango token fetch failed for ${provider}:`, nangoErr.message);
        return { success: false, error: `Failed to get ${provider} token from Nango: ${nangoErr.message}` };
      }
    }

    // Decrypt current access token
    let currentAccessToken;
    try {
      currentAccessToken = decryptToken(connection.access_token);
    } catch (decryptError) {
      log.error(`Failed to decrypt access token for ${provider}:`, decryptError.message);
      return { success: false, error: `Token decryption failed - user must reconnect ${provider}`, requiresReauth: true };
    }

    // Check expiry (5-minute proactive buffer)
    const expiryTime = connection.token_expires_at ? new Date(connection.token_expires_at) : null;
    const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);

    if (!expiryTime) {
      return { success: true, accessToken: currentAccessToken };
    }

    if (expiryTime > fiveMinutesFromNow) {
      return { success: true, accessToken: currentAccessToken };
    }

    // Token expired or expiring soon — use ensureFreshToken (has locking)
    log.info(`Token for ${provider} is expired or expiring soon, refreshing...`);
    try {
      const freshToken = await ensureFreshToken(userId, provider);
      return { success: true, accessToken: freshToken };
    } catch (refreshError) {
      return { success: false, error: `Token refresh failed: ${refreshError.message}. User may need to reconnect.` };
    }

  } catch (error) {
    log.error(`Error getting valid access token for ${provider}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Check if a provider supports token refresh.
 *
 * @param {string} provider - Platform provider name
 * @returns {boolean}
 */
export function requiresTokenRefresh(provider) {
  return getPlatformRefreshConfig(provider) != null;
}

/**
 * Batch get valid tokens for multiple providers.
 * Useful for background jobs or pre-warming token cache.
 *
 * @param {string} userId - User ID (UUID)
 * @param {string[]} providers - Array of provider names
 * @returns {Promise<{success: boolean, successCount: number, failureCount: number, results: Object}>}
 */
export async function batchRefreshTokens(userId, providers) {
  log.info(`Batch refreshing tokens for user ${userId}: ${providers.join(', ')}`);

  const results = {};
  for (const provider of providers) {
    results[provider] = await getValidAccessToken(userId, provider);
  }

  const successCount = Object.values(results).filter(r => r.success).length;
  const failureCount = providers.length - successCount;

  log.info(`Batch refresh complete: ${successCount} succeeded, ${failureCount} failed`);

  return { success: failureCount === 0, successCount, failureCount, results };
}

export {
  startTokenRefreshService,
  ensureFreshToken,
  refreshAccessToken,
};
