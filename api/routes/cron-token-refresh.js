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

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    });

    const response = await axios.post(config.tokenUrl, params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
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

    const { data: connections, error } = await getSupabaseClient()
      .from('platform_connections')
      .select('*')
      .in('status', ['connected', 'token_expired'])
      .not('refresh_token', 'is', null)
      .lt('token_expires_at', tenMinutesFromNow);

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
 * Log cron execution to database for tracking and monitoring
 */
async function logCronExecution(jobName, status, executionTimeMs, result, errorMessage = null) {
  try {
    const logEntry = {
      job_name: jobName,
      status,
      execution_time_ms: executionTimeMs,
      tokens_refreshed: result?.tokensRefreshed || 0,
      tokens_checked: result?.tokensChecked || 0,
      platforms_polled: result?.platformsPolled || 0,
      error_message: errorMessage,
      result_data: result || {},
      executed_at: new Date().toISOString(),
    };

    await getSupabaseClient()
      .from('cron_executions')
      .insert(logEntry);

    console.log(`📊 [CRON] Execution logged to database`);
  } catch (error) {
    // Don't fail the cron job if logging fails
    console.error('⚠️  [CRON] Failed to log execution:', error.message);
  }
}

/**
 * Vercel Cron Job Handler
 * Called every 5 minutes by Vercel Cron
 */
export default async function handler(req, res) {
  const startTime = Date.now();
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

  try {
    // Execute token refresh
    const result = await checkAndRefreshExpiringTokens();
    const executionTime = Date.now() - startTime;

    // Log execution to database
    await logCronExecution(
      'token-refresh',
      result.success ? 'success' : 'error',
      executionTime,
      result,
      result.error || null
    );

    // Return results
    const status = result.success ? 200 : 500;

    console.log(`✅ [CRON] Token refresh completed in ${executionTime}ms:`, result);

    return res.status(status).json({
      ...result,
      timestamp: new Date().toISOString(),
      cronType: 'token-refresh',
      executionTime: `${executionTime}ms`,
    });
  } catch (error) {
    const executionTime = Date.now() - startTime;

    // Log error execution
    await logCronExecution(
      'token-refresh',
      'error',
      executionTime,
      null,
      error.message
    );

    console.error(`❌ [CRON] Token refresh failed in ${executionTime}ms:`, error);

    return res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
      cronType: 'token-refresh',
      executionTime: `${executionTime}ms`,
    });
  }
}
