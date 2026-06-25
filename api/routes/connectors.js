/**
 * Connector Routes - OAuth Integration for External Data Sources
 */

import express from 'express';
import { supabase } from '../config/supabase.js';
import { supabaseAdmin } from '../services/database.js';
import { encryptToken, decryptToken, encryptState, decryptState } from '../services/encryption.js';
import { revokeProviderGrant } from '../services/oauthRevocation.js';
import {
  SPOTIFY_SOUL_SCOPES,
  YOUTUBE_SCOPES,
  GITHUB_SOUL_SCOPES,
  DISCORD_SOUL_SCOPES,
  WHOOP_SCOPES,
} from '../config/oauthScopes.js';
import { authenticateUser, requireProfessor } from '../middleware/auth.js';
import { buildPlatformsSummary } from '../services/platformStateService.js';
import { createLogger, redact } from '../services/logger.js';
import { getGoogleWorkspaceScopes } from '../config/googleWorkspaceScopes.js';
import { getAppUrl } from '../utils/oauthUtils.js';

const log = createLogger('Connectors');
const router = express.Router();

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
  // google_drive removed (replan-2026-06-10 Track C). The shared Google
  // Workspace scopes above stay as-is — only the Drive fetcher/config died.
  // The product now promises Gmail + Calendar reading only.

  // YouTube (uses Google OAuth)
  youtube: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    scopes: YOUTUBE_SCOPES,
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token'
  },

  // Spotify
  spotify: {
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    scopes: SPOTIFY_SOUL_SCOPES,
    authUrl: 'https://accounts.spotify.com/authorize',
    tokenUrl: 'https://accounts.spotify.com/api/token'
  },

  // GitHub
  github: {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    scopes: GITHUB_SOUL_SCOPES,
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token'
  },

  // Discord
  discord: {
    clientId: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    scopes: DISCORD_SOUL_SCOPES,
    authUrl: 'https://discord.com/api/oauth2/authorize',
    tokenUrl: 'https://discord.com/api/oauth2/token'
  },

  // Whoop
  whoop: {
    clientId: process.env.WHOOP_CLIENT_ID,
    clientSecret: process.env.WHOOP_CLIENT_SECRET,
    scopes: WHOOP_SCOPES,
    authUrl: 'https://api.prod.whoop.com/oauth/oauth2/auth',
    tokenUrl: 'https://api.prod.whoop.com/oauth/oauth2/token'
  },

  // replan-2026-06-10 Track C portfolio cut: slack, linkedin, reddit, twitch,
  // strava, notion, pinterest, soundcloud, oura OAuth configs deleted.
  // LinkedIn/Discord GDPR export uploads remain the replacement story for the
  // social platforms; the extension already mirrors their browsing signal.
};

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

    // Refuse to return a broken auth URL when the OAuth client_id env var is
    // missing. Without this guard, the URL serializes 'client_id=undefined'
    // and the provider's consent screen rejects with a generic error,
    // burning a click and confusing the user.
    if (!config.clientId) {
      log.error(`OAuth client_id missing for ${provider} — env var not set on this deployment`);
      return res.status(503).json({
        success: false,
        error: `${provider} is temporarily unavailable (configuration missing). Please try again later or contact support.`,
        configError: true,
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
      const redirectUri = `${getAppUrl(req)}/oauth/callback`;
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

      const scope = config.scopes.join(' ');
      const authParams = new URLSearchParams({
        client_id: config.clientId,
        response_type: 'code',
        redirect_uri: redirectUri,
        scope,
        state,
      });

      // Provider-specific OAuth parameters
      if (provider === 'spotify') {
        authParams.set('show_dialog', 'true');
      } else if (provider.startsWith('google') || provider === 'youtube') {
        authParams.set('access_type', 'offline');
        authParams.set('prompt', 'consent');
      } else if (provider === 'discord') {
        authParams.set('prompt', 'consent');
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

        return res.json({
          success: true,
          message: 'Token refreshed successfully'
        });

      } catch (refreshError) {
        log.error("Token refresh failed", { provider, error: refreshError });

        // Refresh failed, need to re-authenticate
        const redirectUri = `${getAppUrl(req)}/oauth/callback`;
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

        const scope = config.scopes.join(' ');
        const reAuthParams = new URLSearchParams({
          client_id: config.clientId,
          response_type: 'code',
          redirect_uri: redirectUri,
          scope,
          state,
        });

        if (provider === 'spotify') {
          reAuthParams.set('show_dialog', 'true');
        } else if (provider.startsWith('google') || provider === 'youtube') {
          reAuthParams.set('access_type', 'offline');
          reAuthParams.set('prompt', 'consent');
        } else if (provider === 'discord') {
          reAuthParams.set('prompt', 'consent');
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

      const redirectUri = `${getAppUrl(req)}/oauth/callback`;
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

      const scope = config.scopes.join(' ');
      const noRefreshParams = new URLSearchParams({
        client_id: config.clientId,
        response_type: 'code',
        redirect_uri: redirectUri,
        scope,
        state,
      });

      if (provider === 'spotify') {
        noRefreshParams.set('show_dialog', 'true');
      } else if (provider.startsWith('google') || provider === 'youtube') {
        noRefreshParams.set('access_type', 'offline');
        noRefreshParams.set('prompt', 'consent');
      } else if (provider === 'discord') {
        noRefreshParams.set('prompt', 'consent');
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
      log.warn("No clientId for provider", { provider });
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
    const redirectUri = `${getAppUrl(req)}/oauth/callback`;

    log.debug("OAuth URL generation", { provider });
    log.debug("Redirect URI", { redirectUri });

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: redirectUri,
      scope: config.scopes.join(' '),
      response_type: 'code',
      state
    });

    // Provider-specific OAuth parameters for refresh tokens
    if (provider.startsWith('google') || provider === 'youtube') {
      params.set('access_type', 'offline');
      params.set('prompt', 'consent');
    } else if (provider === 'discord') {
      params.set('prompt', 'consent');
    } else if (provider === 'whoop') {
      params.set('scope', [...config.scopes, 'offline'].join(' '));
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
    const redirectUri = `${getAppUrl(req)}/oauth/callback`;
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

    const tokens = tokenData;

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

      // Trigger background extraction using Bull queue (if available)
      // Falls back to direct execution if queue not available.
      //
      // audit-2026-05-16: every dynamic import().then(...) chain below now
      // has a .catch on the outer import — a module-eval failure (or any
      // throw inside the .then callback) was previously becoming an
      // unhandled Promise rejection that poisoned the Vercel function
      // instance. Walkthrough probes correlated with ~33% chat persistence
      // loss right after warm instances handled OAuth callbacks.
      import('../services/queueService.js').then(({ addExtractionJob, areQueuesAvailable }) => {
        if (areQueuesAvailable()) {
          addExtractionJob(userUuid, platformKey, null, { priority: 1 })
            .then(job => log.info("Extraction job queued", { jobId: job.id, platformKey }))
            .catch(error => log.warn("Failed to queue extraction job", { platformKey, error: error?.message }));
        } else {
          // Fallback to direct execution if queue not available
          import('../services/dataExtractionService.js').then(({ default: extractionService }) => {
            extractionService.extractPlatformData(userUuid, platformKey)
              .then(result => {
                log.info("Background extraction completed", { platformKey });
                // Trigger soul signature building after extraction
                import('../services/soulSignatureBuilder.js').then(({ default: soulBuilder }) => {
                  soulBuilder.buildSoulSignature(userUuid)
                    .then(soulResult => log.info("Soul signature updated", { platformKey }))
                    .catch(soulError => log.warn("Soul signature building failed", { error: soulError?.message }));
                }).catch(impErr => log.warn("soulSignatureBuilder import failed", { error: impErr?.message }));
              })
              .catch(error => log.warn("Background extraction failed", { platformKey, error: error?.message }));
          }).catch(impErr => log.warn("dataExtractionService import failed", { error: impErr?.message }));
        }
      }).catch(impErr => log.warn("queueService import failed", { error: impErr?.message }));

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
 * GET /api/connectors/summary
 * GET /api/platforms/summary (alias mounted in server.js)
 *
 * Canonical single source of truth for "how many platforms is the user
 * connected to" used across /dashboard, /identity, /connect, /wiki, the
 * settings sidebar, and the chat header. Every other surface should consume
 * this to avoid the drift bug where /wiki said 9, /identity said 10, and
 * /talk-to-twin said 11 for the same user (audit 2026-05-12 H1).
 *
 * A platform is considered:
 *   - active:  connected, auth OK, last_sync within STALE_DAYS days
 *   - expired: genuine auth failure — the user must reconnect
 *   - stale:   connected, auth OK, but hasn't synced in >= STALE_DAYS
 *   - total:   active + expired + stale
 *
 * Classification lives in platformStateService.js (batch-3 state unification,
 * audit-2026-06-10) — this route is a thin wrapper. Breakdown entries also
 * carry { connectedAt, lastSyncAt, source } (additive).
 *
 * Response: { success, total, active, expired, stale, breakdown: [{platform, state, ...}] }
 */
router.get('/summary', authenticateUser, async (req, res) => {
  try {
    const summary = await buildPlatformsSummary(req.user.id);
    res.json({ success: true, ...summary });
  } catch (error) {
    log.error('Error getting platform summary', { error });
    res.status(500).json({ success: false, error: 'Failed to get platform summary' });
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
      .select('id, platform, access_token, refresh_token')
      .eq('user_id', userUuid)
      .eq('platform', provider)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      log.error("Error checking platform_connections", { error: checkError });
    }

    if (existingConnection) {
      // Best-effort: revoke the grant at the provider BEFORE deleting our row, so
      // "Disconnect" actually severs the access we were granted instead of only
      // forgetting the token. A failed/unsupported revoke must NOT block the
      // local disconnect (see oauthRevocation.js).
      try {
        const cfg = OAUTH_CONFIGS[provider] || {};
        const accessToken = existingConnection.access_token ? decryptToken(existingConnection.access_token) : null;
        const refreshToken = existingConnection.refresh_token ? decryptToken(existingConnection.refresh_token) : null;
        if (accessToken || refreshToken) {
          const revokeResult = await revokeProviderGrant({
            provider,
            accessToken,
            refreshToken,
            clientId: cfg.clientId,
            clientSecret: cfg.clientSecret,
          });
          log.info("Provider grant revocation on disconnect", { provider, ...revokeResult });
        }
      } catch (revokeErr) {
        log.warn("Provider revocation threw; continuing with local disconnect", { provider, error: revokeErr?.message });
      }

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
    const entertainmentPlatforms = ['spotify', 'youtube', 'netflix'];

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

    // Refuse to return a broken auth URL when the OAuth client_id env var is
    // missing — without this guard the URL serializes 'client_id=undefined'.
    if (!config.clientId) {
      log.error(`OAuth client_id missing for ${platform} — env var not set on this deployment`);
      return res.status(503).json({
        success: false,
        error: `${platform} is temporarily unavailable (configuration missing). Please try again later or contact support.`,
        configError: true,
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
    const redirectUri = `${getAppUrl(req)}/oauth/callback`;

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: redirectUri,
      scope: config.scopes.join(' '),
      response_type: 'code',
      state
    });

    // Provider-specific OAuth parameters for refresh tokens
    if (platform.startsWith('google') || platform === 'youtube') {
      params.set('access_type', 'offline');
      params.set('prompt', 'consent');
    } else if (platform === 'discord') {
      params.set('prompt', 'consent');
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
router.post('/test-add-connection', authenticateUser, requireProfessor, async (req, res) => {
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

export default router;
