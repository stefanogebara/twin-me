/**
 * Vercel Cron Job Endpoint: Platform Polling
 *
 * This endpoint is called by Vercel Cron (every 30 minutes)
 * to automatically extract data from all connected platforms.
 *
 * Security: Protected by CRON_SECRET environment variable
 */

import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import { decryptToken } from '../services/encryption.js';
import { verifyCronSecret } from '../middleware/verifyCronSecret.js';
import { logCronExecution } from '../services/cronLogger.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('CronPlatformPolling');

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

// Platform-specific polling configurations
const POLLING_CONFIGS = {
  spotify: {
    endpoints: [
      {
        name: 'recently_played',
        url: 'https://api.spotify.com/v1/me/player/recently-played',
        limit: 50,
      },
      {
        name: 'top_tracks',
        url: 'https://api.spotify.com/v1/me/top/tracks',
        params: { limit: 50, time_range: 'short_term' },
      },
    ],
  },
  youtube: {
    endpoints: [
      {
        name: 'liked_videos',
        url: 'https://www.googleapis.com/youtube/v3/videos',
        params: { part: 'snippet,contentDetails', myRating: 'like', maxResults: 50 },
      },
    ],
  },
  github: {
    endpoints: [
      {
        name: 'events',
        url: 'https://api.github.com/users/{username}/events',
        params: { per_page: 100 },
      },
      {
        name: 'repos',
        url: 'https://api.github.com/user/repos',
        params: { sort: 'updated', per_page: 100 },
      },
    ],
  },
  twitch: {
    endpoints: [], // Handled by Nango
  },
  discord: {
    endpoints: [
      {
        name: 'user_guilds',
        url: 'https://discord.com/api/v10/users/@me/guilds',
      },
    ],
  },
  google_gmail: {
    endpoints: [
      {
        name: 'messages',
        url: 'https://gmail.googleapis.com/gmail/v1/users/me/messages',
        params: { maxResults: 100, q: 'newer_than:1d' },
      },
    ],
  },
  google_calendar: {
    endpoints: [
      {
        name: 'events',
        url: 'https://www.googleapis.com/calendar/v3/calendars/primary/events',
        params: { maxResults: 100, timeMin: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() },
      },
    ],
  },
  strava: {
    endpoints: [
      {
        name: 'activities',
        url: 'https://www.strava.com/api/v3/athlete/activities',
        params: { per_page: 30 },
      },
    ],
  },
  linkedin: {
    endpoints: [
      {
        name: 'profile',
        url: 'https://api.linkedin.com/v2/userinfo',
      },
    ],
  },
  reddit: {
    endpoints: [
      {
        name: 'overview',
        url: 'https://oauth.reddit.com/user/{username}/overview',
        params: { limit: 25, sort: 'new' },
      },
    ],
  },
};

/**
 * Poll a specific platform for new data
 */
async function pollPlatform(userId, platform, accessToken) {
  const config = POLLING_CONFIGS[platform];

  if (!config) {
    log.info('No polling config for platform', { platform });
    return { success: false, error: 'No polling config' };
  }

  const results = [];

  for (const endpoint of config.endpoints) {
    try {
      log.info('Polling platform endpoint', { platform, endpoint: endpoint.name, userId });

      let url = endpoint.url;

      // Replace placeholders (e.g., {username})
      if (url.includes('{username}')) {
        const { data: connection, error: connErr } = await getSupabaseClient()
          .from('platform_connections')
          .select('platform_user_id, metadata')
          .eq('user_id', userId)
          .eq('platform', platform)
          .single();
        if (connErr) {
          log.warn('Could not fetch username for platform', { platform, error: connErr.message });
        }

        const username = connection?.platform_user_id || connection?.metadata?.username;
        url = url.replace('{username}', username);
      }

      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        params: endpoint.params || {},
      });

      log.info('Successfully polled platform endpoint', { platform, endpoint: endpoint.name });

      // Store the raw data
      const { error: insertErr } = await getSupabaseClient().from('user_platform_data').insert({
        user_id: userId,
        platform: platform,
        data_type: endpoint.name,
        raw_data: response.data,
        extracted_at: new Date().toISOString(),
      });
      if (insertErr) {
        log.error('Failed to store platform data', { platform, endpoint: endpoint.name, error: insertErr.message });
      }

      results.push({
        endpoint: endpoint.name,
        success: true,
        itemCount: Array.isArray(response.data) ? response.data.length : response.data.items?.length || 1,
      });
    } catch (error) {
      log.error('Error polling platform endpoint', { platform, endpoint: endpoint.name, error: error.response?.data || error.message });

      results.push({
        endpoint: endpoint.name,
        success: false,
        error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal server error',
      });

      // If unauthorized, mark connection as needs_reauth
      if (error.response?.status === 401) {
        const { error: reauthErr } = await getSupabaseClient()
          .from('platform_connections')
          .update({
            status: 'expired',
            last_sync_status: 'auth_error',
            last_sync_error: 'Authentication failed - please reconnect',
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId)
          .eq('platform', platform);
        if (reauthErr) {
          log.warn('Failed to mark platform as needs_reauth', { platform, error: reauthErr.message });
        }
      }
    }
  }

  return {
    success: results.some(r => r.success),
    results,
  };
}

/**
 * Poll all connected platforms for all users
 */
async function pollAllUsers() {
  try {
    log.info('Starting background polling for all users');

    // Get all unique user IDs with at least one connected platform
    const { data: connections, error } = await getSupabaseClient()
      .from('platform_connections')
      .select('user_id, platform, access_token, refresh_token')
      .eq('status', 'connected')
      .limit(1000);

    if (error) {
      log.error('Error fetching users', { error });
      return { success: false, error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal server error' };
    }

    if (!connections || connections.length === 0) {
      log.info('No connected platforms found');
      return { success: true, userCount: 0, platformCount: 0, message: 'No connected platforms' };
    }

    log.info('Found connected platforms across users', { count: connections.length });

    const pollingResults = [];

    // Group connections by user
    const userPlatforms = connections.reduce((acc, conn) => {
      if (!acc[conn.user_id]) {
        acc[conn.user_id] = [];
      }
      acc[conn.user_id].push(conn);
      return acc;
    }, {});

    const uniqueUserIds = Object.keys(userPlatforms);
    log.info('Polling users', { count: uniqueUserIds.length });

    // Poll each user's platforms
    for (const userId of uniqueUserIds) {
      const userConns = userPlatforms[userId];

      for (const connection of userConns) {
        try {
          // Skip Nango-managed tokens — handled by observation-ingestion cron via nango_connection_mappings
          // Processing them here causes 120s function timeout before legacy platforms (Spotify, Discord) are reached
          if (connection.access_token === 'NANGO_MANAGED') {
            log.info('Skipping Nango-managed platform', { platform: connection.platform });
            continue;
          }

          // Skip platforms not in POLLING_CONFIGS — these are handled by the
          // observation-ingestion cron (e.g. linkedin, reddit, whoop, oura, slack).
          // Without this check, pollPlatform() returns {success:false} for unknown
          // platforms and overwrites last_sync_status with 'failed' / 'Poll failed',
          // clobbering the correct status written by observation-ingestion.
          if (!POLLING_CONFIGS[connection.platform]) {
            log.info('Skipping platform without polling config (handled by observation-ingestion)', { platform: connection.platform });
            continue;
          }

          // Decrypt access token (legacy flow)
          const accessToken = decryptToken(connection.access_token);

          if (!accessToken) {
            log.error('Could not decrypt token', { platform: connection.platform, userId });
            pollingResults.push({
              userId,
              platform: connection.platform,
              success: false,
              error: 'Token decryption failed',
            });
            continue;
          }

          // Poll the platform
          const result = await pollPlatform(userId, connection.platform, accessToken);

          // Update last sync time and status
          const firstError = result.results?.find(r => !r.success)?.error;
          const { error: syncUpdateErr } = await getSupabaseClient()
            .from('platform_connections')
            .update({
              last_sync_at: new Date().toISOString(),
              last_sync_status: result.success ? 'success' : 'failed',
              last_sync_error: result.success ? null : (firstError || 'Poll failed'),
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', userId)
            .eq('platform', connection.platform);
          if (syncUpdateErr) {
            log.error('Failed to update last_sync', { platform: connection.platform, userId, error: syncUpdateErr.message, code: syncUpdateErr.code });
          }

          pollingResults.push({
            userId,
            platform: connection.platform,
            success: result.success,
            results: result.results,
          });

          // Wait 2 seconds between platforms to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
          log.error('Error polling platform for user', { platform: connection.platform, userId, error: error.message });
          const { error: catchUpdateErr } = await getSupabaseClient()
            .from('platform_connections')
            .update({
              last_sync_at: new Date().toISOString(),
              last_sync_status: 'failed',
              last_sync_error: error.message,
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', userId)
            .eq('platform', connection.platform);
          if (catchUpdateErr) {
            log.error('Failed to update error status', { platform: connection.platform, error: catchUpdateErr.message, code: catchUpdateErr.code });
          }
          pollingResults.push({
            userId,
            platform: connection.platform,
            success: false,
            error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal server error',
          });
        }
      }

      // Wait 3 seconds between users to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    const successCount = pollingResults.filter(r => r.success).length;

    log.info('Completed background polling for all users');

    return {
      success: true,
      userCount: uniqueUserIds.length,
      platformCount: connections.length,
      pollsSuccessful: successCount,
      pollsFailed: pollingResults.length - successCount,
      results: pollingResults,
    };
  } catch (error) {
    log.error('Error in background polling', { error });
    return { success: false, error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal server error' };
  }
}

/**
 * Vercel Cron Job Handler
 * Called every 30 minutes by Vercel Cron
 */
export default async function handler(req, res) {
  const startTime = Date.now();
  log.info('Platform polling endpoint called');

  // Security: Verify cron secret (timing-safe)
  const authResult = verifyCronSecret(req);
  if (!authResult.authorized) {
    log.error('Unauthorized cron request - invalid secret');
    return res.status(authResult.status).json({
      success: false,
      error: authResult.error,
    });
  }

  try {
    // Execute platform polling
    const result = await pollAllUsers();
    const durationMs = Date.now() - startTime;

    await logCronExecution(
      'platform-polling',
      result.success ? 'success' : 'error',
      durationMs,
      result,
      result.error || null
    );

    // Return results
    const status = result.success ? 200 : 500;

    log.info('Platform polling completed', { result });

    return res.status(status).json({
      ...result,
      timestamp: new Date().toISOString(),
      cronType: 'platform-polling',
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    await logCronExecution('platform-polling', 'error', durationMs, null, error.message);
    log.error('Platform polling failed', { error: error.message });
    return res.status(500).json({
      success: false,
      error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal server error',
      timestamp: new Date().toISOString(),
      cronType: 'platform-polling',
    });
  }
}
