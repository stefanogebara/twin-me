/**
 * Arctic OAuth Connector Routes
 * Clean OAuth implementation using Arctic library
 */

import express from 'express';
import { createClient } from '@supabase/supabase-js';
import {
  generateAuthorizationURL,
  validateAuthorizationCode,
  getUserInfo,
  refreshAccessToken
} from '../services/arcticOAuth.js';
import { encryptToken, decryptState } from '../services/encryption.js';
import { authenticateUser } from '../middleware/auth.js';

const router = express.Router();

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * GET /api/arctic/connect/:provider
 * Initiate OAuth flow for a platform using Arctic
 */
router.get('/connect/:provider', authenticateUser, async (req, res) => {
  try {
    const { provider } = req.params;
    const userId = req.user.id;

    console.log(`[Arctic Connector] Initiating OAuth for ${provider}, user ${userId}`);

    // Generate authorization URL using Arctic
    const { url, state, codeVerifier } = await generateAuthorizationURL(provider, userId);

    // Store code verifier in session/database for later validation
    // For now, we'll store it in a temporary table or use stateless approach
    const { error: sessionErr } = await supabase
      .from('oauth_sessions')
      .upsert({
        state,
        user_id: userId,
        provider,
        code_verifier: codeVerifier,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString() // 30 minutes - enough time for user to complete OAuth
      });
    if (sessionErr) console.warn('[Arctic] Error storing OAuth session:', sessionErr.message);

    console.log(`[Arctic Connector] Authorization URL generated for ${provider}`);

    // Return the authorization URL
    res.json({
      success: true,
      authUrl: url,
      provider
    });

  } catch (error) {
    console.error('[Arctic Connector] Error initiating OAuth:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initiate OAuth',
      message: error.message
    });
  }
});

/**
 * POST /api/arctic/callback
 * Handle OAuth callback from provider
 */
router.post('/callback', async (req, res) => {
  // FIRST LINE OF DEFENSE - Log IMMEDIATELY when route is hit
  console.log(`\n\n🚨 [Arctic Connector] ============ POST /callback HIT at ${new Date().toISOString()} ============`);
  console.log(`[Arctic Connector] Request method: ${req.method}`);
  console.log(`[Arctic Connector] Request URL: ${req.url}`);
  console.log(`[Arctic Connector] Request path: ${req.path}`);
  console.log(`[Arctic Connector] Request headers:`, JSON.stringify(req.headers, null, 2));

  try {
    const { code, state } = req.body;
    const timestamp = new Date().toISOString();

    console.log(`[Arctic Connector] ========== OAuth Callback Received at ${timestamp} ==========`);
    console.log(`[Arctic Connector] Request body keys: ${Object.keys(req.body).join(', ')}`);
    console.log(`[Arctic Connector] Code present: ${!!code}, State present: ${!!state}`);

    if (!code || !state) {
      console.log(`[Arctic Connector] ❌ Missing required parameters - code: ${!!code}, state: ${!!state}`);
      return res.status(400).json({
        success: false,
        error: 'code and state are required'
      });
    }

    console.log(`[Arctic Connector] Processing OAuth callback with state: ${state.substring(0, 50)}...`);

    // Decrypt state to get user ID and provider
    let stateData;
    try {
      stateData = decryptState(state);
      console.log(`[Arctic Connector] ✅ State decrypted successfully`);
      console.log(`[Arctic Connector] 🔑 Provider: ${stateData.provider}`);
      console.log(`[Arctic Connector] 🎯 This is an Arctic connector OAuth flow (userId present: ${!!stateData.userId})`);
    } catch (decodeError) {
      console.log(`[Arctic Connector] ❌ Failed to decode state parameter:`, decodeError.message);
      return res.status(400).json({
        success: false,
        error: 'Invalid state parameter - unable to decode'
      });
    }

    const { userId, provider } = stateData;

    console.log(`[Arctic Connector] Looking up OAuth session for ${provider}, user ${userId.substring(0, 8)}...`);

    // Retrieve code verifier from session
    console.log(`[Arctic Connector] Querying oauth_sessions table with state parameter`);
    const { data: session, error: sessionError } = await supabase
      .from('oauth_sessions')
      .select('code_verifier, created_at, expires_at')
      .eq('state', state)
      .single();

    if (sessionError) {
      console.log(`[Arctic Connector] ❌ Database error querying session:`, sessionError.message);
    }

    if (!session) {
      console.log(`[Arctic Connector] ❌ OAuth session not found or expired for state: ${state.substring(0, 30)}...`);
      console.log(`[Arctic Connector] This usually means either:`);
      console.log(`[Arctic Connector]   1. Session expired (30 minute limit)`);
      console.log(`[Arctic Connector]   2. Session was already used and deleted`);
      console.log(`[Arctic Connector]   3. State parameter mismatch`);
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired OAuth session'
      });
    }

    console.log(`[Arctic Connector] ✅ Session found - created at ${session.created_at}, expires at ${session.expires_at}`);
    console.log(`[Arctic Connector] Code verifier present: ${!!session.code_verifier}`);

    // Check if session is expired
    const expiresAt = new Date(session.expires_at);
    const now = new Date();
    if (now > expiresAt) {
      console.log(`[Arctic Connector] ⚠️  WARNING: Session expired ${Math.round((now - expiresAt) / 1000)}s ago`);
    } else {
      const remainingSeconds = Math.round((expiresAt - now) / 1000);
      console.log(`[Arctic Connector] Session has ${remainingSeconds}s remaining before expiration`);
    }

    // Exchange code for tokens using Arctic
    console.log(`[Arctic Connector] Exchanging authorization code for access tokens...`);
    let tokens;
    try {
      tokens = await validateAuthorizationCode(provider, code, session.code_verifier);
      console.log(`[Arctic Connector] ✅ Tokens obtained for ${provider}`);
      console.log(`[Arctic Connector] Token details - has access token: ${!!tokens.accessToken}, has refresh token: ${!!tokens.refreshToken}, expires at: ${tokens.expiresAt}`);
    } catch (tokenError) {
      console.log(`[Arctic Connector] ❌ Token exchange failed:`, tokenError.message);
      throw tokenError;
    }

    // Get user info from provider
    console.log(`[Arctic Connector] Fetching user info from ${provider}...`);
    let userInfo;
    try {
      userInfo = await getUserInfo(provider, tokens.accessToken);
      console.log(`[Arctic Connector] ✅ User info retrieved: ${userInfo.name || 'no name'}`);
      console.log(`[Arctic Connector] Platform user ID: ${userInfo.id}`);
    } catch (userInfoError) {
      console.log(`[Arctic Connector] ❌ Failed to fetch user info:`, userInfoError.message);
      throw userInfoError;
    }

    // Encrypt tokens before storing
    console.log(`[Arctic Connector] Encrypting tokens for secure storage...`);
    const encryptedAccessToken = encryptToken(tokens.accessToken);
    const encryptedRefreshToken = tokens.refreshToken ? encryptToken(tokens.refreshToken) : null;
    console.log(`[Arctic Connector] ✅ Tokens encrypted, refresh token: ${encryptedRefreshToken ? 'present' : 'none'}`);

    // Save to platform_connections table
    console.log(`[Arctic Connector] Saving connection to platform_connections table...`);
    const { error: dbError } = await supabase
      .from('platform_connections')
      .upsert({
        user_id: userId,
        platform: provider,
        connected_at: new Date().toISOString(),
        status: 'connected',  // Reset status to connected after successful OAuth (matches DB constraint)
        access_token: encryptedAccessToken,
        refresh_token: encryptedRefreshToken,
        token_expires_at: tokens.expiresAt.toISOString(),
        metadata: {
          platform_user_id: userInfo.id,
          email: userInfo.email,
          name: userInfo.name,
          image: userInfo.image,
          token_type: tokens.tokenType,
          scope: tokens.scope
        }
      }, {
        onConflict: 'user_id,platform'
      });

    if (dbError) {
      console.error('[Arctic Connector] ❌ Database error saving connection:', dbError);
      return res.status(500).json({
        success: false,
        error: 'Failed to save connection',
        message: dbError.message
      });
    }

    console.log(`[Arctic Connector] ✅ Connection saved to database for ${provider}`);

    // Clean up OAuth session
    console.log(`[Arctic Connector] Cleaning up OAuth session from database...`);
    const { error: deleteError } = await supabase
      .from('oauth_sessions')
      .delete()
      .eq('state', state);

    if (deleteError) {
      console.log(`[Arctic Connector] ⚠️  Warning: Failed to delete OAuth session:`, deleteError.message);
    } else {
      console.log(`[Arctic Connector] ✅ OAuth session cleaned up successfully`);
    }

    // Trigger data extraction in background
    console.log(`[Arctic Connector] Triggering data extraction for ${provider}...`);

    // Import and call extraction service
    try {
      const { extractPlatformDataDirect } = await import('../services/arcticDataExtraction.js');

      extractPlatformDataDirect(provider, userId, tokens.accessToken)
        .then(async result => {
          console.log(`[Arctic Connector] ✅ Initial extraction complete: ${result.extractedItems} items from ${provider}`);

          // Trigger soul signature analysis after successful extraction
          try {
            const { analyzeSoulSignature } = await import('../services/soulSignatureAnalysis.js');
            console.log(`[Arctic Connector] 🧠 Triggering soul signature analysis for user ${userId}...`);

            analyzeSoulSignature(userId)
              .then(analysisResult => {
                console.log(`[Arctic Connector] ✅ Soul signature analysis complete: ${analysisResult.insightsGenerated} insights generated`);
              })
              .catch(analysisError => {
                console.error(`[Arctic Connector] ⚠️  Soul signature analysis failed:`, analysisError.message);
              });
          } catch (err) {
            console.error(`[Arctic Connector] ⚠️  Failed to trigger analysis:`, err);
          }
        })
        .catch(error => {
          console.error(`[Arctic Connector] ❌ Initial extraction failed for ${provider}:`, error.message);
        });
    } catch (extractError) {
      console.error(`[Arctic Connector] ❌ Data extraction service error:`, extractError);
    }

    res.json({
      success: true,
      provider,
      connected: true,
      userInfo: {
        name: userInfo.name,
        email: userInfo.email,
        image: userInfo.image
      }
    });

  } catch (error) {
    console.error('[Arctic Connector] ❌ OAuth callback error:', error);
    res.status(500).json({
      success: false,
      error: 'OAuth callback failed',
      message: error.message
    });
  }
});

/**
 * GET /api/arctic/status/:userId
 * Get connection status for all platforms
 */
router.get('/status/:userId', authenticateUser, async (req, res) => {
  try {
    const { userId } = req.params;

    if (userId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden', message: 'Access denied' });
    }

    console.log(`[Arctic Connector] Fetching connection status for user ${userId}`);

    const { data: connections, error } = await supabase
      .from('platform_connections')
      .select('platform, connected_at, metadata, token_expires_at, last_sync_at')
      .eq('user_id', userId);

    if (error) {
      throw error;
    }

    const status = {};
    for (const conn of connections || []) {
      status[conn.platform] = {
        connected: conn.connected_at != null,
        externalAccountId: conn.metadata?.platform_user_id || conn.metadata?.id, // Get from metadata
        expiresAt: conn.token_expires_at,
        lastSync: conn.last_sync_at,
        userInfo: {
          name: conn.metadata?.name,
          email: conn.metadata?.email,
          image: conn.metadata?.image
        }
      };
    }

    res.json({
      success: true,
      connections: status
    });

  } catch (error) {
    console.error('[Arctic Connector] Error fetching status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch connection status',
      message: error.message
    });
  }
});

/**
 * DELETE /api/arctic/disconnect/:userId/:provider
 * Disconnect a platform
 */
router.delete('/disconnect/:userId/:provider', authenticateUser, async (req, res) => {
  try {
    const { userId, provider } = req.params;

    if (userId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden', message: 'Access denied' });
    }

    console.log(`[Arctic Connector] Disconnecting ${provider} for user ${userId}`);

    const { error } = await supabase
      .from('platform_connections')
      .delete()
      .eq('user_id', userId)
      .eq('platform', provider);

    if (error) {
      throw error;
    }

    console.log(`[Arctic Connector] ✅ ${provider} disconnected`);

    res.json({
      success: true,
      message: `${provider} disconnected successfully`
    });

  } catch (error) {
    console.error('[Arctic Connector] Error disconnecting:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to disconnect platform',
      message: error.message
    });
  }
});

/**
 * POST /api/arctic/refresh/:userId/:provider
 * Manually refresh tokens for a platform
 */
router.post('/refresh/:userId/:provider', authenticateUser, async (req, res) => {
  try {
    const { userId, provider } = req.params;

    if (userId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden', message: 'Access denied' });
    }

    console.log(`[Arctic Connector] Refreshing tokens for ${provider}, user ${userId}`);

    // Get current connection
    const { data: connection } = await supabase
      .from('platform_connections')
      .select('refresh_token')
      .eq('user_id', userId)
      .eq('platform', provider)
      .single();

    if (!connection || !connection.refresh_token) {
      return res.status(404).json({
        success: false,
        error: 'Connection not found or no refresh token available'
      });
    }

    // Decrypt refresh token
    const { decryptToken } = await import('../services/encryption.js');
    const refreshToken = decryptToken(connection.refresh_token);

    // Refresh tokens using Arctic
    const newTokens = await refreshAccessToken(provider, refreshToken);

    console.log(`[Arctic Connector] ✅ Tokens refreshed for ${provider}`);

    // Encrypt and save new tokens
    const encryptedAccessToken = encryptToken(newTokens.accessToken);
    const encryptedRefreshToken = newTokens.refreshToken ? encryptToken(newTokens.refreshToken) : connection.refresh_token;

    const { error: tokenSaveErr } = await supabase
      .from('platform_connections')
      .update({
        access_token: encryptedAccessToken,
        refresh_token: encryptedRefreshToken,
        token_expires_at: newTokens.expiresAt.toISOString()
      })
      .eq('user_id', userId)
      .eq('platform', provider);
    if (tokenSaveErr) console.warn('[Arctic] Error saving refreshed tokens:', tokenSaveErr.message);

    res.json({
      success: true,
      message: `Tokens refreshed for ${provider}`,
      expiresAt: newTokens.expiresAt
    });

  } catch (error) {
    console.error('[Arctic Connector] Error refreshing tokens:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to refresh tokens',
      message: error.message
    });
  }
});

export default router;
