/**
 * Platform Polling Service
 * Continuously polls connected platforms for new data
 * Automatically extracts and updates soul signature data
 */

import cron from 'node-cron';
import { createClient } from '@supabase/supabase-js';
import { ensureFreshToken } from './tokenRefreshService.js';
import axios from 'axios';

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
};

/**
 * Poll a specific platform for new data
 */
async function pollPlatform(userId, platform, accessToken) {
  const config = POLLING_CONFIGS[platform];

  if (!config) {
    console.log(`ℹ️  No polling config for platform: ${platform}`);
    return null;
  }

  const results = [];

  for (const endpoint of config.endpoints) {
    try {
      console.log(`📡 Polling ${platform} - ${endpoint.name} for user ${userId}`);

      let url = endpoint.url;

      // Replace placeholders (e.g., {username})
      if (url.includes('{username}')) {
        // Get username from platform_connections metadata
        const { data: connection } = await getSupabaseClient()
          .from('platform_connections')
          .select('platform_user_id, metadata')
          .eq('user_id', userId)
          .eq('platform', platform)
          .single();

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
      await getSupabaseClient().from('user_platform_data').insert({
        user_id: userId,
        platform: platform,
        data_type: endpoint.name,
        raw_data: response.data,
        extracted_at: new Date().toISOString(),
      });

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
        error: error.message,
      });

      // If unauthorized, mark connection as needs_reauth
      if (error.response?.status === 401) {
        await getSupabaseClient()
          .from('platform_connections')
          .update({
            status: 'needs_reauth',
            error_message: 'Authentication failed - please reconnect',
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId)
          .eq('platform', platform);
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
    console.log(`🔍 Polling all platforms for user: ${userId}`);

    // Get all connected platforms for this user
    const { data: connections, error } = await getSupabaseClient()
      .from('platform_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'connected');

    if (error) {
      console.error('❌ Error fetching connections:', error);
      return;
    }

    if (!connections || connections.length === 0) {
      console.log(`ℹ️  No connected platforms for user: ${userId}`);
      return;
    }

    console.log(`📡 Found ${connections.length} connected platforms`);

    const pollPromises = connections.map(async (connection) => {
      try {
        // Ensure token is fresh
        const accessToken = await ensureFreshToken(userId, connection.platform);

        if (!accessToken) {
          console.error(`❌ Could not get fresh token for ${connection.platform}`);
          return null;
        }

        // Poll the platform
        const results = await pollPlatform(userId, connection.platform, accessToken);

        // Update last sync time
        await getSupabaseClient()
          .from('platform_connections')
          .update({
            last_sync: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', connection.id);

        return {
          platform: connection.platform,
          results,
        };
      } catch (error) {
        console.error(`❌ Error polling ${connection.platform}:`, error.message);
        return {
          platform: connection.platform,
          error: error.message,
        };
      }
    });

    const pollResults = await Promise.all(pollPromises);

    console.log(`✅ Completed polling for user ${userId}:`, pollResults);

    return pollResults;
  } catch (error) {
    console.error(`❌ Error polling all platforms for user ${userId}:`, error);
  }
}

/**
 * Poll all users' connected platforms
 * This runs on a schedule for background data collection
 */
async function pollAllUsers() {
  try {
    console.log('🌍 Starting background polling for all users...');

    // Get all unique user IDs with at least one connected platform
    const { data: connections, error } = await getSupabaseClient()
      .from('platform_connections')
      .select('user_id')
      .eq('status', 'connected');

    if (error) {
      console.error('❌ Error fetching users:', error);
      return;
    }

    if (!connections || connections.length === 0) {
      console.log('ℹ️  No connected platforms found');
      return;
    }

    // Get unique user IDs
    const uniqueUserIds = [...new Set(connections.map(c => c.user_id))];

    console.log(`👥 Found ${uniqueUserIds.length} users with connected platforms`);

    // Poll each user's platforms (with a small delay between users to avoid rate limits)
    for (const userId of uniqueUserIds) {
      await pollAllPlatformsForUser(userId);

      // Wait 5 seconds between users to avoid hitting rate limits
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    console.log('✅ Completed background polling for all users');
  } catch (error) {
    console.error('❌ Error in background polling:', error);
  }
}

/**
 * Start platform-specific polling jobs
 * Each platform has its own polling schedule based on POLLING_CONFIGS
 */
function startPlatformPolling() {
  console.log('🚀 Starting platform polling service...');

  // Spotify - Every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    console.log('⏰ Running Spotify polling job');
    await pollPlatformForAllUsers('spotify');
  });

  // YouTube - Every 2 hours
  cron.schedule('0 */2 * * *', async () => {
    console.log('⏰ Running YouTube polling job');
    await pollPlatformForAllUsers('youtube');
  });

  // GitHub - Every 6 hours
  cron.schedule('0 */6 * * *', async () => {
    console.log('⏰ Running GitHub polling job');
    await pollPlatformForAllUsers('github');
  });

  // Discord - Every 4 hours
  cron.schedule('0 */4 * * *', async () => {
    console.log('⏰ Running Discord polling job');
    await pollPlatformForAllUsers('discord');
  });

  // Gmail - Every 1 hour
  cron.schedule('0 */1 * * *', async () => {
    console.log('⏰ Running Gmail polling job');
    await pollPlatformForAllUsers('google_gmail');
  });

  console.log('✅ Platform polling service started with multiple schedules');
}

/**
 * Poll a specific platform for all users
 */
async function pollPlatformForAllUsers(platform) {
  try {
    console.log(`📡 Polling ${platform} for all users...`);

    const { data: connections, error } = await getSupabaseClient()
      .from('platform_connections')
      .select('user_id')
      .eq('platform', platform)
      .eq('status', 'connected');

    if (error) {
      console.error(`❌ Error fetching ${platform} connections:`, error);
      return;
    }

    if (!connections || connections.length === 0) {
      console.log(`ℹ️  No connected ${platform} accounts found`);
      return;
    }

    const uniqueUserIds = [...new Set(connections.map(c => c.user_id))];

    console.log(`👥 Polling ${platform} for ${uniqueUserIds.length} users`);

    for (const userId of uniqueUserIds) {
      try {
        const accessToken = await ensureFreshToken(userId, platform);

        if (!accessToken) {
          console.error(`❌ Could not get fresh token for ${platform} (user: ${userId})`);
          continue;
        }

        await pollPlatform(userId, platform, accessToken);

        // Update last sync time
        await getSupabaseClient()
          .from('platform_connections')
          .update({
            last_sync: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId)
          .eq('platform', platform);

        // Wait 2 seconds between users to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.error(`❌ Error polling ${platform} for user ${userId}:`, error.message);
      }
    }

    console.log(`✅ Completed ${platform} polling`);
  } catch (error) {
    console.error(`❌ Error in ${platform} polling:`, error);
  }
}

export {
  startPlatformPolling,
  pollAllPlatformsForUser,
  pollPlatform,
  pollAllUsers,
};
