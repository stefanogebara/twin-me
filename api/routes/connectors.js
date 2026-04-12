/**
 * Connector Routes - OAuth Integration for External Data Sources
 */

import express from 'express';
import { supabase } from '../config/supabase.js';
import { supabaseAdmin } from '../services/database.js';
import { encryptToken, decryptToken, encryptState, decryptState } from '../services/encryption.js';
import { authenticateUser } from '../middleware/auth.js';
import {
  getCachedPlatformStatus,
  setCachedPlatformStatus,
  invalidatePlatformStatusCache
} from '../services/redisClient.js';
import { ensureFreshToken } from '../services/tokenRefreshService.js';
import { createLogger, redact } from '../services/logger.js';
import { getGoogleWorkspaceScopes } from '../config/googleWorkspaceScopes.js';

const log = createLogger('Connectors');
const router = express.Router();

// In-memory cache fallback for when Redis is unavailable
const memoryCache = new Map();
const MEMORY_CACHE_TTL = 3 * 60 * 1000; // 3 minutes

function getMemoryCached(key) {
  const entry = memoryCache.get(key);
  if (entry && Date.now() - entry.ts < MEMORY_CACHE_TTL) return entry.data;
  if (entry) memoryCache.delete(key);
  return null;
}

function setMemoryCached(key, data) {
  memoryCache.set(key, { data, ts: Date.now() });
}

/**
 * Clear in-memory status cache for a user.
 * Call after platform connect/disconnect in other route files.
 */
export function clearStatusMemoryCache(userId) {
  memoryCache.delete(`status:${userId}`);
}

// ====================================================================
// OAUTH CONFIGURATIONS
// ====================================================================

const OAUTH_CONFIGS = {
  // Google Services
  google_gmail: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    scopes: getGoogleWorkspaceScopes(),
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token'
  },
  google_calendar: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    scopes: getGoogleWorkspaceScopes(),
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token'
  },
  google_drive: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    scopes: getGoogleWorkspaceScopes(),
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
    scopes: ['user', 'public_repo', 'read:org'],
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token'
  },

  // Discord
  discord: {
    clientId: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    scopes: ['identify', 'email', 'guilds', 'connections'],
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

  // Twitch
  twitch: {
    clientId: process.env.TWITCH_CLIENT_ID,
    clientSecret: process.env.TWITCH_CLIENT_SECRET,
    scopes: ['user:read:follows', 'user:read:email'],
    authUrl: 'https://id.twitch.tv/oauth2/authorize',
    tokenUrl: 'https://id.twitch.tv/oauth2/token'
  },

  // Whoop
  whoop: {
    clientId: process.env.WHOOP_CLIENT_ID,
    clientSecret: process.env.WHOOP_CLIENT_SECRET,
    scopes: ['read:recovery', 'read:sleep', 'read:workout', 'read:profile', 'read:body_measurement'],
    authUrl: 'https://api.prod.whoop.com/oauth/oauth2/auth',
    tokenUrl: 'https://api.prod.whoop.com/oauth/oauth2/token'
  },

  // Strava
  strava: {
    clientId: process.env.STRAVA_CLIENT_ID,
    clientSecret: process.env.STRAVA_CLIENT_SECRET,
    scopes: ['read', 'activity:read_all'],
    authUrl: 'https://www.strava.com/oauth/authorize',
    tokenUrl: 'https://www.strava.com/oauth/token'
  },

  // Oura Ring
  oura: {
    clientId: process.env.OURA_CLIENT_ID,
    clientSecret: process.env.OURA_CLIENT_SECRET,
    scopes: ['daily', 'session', 'heartrate', 'workout', 'tag', 'personal', 'email', 'spo2', 'ring_configuration'],
    authUrl: 'https://cloud.ouraring.com/oauth/authorize',
    tokenUrl: 'https://cloud.ouraring.com/oauth/token'
  },

};

// Debug: Check LinkedIn config on load
log.debug('LinkedIn config on file load', {
  hasLinkedIn: !!OAUTH_CONFIGS.linkedin,
  hasClientId: !!OAUTH_CONFIGS.linkedin?.clientId,
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
router.get('/connect/:provider', authenticateUser, async (req, res) => {
  try {
    const { provider } = req.params;
    // Always use the authenticated user's ID — never trust userId from query params
    const userId = req.user.id;

    const config = OAUTH_CONFIGS[provider];
    if (!config) {
      return res.status(404).json({
        success: false,
        error: `Provider ${provider} not configured`
      });
    }

    log.info("Reconnect/refresh initiated", { provider, userId });

    // Check if we have a refresh token stored
    const { data: connection, error: fetchError } = await supabaseAdmin
      .from('platform_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('platform', provider)
      .single();

    if (fetchError || !connection) {
      // No existing connection, redirect to full OAuth flow
      log.info("No existing connection found, initiating full OAuth", { provider });

      // Generate OAuth URL for fresh authentication
      const redirectUri = `${process.env.VITE_APP_URL || 'http://localhost:8086'}/oauth/callback`;
      const state = encryptState({
        provider,
        userId,
        timestamp: Date.now()
      }, 'connector');

      // Store state for CSRF protection
      const { error: stateInsertErr1 } = await supabaseAdmin
        .from('oauth_states')
        .insert({
          state,
          user_id: userId,
          provider,
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 1800000).toISOString() // 30 minutes
        });
      if (stateInsertErr1) {
        log.error("Failed to store CSRF state for connect", { error: stateInsertErr1 });
      }

      const scopeSeparator = (provider === 'slack' || provider === 'strava') ? ',' : ' ';
      const scope = config.scopes.join(scopeSeparator);
      const authParams = new URLSearchParams({
        client_id: config.clientId,
        response_type: 'code',
        redirect_uri: redirectUri,
        [provider === 'slack' ? 'user_scope' : 'scope']: scope,
        state,
      });

      // Provider-specific OAuth parameters
      if (provider === 'spotify') {
        authParams.set('show_dialog', 'true');
      } else if (provider.startsWith('google') || provider === 'youtube') {
        authParams.set('access_type', 'offline');
        authParams.set('prompt', 'consent');
      } else if (provider === 'reddit') {
        authParams.set('duration', 'permanent');
      } else if (provider === 'twitch') {
        authParams.set('force_verify', 'true');
      } else if (provider === 'discord') {
        authParams.set('prompt', 'consent');
      } else if (provider === 'strava') {
        authParams.set('approval_prompt', 'force');
      }

      const authUrl = `${config.authUrl}?${authParams.toString()}`;

      return res.json({
        success: true,
        data: { authUrl }
      });
    }

    // We have a connection, attempt to refresh the token
    if (connection.refresh_token) {
      try {
        const refreshToken = decryptToken(connection.refresh_token);
        log.debug("Attempting to refresh token", { provider });

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
          status: 'connected',
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

        log.info("Token refreshed successfully", { provider });

        // Invalidate cache (both Redis and in-memory)
        await invalidatePlatformStatusCache(userId);
        clearStatusMemoryCache(userId);

        return res.json({
          success: true,
          message: 'Token refreshed successfully'
        });

      } catch (refreshError) {
        log.error("Token refresh failed", { provider, error: refreshError });

        // Refresh failed, need to re-authenticate
        const redirectUri = `${process.env.VITE_APP_URL || 'http://localhost:8086'}/oauth/callback`;
        const state = encryptState({
          provider,
          userId,
          timestamp: Date.now(),
          isReconnect: true
        }, 'connector');

        // Store state for CSRF protection
        const { error: stateInsertErr2 } = await supabaseAdmin
          .from('oauth_states')
          .insert({
            state,
            user_id: userId,
            provider,
            created_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 1800000).toISOString() // 30 minutes
          });
        if (stateInsertErr2) {
          log.error("Failed to store CSRF state for reconnect", { error: stateInsertErr2 });
        }

        const scopeSeparator = (provider === 'slack' || provider === 'strava') ? ',' : ' ';
      const scope = config.scopes.join(scopeSeparator);
        const reAuthParams = new URLSearchParams({
          client_id: config.clientId,
          response_type: 'code',
          redirect_uri: redirectUri,
          [provider === 'slack' ? 'user_scope' : 'scope']: scope,
          state,
        });

        if (provider === 'spotify') {
          reAuthParams.set('show_dialog', 'true');
        } else if (provider.startsWith('google') || provider === 'youtube') {
          reAuthParams.set('access_type', 'offline');
          reAuthParams.set('prompt', 'consent');
        } else if (provider === 'reddit') {
          reAuthParams.set('duration', 'permanent');
        } else if (provider === 'twitch') {
          reAuthParams.set('force_verify', 'true');
        } else if (provider === 'discord') {
          reAuthParams.set('prompt', 'consent');
        } else if (provider === 'strava') {
          reAuthParams.set('approval_prompt', 'force');
        }

        const authUrl = `${config.authUrl}?${reAuthParams.toString()}`;

        return res.json({
          success: true,
          data: { authUrl }
        });
      }
    } else {
      // No refresh token available, need full re-authentication
      log.debug("No refresh token available, requiring re-auth", { provider });

      const redirectUri = `${process.env.VITE_APP_URL || 'http://localhost:8086'}/oauth/callback`;
      const state = encryptState({
        provider,
        userId,
        timestamp: Date.now(),
        isReconnect: true
      }, 'connector');

      // Store state for CSRF protection
      const { error: stateInsertErr3 } = await supabaseAdmin
        .from('oauth_states')
        .insert({
          state,
          user_id: userId,
          provider,
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 1800000).toISOString() // 30 minutes
        });
      if (stateInsertErr3) {
        log.error("Failed to store CSRF state for /auth/:provider", { error: stateInsertErr3 });
      }

      const scopeSeparator = (provider === 'slack' || provider === 'strava') ? ',' : ' ';
      const scope = config.scopes.join(scopeSeparator);
      const noRefreshParams = new URLSearchParams({
        client_id: config.clientId,
        response_type: 'code',
        redirect_uri: redirectUri,
        [provider === 'slack' ? 'user_scope' : 'scope']: scope,
        state,
      });

      if (provider === 'spotify') {
        noRefreshParams.set('show_dialog', 'true');
      } else if (provider.startsWith('google') || provider === 'youtube') {
        noRefreshParams.set('access_type', 'offline');
        noRefreshParams.set('prompt', 'consent');
      } else if (provider === 'reddit') {
        noRefreshParams.set('duration', 'permanent');
      } else if (provider === 'twitch') {
        noRefreshParams.set('force_verify', 'true');
      } else if (provider === 'discord') {
        noRefreshParams.set('prompt', 'consent');
      } else if (provider === 'strava') {
        noRefreshParams.set('approval_prompt', 'force');
      }

      const authUrl = `${config.authUrl}?${noRefreshParams.toString()}`;

      return res.json({
        success: true,
        data: { authUrl }
      });
    }

  } catch (error) {
    log.error("Reconnect error", { error });
    res.status(500).json({
      success: false,
      error: 'Failed to reconnect',
      ...(process.env.NODE_ENV !== 'production' && { details: error.message }),
    });
  }
});

/**
 * GET /api/connectors/auth/:provider
 * Generate OAuth authorization URL for a provider
 */
router.get('/auth/:provider', authenticateUser, (req, res) => {
  try {
    const { provider } = req.params;
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    // IDOR protection: callers may only request auth URLs for themselves
    if (userId !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Cannot request OAuth URL for another user'
      });
    }

    const config = OAUTH_CONFIGS[provider];
    log.debug("Provider config check", { provider, configExists: !!config });
    if (!config) {
      return res.status(400).json({
        success: false,
        error: `Unsupported provider: ${provider}`
      });
    }

    if (!config.clientId) {
      log.error("No clientId for provider", { provider });
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
    log.debug("Creating state object for connector OAuth");
    const state = encryptState(stateObject);
    log.debug("State encrypted successfully");

    // Build authorization URL - Use unified callback for all platforms
    const appUrl = process.env.APP_URL || process.env.VITE_APP_URL || 'http://localhost:8086';
    const redirectUri = `${appUrl}/oauth/callback`;

    log.debug("OAuth URL generation", { provider });
    log.debug("APP_URL from env", { appUrl: process.env.APP_URL });
    log.debug("VITE_APP_URL from env", { viteAppUrl: process.env.VITE_APP_URL });
    log.debug("Final appUrl", { appUrl });
    log.debug("Redirect URI", { redirectUri });

    // Slack requires 'user_scope' parameter for user tokens (not 'scope' which is for bot tokens)
    // Slack also uses comma-separated scopes, while most others use space-separated
    const scopeParam = provider === 'slack' ? 'user_scope' : 'scope';
    const scopeSeparator = (provider === 'slack' || provider === 'strava') ? ',' : ' ';

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: redirectUri,
      [scopeParam]: config.scopes.join(scopeSeparator),
      response_type: 'code',
      state
    });

    // Provider-specific OAuth parameters for refresh tokens
    if (provider.startsWith('google') || provider === 'youtube') {
      params.set('access_type', 'offline');
      params.set('prompt', 'consent');
    } else if (provider === 'reddit') {
      params.set('duration', 'permanent'); // Required for refresh tokens
    } else if (provider === 'twitch') {
      params.set('force_verify', 'true');
    } else if (provider === 'discord') {
      params.set('prompt', 'consent');
    } else if (provider === 'whoop') {
      params.set('scope', [...config.scopes, 'offline'].join(' '));
    } else if (provider === 'strava') {
      params.set('approval_prompt', 'force');
    }

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
    log.error("Error generating auth URL", { error });
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

    log.debug("Starting OAuth callback processing");
    log.debug("Callback params", { hasCode: !!code });
    log.debug("Callback state", { hasState: !!state });

    if (!code || !state) {
      log.error("Callback missing required parameters");
      return res.status(400).json({
        success: false,
        error: 'Missing code or state parameter'
      });
    }

    // Decode and verify state
    let stateData;
    try {
      stateData = decryptState(state);
      log.debug("State decrypted", { provider: stateData.provider });
    } catch (e) {
      log.error("Failed to decrypt state", { error: e });
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
    log.debug("Callback provider", { provider });
    log.debug("Callback platform", { platform });
    log.debug("Callback config key", { configKey });
    log.debug("Callback userId", { userId });
    log.debug("Available configs", { configs: Object.keys(OAUTH_CONFIGS) });

    const config = OAUTH_CONFIGS[configKey];

    if (!config) {
      log.error("No config found", { configKey });
      log.error("Available configs", { configs: Object.keys(OAUTH_CONFIGS) });
      return res.status(400).json({
        success: false,
        error: `Unsupported provider: ${configKey}`
      });
    }

    log.debug("Config found", { hasConfig: !!config });
    log.debug("Config clientId", { hasClientId: !!config.clientId });
    log.debug("Config clientSecret present", { hasClientSecret: !!config.clientSecret });

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
        log.error("Error looking up user UUID", { error: userError });
        return res.status(400).json({
          success: false,
          error: 'User not found'
        });
      }
      userUuid = userData.id;
      log.info("Converted email-based userId to UUID", { userUuid });
    }

    // Exchange authorization code for tokens
    // Different providers need different auth methods
    const redirectUri = `${process.env.APP_URL || process.env.VITE_APP_URL || 'http://127.0.0.1:8086'}/oauth/callback`;
    let tokenResponse;

    log.debug("Starting token exchange", { provider });
    log.debug("Token exchange code", { provider, codeLength: code.length });
    log.debug("Token exchange redirect", { provider, redirectUri });
    log.debug("Token exchange URL", { provider, tokenUrl: config.tokenUrl });

    if (provider === 'spotify') {
      // Spotify uses Basic Authentication
      log.debug("Spotify client ID check", { hasClientId: !!config.clientId });

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

      log.debug("Spotify token response", { status: tokenResponse.status });
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
      log.error("Token exchange failed", {
        provider,
        status: tokenResponse.status,
        statusText: tokenResponse.statusText,
        errorText,
      });

      // Try to parse JSON error for more details
      try {
        const errorJson = JSON.parse(errorText);
        log.error("Token exchange parsed error", { provider, errorJson });
      } catch (e) {
        log.error("Token exchange raw error", { provider, errorText });
      }

      return res.status(tokenResponse.status).json({
        success: false,
        error: `Token exchange failed: ${tokenResponse.statusText}`,
        details: errorText
      });
    }

    const tokenData = await tokenResponse.json();
    log.info("Token exchange successful", { provider });

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
      log.info("Storing connection", { platformKey });

      const connectionData = {
        user_id: userUuid,  // Use UUID not email
        platform: platformKey,  // Use the config key (e.g., 'google_calendar' not 'google')
        access_token: encryptToken(tokens.access_token),
        refresh_token: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
        token_expires_at: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null,
        connected_at: new Date().toISOString(),  // Use correct column name
        status: 'connected',  // Reset status to connected after successful OAuth (matches DB constraint)
        last_sync_status: 'success',  // IMPORTANT: Set to success after OAuth completes!
        last_sync_error: null,  // Clear any previous sync errors
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
        log.error("Database error storing connection", { error: dbError });
        throw dbError;
      }

      log.info("Connection stored", { platformKey, userId });

      // Invalidate cached platform status for this user (both Redis and in-memory)
      await invalidatePlatformStatusCache(userUuid);
      clearStatusMemoryCache(userUuid);

      // Trigger background extraction using Bull queue (if available)
      // Falls back to direct execution if queue not available
      import('../services/queueService.js').then(({ addExtractionJob, areQueuesAvailable }) => {
        // Check if job queue is available
        if (areQueuesAvailable()) {
          // Add job to queue with high priority (newly connected platforms)
          addExtractionJob(userUuid, platformKey, null, { priority: 1 })
            .then(job => {
              log.info("Extraction job queued", { jobId: job.id, platformKey });
            })
            .catch(error => {
              log.warn("Failed to queue extraction job", { platformKey, error });
            });
        } else {
          // Fallback to direct execution if queue not available
          import('../services/dataExtractionService.js').then(({ default: extractionService }) => {
            extractionService.extractPlatformData(userUuid, platformKey)
              .then(result => {
                log.info("Background extraction completed", { platformKey });

                // Trigger soul signature building after extraction
                import('../services/soulSignatureBuilder.js').then(({ default: soulBuilder }) => {
                  soulBuilder.buildSoulSignature(userUuid)
                    .then(soulResult => {
                      log.info("Soul signature updated", { platformKey });
                    })
                    .catch(soulError => {
                      log.warn("Soul signature building failed", { error: soulError });
                    });
                });
              })
              .catch(error => {
                log.warn("Background extraction failed", { platformKey, error });
              });
          });
        }
      });

    } catch (error) {
      log.error("Error storing connection", { error });
      return res.status(500).json({
        success: false,
        error: 'Failed to store connection'
      });
    }

    log.debug("Sending callback response", { provider });

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

    log.debug("Connector response sent");

    res.json(responseData);

  } catch (error) {
    log.error("Error handling OAuth callback", { error });
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
router.get('/status/:userId', authenticateUser, async (req, res) => {
  try {
    const { userId } = req.params;

    if (userId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden', message: 'Access denied' });
    }

    // Convert email to UUID if needed
    let userUuid = userId;
    if (userId && !userId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      const { data: userData, error: userLookupErr } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('email', userId)
        .single();
      if (userLookupErr) {
        log.warn("Failed to resolve email to UUID", { error: userLookupErr });
      } else if (userData) {
        userUuid = userData.id;
      }
    }

    // Check in-memory cache first (fastest, no external deps)
    const memoryCached = getMemoryCached(`status:${userUuid}`);
    if (memoryCached) {
      return res.json({
        success: true,
        data: memoryCached,
        cached: true
      });
    }

    // Check Redis cache second
    const cachedStatus = await getCachedPlatformStatus(userUuid);
    if (cachedStatus) {
      setMemoryCached(`status:${userUuid}`, cachedStatus);
      return res.json({
        success: true,
        data: cachedStatus,
        cached: true
      });
    }

    // Cache miss - fetch from database with retry
    // IMPORTANT: Include 'status' column to check for token_expired status
    let connections, error;
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await supabaseAdmin
        .from('platform_connections')
        .select('platform, connected_at, token_expires_at, access_token, metadata, last_sync_at, last_sync_status, status') // access_token needed only for NANGO_MANAGED sentinel check — never returned to client
        .eq('user_id', userUuid);
      connections = result.data;
      error = result.error;
      if (!error) break;
      if (attempt === 0) {
        log.warn("Database error getting connections, retrying", { errorCode: error.code });
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    if (error) {
      log.error("Database error getting connections (after retry)", { error });
      throw error;
    }

    // Transform to status object with token expiration validation
    const connectionStatus = {};
    const now = new Date();

    // Use for...of to handle async token refresh
    for (const connection of connections || []) {
      // NANGO_MANAGED connections: Nango handles token lifecycle, skip expiry checks
      const isNangoManaged = connection.access_token === 'NANGO_MANAGED';

      // Check if token is expired (check both possible expiration columns)
      const expiresAt = connection.token_expires_at;
      let isTokenExpired = !isNangoManaged && expiresAt && new Date(expiresAt) < now;

      // SPECIAL CASE: For Spotify and YouTube with encryption_key_mismatch,
      // force connected=true to show "Token Expired" badge instead of "Connect"
      // Check if connected_at exists to determine if platform is connected
      let isConnected = !!connection.connected_at;
      if ((connection.platform === 'spotify' || connection.platform === 'youtube') &&
          connection.last_sync_status === 'encryption_key_mismatch') {
        isConnected = true;  // Force true to show expired state in UI
        log.info("Forcing connected due to encryption_key_mismatch", { platform: connection.platform });
      }

      // AUTOMATIC TOKEN REFRESH: Attempt to refresh expired tokens
      // Skip for Nango-managed connections (Nango handles refresh automatically)
      if (isConnected && isTokenExpired && !isNangoManaged) {
        log.debug("Attempting automatic token refresh", { platform: connection.platform });
        try {
          await ensureFreshToken(userUuid, connection.platform);
          log.info("Token automatically refreshed", { platform: connection.platform });
          isTokenExpired = false;  // Token is now valid
          // Invalidate cache so next request gets fresh status (both Redis and in-memory)
          await invalidatePlatformStatusCache(userUuid);
          clearStatusMemoryCache(userUuid);
        } catch (refreshError) {
          log.warn("Auto-refresh failed", { platform: connection.platform, error: refreshError });
          // Keep isTokenExpired = true, user will need to reconnect
        }
      }

      const isActive = isConnected && !isTokenExpired;

      // Determine the current status
      // Priority: database status if 'expired' or 'token_expired', then last_sync_status, then fallback
      let status = connection.last_sync_status || connection.metadata?.last_sync_status || 'unknown';

      // If database status is 'expired' or 'token_expired', use that as the primary status
      // AND set isTokenExpired to true
      // Also handle 'error' with 'auth_error' sync status — means token was rejected (401)
      if (connection.status === 'expired' || connection.status === 'token_expired' || connection.status === 'needs_reauth'
        || connection.status === 'requires_reauth'
        || connection.last_sync_status === 'requires_reauth'
        || (connection.status === 'error' && connection.last_sync_status === 'auth_error')) {
        status = 'token_expired';
        isTokenExpired = true;  // Force token expired flag when status indicates expired
        log.debug("Platform token expired", { platform: connection.platform, status: connection.status });
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

    // Also include Nango-only connections (stored in nango_connection_mappings, not platform_connections)
    const { data: nangoMappings } = await supabaseAdmin
      .from('nango_connection_mappings')
      .select('platform, status, created_at, updated_at, last_synced_at')
      .eq('user_id', userUuid)
      .in('status', ['connected', 'active']);

    for (const mapping of nangoMappings || []) {
      if (!connectionStatus[mapping.platform]) {
        connectionStatus[mapping.platform] = {
          connected: true,
          isActive: true,
          tokenExpired: false,
          connectedAt: mapping.created_at || null,
          lastSync: mapping.last_synced_at || mapping.updated_at || null,
          status: 'active',
          expiresAt: null,
        };
      }
    }

    log.debug("Connection status", { userId });

    // Cache the result in memory and Redis
    setMemoryCached(`status:${userUuid}`, connectionStatus);
    await setCachedPlatformStatus(userUuid, connectionStatus);

    res.json({
      success: true,
      data: connectionStatus,
      cached: false
    });

  } catch (error) {
    log.error("Error getting connector status", { error });
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
router.post('/reset/:userId', authenticateUser, async (req, res) => {
  try {
    const { userId } = req.params;

    if (userId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden', message: 'Access denied' });
    }

    log.info("Resetting connections", { userId });
    log.warn("RESET ENDPOINT CALLED - should only be on fresh page loads");

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
    const { data: currentConnections, error: currentConnErr } = await supabase
      .from('platform_connections')
      .select('id, platform, last_sync_status')
      .eq('user_id', userUuid);
    if (currentConnErr) log.error("Failed to get current connections", { error: currentConnErr });

    // Only reset connections that don't have encryption_key_mismatch
    // Since we don't have a 'connected' column, we'll update the last_sync_status instead
    const { data, error} = await supabase
      .from('platform_connections')
      .update({ last_sync_status: 'disconnected' })
      .eq('user_id', userUuid)
      .not('last_sync_status', 'eq', 'encryption_key_mismatch')
      .select();

    if (error) {
      log.error("Database error resetting connections", { error });
      throw error;
    }

    const deletedCount = data?.length || 0;
    log.info("Deactivated connections", { deletedCount, userId });

    // Invalidate cached platform status for this user (both Redis and in-memory)
    await invalidatePlatformStatusCache(userUuid);
    clearStatusMemoryCache(userUuid);

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
    log.error("Error resetting connections", { error });
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
router.delete('/:provider/:userId', authenticateUser, async (req, res) => {
  try {
    const { provider, userId } = req.params;

    // Reject non-UUID user IDs — auth tokens always contain UUID
    if (!userId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
      return res.status(400).json({ error: 'Invalid user ID format' });
    }

    if (userId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const userUuid = userId;

    log.info("Disconnect request", { provider, userId });

    let deletedSomething = false;

    // 1. Delete from platform_connections (standard OAuth connections)
    const { data: existingConnection, error: checkError } = await supabaseAdmin
      .from('platform_connections')
      .select('id, platform')
      .eq('user_id', userUuid)
      .eq('platform', provider)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      log.error("Error checking platform_connections", { error: checkError });
    }

    if (existingConnection) {
      const { error } = await supabaseAdmin
        .from('platform_connections')
        .delete()
        .eq('user_id', userUuid)
        .eq('platform', provider);

      if (error) {
        log.error("Error deleting from platform_connections", { error });
        throw error;
      }
      log.info("Deleted platform_connections", { provider });
      deletedSomething = true;
    }

    // 2. Also delete from nango_connection_mappings (Nango-managed connections)
    const { data: nangoMapping } = await supabaseAdmin
      .from('nango_connection_mappings')
      .select('id, platform')
      .eq('user_id', userUuid)
      .eq('platform', provider)
      .single();

    if (nangoMapping) {
      const { error: nangoError } = await supabaseAdmin
        .from('nango_connection_mappings')
        .delete()
        .eq('user_id', userUuid)
        .eq('platform', provider);

      if (nangoError) {
        log.error("Error deleting from nango_connection_mappings", { error: nangoError });
        throw nangoError;
      }
      log.info("Deleted nango_connection_mappings", { provider });
      deletedSomething = true;
    }

    if (!deletedSomething) {
      log.warn("No connection found", { provider, userUuid });
    }

    // Invalidate cached platform status for this user BEFORE responding (both Redis and in-memory)
    await invalidatePlatformStatusCache(userUuid);
    clearStatusMemoryCache(userUuid);
    log.debug("Cache invalidated", { userUuid });

    res.json({
      success: true,
      data: {
        provider,
        userId,
        disconnected: true
      }
    });

  } catch (error) {
    log.error("Error disconnecting provider", { error });
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
router.post('/connect/:platform', authenticateUser, async (req, res) => {
  try {
    const { platform } = req.params;
    const userId = req.user.id;

    log.info("OAuth connection request", { platform, userId });

    // Platforms handled by entertainment-connectors
    const entertainmentPlatforms = ['spotify', 'youtube', 'netflix', 'tiktok'];

    if (entertainmentPlatforms.includes(platform)) {
      // Forward to entertainment connectors endpoint
      const baseUrl = process.env.API_URL || `http://localhost:${process.env.PORT || 3001}`;
      const entertainmentUrl = `${baseUrl}/api/entertainment/connect/${platform}`;

      log.info("Proxying to entertainment connector", { entertainmentUrl });

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

    const state = encryptState(stateObject);

    // Build authorization URL
    const appUrl = process.env.APP_URL || process.env.VITE_APP_URL || 'http://localhost:8086';
    const redirectUri = `${appUrl}/oauth/callback`;

    const scopeParam = platform === 'slack' ? 'user_scope' : 'scope';
    const scopeSeparator = (platform === 'slack' || platform === 'strava') ? ',' : ' ';

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: redirectUri,
      [scopeParam]: config.scopes.join(scopeSeparator),
      response_type: 'code',
      state
    });

    // Provider-specific OAuth parameters for refresh tokens
    if (platform.startsWith('google') || platform === 'youtube') {
      params.set('access_type', 'offline');
      params.set('prompt', 'consent');
    } else if (platform === 'reddit') {
      params.set('duration', 'permanent');
    } else if (platform === 'twitch') {
      params.set('force_verify', 'true');
    } else if (platform === 'discord') {
      params.set('prompt', 'consent');
    } else if (platform === 'strava') {
      params.set('approval_prompt', 'force');
    }

    const authUrl = `${config.authUrl}?${params.toString()}`;

    res.json({
      success: true,
      authUrl,
      state,
      platform
    });

  } catch (error) {
    log.error("Error initiating platform connection", { platform: req.params.platform, error });
    res.status(500).json({
      success: false,
      error: 'Failed to initiate OAuth connection',
      ...(process.env.NODE_ENV !== 'production' && { details: error.message }),
    });
  }
});

/**
 * POST /api/connectors/test-add-connection
 * Test endpoint to add a connection for testing purposes
 */
router.post('/test-add-connection', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { provider } = req.body;

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
      log.error("Database error adding test connection", { error });
      throw error;
    }

    log.info("Test connection added", { userId, provider });

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
    log.error("Error adding test connection", { error });
    res.status(500).json({
      success: false,
      error: 'Failed to add test connection'
    });
  }
});

/**
 * POST /api/connectors/garmin/credentials
 * Save Garmin credentials (email + password) for direct web-session access.
 * Validates immediately by attempting auth before storing.
 */
router.post('/garmin/credentials', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'email and password are required' });
    }

    const garmin = await import('../services/garminDirectService.js');
    await garmin.saveCredentials(userId, email, password);

    res.json({ success: true, message: 'Garmin connected' });
  } catch (err) {
    log.error('Garmin credential save failed', { error: err.message });
    const userMsg = err.message?.includes('Invalid sign in') || err.message?.includes('auth failed')
      ? 'Invalid Garmin credentials'
      : 'Failed to connect Garmin';
    res.status(400).json({ success: false, error: userMsg });
  }
});

/**
 * DELETE /api/connectors/garmin/credentials
 * Disconnect Garmin (mark inactive).
 */
router.delete('/garmin/credentials', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { getSupabase } = await import('../services/observationUtils.js');
    const db = await getSupabase();
    if (!db) {
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }

    await db.from('platform_connections')
      .update({ is_active: false })
      .eq('user_id', userId)
      .eq('platform', 'garmin');

    res.json({ success: true });
  } catch (err) {
    log.error('Garmin credential disconnect failed', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to disconnect Garmin' });
  }
});

export default router;
