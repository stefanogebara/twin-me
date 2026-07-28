/**
 * Unified OAuth Callback Handler for Soul Signature Platforms
 * Handles OAuth callbacks, token exchange, storage, and data extraction
 */

import express from 'express';
import crypto from 'crypto';
import { authenticateUser } from '../middleware/auth.js';
import { serverDb } from '../services/database.js';
import dataExtractionService from '../services/dataExtractionService.js';
import {
  registerGitHubWebhook,
  setupGmailPushNotifications,
} from '../services/webhookReceiverService.js';
import { encryptToken, decryptToken, decryptState } from '../services/encryption.js';
import { revokeProviderGrant, getProviderClientCreds } from '../services/oauthRevocation.js';
import { createLogger } from '../services/logger.js';
import { getAppUrl } from '../utils/oauthUtils.js';
import { enrichGoogleProfileInBackground } from '../services/enrichment/googleGaiaProvider.js';
import { runPostOnboardingIngestion } from '../services/observationIngestion.js';

const log = createLogger('OAuthCallback');

const router = express.Router();

// Allowlist of valid OAuth providers — prevents path traversal / injection via :provider param
// replan-2026-06-10 Track C portfolio cut: reddit, slack, tiktok, strava, notion,
// pinterest, soundcloud, fitbit, twitch, linkedin, steam removed. Existing
// platform_connections rows for those platforms keep their data but are no
// longer extractable/connectable through this surface.
const VALID_PROVIDERS = new Set([
  'spotify', 'youtube', 'google_gmail', 'google_calendar', 'discord', 'github',
  'whoop', 'instagram', 'outlook',
]);

// Encryption key for OAuth tokens
const ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY;
if (!ENCRYPTION_KEY) {
  log.error('TOKEN_ENCRYPTION_KEY environment variable is required');
}

/**
 * Unified OAuth Callback Endpoint
 * Handles callbacks from: Spotify, YouTube, Discord, GitHub
 */
router.get('/callback', async (req, res) => {
  try {
    const { code, state, error: oauthError } = req.query;
    const appUrl = getAppUrl(req);

    // Handle OAuth errors
    if (oauthError) {
      log.error('OAuth error:', oauthError);
      return res.redirect(`${appUrl}/soul-signature?error=${oauthError}`);
    }

    // Validate required parameters
    if (!code || !state) {
      return res.redirect(`${appUrl}/soul-signature?error=missing_params`);
    }

    // Decrypt state to get provider and userId
    let stateData;
    try {
      stateData = decryptState(state);
    } catch (err) {
      log.error('Failed to decrypt state:', err);
      return res.redirect(`${appUrl}/soul-signature?error=invalid_state`);
    }

    const { provider, userId, timestamp } = stateData;

    // Verify the userId from state actually exists in our users table
    // (prevents crafted state tokens from creating dangling platform_connections)
    const userCheck = await serverDb.query(
      'SELECT id FROM users WHERE id = $1',
      [userId]
    );
    if (!userCheck.rows || userCheck.rows.length === 0) {
      log.warn(`OAuth callback: userId ${userId} not found in users table`);
      return res.redirect(`${appUrl}/soul-signature?error=invalid_state`);
    }

    // Validate state is fresh to prevent replay attacks (10-minute window)
    const STATE_MAX_AGE_MS = 10 * 60 * 1000;
    if (timestamp && (Date.now() - timestamp) > STATE_MAX_AGE_MS) {
      log.warn('State parameter too old, possible replay attack');
      return res.redirect(`${appUrl}/soul-signature?error=state_expired`);
    }

    log.info(`OAuth callback received for ${provider} - User: ${userId}`);

    // Exchange authorization code for access token
    // (state is passed for flows that need to look up a stored PKCE code_verifier)
    const tokens = await exchangeCodeForTokens(provider, code, appUrl, state);

    if (!tokens || !tokens.access_token) {
      throw new Error(`Failed to exchange code for tokens: ${provider}`);
    }

    log.info(`Tokens obtained for ${provider}`);

    // Store tokens securely in database
    const connectorId = await storeOAuthTokens(userId, provider, tokens);

    log.info(`Tokens stored in database - Connector ID: ${connectorId}`);

    // Register webhooks for supported platforms (GitHub, Gmail)
    await registerWebhooksIfSupported(userId, provider, tokens.access_token);

    // Trigger immediate data extraction
    log.info(`Starting data extraction for ${provider}...`);

    // Extract data in background (don't wait for completion)
    extractDataInBackground(userId, provider, tokens.access_token, connectorId);

    // Fire-and-forget: enrich profile from Google People API (Gaia ID, Maps, YouTube)
    enrichGoogleProfileInBackground(userId, provider, tokens.access_token);

    // Redirect back to Soul Signature Dashboard with success
    res.redirect(`${appUrl}/soul-signature?connected=${provider}`);

  } catch (error) {
    log.error('OAuth callback error:', error);
    // audit A2-M2c: appUrl is scoped to the try block above, so referencing it
    // here threw ReferenceError and the failure redirect never fired. Recompute.
    const errorAppUrl = getAppUrl(req);
    res.redirect(`${errorAppUrl}/soul-signature?error=connection_failed`);
  }
});

/**
 * Exchange authorization code for access tokens
 */
async function exchangeCodeForTokens(provider, code, appUrl, state) {
  const redirectUri = `${appUrl}/oauth/callback`;

  switch (provider) {
    case 'spotify':
      return await exchangeSpotifyCode(code, redirectUri);

    case 'youtube':
      return await exchangeGoogleCode(code, redirectUri); // YouTube uses Google OAuth

    case 'google_gmail':
      return await exchangeGoogleCode(code, redirectUri); // Gmail uses Google OAuth

    case 'google_calendar':
      return await exchangeGoogleCode(code, redirectUri); // Calendar uses Google OAuth

    case 'discord':
      return await exchangeDiscordCode(code, redirectUri);

    case 'github':
      return await exchangeGitHubCode(code, redirectUri);

    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

/**
 * Spotify token exchange
 */
async function exchangeSpotifyCode(code, redirectUri) {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Spotify credentials not configured');
  }

  log.info('Exchanging authorization code for tokens...');
  log.info('Code length:', code.length);
  log.info('Redirect URI:', redirectUri);

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri
    })
  });

  log.info('Token exchange response status:', response.status);

  if (!response.ok) {
    const errorText = await response.text();
    log.error('Token exchange failed!');
    log.error('Status:', response.status);
    log.error('Error body:', errorText);

    // Try to parse JSON error response
    try {
      const errorJson = JSON.parse(errorText);
      log.error('Error JSON:', JSON.stringify(errorJson, null, 2));
    } catch (e) {
      log.error('Raw error (not JSON):', errorText);
    }

    throw new Error(`Spotify token exchange failed (${response.status}): ${errorText}`);
  }

  log.info('Token exchange successful!');
  return await response.json();
}

/**
 * Google/YouTube token exchange
 */
async function exchangeGoogleCode(code, redirectUri) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Google credentials not configured');
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Google token exchange failed: ${error}`);
  }

  return await response.json();
}

/**
 * Discord token exchange
 */
async function exchangeDiscordCode(code, redirectUri) {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Discord credentials not configured');
  }

  const response = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Discord token exchange failed: ${error}`);
  }

  return await response.json();
}

/**
 * GitHub token exchange
 */
async function exchangeGitHubCode(code, redirectUri) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('GitHub credentials not configured');
  }

  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GitHub token exchange failed: ${error}`);
  }

  return await response.json();
}

/**
 * Store OAuth tokens in database with encryption
 */
async function storeOAuthTokens(userId, provider, tokens) {
  const { access_token, refresh_token, expires_in } = tokens;

  // Calculate expiration timestamp
  const expiresAt = expires_in ? new Date(Date.now() + expires_in * 1000) : null;

  // Encrypt tokens (simple encryption - use proper encryption in production)
  const encryptedAccessToken = encryptToken(access_token);
  const encryptedRefreshToken = refresh_token ? encryptToken(refresh_token) : null;

  // Insert or update data connector
  const result = await serverDb.query(`
    INSERT INTO platform_connections (user_id, platform, access_token, refresh_token, token_expires_at, connected_at, status, last_sync_status)
    VALUES ($1, $2, $3, $4, $5, NOW(), 'connected', 'pending')
    ON CONFLICT (user_id, platform) DO UPDATE SET
      access_token = EXCLUDED.access_token,
      refresh_token = EXCLUDED.refresh_token,
      token_expires_at = EXCLUDED.token_expires_at,
      connected_at = NOW(),
      status = 'connected',
      last_sync_status = 'pending'
    RETURNING id
  `, [userId, provider, encryptedAccessToken, encryptedRefreshToken, expiresAt]);

  // Auto-dismiss stale "expired"/"error" notifications for this platform
  // so users don't see old warnings after reconnecting
  try {
    await serverDb.query(`
      UPDATE user_notifications
      SET dismissed = true, read = true, read_at = NOW()
      WHERE user_id = $1
        AND platform = $2
        AND dismissed = false
        AND type IN ('token_expired', 'token_expiring', 'connection_error', 'sync_error')
    `, [userId, provider]);
  } catch (notifErr) {
    // Non-blocking — don't fail the connection flow for notification cleanup
    log.warn(`Notification cleanup error for ${provider}:`, notifErr.message);
  }

  return result.rows[0]?.id;
}

/**
 * Token encryption/decryption
 * (Using shared encryption service with AES-256-GCM)
 */
// Removed insecure deprecated crypto.createCipher implementation
// Now using secure encryption.js service with authenticated encryption

/**
 * Extract data in background (non-blocking)
 */
async function extractDataInBackground(userId, provider, accessToken, connectorId) {
  try {
    // This runs asynchronously without blocking the OAuth callback response
    const result = await dataExtractionService.extractPlatformData(
      userId,
      provider
    );

    log.info(`Data extraction completed for ${provider}:`, result);

    // Update connector with last sync time
    await serverDb.query(`
      UPDATE platform_connections
      SET last_sync_at = NOW(), last_sync_status = 'success'
      WHERE id = $1
    `, [connectorId]);

    // Chain observation ingestion (platform_data -> user_memories) so the user
    // has something in their memory stream by the time they land on the next
    // page, instead of waiting for the 30-minute cron.
    // Uses runPostOnboardingIngestion which is purpose-built for single-user
    // post-OAuth ingestion (covers both legacy platform_connections and Nango).
    //
    // Note: proactive insight generation is NOT chained here — the LLM call
    // takes ~40s which would exceed 60s maxDuration when combined with
    // extraction + ingestion. The frontend triggers insight generation via
    // POST /api/insights/proactive/generate after landing on the onboarding
    // page, giving users a visible progressive reveal with a spinner.
    try {
      const result = await runPostOnboardingIngestion(userId);
      log.info(`Post-onboarding ingestion complete after ${provider} connect`, { userId, observationsStored: result?.observationsStored });
    } catch (ingestErr) {
      log.warn(`Inline post-onboarding ingestion failed after ${provider} connect (non-fatal):`, ingestErr.message);
    }

  } catch (error) {
    log.error(`Background extraction failed for ${provider}:`, error);

    // Update connector with error status
    await serverDb.query(`
      UPDATE platform_connections
      SET last_sync_at = NOW(), last_sync_status = 'error'
      WHERE id = $1
    `, [connectorId]);
  }
}

/**
 * Manual data extraction trigger endpoint
 * Allows users to manually trigger data extraction for a connected platform
 */
router.post('/extract/:provider', authenticateUser, async (req, res) => {
  try {
    const { provider } = req.params;
    if (!VALID_PROVIDERS.has(provider)) {
      return res.status(400).json({ success: false, error: 'Invalid provider' });
    }
    const userId = req.user.id;

    log.info(`Manual extraction requested for ${provider} - User: ${userId}`);

    // Get stored tokens from database
    const connector = await serverDb.query(`
      SELECT id, access_token, refresh_token, token_expires_at, status
      FROM platform_connections
      WHERE user_id = $1 AND platform = $2
    `, [userId, provider]);

    if (!connector.rows || connector.rows.length === 0) {
      return res.status(404).json({
        error: 'No connector found',
        message: `Please connect your ${provider} account first`
      });
    }

    const connectorData = connector.rows[0];

    if (connectorData.status !== 'connected') {
      return res.status(400).json({
        error: 'Connector inactive',
        message: `Your ${provider} connection is inactive. Please reconnect.`
      });
    }

    // Decrypt access token
    const accessToken = decryptToken(connectorData.access_token);

    // Check if token is expired
    if (connectorData.token_expires_at && new Date(connectorData.token_expires_at) < new Date()) {
      return res.status(401).json({
        error: 'Token expired',
        message: `Your ${provider} token has expired. Please reconnect.`
      });
    }

    // Trigger extraction
    const result = await dataExtractionService.extractPlatformData(
      userId,
      provider
    );

    // Update last sync
    await serverDb.query(`
      UPDATE platform_connections
      SET last_sync_at = NOW(), last_sync_status = 'success'
      WHERE id = $1
    `, [connectorData.id]);

    res.json({
      success: true,
      provider,
      itemsExtracted: result.itemsExtracted,
      insights: result.insights,
      message: `Successfully extracted ${result.itemsExtracted} items from ${provider}`
    });

  } catch (error) {
    log.error('Manual extraction error:', error);
    res.status(500).json({
      error: 'Extraction failed',
      ...(process.env.NODE_ENV !== 'production' && { message: error.message })
    });
  }
});

/**
 * Get extraction status for a user
 */
router.get('/status/:userId', authenticateUser, async (req, res) => {
  try {
    const { userId } = req.params;

    if (userId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden', message: 'Access denied' });
    }

    const status = await serverDb.query(`
      SELECT
        dc.platform,
        dc.connected_at,
        dc.last_sync_at,
        dc.last_sync_status,
        dc.status,
        es.extraction_stage,
        es.total_items_extracted,
        es.next_extraction_scheduled
      FROM platform_connections dc
      LEFT JOIN extraction_status es ON dc.id = es.connector_id
      WHERE dc.user_id = $1
      ORDER BY dc.connected_at DESC
    `, [userId]);

    res.json({
      success: true,
      connectors: status.rows
    });

  } catch (error) {
    log.error('Status fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch status',
      ...(process.env.NODE_ENV !== 'production' && { message: error.message })
    });
  }
});

/**
 * Disconnect a platform (delete connector and stop syncing)
 */
router.delete('/disconnect/:provider', authenticateUser, async (req, res) => {
  try {
    const { provider } = req.params;
    if (!VALID_PROVIDERS.has(provider)) {
      return res.status(400).json({ success: false, error: 'Invalid provider' });
    }
    const userId = req.user.id;

    // Best-effort: revoke the grant at the provider before we stop syncing, so a
    // disconnect actually severs the access we hold (not just hide it locally).
    // Never let a failed/unsupported revoke block the disconnect.
    try {
      const tokenRes = await serverDb.query(
        `SELECT access_token, refresh_token FROM platform_connections WHERE user_id = $1 AND platform = $2`,
        [userId, provider]
      );
      const row = tokenRes?.rows?.[0];
      if (row && (row.access_token || row.refresh_token)) {
        const accessToken = row.access_token ? decryptToken(row.access_token) : null;
        const refreshToken = row.refresh_token ? decryptToken(row.refresh_token) : null;
        const { clientId, clientSecret } = getProviderClientCreds(provider);
        const revokeResult = await revokeProviderGrant({ provider, accessToken, refreshToken, clientId, clientSecret });
        log.info('Provider grant revocation on disconnect', { provider, ...revokeResult });
      }
    } catch (revokeErr) {
      log.warn('Provider revocation failed; continuing with disconnect', { provider, error: revokeErr?.message });
    }

    // Soft delete - mark as disconnected instead of deleting.
    // (status='disconnected' is the canonical column; last_sync_status only
    // accepts sync-result values, not 'disconnected'.)
    await serverDb.query(`
      UPDATE platform_connections
      SET status = 'disconnected'
      WHERE user_id = $1 AND platform = $2
    `, [userId, provider]);

    res.json({
      success: true,
      message: `Successfully disconnected ${provider}`
    });

  } catch (error) {
    log.error('Disconnect error:', error);
    res.status(500).json({
      error: 'Failed to disconnect',
      ...(process.env.NODE_ENV !== 'production' && { message: error.message })
    });
  }
});

/**
 * Register webhooks for platforms that support real-time push notifications
 * This runs automatically after OAuth connection is established
 */
async function registerWebhooksIfSupported(userId, provider, accessToken) {
  try {
    log.info(`Checking webhook support for ${provider}...`);

    switch (provider) {
      case 'github':
        // GitHub supports webhooks - register for all user repos
        // Note: This requires additional API call to get user's repos
        // For now, we'll log that it's available
        log.info(`GitHub webhook registration available - will register on first repo activity`);
        // TODO: Get user's repos and register webhooks for each
        // const repos = await fetchUserRepos(accessToken);
        // for (const repo of repos) {
        //   await registerGitHubWebhook(userId, accessToken, repo.owner, repo.name);
        // }
        break;

      case 'google_gmail':
      case 'gmail':
        // Gmail supports push notifications via Pub/Sub
        log.info(`Setting up Gmail push notifications...`);
        const gmailResult = await setupGmailPushNotifications(userId, accessToken);

        if (gmailResult.success) {
          log.info(`Gmail push notifications enabled for user ${userId}`);
        } else {
          log.warn(`Gmail push setup failed:`, gmailResult.error);
        }
        break;

      case 'discord':
        // Discord does NOT support outgoing webhooks for user events
        // Continue using polling approach
        log.info(`Discord does not support webhooks - using polling`);
        break;

      case 'spotify':
      case 'youtube':
      case 'google_calendar':
      default:
        // These platforms don't support webhooks - continue using polling
        log.info(`${provider} does not support webhooks - using polling`);
        break;
    }
  } catch (error) {
    log.error(`Webhook registration failed for ${provider}:`, error);
    // Don't throw - webhook registration is optional, platform will still work with polling
  }
}

export default router;
