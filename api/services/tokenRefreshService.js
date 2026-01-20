/**
 * Automatic Token Refresh Service
 * Proactively refreshes OAuth tokens before they expire
 * Prevents token expiration issues and maintains continuous connection
 */

import cron from 'node-cron';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import { encryptToken, decryptToken } from './encryption.js';

// Lazy initialization to avoid crashes if env vars not loaded yet
let supabase = null;
function getSupabaseClient() {
  if (!supabase) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return supabase;
}

// In-memory lock to prevent concurrent token refresh attempts
// Key: `${userId}:${platform}`, Value: Promise that resolves when refresh completes
const refreshLocks = new Map();

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
    whoop: {
      tokenUrl: 'https://api.prod.whoop.com/oauth/oauth2/token',
      clientId: process.env.WHOOP_CLIENT_ID,
      clientSecret: process.env.WHOOP_CLIENT_SECRET,
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
    console.log(`ℹ️  Platform ${platform} doesn't support token refresh`);
    return null;
  }

  try {
    console.log(`🔄 Refreshing token for ${platform} (user: ${userId})`);
    console.log(`🔷 [Token Refresh] Config for ${platform}:`, {
      hasTokenUrl: !!config?.tokenUrl,
      hasClientId: !!config?.clientId,
      hasClientSecret: !!config?.clientSecret,
      clientIdPrefix: config?.clientId?.substring(0, 8),
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

    // Spotify requires HTTP Basic Auth for client credentials
    if (platform === 'spotify') {
      const basicAuth = Buffer.from(
        `${config.clientId}:${config.clientSecret}`
      ).toString('base64');
      headers['Authorization'] = `Basic ${basicAuth}`;
    } else {
      // Whoop and other platforms use client_secret_post (credentials in body)
      paramsObj.client_id = config.clientId;
      paramsObj.client_secret = config.clientSecret;

      // Whoop requires scope in the body
      if (platform === 'whoop') {
        paramsObj.scope = 'offline';
      }
    }

    const params = new URLSearchParams(paramsObj);

    const response = await axios.post(config.tokenUrl, params.toString(), {
      headers,
    });

    const { access_token, refresh_token: newRefreshToken, expires_in } = response.data;

    if (!access_token) {
      throw new Error('No access token in refresh response');
    }

    console.log(`✅ Token refreshed successfully for ${platform}`);

    return {
      accessToken: access_token,
      refreshToken: newRefreshToken || refreshToken, // Some platforms don't return new refresh token
      expiresIn: expires_in || 3600, // Default 1 hour
    };
  } catch (error) {
    console.error(`❌ Token refresh failed for ${platform}:`, error.response?.data || error.message);

    // Mark connection as expired (database constraint allows: connected, disconnected, error, pending, expired)
    await getSupabaseClient()
      .from('platform_connections')
      .update({
        status: 'expired',
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('platform', platform);

    return null;
  }
}

/**
 * Check and refresh tokens that are about to expire
 * Runs every 5 minutes
 */
async function checkAndRefreshExpiringTokens() {
  try {
    console.log('🔍 Checking for expiring tokens...');

    // Get all connections that expire in the next 10 minutes
    // Include both 'connected' and 'token_expired' status (tokens can be refreshed even if expired)
    const tenMinutesFromNow = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { data: connections, error } = await getSupabaseClient()
      .from('platform_connections')
      .select('*')
      .in('status', ['connected', 'token_expired', 'expired'])
      .not('refresh_token', 'is', null)
      .lt('token_expires_at', tenMinutesFromNow);

    if (error) {
      console.error('❌ Error fetching connections:', error);
      return;
    }

    if (!connections || connections.length === 0) {
      console.log('✅ No tokens expiring soon');
      return;
    }

    console.log(`⚠️  Found ${connections.length} tokens expiring soon`);

    // Refresh each token
    for (const connection of connections) {
      const decryptedRefreshToken = decryptToken(connection.refresh_token);

      if (!decryptedRefreshToken) {
        console.error(`❌ Could not decrypt refresh token for ${connection.platform}`);
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

        await getSupabaseClient()
          .from('platform_connections')
          .update({
            access_token: encryptedAccessToken,
            refresh_token: encryptedRefreshToken,
            token_expires_at: newExpiryTime,
            status: 'connected', // Reset status to 'connected' after successful refresh
            updated_at: new Date().toISOString(),
          })
          .eq('id', connection.id);

        console.log(`✅ Updated tokens for ${connection.platform} (user: ${connection.user_id})`);
      }
    }
  } catch (error) {
    console.error('❌ Error in token refresh check:', error);
  }
}

/**
 * Start the automatic token refresh service
 * Runs every 5 minutes to check for expiring tokens
 */
function startTokenRefreshService() {
  console.log('🚀 Starting automatic token refresh service...');

  // Run immediately on startup
  checkAndRefreshExpiringTokens();

  // Schedule to run every 5 minutes
  cron.schedule('*/5 * * * *', () => {
    console.log('⏰ Running scheduled token refresh check');
    checkAndRefreshExpiringTokens();
  });

  console.log('✅ Token refresh service started (runs every 5 minutes)');
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
    console.log(`⏳ [Token Refresh] Waiting for existing ${platform} refresh to complete...`);
    try {
      await refreshLocks.get(lockKey);
      // After waiting, re-fetch the connection to get the updated token
      const { data: updatedConnection } = await getSupabaseClient()
        .from('platform_connections')
        .select('access_token, status')
        .eq('user_id', userId)
        .eq('platform', platform)
        .single();

      if (updatedConnection?.status === 'connected') {
        console.log(`✅ [Token Refresh] Using token from completed ${platform} refresh`);
        return decryptToken(updatedConnection.access_token);
      }
    } catch {
      // Previous refresh failed, we'll try our own below
      console.log(`⚠️ [Token Refresh] Previous ${platform} refresh failed, attempting new refresh...`);
    }
  }

  try {
    const { data: connection } = await getSupabaseClient()
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
      console.log(`🔄 Token ${isExpiredStatus ? 'expired' : 'expiring'} for ${platform}, attempting refresh...`);

      // Create a promise that we'll resolve when refresh completes
      let resolveRefresh, rejectRefresh;
      const refreshPromise = new Promise((resolve, reject) => {
        resolveRefresh = resolve;
        rejectRefresh = reject;
      });
      refreshLocks.set(lockKey, refreshPromise);

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

        await getSupabaseClient()
          .from('platform_connections')
          .update({
            access_token: encryptedAccessToken,
            refresh_token: encryptedRefreshToken,
            token_expires_at: newExpiryTime,
            status: 'connected', // Reset status to 'connected' after successful refresh
            updated_at: new Date().toISOString(),
          })
          .eq('id', connection.id);

        console.log(`✅ Token refreshed for ${platform}`);
        resolveRefresh(newTokens.accessToken);
        return newTokens.accessToken;
      } catch (refreshError) {
        rejectRefresh(refreshError);
        throw refreshError;
      } finally {
        // Clean up lock after a short delay to handle rapid subsequent requests
        setTimeout(() => refreshLocks.delete(lockKey), 1000);
      }
    }

    // Token is still valid, decrypt and return
    return decryptToken(connection.access_token);
  } catch (error) {
    console.error(`❌ Error ensuring fresh token for ${platform}:`, error.message);
    throw error;
  }
}

export {
  startTokenRefreshService,
  ensureFreshToken,
  ensureFreshToken as getValidAccessToken,
  refreshAccessToken,
};
