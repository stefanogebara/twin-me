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
};

/**
 * Poll a specific platform for new data
 */
async function pollPlatform(userId, platform, accessToken) {
  const config = POLLING_CONFIGS[platform];

  if (!config) {
    console.log(`ℹ️  No polling config for platform: ${platform}`);
    return { success: false, error: 'No polling config' };
  }

  const results = [];

  for (const endpoint of config.endpoints) {
    try {
      console.log(`📡 Polling ${platform} - ${endpoint.name} for user ${userId}`);

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
          console.warn(`[CRON] Could not fetch username for ${platform}:`, connErr.message);
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

      console.log(`✅ Successfully polled ${platform} - ${endpoint.name}`);

      // Store the raw data
      const { error: insertErr } = await getSupabaseClient().from('user_platform_data').insert({
        user_id: userId,
        platform: platform,
        data_type: endpoint.name,
        raw_data: response.data,
        extracted_at: new Date().toISOString(),
      });
      if (insertErr) {
        console.error(`[CRON] Failed to store ${platform} - ${endpoint.name} data:`, insertErr.message);
      }

      results.push({
        endpoint: endpoint.name,
        success: true,
        itemCount: Array.isArray(response.data) ? response.data.length : response.data.items?.length || 1,
      });
    } catch (error) {
      console.error(`❌ Error polling ${platform} - ${endpoint.name}:`, error.response?.data || error.message);

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
            status: 'needs_reauth',
            error_message: 'Authentication failed - please reconnect',
            last_sync_status: 'auth_error',
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId)
          .eq('platform', platform);
        if (reauthErr) {
          console.warn(`[CRON] Failed to mark ${platform} as needs_reauth:`, reauthErr.message);
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
    console.log('🌍 [CRON] Starting background polling for all users...');

    // Get all unique user IDs with at least one connected platform
    const { data: connections, error } = await getSupabaseClient()
      .from('platform_connections')
      .select('user_id, platform, access_token, refresh_token')
      .eq('status', 'connected')
      .limit(1000);

    if (error) {
      console.error('❌ Error fetching users:', error);
      return { success: false, error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal server error' };
    }

    if (!connections || connections.length === 0) {
      console.log('ℹ️  No connected platforms found');
      return { success: true, userCount: 0, platformCount: 0, message: 'No connected platforms' };
    }

    console.log(`👥 Found ${connections.length} connected platforms across users`);

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
    console.log(`👥 Polling ${uniqueUserIds.length} users`);

    // Poll each user's platforms
    for (const userId of uniqueUserIds) {
      const userConns = userPlatforms[userId];

      for (const connection of userConns) {
        try {
          // Handle Nango-managed tokens (YouTube, Twitch, etc.)
          if (connection.access_token === 'NANGO_MANAGED') {
            console.log(`📡 [CRON] Polling ${connection.platform} via Nango for user ${userId}`);
            const nangoService = await import('../services/nangoService.js');
            const nangoResult = await nangoService.extractPlatformData(userId, connection.platform);
            if (nangoResult.success) {
              await nangoService.storeNangoExtractionData(userId, connection.platform, nangoResult);
              const { error: nangoSyncErr } = await getSupabaseClient()
                .from('platform_connections')
                .update({
                  last_sync_at: new Date().toISOString(),
                  last_sync_status: 'success',
                  updated_at: new Date().toISOString(),
                })
                .eq('user_id', userId)
                .eq('platform', connection.platform);
              if (nangoSyncErr) console.warn(`[CRON] Failed to update sync status for ${connection.platform}:`, nangoSyncErr.message);
            }

            pollingResults.push({
              userId,
              platform: connection.platform,
              success: nangoResult.success,
              results: nangoResult.success ? [{ endpoint: 'nango', success: true }] : [{ endpoint: 'nango', success: false, error: nangoResult.error }],
            });

            await new Promise(resolve => setTimeout(resolve, 2000));
            continue;
          }

          // Decrypt access token (legacy flow)
          const accessToken = decryptToken(connection.access_token);

          if (!accessToken) {
            console.error(`❌ Could not decrypt token for ${connection.platform} (user: ${userId})`);
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

          // Update last sync time if successful
          if (result.success) {
            const { error: syncUpdateErr } = await getSupabaseClient()
              .from('platform_connections')
              .update({
                last_sync_at: new Date().toISOString(),
                last_sync_status: 'success',
                updated_at: new Date().toISOString(),
              })
              .eq('user_id', userId)
              .eq('platform', connection.platform);
            if (syncUpdateErr) console.warn(`[CRON] Failed to update sync status for ${connection.platform}:`, syncUpdateErr.message);
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
          console.error(`❌ Error polling ${connection.platform} for user ${userId}:`, error.message);
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

    console.log('✅ Completed background polling for all users');

    return {
      success: true,
      userCount: uniqueUserIds.length,
      platformCount: connections.length,
      pollsSuccessful: successCount,
      pollsFailed: pollingResults.length - successCount,
      results: pollingResults,
    };
  } catch (error) {
    console.error('❌ Error in background polling:', error);
    return { success: false, error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal server error' };
  }
}

/**
 * Vercel Cron Job Handler
 * Called every 30 minutes by Vercel Cron
 */
export default async function handler(req, res) {
  console.log('🌐 [CRON] Platform polling endpoint called');

  // Security: Verify cron secret (Vercel automatically adds this header)
  // SECURITY FIX: Require CRON_SECRET in production (was previously bypassed if not set)
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  const isDevelopment = process.env.NODE_ENV === 'development';

  if (!isDevelopment) {
    if (!cronSecret) {
      console.error('❌ CRON_SECRET not configured in production');
      return res.status(500).json({
        success: false,
        error: 'Configuration Error',
        message: 'CRON_SECRET must be configured in production',
      });
    }
    if (authHeader !== `Bearer ${cronSecret}`) {
      console.error('❌ Unauthorized cron request - invalid secret');
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Invalid CRON_SECRET',
      });
    }
  }

  // Execute platform polling
  const result = await pollAllUsers();

  // Return results
  const status = result.success ? 200 : 500;

  console.log(`✅ [CRON] Platform polling completed:`, result);

  return res.status(status).json({
    ...result,
    timestamp: new Date().toISOString(),
    cronType: 'platform-polling',
  });
}
