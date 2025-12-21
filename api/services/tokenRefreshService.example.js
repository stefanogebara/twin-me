/**
 * Token Refresh Service - Usage Examples
 *
 * This file demonstrates how to use the token refresh service in various
 * scenarios across the Soul Signature platform.
 */

import { refreshPlatformToken, getValidAccessToken, refreshExpiringTokens } from './tokenRefreshService.js';
import cron from 'node-cron';
import axios from 'axios';

// ============================================================================
// EXAMPLE 1: Using getValidAccessToken in API Routes
// ============================================================================

/**
 * Example: Spotify API endpoint that automatically handles token refresh
 */
export async function getSpotifyProfile(req, res) {
  try {
    const userId = req.user.id;

    // This will automatically refresh the token if it's expiring within 5 minutes
    const accessToken = await getValidAccessToken(userId, 'spotify');

    if (!accessToken) {
      return res.status(401).json({
        error: 'Spotify not connected',
        message: 'Please connect your Spotify account'
      });
    }

    // Make API call with the valid token
    const response = await axios.get('https://api.spotify.com/v1/me', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    res.json({
      success: true,
      profile: response.data
    });

  } catch (error) {
    console.error('Error fetching Spotify profile:', error.message);
    res.status(500).json({ error: 'Failed to fetch Spotify profile' });
  }
}

/**
 * Example: YouTube API endpoint with token refresh
 */
export async function getYouTubeSubscriptions(req, res) {
  try {
    const userId = req.user.id;

    // Automatically handles token refresh for YouTube/Google OAuth
    const accessToken = await getValidAccessToken(userId, 'youtube');

    if (!accessToken) {
      return res.status(401).json({
        error: 'YouTube not connected',
        message: 'Please connect your YouTube account'
      });
    }

    const response = await axios.get('https://www.googleapis.com/youtube/v3/subscriptions', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      },
      params: {
        part: 'snippet',
        mine: true,
        maxResults: 50
      }
    });

    res.json({
      success: true,
      subscriptions: response.data.items
    });

  } catch (error) {
    console.error('Error fetching YouTube subscriptions:', error.message);
    res.status(500).json({ error: 'Failed to fetch YouTube subscriptions' });
  }
}

/**
 * Example: Discord API endpoint
 */
export async function getDiscordGuilds(req, res) {
  try {
    const userId = req.user.id;

    const accessToken = await getValidAccessToken(userId, 'discord');

    if (!accessToken) {
      return res.status(401).json({
        error: 'Discord not connected',
        message: 'Please connect your Discord account'
      });
    }

    const response = await axios.get('https://discord.com/api/users/@me/guilds', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    res.json({
      success: true,
      guilds: response.data
    });

  } catch (error) {
    console.error('Error fetching Discord guilds:', error.message);
    res.status(500).json({ error: 'Failed to fetch Discord guilds' });
  }
}

// ============================================================================
// EXAMPLE 2: Manual Token Refresh
// ============================================================================

/**
 * Example: Manually refresh a specific platform token
 * Useful for admin endpoints or testing
 */
export async function refreshTokenEndpoint(req, res) {
  try {
    const userId = req.user.id;
    const { platform } = req.body;

    if (!platform) {
      return res.status(400).json({ error: 'Platform is required' });
    }

    const result = await refreshPlatformToken(userId, platform);

    if (result) {
      res.json({
        success: true,
        message: `Token refreshed successfully for ${platform}`,
        expiresIn: result.expiresIn
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Token refresh failed - check platform connection status'
      });
    }

  } catch (error) {
    console.error('Error in manual token refresh:', error.message);
    res.status(500).json({ error: 'Token refresh failed' });
  }
}

// ============================================================================
// EXAMPLE 3: Scheduled Background Token Refresh (Cron Job)
// ============================================================================

/**
 * Setup automatic token refresh every 5 minutes
 * Add this to your server initialization (e.g., api/server.js)
 */
export function setupAutomaticTokenRefresh() {
  console.log('🚀 Setting up automatic token refresh service...');

  // Run immediately on startup
  refreshExpiringTokens()
    .then(results => {
      console.log('✅ Initial token refresh complete:', results);
    })
    .catch(error => {
      console.error('❌ Initial token refresh failed:', error.message);
    });

  // Schedule to run every 5 minutes
  // Cron format: */5 * * * * = every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    console.log('⏰ Running scheduled token refresh...');

    try {
      const results = await refreshExpiringTokens();
      console.log('✅ Scheduled token refresh complete:', results);
    } catch (error) {
      console.error('❌ Scheduled token refresh failed:', error.message);
    }
  });

  console.log('✅ Token refresh service started (runs every 5 minutes)');
}

// ============================================================================
// EXAMPLE 4: Data Extraction Service Integration
// ============================================================================

/**
 * Example: Soul signature extraction with automatic token refresh
 */
export async function extractSpotifyData(userId) {
  try {
    console.log(`🎵 Extracting Spotify data for user ${userId}...`);

    // Get valid token (auto-refreshes if needed)
    const accessToken = await getValidAccessToken(userId, 'spotify');

    if (!accessToken) {
      throw new Error('Spotify not connected or token refresh failed');
    }

    // Fetch user's top tracks
    const topTracksResponse = await axios.get('https://api.spotify.com/v1/me/top/tracks', {
      headers: { 'Authorization': `Bearer ${accessToken}` },
      params: {
        limit: 50,
        time_range: 'medium_term' // Last 6 months
      }
    });

    // Fetch user's top artists
    const topArtistsResponse = await axios.get('https://api.spotify.com/v1/me/top/artists', {
      headers: { 'Authorization': `Bearer ${accessToken}` },
      params: {
        limit: 50,
        time_range: 'medium_term'
      }
    });

    // Fetch recently played tracks
    const recentTracksResponse = await axios.get('https://api.spotify.com/v1/me/player/recently-played', {
      headers: { 'Authorization': `Bearer ${accessToken}` },
      params: {
        limit: 50
      }
    });

    console.log(`✅ Successfully extracted Spotify data for user ${userId}`);

    return {
      topTracks: topTracksResponse.data.items,
      topArtists: topArtistsResponse.data.items,
      recentlyPlayed: recentTracksResponse.data.items
    };

  } catch (error) {
    console.error(`❌ Failed to extract Spotify data for user ${userId}:`, error.message);

    // If it's a 401 Unauthorized, the token might be invalid
    if (error.response?.status === 401) {
      console.log('🔄 Attempting manual token refresh...');
      const refreshResult = await refreshPlatformToken(userId, 'spotify');

      if (refreshResult) {
        console.log('✅ Token refreshed, retrying extraction...');
        // Retry the extraction once
        return extractSpotifyData(userId);
      }
    }

    throw error;
  }
}

// ============================================================================
// EXAMPLE 5: Health Check Endpoint
// ============================================================================

/**
 * Example: Check platform connection health and token status
 */
export async function platformHealthCheck(req, res) {
  try {
    const userId = req.user.id;

    // Get all platform connections from database
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: connections, error } = await supabase
      .from('platform_connections')
      .select('platform, status, token_expires_at, last_sync_status, last_sync_error')
      .eq('user_id', userId);

    if (error) {
      throw error;
    }

    // Check each connection's token status
    const healthStatus = connections.map(conn => {
      const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at) : null;
      const now = new Date();
      const isExpired = expiresAt && expiresAt <= now;
      const isExpiringSoon = expiresAt && expiresAt <= new Date(now.getTime() + 5 * 60 * 1000);

      return {
        platform: conn.platform,
        status: conn.status,
        tokenStatus: isExpired ? 'expired' : isExpiringSoon ? 'expiring_soon' : 'valid',
        expiresAt: conn.token_expires_at,
        lastSyncStatus: conn.last_sync_status,
        lastSyncError: conn.last_sync_error,
        needsAttention: conn.status === 'needs_reauth' || conn.status === 'error' || isExpired
      };
    });

    res.json({
      success: true,
      connections: healthStatus,
      summary: {
        total: connections.length,
        healthy: healthStatus.filter(c => c.tokenStatus === 'valid' && c.status === 'connected').length,
        needsAttention: healthStatus.filter(c => c.needsAttention).length
      }
    });

  } catch (error) {
    console.error('Error checking platform health:', error.message);
    res.status(500).json({ error: 'Failed to check platform health' });
  }
}

// ============================================================================
// EXAMPLE 6: Server.js Integration
// ============================================================================

/**
 * Add this to your api/server.js file
 */
export function integrateTokenRefreshIntoServer() {
  // Example server.js integration:
  /*
  import express from 'express';
  import { setupAutomaticTokenRefresh } from './services/tokenRefreshService.example.js';

  const app = express();

  // ... your other middleware and routes ...

  // Start automatic token refresh service
  setupAutomaticTokenRefresh();

  // ... start server ...
  app.listen(3001, () => {
    console.log('✅ Server running on port 3001');
    console.log('✅ Automatic token refresh enabled');
  });
  */
}

// ============================================================================
// EXAMPLE 7: Error Handling and Status Updates
// ============================================================================

/**
 * Example: Comprehensive error handling with user notifications
 */
export async function extractPlatformDataWithNotifications(userId, platform) {
  try {
    const accessToken = await getValidAccessToken(userId, platform);

    if (!accessToken) {
      // Check connection status to determine the issue
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );

      const { data: connection } = await supabase
        .from('platform_connections')
        .select('status, last_sync_error')
        .eq('user_id', userId)
        .eq('platform', platform)
        .single();

      if (connection?.status === 'needs_reauth') {
        // Send user notification to reconnect
        console.log(`📧 Sending reconnection notification to user ${userId} for ${platform}`);
        // TODO: Implement notification service
        return {
          success: false,
          reason: 'needs_reauth',
          message: 'Please reconnect your account to continue syncing data'
        };
      }

      return {
        success: false,
        reason: 'not_connected',
        message: 'Platform not connected'
      };
    }

    // Proceed with data extraction...
    console.log(`✅ Token valid for ${platform}, proceeding with extraction`);

    return {
      success: true,
      message: 'Data extraction started'
    };

  } catch (error) {
    console.error(`❌ Error extracting ${platform} data:`, error.message);
    return {
      success: false,
      reason: 'extraction_error',
      message: error.message
    };
  }
}

// ============================================================================
// EXPORT ALL EXAMPLES
// ============================================================================

export default {
  // API Route Examples
  getSpotifyProfile,
  getYouTubeSubscriptions,
  getDiscordGuilds,
  refreshTokenEndpoint,
  platformHealthCheck,

  // Background Service Examples
  setupAutomaticTokenRefresh,

  // Data Extraction Examples
  extractSpotifyData,
  extractPlatformDataWithNotifications
};
