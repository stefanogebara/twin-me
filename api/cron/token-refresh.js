/**
 * Vercel Cron Job Endpoint: Token Refresh
 *
 * This endpoint is called by Vercel Cron (every 5 minutes)
 * to automatically refresh expiring OAuth tokens.
 *
 * Security: Protected by CRON_SECRET environment variable
 */

import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import { encryptToken, decryptToken } from '../services/encryption.js';

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

// Platform-specific OAuth configurations
const PLATFORM_REFRESH_CONFIGS = {
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
  // Whoop OAuth refresh configuration
  whoop: {
    tokenUrl: 'https://api.prod.whoop.com/oauth/oauth2/token',
    clientId: process.env.WHOOP_CLIENT_ID,
    clientSecret: process.env.WHOOP_CLIENT_SECRET,
  },
};

/**
 * Refresh access token using refresh token
 */
async function refreshAccessToken(platform, refreshToken, userId) {
  const config = PLATFORM_REFRESH_CONFIGS[platform];

  if (!config || !config.tokenUrl) {
    console.log(`ℹ️  Platform ${platform} doesn't support token refresh`);
    return null;
  }

  try {
    console.log(`🔄 Refreshing token for ${platform} (user: ${userId})`);

    // Build params
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

      // Whoop requires scope
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
      refreshToken: newRefreshToken || refreshToken,
      expiresIn: expires_in || 3600,
    };
  } catch (error) {
    console.error(`❌ Token refresh failed for ${platform}:`, error.response?.data || error.message);

    // Mark connection as needs_reauth
    await getSupabaseClient()
      .from('platform_connections')
      .update({
        status: 'needs_reauth',
        error_message: 'Token refresh failed - please reconnect',
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('platform', platform);

    return null;
  }
}

/**
 * Check and refresh tokens that are about to expire
 */
async function checkAndRefreshExpiringTokens() {
  try {
    console.log('🔍 [CRON] Checking for expiring tokens...');

    // Get all connections that expire in the next 10 minutes
    const tenMinutesFromNow = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    console.log('🔍 [CRON] Query threshold:', tenMinutesFromNow);

    const client = getSupabaseClient();
    console.log('🔍 [CRON] Supabase client exists:', !!client);

    const { data: connections, error } = await client
      .from('platform_connections')
      .select('*')
      .in('status', ['connected', 'token_expired', 'expired'])
      .not('refresh_token', 'is', null)
      .lt('token_expires_at', tenMinutesFromNow);

    console.log('🔍 [CRON] Query result:', {
      hasError: !!error,
      connectionCount: connections?.length ?? 0,
      errorMessage: error?.message
    });

    if (error) {
      console.error('❌ Error fetching connections:', error);
      return { success: false, error: error.message };
    }

    if (!connections || connections.length === 0) {
      console.log('✅ No tokens expiring soon');
      return { success: true, tokensRefreshed: 0, message: 'No tokens expiring soon' };
    }

    console.log(`⚠️  Found ${connections.length} tokens expiring soon`);

    const refreshResults = [];

    // Refresh each token
    for (const connection of connections) {
      const decryptedRefreshToken = decryptToken(connection.refresh_token);

      if (!decryptedRefreshToken) {
        console.error(`❌ Could not decrypt refresh token for ${connection.platform}`);
        refreshResults.push({
          platform: connection.platform,
          userId: connection.user_id,
          success: false,
          error: 'Decryption failed',
        });
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
            status: 'connected',
            last_sync_status: 'token_refreshed',
            updated_at: new Date().toISOString(),
          })
          .eq('id', connection.id);

        console.log(`✅ Updated tokens for ${connection.platform} (user: ${connection.user_id})`);

        refreshResults.push({
          platform: connection.platform,
          userId: connection.user_id,
          success: true,
          newExpiry: newExpiryTime,
        });
      } else {
        refreshResults.push({
          platform: connection.platform,
          userId: connection.user_id,
          success: false,
          error: 'Refresh failed',
        });
      }
    }

    const successCount = refreshResults.filter(r => r.success).length;

    return {
      success: true,
      tokensChecked: connections.length,
      tokensRefreshed: successCount,
      results: refreshResults,
    };
  } catch (error) {
    console.error('❌ Error in token refresh check:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Vercel Cron Job Handler
 * Called every 5 minutes by Vercel Cron
 */
export default async function handler(req, res) {
  console.log('🌐 [CRON] Token refresh endpoint called');

  // Security: Verify cron secret (Vercel automatically adds this header)
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    console.error('❌ Unauthorized cron request - invalid secret');
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Invalid CRON_SECRET',
    });
  }

  // Execute token refresh
  const result = await checkAndRefreshExpiringTokens();

  // Return results
  const status = result.success ? 200 : 500;

  console.log(`✅ [CRON] Token refresh completed:`, result);

  return res.status(status).json({
    ...result,
    timestamp: new Date().toISOString(),
    cronType: 'token-refresh',
  });
}
