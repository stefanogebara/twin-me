/**
 * Comprehensive Platform Connectors API
 * Handles OAuth, MCP, and Browser Extension connections for all 56 platforms
 */

import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import mcpIntegration from '../services/mcpIntegration.js';

// Alias for consistency with other routes
const authenticateToken = authenticateUser;
import { ALL_PLATFORM_CONFIGS, getPlatformConfig, getPlatformStats } from '../services/allPlatformConfigs.js';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import axios from 'axios';
import { extractYouTubeData } from '../services/youtubeExtraction.js';
import { extractRedditData } from '../services/redditExtraction.js';
import { extractGitHubData } from '../services/githubExtraction.js';
import { extractDiscordData } from '../services/discordExtraction.js';
import { encryptToken, decryptToken } from '../services/encryption.js';

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * GET /api/platforms/all
 * Get all available platforms with connection status
 */
router.get('/all', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get user's connected platforms
    const { data: connections } = await supabase
      .from('platform_connections')
      .select('*')
      .eq('user_id', userId);

    const connectedPlatforms = new Set(connections?.map(c => c.platform) || []);

    // Get data counts for connected platforms
    const { data: dataCounts } = await supabase
      .from('extracted_platform_data')
      .select('platform, count')
      .eq('user_id', userId);

    const dataCountMap = new Map(
      dataCounts?.map(d => [d.platform, d.count]) || []
    );

    // Build platform list with connection status
    const platforms = Object.values(ALL_PLATFORM_CONFIGS).map(platform => ({
      ...platform,
      connected: connectedPlatforms.has(platform.id),
      dataCount: dataCountMap.get(platform.id) || 0
    }));

    res.json({
      success: true,
      platforms,
      total: platforms.length,
      connected: platforms.filter(p => p.connected).length
    });
  } catch (error) {
    console.error('Error loading platforms:', error);
    res.status(500).json({ error: 'Failed to load platforms' });
  }
});

/**
 * GET /api/platforms/stats
 * Get platform connection statistics
 */
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get connection count
    const { count: connectedCount } = await supabase
      .from('platform_connections')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    // Get total data points
    const { data: dataPoints } = await supabase
      .from('extracted_platform_data')
      .select('count')
      .eq('user_id', userId);

    const totalDataPoints = dataPoints?.reduce((sum, d) => sum + (d.count || 0), 0) || 0;

    // Calculate soul completeness (% of platforms connected)
    const soulComplete = Math.round((connectedCount / 56) * 100);

    res.json({
      success: true,
      stats: {
        connected: connectedCount || 0,
        available: 56,
        dataPoints: totalDataPoints,
        soulComplete
      }
    });
  } catch (error) {
    console.error('Error loading stats:', error);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

/**
 * POST /api/platforms/connect/:platform
 * Initiate connection flow for a platform
 */
router.post('/connect/:platform', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const platformId = req.params.platform;

    const platformConfig = getPlatformConfig(platformId);
    if (!platformConfig) {
      return res.status(404).json({ error: 'Platform not found' });
    }

    // Handle different integration types
    switch (platformConfig.integrationType) {
      case 'mcp':
        return await handleMCPConnection(userId, platformId, platformConfig, res);

      case 'oauth':
        return await handleOAuthConnection(userId, platformId, platformConfig, req, res);

      case 'browser_extension':
        return res.json({
          success: true,
          requiresExtension: true,
          message: 'Install Soul Signature Browser Extension to connect this platform',
          platform: platformConfig.name
        });

      default:
        return res.status(400).json({ error: 'Unknown integration type' });
    }
  } catch (error) {
    console.error('Error connecting platform:', error);
    res.status(500).json({ error: 'Failed to connect platform' });
  }
});

/**
 * Handle MCP connection
 */
async function handleMCPConnection(userId, platformId, platformConfig, res) {
  try {
    // Connect to MCP server
    await mcpIntegration.connectMCPServer(userId, platformId);

    res.json({
      success: true,
      message: `Successfully connected to ${platformConfig.name}`,
      platform: platformId,
      integrationType: 'mcp'
    });
  } catch (error) {
    console.error('MCP connection error:', error);
    res.status(500).json({ error: `Failed to connect to ${platformConfig.name}` });
  }
}

/**
 * Handle OAuth connection
 */
async function handleOAuthConnection(userId, platformId, platformConfig, req, res) {
  try {
    const apiConfig = platformConfig.apiConfig;
    if (!apiConfig) {
      return res.status(400).json({ error: 'OAuth configuration missing' });
    }

    // Generate state for CSRF protection with embedded user data
    const state = Buffer.from(JSON.stringify({
      platform: platformId,
      userId,
      timestamp: Date.now()
    })).toString('base64');

    // Store state in session/database
    await supabase
      .from('oauth_states')
      .insert({
        state,
        data: { userId, platform: platformId, timestamp: Date.now() },
        expires_at: new Date(Date.now() + 10 * 60 * 1000) // 10 min expiry
      });

    // Build authorization URL
    const redirectUri = `${process.env.VITE_APP_URL || 'http://localhost:8086'}/oauth/callback`;

    const authParams = new URLSearchParams({
      client_id: apiConfig.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      state,
      scope: apiConfig.scopes.join(' ')
    });

    // Platform-specific URL handling
    let authUrl;
    if (platformId === 'apple_music' || platformId === 'apple_tv_plus') {
      authParams.append('response_mode', 'form_post');
    }

    // Spotify-specific: show dialog
    if (platformId === 'spotify') {
      authParams.append('show_dialog', 'true');
    }

    authUrl = `${apiConfig.authUrl}?${authParams.toString()}`;

    console.log(`🎵 ${platformConfig.name} OAuth initiated for user ${userId}`);

    res.json({
      success: true,
      authUrl,
      platform: platformId,
      integrationType: 'oauth',
      message: `Connect your ${platformConfig.name} account`
    });
  } catch (error) {
    console.error('OAuth connection error:', error);
    res.status(500).json({ error: 'Failed to initiate OAuth flow' });
  }
}

/**
 * GET /api/platforms/callback/:platform
 * Handle OAuth callback
 */
router.get('/callback/:platform', async (req, res) => {
  try {
    const platformId = req.params.platform;
    const { code, state } = req.query;

    // Verify state
    const { data: stateData } = await supabase
      .from('oauth_states')
      .select('*')
      .eq('state', state)
      .eq('platform', platformId)
      .single();

    if (!stateData) {
      return res.redirect(`${process.env.VITE_APP_URL}/platform-hub?error=invalid_state`);
    }

    const userId = stateData.user_id;

    // Exchange code for tokens
    const platformConfig = getPlatformConfig(platformId);
    const apiConfig = platformConfig.apiConfig;

    const tokenResponse = await axios.post(apiConfig.tokenUrl, {
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${process.env.VITE_API_URL || 'http://localhost:3001/api'}/platforms/callback/${platformId}`,
      client_id: apiConfig.clientId,
      client_secret: apiConfig.clientSecret
    }, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const tokens = tokenResponse.data;

    // Encrypt tokens before storage
    const encryptedAccessToken = encryptToken(tokens.access_token);
    const encryptedRefreshToken = tokens.refresh_token ? encryptToken(tokens.refresh_token) : null;

    // Store connection
    await supabase
      .from('platform_connections')
      .upsert({
        user_id: userId,
        platform: platformId,
        access_token: encryptedAccessToken,
        refresh_token: encryptedRefreshToken,
        token_expires_at: tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
          : null,
        connection_type: 'oauth',
        status: 'active',
        connected_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,platform'
      });

    // Delete used state
    await supabase
      .from('oauth_states')
      .delete()
      .eq('state', state);

    // Redirect to platform hub
    res.redirect(`${process.env.VITE_APP_URL}/platform-hub?connected=${platformId}`);
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.redirect(`${process.env.VITE_APP_URL}/platform-hub?error=connection_failed`);
  }
});

/**
 * POST /api/platforms/extract/:platform
 * Extract data from a connected platform
 */
router.post('/extract/:platform', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId; // Support both formats
    const platformId = req.params.platform;

    const platformConfig = getPlatformConfig(platformId);
    if (!platformConfig) {
      return res.status(404).json({ error: 'Platform not found' });
    }

    // Check if connected
    const { data: connection } = await supabase
      .from('platform_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('platform', platformId)
      .single();

    if (!connection) {
      return res.status(400).json({ error: 'Platform not connected' });
    }

    // Extract based on integration type
    let result;

    if (platformConfig.integrationType === 'mcp') {
      result = await mcpIntegration.extractPlatformData(userId, platformId);
    } else if (platformConfig.integrationType === 'oauth') {
      result = await extractOAuthPlatformData(userId, platformId, platformConfig, connection);
    }

    res.json({
      success: true,
      result,
      platform: platformId
    });
  } catch (error) {
    console.error('Data extraction error:', error);
    res.status(500).json({ error: 'Failed to extract data' });
  }
});

/**
 * DELETE /api/platforms/disconnect/:platform
 * Disconnect a platform
 */
router.delete('/disconnect/:platform', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const platformId = req.params.platform;

    // Delete connection
    await supabase
      .from('platform_connections')
      .delete()
      .eq('user_id', userId)
      .eq('platform', platformId);

    // Optionally delete extracted data
    if (req.query.deleteData === 'true') {
      await supabase
        .from('extracted_platform_data')
        .delete()
        .eq('user_id', userId)
        .eq('platform', platformId);
    }

    res.json({
      success: true,
      message: `Disconnected from ${platformId}`
    });
  } catch (error) {
    console.error('Disconnect error:', error);
    res.status(500).json({ error: 'Failed to disconnect platform' });
  }
});

/**
 * Helper: Extract OAuth platform data
 */
async function extractOAuthPlatformData(userId, platformId, platformConfig, connection) {
  // Decrypt access token
  const accessToken = decryptToken(connection.access_token);

  // Platform-specific extraction logic
  switch (platformId) {
    case 'spotify':
      return await extractSpotifyData(userId, accessToken);

    case 'youtube':
      return await extractYouTubeData(userId);

    case 'reddit':
      return await extractRedditData(userId);

    case 'github':
      return await extractGitHubData(userId);

    case 'discord':
      return await extractDiscordData(userId);

    case 'apple_music':
      return await extractAppleMusicData(userId, accessToken);

    case 'fitbit':
      return await extractFitbitData(userId, accessToken);

    case 'whoop':
      return await extractWhoopData(userId, accessToken);

    // Add more platform extractors as needed
    default:
      throw new Error(`Extraction not implemented for ${platformId}`);
  }
}

/**
 * Token encryption/decryption helpers
 * (Imported from shared encryption service)
 */
// Removed duplicate implementation - using shared encryption.js service instead

/**
 * Platform-specific data extraction functions
 */
async function extractSpotifyData(userId, accessToken) {
  const endpoints = [
    'https://api.spotify.com/v1/me/player/recently-played?limit=50',
    'https://api.spotify.com/v1/me/top/artists?limit=50',
    'https://api.spotify.com/v1/me/top/tracks?limit=50',
    'https://api.spotify.com/v1/me/playlists'
  ];

  const results = await Promise.all(
    endpoints.map(url =>
      axios.get(url, {
        headers: { Authorization: `Bearer ${accessToken}` }
      }).catch(err => ({ data: { error: err.message } }))
    )
  );

  return {
    recentlyPlayed: results[0].data,
    topArtists: results[1].data,
    topTracks: results[2].data,
    playlists: results[3].data
  };
}

async function extractAppleMusicData(userId, accessToken) {
  // Apple Music API extraction
  const response = await axios.get('https://api.music.apple.com/v1/me/library/songs', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Music-User-Token': accessToken
    }
  });

  return response.data;
}

async function extractFitbitData(userId, accessToken) {
  const today = new Date().toISOString().split('T')[0];

  const endpoints = [
    `https://api.fitbit.com/1/user/-/activities/date/${today}.json`,
    `https://api.fitbit.com/1/user/-/sleep/date/${today}.json`,
    `https://api.fitbit.com/1/user/-/activities/heart/date/${today}/1d.json`
  ];

  const results = await Promise.all(
    endpoints.map(url =>
      axios.get(url, {
        headers: { Authorization: `Bearer ${accessToken}` }
      }).catch(err => ({ data: { error: err.message } }))
    )
  );

  return {
    activities: results[0].data,
    sleep: results[1].data,
    heartRate: results[2].data
  };
}

async function extractWhoopData(userId, accessToken) {
  const response = await axios.get('https://api.prod.whoop.com/developer/v1/cycle', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  return response.data;
}

export default router;
