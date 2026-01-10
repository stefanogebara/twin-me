/**
 * Connector Routes - OAuth Integration for External Data Sources
 */

import express from 'express';
import { supabase } from '../config/supabase.js';
import { supabaseAdmin } from '../services/database.js';
import { encryptToken, decryptToken } from '../services/encryption.js';
import {
  getCachedPlatformStatus,
  setCachedPlatformStatus,
  invalidatePlatformStatusCache
} from '../services/redisClient.js';
import { ensureFreshToken } from '../services/tokenRefreshService.js';
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
  },

  // Reddit
  reddit: {
    clientId: process.env.REDDIT_CLIENT_ID,
    clientSecret: process.env.REDDIT_CLIENT_SECRET,
    scopes: ['identity', 'history', 'read', 'mysubreddits'],
    authUrl: 'https://www.reddit.com/api/v1/authorize',
    tokenUrl: 'https://www.reddit.com/api/v1/access_token'
  },

  // Whoop - Health & Fitness
  whoop: {
    clientId: process.env.WHOOP_CLIENT_ID,
    clientSecret: process.env.WHOOP_CLIENT_SECRET,
    scopes: [
      'offline',  // Required for refresh tokens
      'read:profile',
      'read:recovery',
      'read:cycles',
      'read:workout',
      'read:sleep',
      'read:body_measurement'
    ],
    authUrl: 'https://api.prod.whoop.com/oauth/oauth2/auth',
    tokenUrl: 'https://api.prod.whoop.com/oauth/oauth2/token'
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
 * GET /api/connectors/connect/:provider
 * Reconnect/Refresh OAuth tokens for a provider
 * This is called when tokens are expired and need refresh
 */
router.get('/connect/:provider', async (req, res) => {
  try {
    const { provider } = req.params;
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    // Health platforms handled by health-connectors (use platform-specific redirect URIs)
    const healthPlatforms = ['whoop', 'oura'];
    if (healthPlatforms.includes(provider)) {
      // Forward to health connectors endpoint (uses WHOOP_REDIRECT_URI etc.)
      const baseUrl = process.env.API_URL || `http://localhost:${process.env.PORT || 3001}`;
      const healthUrl = `${baseUrl}/api/health/connect/${provider}?userId=${encodeURIComponent(userId)}`;

      console.log(`🏃 Proxying GET reconnect to health connector: ${healthUrl}`);

      try {
        const response = await fetch(healthUrl, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        });

        const data = await response.json();

        if (!response.ok) {
          return res.status(response.status).json(data);
        }

        // Transform health-connector response format to match what frontend expects
        // Health-connectors returns { success: true, authUrl }
        // Frontend expects { success: true, data: { authUrl } }
        if (data.authUrl) {
          return res.json({
            success: true,
            data: { authUrl: data.authUrl }
          });
        }

        return res.json(data);
      } catch (healthError) {
        console.error(`❌ Health connector error for ${provider}:`, healthError);
        return res.status(500).json({
          success: false,
          error: `Failed to initiate ${provider} reconnection`,
          details: healthError.message
        });
      }
    }

    const config = OAUTH_CONFIGS[provider];
    if (!config) {
      return res.status(404).json({
        success: false,
        error: `Provider ${provider} not configured`
      });
    }

    console.log(`🔄 Reconnect/refresh initiated for ${provider} - userId: ${userId}`);

    // Check if we have a refresh token stored
    const { data: connection, error: fetchError } = await supabaseAdmin
      .from('platform_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('platform', provider)
      .single();

    if (fetchError || !connection) {
      // No existing connection, redirect to full OAuth flow
      console.log(`📝 No existing connection found for ${provider}, initiating full OAuth`);

      // Generate OAuth URL for fresh authentication
      const redirectUri = `${process.env.VITE_APP_URL || 'http://localhost:8086'}/oauth/callback`;
      const state = Buffer.from(JSON.stringify({
        provider,
        userId,
        timestamp: Date.now()
      })).toString('base64');

      // Store state for CSRF protection
      await supabaseAdmin
        .from('oauth_states')
        .insert({
          state,
          user_id: userId,
          provider,
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 1800000).toISOString() // 30 minutes
        });

      let authUrl;
      if (provider === 'spotify') {
        const scope = config.scopes.join(' ');
        authUrl = `${config.authUrl}?` +
          `client_id=${config.clientId}&` +
          `response_type=code&` +
          `redirect_uri=${encodeURIComponent(redirectUri)}&` +
          `scope=${encodeURIComponent(scope)}&` +
          `state=${state}&` +
          `show_dialog=true`;
      } else {
        const scope = config.scopes.join(' ');
        authUrl = `${config.authUrl}?` +
          `client_id=${config.clientId}&` +
          `response_type=code&` +
          `redirect_uri=${encodeURIComponent(redirectUri)}&` +
          `scope=${encodeURIComponent(scope)}&` +
          `state=${state}&` +
          `access_type=offline&` +
          `prompt=consent`;
      }

      return res.json({
        success: true,
        data: { authUrl }
      });
    }

    // We have a connection, attempt to refresh the token
    if (connection.refresh_token) {
      try {
        const refreshToken = decryptToken(connection.refresh_token);
        console.log(`🔑 Attempting to refresh token for ${provider}`);

        let newTokens;
        if (provider === 'spotify') {
          // Spotify refresh
          const tokenResponse = await fetch(config.tokenUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Authorization': 'Basic ' + Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')
            },
            body: new URLSearchParams({
              grant_type: 'refresh_token',
              refresh_token: refreshToken
            })
          });

          if (!tokenResponse.ok) {
            throw new Error(`Token refresh failed: ${tokenResponse.statusText}`);
          }

          newTokens = await tokenResponse.json();
        } else {
          // Google/YouTube refresh
          const tokenResponse = await fetch(config.tokenUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
              grant_type: 'refresh_token',
              refresh_token: refreshToken,
              client_id: config.clientId,
              client_secret: config.clientSecret
            })
          });

          if (!tokenResponse.ok) {
            throw new Error(`Token refresh failed: ${tokenResponse.statusText}`);
          }

          newTokens = await tokenResponse.json();
        }

        // Update the stored tokens
        const updateData = {
          access_token: encryptToken(newTokens.access_token),
          token_expires_at: new Date(Date.now() + (newTokens.expires_in * 1000)).toISOString(),
          updated_at: new Date().toISOString(),
          is_active: true,
          token_expired: false
        };

        // Only update refresh token if a new one was provided
        if (newTokens.refresh_token) {
          updateData.refresh_token = encryptToken(newTokens.refresh_token);
        }

        const { error: updateError } = await supabaseAdmin
          .from('platform_connections')
          .update(updateData)
          .eq('user_id', userId)
          .eq('platform', provider);

        if (updateError) {
          throw updateError;
        }

        console.log(`✅ Token refreshed successfully for ${provider}`);

        // Invalidate cache
        await invalidatePlatformStatusCache(userId);

        return res.json({
          success: true,
          message: 'Token refreshed successfully'
        });

      } catch (refreshError) {
        console.error(`❌ Token refresh failed for ${provider}:`, refreshError);

        // Refresh failed, need to re-authenticate
        const redirectUri = `${process.env.VITE_APP_URL || 'http://localhost:8086'}/oauth/callback`;
        const state = Buffer.from(JSON.stringify({
          provider,
          userId,
          timestamp: Date.now(),
          isReconnect: true
        })).toString('base64');

        // Store state for CSRF protection
        await supabaseAdmin
          .from('oauth_states')
          .insert({
            state,
            user_id: userId,
            provider,
            created_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 1800000).toISOString() // 30 minutes
          });

        const scope = config.scopes.join(' ');
        let authUrl;

        if (provider === 'spotify') {
          authUrl = `${config.authUrl}?` +
            `client_id=${config.clientId}&` +
            `response_type=code&` +
            `redirect_uri=${encodeURIComponent(redirectUri)}&` +
            `scope=${encodeURIComponent(scope)}&` +
            `state=${state}&` +
            `show_dialog=true`;
        } else {
          authUrl = `${config.authUrl}?` +
            `client_id=${config.clientId}&` +
            `response_type=code&` +
            `redirect_uri=${encodeURIComponent(redirectUri)}&` +
            `scope=${encodeURIComponent(scope)}&` +
            `state=${state}&` +
            `access_type=offline&` +
            `prompt=consent`;
        }

        return res.json({
          success: true,
          data: { authUrl }
        });
      }
    } else {
      // No refresh token available, need full re-authentication
      console.log(`🔐 No refresh token available for ${provider}, requiring re-authentication`);

      const redirectUri = `${process.env.VITE_APP_URL || 'http://localhost:8086'}/oauth/callback`;
      const state = Buffer.from(JSON.stringify({
        provider,
        userId,
        timestamp: Date.now(),
        isReconnect: true
      })).toString('base64');

      // Store state for CSRF protection
      await supabaseAdmin
        .from('oauth_states')
        .insert({
          state,
          user_id: userId,
          provider,
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 1800000).toISOString() // 30 minutes
        });

      const scope = config.scopes.join(' ');
      let authUrl;

      if (provider === 'spotify') {
        authUrl = `${config.authUrl}?` +
          `client_id=${config.clientId}&` +
          `response_type=code&` +
          `redirect_uri=${encodeURIComponent(redirectUri)}&` +
          `scope=${encodeURIComponent(scope)}&` +
          `state=${state}&` +
          `show_dialog=true`;
      } else {
        authUrl = `${config.authUrl}?` +
          `client_id=${config.clientId}&` +
          `response_type=code&` +
          `redirect_uri=${encodeURIComponent(redirectUri)}&` +
          `scope=${encodeURIComponent(scope)}&` +
          `state=${state}&` +
          `access_type=offline&` +
          `prompt=consent`;
      }

      return res.json({
        success: true,
        data: { authUrl }
      });
    }

  } catch (error) {
    console.error('Reconnect error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reconnect',
      details: error.message
    });
  }
});

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

    console.log('🔵 [Connector Callback] Starting OAuth callback processing');
    console.log('🔵 [Connector Callback] Code present:', !!code);
    console.log('🔵 [Connector Callback] State present:', !!state);

    if (!code || !state) {
      console.error('❌ [Connector Callback] Missing required parameters');
      return res.status(400).json({
        success: false,
        error: 'Missing code or state parameter'
      });
    }

    // Decode and verify state
    let stateData;
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64').toString());
      console.log('🔵 [Connector Callback] Decoded state:', stateData);
    } catch (e) {
      console.error('❌ [Connector Callback] Failed to decode state:', e);
      return res.status(400).json({
        success: false,
        error: 'Invalid state parameter'
      });
    }

    let { provider, platform, userId } = stateData;

    // Handle provider vs platform mismatch for Google services
    // Frontend sends provider: 'google', platform: 'google_calendar'
    // But OAUTH_CONFIGS uses 'google_calendar' as the key
    const configKey = platform || provider;
    console.log('🔵 [Connector Callback] Provider:', provider);
    console.log('🔵 [Connector Callback] Platform:', platform);
    console.log('🔵 [Connector Callback] Using config key:', configKey);
    console.log('🔵 [Connector Callback] UserId:', userId);
    console.log('🔵 [Connector Callback] Available configs:', Object.keys(OAUTH_CONFIGS));

    // Route health platforms to health connectors
    const healthPlatforms = ['whoop', 'oura'];
    if (healthPlatforms.includes(configKey)) {
      console.log(`🏃 [Connector Callback] Routing ${configKey} to health connectors`);
      const baseUrl = process.env.API_URL || `http://localhost:${process.env.PORT || 3001}`;
      const healthUrl = `${baseUrl}/api/health/oauth/callback/${configKey}`;

      try {
        const healthResponse = await fetch(healthUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, state })
        });

        const healthData = await healthResponse.json();

        if (!healthResponse.ok) {
          console.error(`❌ [Connector Callback] Health callback failed:`, healthData);
          return res.status(healthResponse.status).json(healthData);
        }

        console.log(`✅ [Connector Callback] Health callback successful for ${configKey}`);
        return res.json(healthData);
      } catch (healthError) {
        console.error(`❌ [Connector Callback] Health callback error:`, healthError);
        return res.status(500).json({
          success: false,
          error: `Failed to process ${configKey} callback`,
          details: healthError.message
        });
      }
    }

    const config = OAUTH_CONFIGS[configKey];

    if (!config) {
      console.error(`❌ [Connector Callback] No config found for key: ${configKey}`);
      console.error('❌ [Connector Callback] Available configs:', Object.keys(OAUTH_CONFIGS));
      return res.status(400).json({
        success: false,
        error: `Unsupported provider: ${configKey}`
      });
    }

    console.log('🔵 [Connector Callback] Config found:', !!config);
    console.log('🔵 [Connector Callback] Config has clientId:', !!config.clientId);
    console.log('🔵 [Connector Callback] Config has clientSecret:', !!config.clientSecret);

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
    const redirectUri = `${process.env.APP_URL || process.env.VITE_APP_URL || 'http://127.0.0.1:8086'}/oauth/callback`;
    let tokenResponse;

    console.log(`🔑 [${provider}] Starting token exchange...`);
    console.log(`🔑 [${provider}] Code length: ${code.length}`);
    console.log(`🔑 [${provider}] Redirect URI: ${redirectUri}`);
    console.log(`🔑 [${provider}] Token URL: ${config.tokenUrl}`);

    if (provider === 'spotify') {
      // Spotify uses Basic Authentication
      console.log(`🔑 [Spotify] Client ID: ${config.clientId}`);

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

      console.log(`🔑 [Spotify] Token response status: ${tokenResponse.status}`);
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
    } else if (provider === 'reddit') {
      // Reddit uses Basic Authentication like Spotify
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

      // Try to parse JSON error for more details
      try {
        const errorJson = JSON.parse(errorText);
        console.error(`❌ [${provider}] Parsed error:`, JSON.stringify(errorJson, null, 2));
      } catch (e) {
        console.error(`❌ [${provider}] Raw error (not JSON):`, errorText);
      }

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
      // Use the correct platform key for storage
      // For Google services, use the specific service (google_calendar, google_gmail, etc.)
      const platformKey = configKey;
      console.log(`🔵 [Connector Callback] Storing connection with platform key: ${platformKey}`);

      const connectionData = {
        user_id: userUuid,  // Use UUID not email
        platform: platformKey,  // Use the config key (e.g., 'google_calendar' not 'google')
        access_token: encryptToken(tokens.access_token),
        refresh_token: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
        token_expires_at: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null,
        connected_at: new Date().toISOString(),  // Use correct column name
        status: 'connected',  // Reset status to connected after successful OAuth (matches DB constraint)
        last_sync_status: 'success',  // IMPORTANT: Set to success after OAuth completes!
        last_sync_at: new Date().toISOString(),  // Use correct column name
        metadata: {
          connected_at: new Date().toISOString(),
          last_sync: new Date().toISOString(),
          last_sync_status: 'success'
        },
        scopes: config.scopes || []
      };

      // Upsert connection to database (insert or update if exists)
      // Use supabaseAdmin to bypass RLS since this is a server-side operation
      const { error: dbError } = await supabaseAdmin
        .from('platform_connections')
        .upsert(connectionData, {
          onConflict: 'user_id,platform'
        });

      if (dbError) {
        console.error('Database error storing connection:', dbError);
        throw dbError;
      }

      console.log(`✅ Successfully stored ${platformKey} connection for user ${userId} (UUID: ${userUuid}) in database`);

      // Invalidate cached platform status for this user
      await invalidatePlatformStatusCache(userUuid);

      // Trigger background extraction using Bull queue (if available)
      // Falls back to direct execution if queue not available
      import('../services/queueService.js').then(({ addExtractionJob, areQueuesAvailable }) => {
        // Check if job queue is available
        if (areQueuesAvailable()) {
          // Add job to queue with high priority (newly connected platforms)
          addExtractionJob(userUuid, platformKey, null, { priority: 1 })
            .then(job => {
              console.log(`✅ Added extraction job to queue: ${job.id} for ${platformKey}`);
            })
            .catch(error => {
              console.warn(`⚠️ Failed to queue extraction job for ${platformKey}:`, error.message);
            });
        } else {
          // Fallback to direct execution if queue not available
          import('../services/dataExtractionService.js').then(({ default: extractionService }) => {
            extractionService.extractPlatformData(userUuid, platformKey)
              .then(result => {
                console.log(`✅ Background extraction completed for ${platformKey}:`, result);

                // Trigger soul signature building after extraction
                import('../services/soulSignatureBuilder.js').then(({ default: soulBuilder }) => {
                  soulBuilder.buildSoulSignature(userUuid)
                    .then(soulResult => {
                      console.log(`✅ Soul signature updated for user after ${platformKey} extraction:`, soulResult);
                    })
                    .catch(soulError => {
                      console.warn(`⚠️ Soul signature building failed:`, soulError);
                    });
                });
              })
              .catch(error => {
                console.warn(`⚠️ Background extraction failed for ${platformKey}:`, error.message);
              });
          });
        }
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
    // IMPORTANT: Include 'status' column to check for token_expired status
    const { data: connections, error } = await supabaseAdmin
      .from('platform_connections')
      .select('platform, connected_at, token_expires_at, metadata, last_sync_at, last_sync_status, status')
      .eq('user_id', userUuid);

    if (error) {
      console.error('Database error getting connections:', error);
      throw error;
    }

    // Transform to status object with token expiration validation
    const connectionStatus = {};
    const now = new Date();

    // Use for...of to handle async token refresh
    for (const connection of connections || []) {
      // Check if token is expired (check both possible expiration columns)
      const expiresAt = connection.token_expires_at;
      let isTokenExpired = expiresAt && new Date(expiresAt) < now;

      // SPECIAL CASE: For Spotify and YouTube with encryption_key_mismatch,
      // force connected=true to show "Token Expired" badge instead of "Connect"
      // Check if connected_at exists to determine if platform is connected
      let isConnected = !!connection.connected_at;
      if ((connection.platform === 'spotify' || connection.platform === 'youtube') &&
          connection.last_sync_status === 'encryption_key_mismatch') {
        isConnected = true;  // Force true to show expired state in UI
        console.log(`🔧 Forcing ${connection.platform} connected=true due to encryption_key_mismatch`);
      }

      // AUTOMATIC TOKEN REFRESH: Attempt to refresh expired tokens
      // Skip if already marked as expired (needs user re-authorization, don't spam logs)
      const isAlreadyMarkedExpired = connection.status === 'expired';
      if (isConnected && isTokenExpired && !isAlreadyMarkedExpired) {
        console.log(`🔄 Attempting automatic token refresh for ${connection.platform}...`);
        try {
          await ensureFreshToken(userUuid, connection.platform);
          console.log(`✅ Token automatically refreshed for ${connection.platform}`);
          isTokenExpired = false;  // Token is now valid
          // Invalidate cache so next request gets fresh status
          await invalidatePlatformStatusCache(userUuid);
        } catch (refreshError) {
          console.warn(`⚠️ Auto-refresh failed for ${connection.platform}: ${refreshError.message}`);
          // Keep isTokenExpired = true, user will need to reconnect
        }
      }

      const isActive = isConnected && !isTokenExpired;

      // Determine the current status
      // Priority: database status if 'expired' or 'token_expired', then last_sync_status, then fallback
      let status = connection.last_sync_status || connection.metadata?.last_sync_status || 'unknown';

      // If database status is 'expired' or 'token_expired', use that as the primary status
      // AND set isTokenExpired to true
      if (connection.status === 'expired' || connection.status === 'token_expired') {
        status = 'token_expired';
        isTokenExpired = true;  // Force token expired flag when status indicates expired
        console.log(`🔄 Platform ${connection.platform} has status=${connection.status}, setting tokenExpired=true`);
      }
      // Override with 'token_expired' if:
      // 1. The token is actually expired NOW
      // 2. AND the status is not meaningful (pending, success, unknown)
      // This prevents overriding 'failed' or other error states
      else if (isTokenExpired && (status === 'success' || status === 'unknown' || status === 'pending')) {
        status = 'token_expired';
      }

      // Recalculate isActive after status check (in case isTokenExpired was updated)
      const finalIsActive = isConnected && !isTokenExpired;

      connectionStatus[connection.platform] = {
        connected: isConnected,  // May be forced true for encryption_key_mismatch
        isActive: finalIsActive,      // Actual usability - false if token expired
        tokenExpired: isTokenExpired,
        connectedAt: connection.metadata?.connected_at || connection.connected_at || null,
        lastSync: connection.last_sync_at || connection.metadata?.last_sync || null,
        status: status,
        expiresAt: expiresAt
      };
    }

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
    // Since we don't have a 'connected' column, we'll update the last_sync_status instead
    const { data, error} = await supabase
      .from('platform_connections')
      .update({ last_sync_status: 'disconnected' })
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

    console.log(`🔌 Disconnect request for ${provider} from user ${userId}`);

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

    // Use supabaseAdmin to bypass RLS policies for server-side operations
    // First check if connection exists
    const { data: existingConnection, error: checkError } = await supabaseAdmin
      .from('platform_connections')
      .select('id, platform')
      .eq('user_id', userUuid)
      .eq('platform', provider)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      // PGRST116 is "not found" which is okay
      console.error('Error checking connection:', checkError);
    }

    if (!existingConnection) {
      console.log(`⚠️ No connection found for ${provider} - user ${userUuid}`);
      // Still return success since the end state is what user wants
      return res.json({
        success: true,
        data: {
          provider,
          userId,
          disconnected: true,
          message: 'Connection was already disconnected'
        }
      });
    }

    console.log(`🗑️ Deleting connection: ${existingConnection.id} for ${provider}`);

    // Disconnect by deleting the platform connection record
    // Use supabaseAdmin to bypass RLS for server-side delete
    const { error, count } = await supabaseAdmin
      .from('platform_connections')
      .delete()
      .eq('user_id', userUuid)
      .eq('platform', provider);

    if (error) {
      console.error('Error disconnecting provider:', error);
      throw error;
    }

    console.log(`✅ Deleted connection for ${provider} - user ${userUuid}`);

    // Invalidate cached platform status for this user BEFORE responding
    await invalidatePlatformStatusCache(userUuid);
    console.log(`🔄 Cache invalidated for user ${userUuid}`);

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
 * POST /api/connectors/connect/:platform
 * Proxy endpoint for entertainment connectors (Spotify, YouTube, etc.)
 * This provides backward compatibility for frontend that expects this route
 */
router.post('/connect/:platform', async (req, res) => {
  try {
    const { platform } = req.params;
    const { userId } = req.body;

    console.log(`🔗 OAuth connection request for ${platform} from user ${userId}`);

    // Platforms handled by entertainment-connectors
    const entertainmentPlatforms = ['spotify', 'youtube', 'netflix', 'twitch', 'tiktok'];

    // Health platforms handled by health-connectors (use platform-specific redirect URIs)
    const healthPlatforms = ['whoop', 'oura'];

    if (healthPlatforms.includes(platform)) {
      // Forward to health connectors endpoint (uses WHOOP_REDIRECT_URI etc.)
      const baseUrl = process.env.API_URL || `http://localhost:${process.env.PORT || 3001}`;
      const healthUrl = `${baseUrl}/api/health/connect/${platform}?userId=${encodeURIComponent(userId)}`;

      console.log(`🏃 Proxying to health connector: ${healthUrl}`);

      try {
        const response = await fetch(healthUrl, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        });

        const data = await response.json();

        if (!response.ok) {
          return res.status(response.status).json(data);
        }

        // Transform health-connector response format to match what frontend expects
        // Health-connectors returns { success: true, authUrl }
        // Frontend expects { success: true, data: { authUrl } }
        if (data.authUrl) {
          return res.json({
            success: true,
            data: { authUrl: data.authUrl }
          });
        }

        return res.json(data);
      } catch (healthError) {
        console.error(`❌ Health connector error for ${platform}:`, healthError);
        return res.status(500).json({
          success: false,
          error: `Failed to initiate ${platform} connection`,
          details: healthError.message
        });
      }
    }

    if (entertainmentPlatforms.includes(platform)) {
      // Forward to entertainment connectors endpoint
      const baseUrl = process.env.API_URL || `http://localhost:${process.env.PORT || 3001}`;
      const entertainmentUrl = `${baseUrl}/api/entertainment/connect/${platform}`;

      console.log(`📡 Proxying to entertainment connector: ${entertainmentUrl}`);

      // Make internal request to entertainment connector
      const response = await fetch(entertainmentUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ userId })
      });

      const data = await response.json();

      if (!response.ok) {
        return res.status(response.status).json(data);
      }

      return res.json(data);
    }

    // For other platforms, use the existing auth flow
    const config = OAUTH_CONFIGS[platform];

    if (!config) {
      return res.status(400).json({
        success: false,
        error: `Unsupported platform: ${platform}`
      });
    }

    // Generate state parameter for security
    const stateObject = {
      provider: platform,
      userId,
      timestamp: Date.now()
    };

    const state = Buffer.from(JSON.stringify(stateObject)).toString('base64');

    // Build authorization URL
    const appUrl = process.env.APP_URL || process.env.VITE_APP_URL || 'http://localhost:8086';
    const redirectUri = `${appUrl}/oauth/callback`;

    const scopeParam = platform === 'slack' ? 'user_scope' : 'scope';
    const scopeSeparator = platform === 'slack' ? ',' : ' ';

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
      authUrl,
      state,
      platform
    });

  } catch (error) {
    console.error(`Error initiating ${req.params.platform} connection:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to initiate OAuth connection',
      details: error.message
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