/**
 * Unified OAuth Callback Handler for Soul Signature Platforms
 * Handles OAuth callbacks, token exchange, storage, and data extraction
 */

import express from 'express';
import crypto from 'crypto';
import { serverDb } from '../services/database.js';
import dataExtractionService from '../services/dataExtractionService.js';
import {
  registerGitHubWebhook,
  setupGmailPushNotifications,
} from '../services/webhookReceiverService.js';
import { encryptToken, decryptToken } from '../services/encryption.js';

const router = express.Router();

// Encryption key for OAuth tokens (should be in env in production)
const ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');

/**
 * Unified OAuth Callback Endpoint
 * Handles callbacks from: Spotify, YouTube, Discord, GitHub
 */
router.get('/callback', async (req, res) => {
  try {
    const { code, state, error: oauthError } = req.query;
    const appUrl = process.env.APP_URL || process.env.VITE_APP_URL || 'http://localhost:8086';

    // Handle OAuth errors
    if (oauthError) {
      console.error('OAuth error:', oauthError);
      return res.redirect(`${appUrl}/soul-signature?error=${oauthError}`);
    }

    // Validate required parameters
    if (!code || !state) {
      return res.redirect(`${appUrl}/soul-signature?error=missing_params`);
    }

    // Decode state to get provider and userId
    let stateData;
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
    } catch (err) {
      console.error('Failed to decode state:', err);
      return res.redirect(`${appUrl}/soul-signature?error=invalid_state`);
    }

    const { provider, userId } = stateData;

    console.log(`📥 OAuth callback received for ${provider} - User: ${userId}`);

    // Exchange authorization code for access token
    const tokens = await exchangeCodeForTokens(provider, code);

    if (!tokens || !tokens.access_token) {
      throw new Error(`Failed to exchange code for tokens: ${provider}`);
    }

    console.log(`🔑 Tokens obtained for ${provider}`);

    // Store tokens securely in database
    const connectorId = await storeOAuthTokens(userId, provider, tokens);

    console.log(`💾 Tokens stored in database - Connector ID: ${connectorId}`);

    // Register webhooks for supported platforms (GitHub, Gmail, Slack)
    await registerWebhooksIfSupported(userId, provider, tokens.access_token);

    // Trigger immediate data extraction
    console.log(`📊 Starting data extraction for ${provider}...`);

    // Extract data in background (don't wait for completion)
    extractDataInBackground(userId, provider, tokens.access_token, connectorId);

    // Redirect back to Soul Signature Dashboard with success
    res.redirect(`${appUrl}/soul-signature?connected=${provider}`);

  } catch (error) {
    console.error('OAuth callback error:', error);
    res.redirect(`${appUrl}/soul-signature?error=${error.message}`);
  }
});

/**
 * Exchange authorization code for access tokens
 */
async function exchangeCodeForTokens(provider, code) {
  const appUrl = process.env.APP_URL || process.env.VITE_APP_URL || 'http://localhost:8086';
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

    case 'reddit':
      return await exchangeRedditCode(code, redirectUri);

    case 'slack':
      return await exchangeSlackCode(code, redirectUri);

    case 'tiktok':
      return await exchangeTikTokCode(code, redirectUri);

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

  console.log('🔑 [Spotify OAuth] Exchanging authorization code for tokens...');
  console.log('   Code length:', code.length);
  console.log('   Redirect URI:', redirectUri);
  console.log('   Client ID:', clientId);

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

  console.log('🔑 [Spotify OAuth] Token exchange response status:', response.status);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ [Spotify OAuth] Token exchange failed!');
    console.error('   Status:', response.status);
    console.error('   Error body:', errorText);

    // Try to parse JSON error response
    try {
      const errorJson = JSON.parse(errorText);
      console.error('   Error JSON:', JSON.stringify(errorJson, null, 2));
    } catch (e) {
      console.error('   Raw error (not JSON):', errorText);
    }

    throw new Error(`Spotify token exchange failed (${response.status}): ${errorText}`);
  }

  console.log('✅ [Spotify OAuth] Token exchange successful!');
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
 * Reddit token exchange
 */
async function exchangeRedditCode(code, redirectUri) {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Reddit credentials not configured');
  }

  const response = await fetch('https://www.reddit.com/api/v1/access_token', {
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

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Reddit token exchange failed: ${error}`);
  }

  return await response.json();
}

/**
 * Slack token exchange
 */
async function exchangeSlackCode(code, redirectUri) {
  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Slack credentials not configured');
  }

  const response = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Slack token exchange failed: ${error}`);
  }

  const data = await response.json();

  // Slack returns { ok: true/false, ... }
  if (!data.ok) {
    throw new Error(`Slack OAuth error: ${data.error || 'Unknown error'}`);
  }

  // Slack returns authed_user.access_token for user tokens
  return {
    access_token: data.authed_user?.access_token || data.access_token,
    refresh_token: data.authed_user?.refresh_token || data.refresh_token,
    expires_in: data.authed_user?.expires_in || data.expires_in,
    scope: data.scope,
    team: data.team
  };
}

/**
 * TikTok token exchange
 */
async function exchangeTikTokCode(code, redirectUri) {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;

  if (!clientKey || !clientSecret) {
    throw new Error('TikTok credentials not configured');
  }

  const response = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`TikTok token exchange failed: ${error}`);
  }

  const data = await response.json();

  // TikTok returns tokens in data object
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in,
    open_id: data.open_id,
    scope: data.scope
  };
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
    INSERT INTO platform_connections (user_id, platform, access_token, refresh_token, expires_at, connected_at, is_active, last_sync_status)
    VALUES ($1, $2, $3, $4, $5, NOW(), true, 'pending')
    ON CONFLICT (user_id, platform) DO UPDATE SET
      access_token = EXCLUDED.access_token,
      refresh_token = EXCLUDED.refresh_token,
      expires_at = EXCLUDED.expires_at,
      connected_at = NOW(),
      is_active = true,
      last_sync_status = 'pending'
    RETURNING id
  `, [userId, provider, encryptedAccessToken, encryptedRefreshToken, expiresAt]);

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

    console.log(`✅ Data extraction completed for ${provider}:`, result);

    // Update connector with last sync time
    await serverDb.query(`
      UPDATE platform_connections
      SET last_sync = NOW(), last_sync_status = 'success', total_synced = total_synced + $1
      WHERE id = $2
    `, [result.itemsExtracted || 0, connectorId]);

  } catch (error) {
    console.error(`❌ Background extraction failed for ${provider}:`, error);

    // Update connector with error status
    await serverDb.query(`
      UPDATE platform_connections
      SET last_sync = NOW(), last_sync_status = 'error', error_count = error_count + 1
      WHERE id = $1
    `, [connectorId]);
  }
}

/**
 * Manual data extraction trigger endpoint
 * Allows users to manually trigger data extraction for a connected platform
 */
router.post('/extract/:provider', async (req, res) => {
  try {
    const { provider } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    console.log(`🔄 Manual extraction requested for ${provider} - User: ${userId}`);

    // Get stored tokens from database
    const connector = await serverDb.query(`
      SELECT id, access_token, refresh_token, expires_at, is_active
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

    if (!connectorData.is_active) {
      return res.status(400).json({
        error: 'Connector inactive',
        message: `Your ${provider} connection is inactive. Please reconnect.`
      });
    }

    // Decrypt access token
    const accessToken = decryptToken(connectorData.access_token);

    // Check if token is expired
    if (connectorData.expires_at && new Date(connectorData.expires_at) < new Date()) {
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
      SET last_sync = NOW(), last_sync_status = 'success', total_synced = total_synced + $1
      WHERE id = $2
    `, [result.itemsExtracted || 0, connectorData.id]);

    res.json({
      success: true,
      provider,
      itemsExtracted: result.itemsExtracted,
      insights: result.insights,
      message: `Successfully extracted ${result.itemsExtracted} items from ${provider}`
    });

  } catch (error) {
    console.error('Manual extraction error:', error);
    res.status(500).json({
      error: 'Extraction failed',
      message: error.message
    });
  }
});

/**
 * Get extraction status for a user
 */
router.get('/status/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const status = await serverDb.query(`
      SELECT
        dc.platform,
        dc.connected_at,
        dc.last_sync,
        dc.last_sync_status,
        dc.total_synced,
        dc.is_active,
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
    console.error('Status fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch status',
      message: error.message
    });
  }
});

/**
 * Disconnect a platform (delete connector and stop syncing)
 */
router.delete('/disconnect/:provider', async (req, res) => {
  try {
    const { provider } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    // Soft delete - mark as inactive instead of deleting
    await serverDb.query(`
      UPDATE platform_connections
      SET is_active = false, last_sync_status = 'disconnected'
      WHERE user_id = $1 AND platform = $2
    `, [userId, provider]);

    res.json({
      success: true,
      message: `Successfully disconnected ${provider}`
    });

  } catch (error) {
    console.error('Disconnect error:', error);
    res.status(500).json({
      error: 'Failed to disconnect',
      message: error.message
    });
  }
});

/**
 * Register webhooks for platforms that support real-time push notifications
 * This runs automatically after OAuth connection is established
 */
async function registerWebhooksIfSupported(userId, provider, accessToken) {
  try {
    console.log(`🔔 Checking webhook support for ${provider}...`);

    switch (provider) {
      case 'github':
        // GitHub supports webhooks - register for all user repos
        // Note: This requires additional API call to get user's repos
        // For now, we'll log that it's available
        console.log(`✅ GitHub webhook registration available - will register on first repo activity`);
        // TODO: Get user's repos and register webhooks for each
        // const repos = await fetchUserRepos(accessToken);
        // for (const repo of repos) {
        //   await registerGitHubWebhook(userId, accessToken, repo.owner, repo.name);
        // }
        break;

      case 'google_gmail':
      case 'gmail':
        // Gmail supports push notifications via Pub/Sub
        console.log(`📧 Setting up Gmail push notifications...`);
        const gmailResult = await setupGmailPushNotifications(userId, accessToken);

        if (gmailResult.success) {
          console.log(`✅ Gmail push notifications enabled for user ${userId}`);
        } else {
          console.warn(`⚠️  Gmail push setup failed:`, gmailResult.error);
        }
        break;

      case 'slack':
        // Slack supports event subscriptions, but requires additional setup
        // in the Slack app configuration (event subscription URL)
        console.log(`💬 Slack webhooks require app-level configuration`);
        console.log(`   Configure event subscriptions at: https://api.slack.com/apps`);
        break;

      case 'discord':
        // Discord does NOT support outgoing webhooks for user events
        // Continue using polling approach
        console.log(`🎮 Discord does not support webhooks - using polling`);
        break;

      case 'spotify':
      case 'youtube':
      case 'google_calendar':
      default:
        // These platforms don't support webhooks - continue using polling
        console.log(`ℹ️  ${provider} does not support webhooks - using polling`);
        break;
    }
  } catch (error) {
    console.error(`❌ Webhook registration failed for ${provider}:`, error);
    // Don't throw - webhook registration is optional, platform will still work with polling
  }
}

export default router;
