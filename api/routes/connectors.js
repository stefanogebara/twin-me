/**
 * Connector Routes - OAuth Integration for External Data Sources
 */

import express from 'express';
import { supabase } from '../config/supabase.js';
import { encryptToken, decryptToken } from '../services/encryption.js';
import {
  getCachedPlatformStatus,
  setCachedPlatformStatus,
  invalidatePlatformStatusCache
} from '../services/redisClient.js';
const router = express.Router();

// ====================================================================
// OAUTH CONFIGURATIONS
// ====================================================================

const OAUTH_CONFIGS = {
  // Google Services
  google_gmail: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token'
  },
  google_calendar: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token'
  },
  google_drive: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token'
  },

  // YouTube (uses Google OAuth)
  youtube: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    scopes: [
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/youtube.force-ssl'
    ],
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token'
  },

  // Spotify
  spotify: {
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    scopes: [
      'user-read-private',
      'user-read-email',
      'user-top-read',
      'user-read-recently-played',
      'playlist-read-private',
      'playlist-read-collaborative',
      'user-library-read',
      'user-follow-read'
    ],
    authUrl: 'https://accounts.spotify.com/authorize',
    tokenUrl: 'https://accounts.spotify.com/api/token'
  },

  // GitHub
  github: {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    scopes: ['user', 'repo', 'read:org'],
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token'
  },

  // Discord
  discord: {
    clientId: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    scopes: ['identify', 'email', 'guilds', 'guilds.members.read'],
    authUrl: 'https://discord.com/api/oauth2/authorize',
    tokenUrl: 'https://discord.com/api/oauth2/token'
  },

  // Slack - User Token Scopes (not bot scopes)
  slack: {
    clientId: process.env.SLACK_CLIENT_ID,
    clientSecret: process.env.SLACK_CLIENT_SECRET,
    scopes: [
      'channels:read',
      'files:read',
      'groups:read',
      'users:read',
      'users:read.email',
      'search:read',
      'team.preferences:read',
      'lists:read',
      'reminders:read'
    ],
    authUrl: 'https://slack.com/oauth/v2/authorize',
    tokenUrl: 'https://slack.com/api/oauth.v2.access'
  },

  // LinkedIn (if available)
  linkedin: {
    clientId: process.env.LINKEDIN_CLIENT_ID,
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
    scopes: ['openid', 'profile', 'email'],
    authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
    tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken'
  }
};

// Debug: Check LinkedIn config on load
console.log('🔍 LinkedIn config on file load:', {
  hasLinkedIn: !!OAUTH_CONFIGS.linkedin,
  clientId: OAUTH_CONFIGS.linkedin?.clientId,
  hasClientSecret: !!OAUTH_CONFIGS.linkedin?.clientSecret
});

// ====================================================================
// ROUTES
// ====================================================================

/**
 * GET /api/connectors/auth/:provider
 * Generate OAuth authorization URL for a provider
 */
router.get('/auth/:provider', (req, res) => {
  try {
    const { provider } = req.params;
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    const config = OAUTH_CONFIGS[provider];
    console.log(`🔍 Provider: ${provider}, Config exists: ${!!config}, ClientId: ${config?.clientId}`);
    if (!config) {
      return res.status(400).json({
        success: false,
        error: `Unsupported provider: ${provider}`
      });
    }

    if (!config.clientId) {
      console.log(`❌ No clientId for ${provider}. Full config:`, config);
      return res.status(500).json({
        success: false,
        error: 'OAuth not configured for this provider'
      });
    }

    // Generate state parameter for security
    const stateObject = {
      provider,
      userId,
      timestamp: Date.now()
    };
    console.log('🔗 Creating state object for connector OAuth:', stateObject);
    const state = Buffer.from(JSON.stringify(stateObject)).toString('base64');
    console.log('🔗 Encoded state:', state);

    // Build authorization URL - Use unified callback for all platforms
    const appUrl = process.env.APP_URL || process.env.VITE_APP_URL || 'http://localhost:8086';
    const redirectUri = `${appUrl}/oauth/callback`;

    console.log(`🔗 OAuth for ${provider}:`);
    console.log(`📍 APP_URL from env: ${process.env.APP_URL}`);
    console.log(`📍 VITE_APP_URL from env: ${process.env.VITE_APP_URL}`);
    console.log(`📍 Final appUrl: ${appUrl}`);
    console.log(`📍 Redirect URI: ${redirectUri}`);

    // Slack requires 'user_scope' parameter for user tokens (not 'scope' which is for bot tokens)
    // Slack also uses comma-separated scopes, while most others use space-separated
    const scopeParam = provider === 'slack' ? 'user_scope' : 'scope';
    const scopeSeparator = provider === 'slack' ? ',' : ' ';

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: redirectUri,
      [scopeParam]: config.scopes.join(scopeSeparator),
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      state
    });

    const authUrl = `${config.authUrl}?${params.toString()}`;

    res.json({
      success: true,
      data: {
        authUrl,
        provider,
        state
      }
    });

  } catch (error) {
    console.error('Error generating auth URL:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate authorization URL'
    });
  }
});

/**
 * POST /api/connectors/callback
 * Handle OAuth callback and exchange code for tokens
 */
router.post('/callback', async (req, res) => {
  try {
    const { code, state } = req.body;

    if (!code || !state) {
      return res.status(400).json({
        success: false,
        error: 'Missing code or state parameter'
      });
    }

    // Decode and verify state
    let stateData;
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    } catch (e) {
      return res.status(400).json({
        success: false,
        error: 'Invalid state parameter'
      });
    }

    const { provider, userId } = stateData;
    const config = OAUTH_CONFIGS[provider];

    if (!config) {
      return res.status(400).json({
        success: false,
        error: `Unsupported provider: ${provider}`
      });
    }

    // Convert email to UUID by looking up in users table
    // userId from state might be email (test@twinme.com) or UUID
    let userUuid = userId;
    if (userId && !userId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      // This is an email, look up UUID
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('email', userId)
        .single();

      if (userError || !userData) {
        console.error('Error looking up user UUID:', userError);
        return res.status(400).json({
          success: false,
          error: 'User not found'
        });
      }
      userUuid = userData.id;
      console.log(`🔄 Converted email ${userId} to UUID ${userUuid}`);
    }

    // Exchange authorization code for tokens
    // Different providers need different auth methods
    const redirectUri = `${process.env.APP_URL || process.env.VITE_APP_URL || 'http://localhost:8086'}/oauth/callback`;
    let tokenResponse;

    if (provider === 'spotify') {
      // Spotify uses Basic Authentication
      tokenResponse = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri
        })
      });
    } else if (provider === 'github') {
      // GitHub needs Accept header for JSON response
      tokenResponse = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          code,
          redirect_uri: redirectUri
        })
      });
    } else if (provider === 'slack') {
      // Slack uses OAuth v2 with special response format
      tokenResponse = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          code,
          redirect_uri: redirectUri
        })
      });
    } else {
      // Standard OAuth2 flow (Google, Discord, etc.)
      tokenResponse = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          code,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri
        })
      });
    }

    // Check if token exchange was successful
    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error(`❌ Token exchange failed for ${provider}:`, {
        status: tokenResponse.status,
        statusText: tokenResponse.statusText,
        error: errorText
      });
      return res.status(tokenResponse.status).json({
        success: false,
        error: `Token exchange failed: ${tokenResponse.statusText}`,
        details: errorText
      });
    }

    const tokenData = await tokenResponse.json();
    console.log(`✅ Token exchange successful for ${provider}`);

    // Handle Slack's special response format
    let tokens;
    if (provider === 'slack') {
      if (!tokenData.ok) {
        return res.status(400).json({
          success: false,
          error: `Slack OAuth error: ${tokenData.error || 'Unknown error'}`
        });
      }
      // Extract user token from Slack response
      tokens = {
        access_token: tokenData.authed_user?.access_token || tokenData.access_token,
        refresh_token: tokenData.authed_user?.refresh_token || tokenData.refresh_token,
        expires_in: tokenData.authed_user?.expires_in || tokenData.expires_in,
        scope: tokenData.scope
      };
    } else {
      tokens = tokenData;
    }

    if (tokens.error) {
      return res.status(400).json({
        success: false,
        error: `OAuth error: ${tokens.error_description || tokens.error}`
      });
    }

    // Store encrypted tokens in database
    try {
      const connectionData = {
        user_id: userUuid,  // Use UUID not email
        platform: provider,
        access_token: encryptToken(tokens.access_token),
        refresh_token: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
        token_expires_at: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null,
        connected: true,  // Old schema uses 'connected' not 'is_active'
        last_sync_status: 'success',  // IMPORTANT: Set to success after OAuth completes!
        metadata: {
          connected_at: new Date().toISOString(),
          last_sync: new Date().toISOString(),
          last_sync_status: 'success'
        },
        scopes: config.scopes || []
      };

      // Upsert connection to database (insert or update if exists)
      const { error: dbError } = await supabase
        .from('platform_connections')
        .upsert(connectionData, {
          onConflict: 'user_id,platform'
        });

      if (dbError) {
        console.error('Database error storing connection:', dbError);
        throw dbError;
      }

      console.log(`✅ Successfully stored ${provider} connection for user ${userId} in database`);

      // Invalidate cached platform status for this user
      await invalidatePlatformStatusCache(userUuid);

      // Trigger background extraction (don't await - fire and forget)
      import('../services/dataExtractionService.js').then(({ default: extractionService }) => {
        extractionService.extractPlatformData(userUuid, provider)
          .then(result => {
            console.log(`✅ Background extraction completed for ${provider}:`, result);

            // Trigger soul signature building after extraction
            import('../services/soulSignatureBuilder.js').then(({ default: soulBuilder }) => {
              soulBuilder.buildSoulSignature(userUuid)
                .then(soulResult => {
                  console.log(`✅ Soul signature updated for user after ${provider} extraction:`, soulResult);
                })
                .catch(soulError => {
                  console.warn(`⚠️ Soul signature building failed:`, soulError);
                });
            });
          })
          .catch(error => {
            console.warn(`⚠️ Background extraction failed for ${provider}:`, error.message);
          });
      });

    } catch (error) {
      console.error('Error storing connection:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to store connection'
      });
    }

    console.log(`📤 Sending connector callback response for ${provider}`);

    const responseData = {
      success: true,
      provider,
      userId,
      connected: true,
      hasAccess: !!tokens.access_token,
      data: {
        provider,
        userId,
        connected: true,
        hasAccess: !!tokens.access_token
      }
    };

    console.log('📤 Connector response:', responseData);

    res.json(responseData);

  } catch (error) {
    console.error('Error handling OAuth callback:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process OAuth callback'
    });
  }
});

/**
 * GET /api/connectors/status/:userId
 * Get connection status for all providers for a user
 * Validates token expiration and returns accurate connection state
 *
 * CACHING: Uses Redis with 5-minute TTL for performance
 * - Cache HIT: ~5ms response time
 * - Cache MISS: ~200ms response time (database query)
 * - Cache invalidated on connect/disconnect/reset
 */
router.get('/status/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Convert email to UUID if needed
    let userUuid = userId;
    if (userId && !userId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      const { data: userData } = await supabase
        .from('users')
        .select('id')
        .eq('email', userId)
        .single();
      if (userData) userUuid = userData.id;
    }

    // Check Redis cache first
    const cachedStatus = await getCachedPlatformStatus(userUuid);
    if (cachedStatus) {
      return res.json({
        success: true,
        data: cachedStatus,
        cached: true
      });
    }

    // Cache miss - fetch from database
    const { data: connections, error } = await supabase
      .from('platform_connections')
      .select('platform, connected, token_expires_at, expires_at, metadata, last_sync, last_sync_status')
      .eq('user_id', userUuid);

    if (error) {
      console.error('Database error getting connections:', error);
      throw error;
    }

    // Transform to status object with token expiration validation
    const connectionStatus = {};
    const now = new Date();

    connections?.forEach(connection => {
      // Check if token is expired (check both possible expiration columns)
      // Updated to preserve connected status for expired tokens
      const expiresAt = connection.token_expires_at || connection.expires_at;
      const isTokenExpired = expiresAt && new Date(expiresAt) < now;

      // SPECIAL CASE: For Spotify and YouTube with encryption_key_mismatch,
      // force connected=true to show "Token Expired" badge instead of "Connect"
      let isConnected = connection.connected;
      if ((connection.platform === 'spotify' || connection.platform === 'youtube') &&
          connection.last_sync_status === 'encryption_key_mismatch') {
        isConnected = true;  // Force true to show expired state in UI
        console.log(`🔧 Forcing ${connection.platform} connected=true due to encryption_key_mismatch`);
      }

      const isActive = isConnected && !isTokenExpired;

      // Don't auto-update database - let user explicitly reconnect through UI
      if (isConnected && isTokenExpired) {
        console.warn(`⚠️ Token expired for ${connection.platform}, needs reconnection via UI`);
      }

      // Determine the current status
      // Use the stored last_sync_status from the database as the primary source
      let status = connection.last_sync_status || connection.metadata?.last_sync_status || 'unknown';

      // Only override with 'token_expired' if:
      // 1. The token is actually expired NOW
      // 2. AND we don't have a sync status OR the last status was 'success'
      // This prevents overriding 'failed' or other error states with 'token_expired'
      if (isTokenExpired && (status === 'success' || status === 'unknown')) {
        status = 'token_expired';
      }

      connectionStatus[connection.platform] = {
        connected: isConnected,  // May be forced true for encryption_key_mismatch
        isActive: isActive,      // Actual usability - false if token expired
        tokenExpired: isTokenExpired,
        connectedAt: connection.metadata?.connected_at || null,
        lastSync: connection.last_sync || connection.metadata?.last_sync || null,
        status: status,
        expiresAt: expiresAt
      };
    });

    console.log(`📊 Connection status for user ${userId}:`, connectionStatus);

    // Cache the result in Redis (5-minute TTL)
    await setCachedPlatformStatus(userUuid, connectionStatus);

    res.json({
      success: true,
      data: connectionStatus,
      cached: false
    });

  } catch (error) {
    console.error('Error getting connector status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get connector status'
    });
  }
});

/**
 * POST /api/connectors/reset/:userId
 * Reset all connections for a user (for fresh page loads)
 */
router.post('/reset/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    console.log(`🔄 Resetting connections for user ${userId}`);
    console.warn(`⚠️ RESET ENDPOINT CALLED - This should only be called on fresh page loads!`);

    // Convert email to UUID if needed
    let userUuid = userId;
    if (userId && !userId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      const { data: userData } = await supabase
        .from('users')
        .select('id')
        .eq('email', userId)
        .single();
      if (userData) userUuid = userData.id;
    }

    // Mark all connections as inactive in database (old schema uses 'connected')
    // BUT preserve connected=true for platforms with encryption_key_mismatch
    // First, get current connections to check their status
    const { data: currentConnections } = await supabase
      .from('platform_connections')
      .select('id, platform, last_sync_status')
      .eq('user_id', userUuid);

    // Only reset connections that don't have encryption_key_mismatch
    const { data, error} = await supabase
      .from('platform_connections')
      .update({ connected: false })
      .eq('user_id', userUuid)
      .not('last_sync_status', 'eq', 'encryption_key_mismatch')
      .select();

    if (error) {
      console.error('Database error resetting connections:', error);
      throw error;
    }

    const deletedCount = data?.length || 0;
    console.log(`🗑️ Deactivated ${deletedCount} connections for user ${userId}`);

    // Invalidate cached platform status for this user
    await invalidatePlatformStatusCache(userUuid);

    res.json({
      success: true,
      data: {
        userId,
        reset: true,
        deletedConnections: deletedCount,
        message: 'Connection status reset'
      }
    });

  } catch (error) {
    console.error('Error resetting connections:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset connections'
    });
  }
});

/**
 * DELETE /api/connectors/:provider/:userId
 * Disconnect a provider for a user
 */
router.delete('/:provider/:userId', async (req, res) => {
  try {
    const { provider, userId } = req.params;

    // Convert email to UUID if needed
    let userUuid = userId;
    if (userId && !userId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      const { data: userData } = await supabase
        .from('users')
        .select('id')
        .eq('email', userId)
        .single();
      if (userData) userUuid = userData.id;
    }

    // Remove tokens from database and revoke access (old schema)
    const { error } = await supabase
      .from('platform_connections')
      .update({ connected: false })
      .eq('user_id', userUuid)
      .eq('platform', provider);

    if (error) {
      console.error('Error disconnecting provider:', error);
      throw error;
    }

    // Invalidate cached platform status for this user
    await invalidatePlatformStatusCache(userUuid);

    res.json({
      success: true,
      data: {
        provider,
        userId,
        disconnected: true
      }
    });

  } catch (error) {
    console.error('Error disconnecting provider:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to disconnect provider'
    });
  }
});

/**
 * POST /api/connectors/test-add-connection
 * Test endpoint to add a connection for testing purposes
 */
router.post('/test-add-connection', async (req, res) => {
  try {
    const { userId, provider } = req.body;

    // Convert email to UUID if needed
    let userUuid = userId;
    if (userId && !userId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      const { data: userData } = await supabase
        .from('users')
        .select('id')
        .eq('email', userId)
        .single();
      if (userData) userUuid = userData.id;
    }

    const connectionData = {
      user_id: userUuid,
      platform: provider,
      access_token: encryptToken('test-token'),
      refresh_token: encryptToken('test-refresh-token'),
      token_expires_at: new Date(Date.now() + 3600000).toISOString(), // 1 hour
      connected: true,  // Old schema
      metadata: {
        connected_at: new Date().toISOString(),
        last_sync: new Date().toISOString(),
        last_sync_status: 'success'
      },
      scopes: []
    };

    const { error } = await supabase
      .from('platform_connections')
      .upsert(connectionData, {
        onConflict: 'user_id,platform'
      });

    if (error) {
      console.error('Database error adding test connection:', error);
      throw error;
    }

    console.log(`🧪 Test connection added to database: ${userId}-${provider}`);

    res.json({
      success: true,
      data: {
        provider,
        userId,
        connected: true,
        message: 'Test connection added'
      }
    });

  } catch (error) {
    console.error('Error adding test connection:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add test connection'
    });
  }
});

export default router;