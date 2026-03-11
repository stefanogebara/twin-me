/**
 * Platform Polling Service
 * Continuously polls connected platforms for new data
 * Automatically extracts and updates soul signature data
 */

import cron from 'node-cron';
import { supabaseAdmin } from './database.js';
import { ensureFreshToken } from './tokenRefreshService.js';
import axios from 'axios';
import { createLogger } from './logger.js';

const log = createLogger('PlatformPolling');

// Platform-specific polling configurations
const POLLING_CONFIGS = {
  spotify: {
    interval: '*/30 * * * *', // Every 30 minutes
    endpoints: [
      {
        name: 'recently_played',
        url: 'https://api.spotify.com/v1/me/player/recently-played',
        limit: 50,
      },
      {
        name: 'current_playing',
        url: 'https://api.spotify.com/v1/me/player/currently-playing',
      },
    ],
  },
  youtube: {
    interval: '0 */2 * * *', // Every 2 hours
    endpoints: [
      {
        name: 'watch_history',
        url: 'https://www.googleapis.com/youtube/v3/videos',
        params: { part: 'snippet,contentDetails', myRating: 'like' },
      },
    ],
  },
  github: {
    interval: '0 */6 * * *', // Every 6 hours
    endpoints: [
      {
        name: 'events',
        url: 'https://api.github.com/users/{username}/events',
      },
      {
        name: 'repos',
        url: 'https://api.github.com/user/repos',
        params: { sort: 'updated', per_page: 100 },
      },
    ],
  },
  twitch: {
    interval: '0 */3 * * *', // Every 3 hours
    endpoints: [], // Handled by Nango
  },
  discord: {
    interval: '0 */4 * * *', // Every 4 hours
    endpoints: [
      {
        name: 'user_guilds',
        url: 'https://discord.com/api/v10/users/@me/guilds',
      },
    ],
  },
  google_gmail: {
    interval: '0 */1 * * *', // Every 1 hour
    endpoints: [
      {
        name: 'messages',
        url: 'https://gmail.googleapis.com/gmail/v1/users/me/messages',
        params: { maxResults: 100, q: 'newer_than:1d' },
      },
    ],
  },
  linkedin: {
    interval: '0 */6 * * *', // Every 6 hours (profile data changes infrequently)
    endpoints: [], // Handled by Nango
  },
};

/**
 * Poll a specific platform for new data
 */
async function pollPlatform(userId, platform, accessToken) {
  const config = POLLING_CONFIGS[platform];

  if (!config) {
    log.info(`No polling config for platform: ${platform}`);
    return null;
  }

  const results = [];

  for (const endpoint of config.endpoints) {
    try {
      log.info(`Polling ${platform} - ${endpoint.name} for user ${userId}`);

      let url = endpoint.url;

      // Replace placeholders (e.g., {username})
      if (url.includes('{username}')) {
        // Get username from platform_connections metadata
        const { data: connection, error: connErr } = await supabaseAdmin
          .from('platform_connections')
          .select('platform_user_id, metadata')
          .eq('user_id', userId)
          .eq('platform', platform)
          .single();

        if (connErr) {
          log.warn(`Failed to fetch connection for ${platform} username placeholder:`, connErr.message);
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

      log.info(`Successfully polled ${platform} - ${endpoint.name}`);

      // Store the raw data
      const { error: insertErr } = await supabaseAdmin.from('user_platform_data').insert({
        user_id: userId,
        platform: platform,
        data_type: endpoint.name,
        raw_data: response.data,
        extracted_at: new Date().toISOString(),
      });

      if (insertErr) {
        log.error(`Failed to store polled data for ${platform} - ${endpoint.name}:`, insertErr.message);
      }

      results.push({
        endpoint: endpoint.name,
        success: true,
        itemCount: Array.isArray(response.data) ? response.data.length : response.data.items?.length || 1,
      });
    } catch (error) {
      log.error(`Error polling ${platform} - ${endpoint.name}:`, error.response?.data || error.message);

      results.push({
        endpoint: endpoint.name,
        success: false,
        error: error.message,
      });

      // If unauthorized, mark connection as needs_reauth
      if (error.response?.status === 401) {
        const { error: reauthErr } = await supabaseAdmin
          .from('platform_connections')
          .update({
            status: 'needs_reauth',
            error_message: 'Authentication failed - please reconnect',
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId)
          .eq('platform', platform);

        if (reauthErr) {
          log.warn(`Failed to mark ${platform} as needs_reauth:`, reauthErr.message);
        }
      }
    }
  }

  return results;
}

/**
 * Poll all connected platforms for a user
 */
async function pollAllPlatformsForUser(userId) {
  try {
    log.info(`Polling all platforms for user: ${userId}`);

    // Get all connected platforms for this user
    const { data: connections, error } = await supabaseAdmin
      .from('platform_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'connected');

    if (error) {
      log.error('Error fetching connections:', error);
      return;
    }

    if (!connections || connections.length === 0) {
      log.info(`No connected platforms for user: ${userId}`);
      return;
    }

    log.info(`Found ${connections.length} connected platforms`);

    const pollPromises = connections.map(async (connection) => {
      try {
        // Handle Nango-managed tokens (YouTube, Twitch, etc.)
        if (connection.access_token === 'NANGO_MANAGED') {
          log.info(`Polling ${connection.platform} via Nango for user ${userId}`);
          const nangoService = await import('./nangoService.js');
          const result = await nangoService.extractPlatformData(userId, connection.platform);
          if (result.success) {
            await nangoService.storeNangoExtractionData(userId, connection.platform, result);
            const { error: nangoSyncErr } = await supabaseAdmin
              .from('platform_connections')
              .update({
                last_sync: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq('id', connection.id);

            if (nangoSyncErr) {
              log.warn(`Failed to update last_sync for ${connection.platform} (Nango):`, nangoSyncErr.message);
            }
          }
          return {
            platform: connection.platform,
            results: result.success ? [{ endpoint: 'nango', success: true }] : [{ endpoint: 'nango', success: false, error: result.error }],
          };
        }

        // Ensure token is fresh (legacy flow)
        const accessToken = await ensureFreshToken(userId, connection.platform);

        if (!accessToken) {
          log.error(`Could not get fresh token for ${connection.platform}`);
          return null;
        }

        // Poll the platform
        const results = await pollPlatform(userId, connection.platform, accessToken);

        // Update last sync time
        const { error: legacySyncErr } = await supabaseAdmin
          .from('platform_connections')
          .update({
            last_sync: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', connection.id);

        if (legacySyncErr) {
          log.warn(`Failed to update last_sync for ${connection.platform} (legacy):`, legacySyncErr.message);
        }

        return {
          platform: connection.platform,
          results,
        };
      } catch (error) {
        log.error(`Error polling ${connection.platform}:`, error.message);
        return {
          platform: connection.platform,
          error: error.message,
        };
      }
    });

    const pollResults = await Promise.all(pollPromises);

    log.info(`Completed polling for user ${userId}:`, pollResults);

    return pollResults;
  } catch (error) {
    log.error(`Error polling all platforms for user ${userId}:`, error);
  }
}

/**
 * Poll all users' connected platforms
 * This runs on a schedule for background data collection
 */
async function pollAllUsers() {
  try {
    log.info('Starting background polling for all users...');

    // Get all unique user IDs with at least one connected platform
    const { data: connections, error } = await supabaseAdmin
      .from('platform_connections')
      .select('user_id')
      .eq('status', 'connected');

    if (error) {
      log.error('Error fetching users:', error);
      return;
    }

    if (!connections || connections.length === 0) {
      log.info('No connected platforms found');
      return;
    }

    // Get unique user IDs
    const uniqueUserIds = [...new Set(connections.map(c => c.user_id))];

    log.info(`Found ${uniqueUserIds.length} users with connected platforms`);

    // Poll each user's platforms (with a small delay between users to avoid rate limits)
    for (const userId of uniqueUserIds) {
      await pollAllPlatformsForUser(userId);

      // Wait 5 seconds between users to avoid hitting rate limits
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    log.info('Completed background polling for all users');
  } catch (error) {
    log.error('Error in background polling:', error);
  }
}

/**
 * Start platform-specific polling jobs
 * Each platform has its own polling schedule based on POLLING_CONFIGS
 */
function startPlatformPolling() {
  log.info('Starting platform polling service...');

  // Spotify - Every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    log.info('Running Spotify polling job');
    await pollPlatformForAllUsers('spotify');
  });

  // YouTube - Every 2 hours
  cron.schedule('0 */2 * * *', async () => {
    log.info('Running YouTube polling job');
    await pollPlatformForAllUsers('youtube');
  });

  // GitHub - Every 6 hours
  cron.schedule('0 */6 * * *', async () => {
    log.info('Running GitHub polling job');
    await pollPlatformForAllUsers('github');
  });

  // Discord - Every 4 hours
  cron.schedule('0 */4 * * *', async () => {
    log.info('Running Discord polling job');
    await pollPlatformForAllUsers('discord');
  });

  // Gmail - Every 1 hour
  cron.schedule('0 */1 * * *', async () => {
    log.info('Running Gmail polling job');
    await pollPlatformForAllUsers('google_gmail');
  });

  // Twitch - Every 3 hours
  cron.schedule('0 */3 * * *', async () => {
    log.info('Running Twitch polling job');
    await pollPlatformForAllUsers('twitch');
  });

  // LinkedIn - Every 6 hours
  cron.schedule('0 */6 * * *', async () => {
    log.info('Running LinkedIn polling job');
    await pollPlatformForAllUsers('linkedin');
  });

  log.info('Platform polling service started with multiple schedules');
}

/**
 * Poll a specific platform for all users
 */
async function pollPlatformForAllUsers(platform) {
  try {
    log.info(`Polling ${platform} for all users...`);

    const { data: connections, error } = await supabaseAdmin
      .from('platform_connections')
      .select('user_id')
      .eq('platform', platform)
      .eq('status', 'connected');

    if (error) {
      log.error(`Error fetching ${platform} connections:`, error);
      return;
    }

    if (!connections || connections.length === 0) {
      log.info(`No connected ${platform} accounts found`);
      return;
    }

    const uniqueUserIds = [...new Set(connections.map(c => c.user_id))];

    log.info(`Polling ${platform} for ${uniqueUserIds.length} users`);

    for (const userId of uniqueUserIds) {
      try {
        // Check if this user's connection is Nango-managed
        const { data: conn } = await supabaseAdmin
          .from('platform_connections')
          .select('id, access_token')
          .eq('user_id', userId)
          .eq('platform', platform)
          .eq('status', 'connected')
          .single();

        if (conn?.access_token === 'NANGO_MANAGED') {
          log.info(`Polling ${platform} via Nango for user ${userId}`);
          const nangoService = await import('./nangoService.js');
          const result = await nangoService.extractPlatformData(userId, platform);
          if (result.success) {
            await nangoService.storeNangoExtractionData(userId, platform, result);
            const { error: pollUpdateErr } = await supabaseAdmin
              .from('platform_connections')
              .update({
                last_sync: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq('id', conn.id);
            if (pollUpdateErr) log.warn('Error updating connection:', pollUpdateErr.message);
          }
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }

        const accessToken = await ensureFreshToken(userId, platform);

        if (!accessToken) {
          log.error(`Could not get fresh token for ${platform} (user: ${userId})`);
          continue;
        }

        await pollPlatform(userId, platform, accessToken);

        // Update last sync time
        const { error: syncUpdateErr } = await supabaseAdmin
          .from('platform_connections')
          .update({
            last_sync: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId)
          .eq('platform', platform);
        if (syncUpdateErr) log.warn(`Error updating last_sync for ${platform}:`, syncUpdateErr.message);

        // Wait 2 seconds between users to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        log.error(`Error polling ${platform} for user ${userId}:`, error.message);
      }
    }

    log.info(`Completed ${platform} polling`);
  } catch (error) {
    log.error(`Error in ${platform} polling:`, error);
  }
}

export {
  startPlatformPolling,
  pollAllPlatformsForUser,
  pollPlatform,
  pollAllUsers,
};
