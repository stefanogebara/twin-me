import express from 'express';
import { createClient } from '@supabase/supabase-js';
import PLATFORM_CONFIGS from '../config/platformConfigs.js';
import { generatePKCEParams } from '../services/pkce.js';
import { encryptToken, decryptToken } from '../services/encryption.js';
import {
  oauthAuthorizationLimiter,
  oauthCallbackLimiter
} from '../middleware/oauthRateLimiter.js';
import { invalidatePlatformStatusCache } from '../services/redisClient.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const router = express.Router();

/**
 * Health & Fitness Connectors for Soul Signature Extraction
 *
 * These connectors capture the physical manifestation of personality through
 * health and fitness patterns - sleep quality, recovery cycles, workout intensity.
 * The body reveals truths the mind might miss.
 */

// ============================================================================
// WHOOP CONNECTOR - Physical Discipline & Recovery Patterns
// ============================================================================

/**
 * Whoop Connect - Initiate OAuth flow (GET version for frontend compatibility)
 * Discovers: strain patterns, recovery optimization, sleep consistency, workout intensity
 */
router.get('/connect/whoop', oauthAuthorizationLimiter, async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required in query params'
      });
    }

    const config = PLATFORM_CONFIGS.whoop;
    const redirectUri = process.env.WHOOP_REDIRECT_URI || `${process.env.VITE_APP_URL || 'http://localhost:8086'}/oauth/callback`;
    const scope = config.scopes.join(' ');

    // Generate PKCE parameters (RFC 7636 - OAuth 2.1 mandatory)
    const pkce = generatePKCEParams();

    // Generate base64-encoded OAuth state (frontend-compatible format)
    // codeVerifier is stored encrypted in DB, not in state
    const stateData = {
      platform: 'whoop',
      provider: 'whoop',
      userId,
      timestamp: Date.now()
    };
    const state = Buffer.from(JSON.stringify(stateData)).toString('base64');

    // Store state + code_verifier in Supabase (CSRF protection + PKCE)
    // Use same timestamp for both created_at and expires_at calculation to satisfy check constraint
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 1800000); // 30 minutes from now

    const { error: stateInsertError } = await supabase
      .from('oauth_states')
      .insert({
        state,
        code_verifier: encryptToken(pkce.codeVerifier),
        data: { userId, platform: 'whoop' },
        created_at: now.toISOString(),
        expires_at: expiresAt.toISOString()
      });

    if (stateInsertError) {
      console.error('❌ Failed to store OAuth state:', stateInsertError);
      return res.status(500).json({
        success: false,
        error: 'Failed to initialize OAuth session',
        details: stateInsertError.message
      });
    }

    console.log(`✅ OAuth state stored successfully for Whoop`);

    // Note: Whoop uses client_secret authentication, not PKCE
    // PKCE code_verifier is stored but not used in auth URL
    const authUrl = `${config.authUrl}?` +
      `client_id=${process.env.WHOOP_CLIENT_ID}&` +
      `response_type=code&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `scope=${encodeURIComponent(scope)}&` +
      `state=${encodeURIComponent(state)}`;

    console.log(`💪 Whoop OAuth initiated (GET) for user ${userId}`);
    console.log(`🔗 Whoop redirect_uri: ${redirectUri}`);
    console.log(`🔗 Whoop authUrl: ${authUrl}`);

    res.json({
      success: true,
      authUrl,
      message: 'Connect your body\'s rhythm - discover your physical discipline patterns'
    });
  } catch (error) {
    console.error('Whoop connection error (GET):', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initialize Whoop connection',
      details: error.message
    });
  }
});

/**
 * Whoop Connect - Initiate OAuth flow (POST version)
 * Discovers: strain patterns, recovery optimization, sleep consistency, workout intensity
 */
router.post('/connect/whoop', oauthAuthorizationLimiter, async (req, res) => {
  try {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Request body is required. Ensure Content-Type is application/json'
      });
    }

    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required in request body'
      });
    }

    const config = PLATFORM_CONFIGS.whoop;
    const redirectUri = process.env.WHOOP_REDIRECT_URI || `${process.env.VITE_APP_URL || 'http://localhost:8086'}/oauth/callback`;
    const scope = config.scopes.join(' ');

    // Generate PKCE parameters (RFC 7636 - OAuth 2.1 mandatory)
    const pkce = generatePKCEParams();

    // Generate base64-encoded OAuth state (frontend-compatible format)
    // codeVerifier is stored encrypted in DB, not in state
    const stateData = {
      platform: 'whoop',
      provider: 'whoop',
      userId,
      timestamp: Date.now()
    };
    const state = Buffer.from(JSON.stringify(stateData)).toString('base64');

    // Store state + code_verifier in Supabase (CSRF protection + PKCE)
    // Use same timestamp for both created_at and expires_at calculation to satisfy check constraint
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 1800000); // 30 minutes from now

    const { error: stateInsertError } = await supabase
      .from('oauth_states')
      .insert({
        state,
        code_verifier: encryptToken(pkce.codeVerifier),
        data: { userId, platform: 'whoop' },
        created_at: now.toISOString(),
        expires_at: expiresAt.toISOString()
      });

    if (stateInsertError) {
      console.error('❌ Failed to store OAuth state (POST):', stateInsertError);
      return res.status(500).json({
        success: false,
        error: 'Failed to initialize OAuth session',
        details: stateInsertError.message
      });
    }

    console.log(`✅ OAuth state stored successfully for Whoop (POST)`);

    // Note: Whoop uses client_secret authentication, not PKCE
    const authUrl = `${config.authUrl}?` +
      `client_id=${process.env.WHOOP_CLIENT_ID}&` +
      `response_type=code&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `scope=${encodeURIComponent(scope)}&` +
      `state=${encodeURIComponent(state)}`;

    console.log(`💪 Whoop OAuth initiated for user ${userId}`);

    res.json({
      success: true,
      authUrl,
      message: 'Connect your body\'s rhythm - discover your physical discipline patterns'
    });
  } catch (error) {
    console.error('Whoop connection error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initialize Whoop connection',
      details: error.message
    });
  }
});

/**
 * Whoop OAuth Callback - Exchange code for tokens
 */
router.post('/oauth/callback/whoop', oauthCallbackLimiter, async (req, res) => {
  try {
    console.log('🔷 [Whoop Callback] Starting callback processing...');
    console.log('🔷 [Whoop Callback] Request body:', {
      hasCode: !!req.body?.code,
      hasState: !!req.body?.state,
      error: req.body?.error
    });

    const { code, state, error: oauthError } = req.body;

    if (oauthError) {
      console.error('🔷 [Whoop Callback] OAuth error received:', oauthError);
      return res.status(400).json({
        success: false,
        error: `OAuth error: ${oauthError}`
      });
    }

    if (!code || !state) {
      console.error('🔷 [Whoop Callback] Missing code or state');
      return res.status(400).json({
        success: false,
        error: 'Missing authorization code or state'
      });
    }

    // Decode base64 state (frontend-compatible format)
    let stateData;
    try {
      const decodedState = Buffer.from(state, 'base64').toString('utf8');
      stateData = JSON.parse(decodedState);
      console.log('🔷 [Whoop Callback] State decoded:', { platform: stateData.platform, userId: stateData.userId });
    } catch (error) {
      console.warn(`🔷 [Whoop Callback] State decoding failed:`, error.message);
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired state parameter'
      });
    }

    const { userId } = stateData;

    // Atomically mark state as used (prevents replay attacks)
    console.log('🔷 [Whoop Callback] Marking state as used...');
    const { data: storedState, error: stateError } = await supabase.rpc('mark_oauth_state_as_used', {
      state_param: state
    });

    if (stateError) {
      console.error('🔷 [Whoop Callback] State RPC error:', stateError);
    }

    if (stateError || !storedState) {
      console.warn(`🔷 [Whoop Callback] Invalid, expired, or already used state parameter`);
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired state parameter'
      });
    }
    console.log('🔷 [Whoop Callback] State verified successfully');

    // Exchange code for tokens (Whoop uses client_secret, not PKCE)
    const config = PLATFORM_CONFIGS.whoop;
    const redirectUri = process.env.WHOOP_REDIRECT_URI || `${process.env.VITE_APP_URL || 'http://localhost:8086'}/oauth/callback`;

    console.log('🔷 [Whoop Callback] Token exchange config:', {
      tokenUrl: config.tokenUrl,
      redirectUri,
      hasClientId: !!process.env.WHOOP_CLIENT_ID,
      hasClientSecret: !!process.env.WHOOP_CLIENT_SECRET,
      clientIdPrefix: process.env.WHOOP_CLIENT_ID?.substring(0, 8),
      clientSecretLength: process.env.WHOOP_CLIENT_SECRET?.length
    });

    // WHOOP requires client credentials in the request BODY (not HTTP Basic Auth)
    // See: https://developer.whoop.com/docs/developing/oauth/
    const tokenParams = {
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: process.env.WHOOP_CLIENT_ID,
      client_secret: process.env.WHOOP_CLIENT_SECRET,
      scope: 'offline'
    };

    console.log('🔷 [Whoop Callback] Sending token exchange request...');
    const tokenResponse = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams(tokenParams)
    });

    console.log('🔷 [Whoop Callback] Token response status:', tokenResponse.status);

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('🔷 [Whoop Callback] Token exchange error response:', errorText);
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText };
      }
      throw new Error(`Failed to exchange Whoop authorization code: ${errorData.error_description || errorData.error || errorText}`);
    }

    const tokens = await tokenResponse.json();
    const { access_token: accessToken, refresh_token: refreshToken, expires_in: expiresIn } = tokens;

    // Store encrypted tokens
    const tokenExpiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;
    const encryptedAccessToken = encryptToken(accessToken);
    const encryptedRefreshToken = refreshToken ? encryptToken(refreshToken) : null;

    const { data: connectorData, error: connectorError } = await supabase
      .from('platform_connections')
      .upsert({
        user_id: userId,
        platform: 'whoop',
        access_token: encryptedAccessToken,
        refresh_token: encryptedRefreshToken,
        token_expires_at: tokenExpiresAt,
        status: 'connected',
        connected_at: new Date().toISOString(),
        last_sync_status: 'pending',
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,platform'
      })
      .select()
      .single();

    if (connectorError) {
      console.error('Error storing Whoop connector:', connectorError);
      throw new Error('Failed to store connection');
    }

    console.log(`💾 Whoop tokens stored for user ${userId}`);

    // Invalidate platform status cache so the new token expiration is reflected
    await invalidatePlatformStatusCache(userId);
    console.log(`🗑️ [Whoop Callback] Invalidated platform status cache for user ${userId}`);

    res.json({
      success: true,
      platform: 'whoop',
      userId,
      message: 'Successfully connected to Whoop. Ready to analyze your physical patterns.',
      connector: {
        id: connectorData.id,
        platform: 'whoop',
        connected_at: connectorData.connected_at
      }
    });

  } catch (error) {
    console.error('Whoop OAuth callback error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to complete Whoop OAuth flow',
      details: error.message
    });
  }
});

/**
 * Extract Whoop Physical Soul Signature
 */
router.post('/extract/whoop', async (req, res) => {
  try {
    const { userId, accessToken } = req.body;

    if (!userId || !accessToken) {
      return res.status(400).json({
        success: false,
        error: 'userId and accessToken are required'
      });
    }

    const config = PLATFORM_CONFIGS.whoop;
    const headers = { 'Authorization': `Bearer ${accessToken}` };

    // Fetch data from multiple Whoop endpoints
    const [profileRes, recoveryRes, cyclesRes, sleepRes, workoutsRes] = await Promise.all([
      fetch(`${config.apiBaseUrl}${config.endpoints.userProfile}`, { headers }),
      fetch(`${config.apiBaseUrl}${config.endpoints.recovery}?limit=30`, { headers }),
      fetch(`${config.apiBaseUrl}${config.endpoints.cycles}?limit=30`, { headers }),
      fetch(`${config.apiBaseUrl}${config.endpoints.sleep}?limit=30`, { headers }),
      fetch(`${config.apiBaseUrl}${config.endpoints.workouts}?limit=30`, { headers })
    ]);

    const [profile, recoveries, cycles, sleepData, workouts] = await Promise.all([
      profileRes.json(),
      recoveryRes.json(),
      cyclesRes.json(),
      sleepRes.json(),
      workoutsRes.json()
    ]);

    // Analyze physical patterns for soul signature
    const physicalSoul = analyzeWhoopPatterns({
      profile,
      recoveries: recoveries.records || [],
      cycles: cycles.records || [],
      sleepData: sleepData.records || [],
      workouts: workouts.records || []
    });

    res.json({
      success: true,
      extractionMethod: 'direct-api',
      soulSignature: {
        whoop: physicalSoul,
        summary: {
          physicalDiscipline: physicalSoul.disciplineScore,
          recoveryPattern: physicalSoul.recoveryStyle,
          strainTolerance: physicalSoul.strainTolerance,
          sleepConsistency: physicalSoul.sleepConsistency
        }
      },
      metadata: {
        dataPoints: (recoveries.records?.length || 0) + (cycles.records?.length || 0) + (sleepData.records?.length || 0) + (workouts.records?.length || 0),
        extractedAt: new Date().toISOString(),
        method: 'direct-api'
      }
    });

  } catch (error) {
    console.error('Whoop extraction error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to extract Whoop data',
      details: error.message
    });
  }
});

/**
 * Disconnect Whoop - Remove platform connection
 */
router.delete('/disconnect/whoop', async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    // Delete the platform connection
    const { error: deleteError } = await supabase
      .from('platform_connections')
      .delete()
      .eq('user_id', userId)
      .eq('platform', 'whoop');

    if (deleteError) {
      console.error('Error disconnecting Whoop:', deleteError);
      throw new Error('Failed to disconnect Whoop');
    }

    console.log(`🔌 Whoop disconnected for user ${userId}`);

    res.json({
      success: true,
      platform: 'whoop',
      message: 'Successfully disconnected from Whoop'
    });

  } catch (error) {
    console.error('Whoop disconnect error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to disconnect Whoop',
      details: error.message
    });
  }
});

/**
 * Reconnect Whoop - Initiate new OAuth flow for existing user
 * Use when token is expired and cannot be refreshed
 */
router.get('/reconnect/whoop', oauthAuthorizationLimiter, async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required in query params'
      });
    }

    // Check if user has an existing connection
    const { data: existingConnection } = await supabase
      .from('platform_connections')
      .select('id, status')
      .eq('user_id', userId)
      .eq('platform', 'whoop')
      .single();

    if (existingConnection) {
      // Update status to 'reconnecting'
      await supabase
        .from('platform_connections')
        .update({
          status: 'reconnecting',
          updated_at: new Date().toISOString()
        })
        .eq('id', existingConnection.id);
    }

    const config = PLATFORM_CONFIGS.whoop;
    const redirectUri = process.env.WHOOP_REDIRECT_URI || `${process.env.VITE_APP_URL || 'http://localhost:8086'}/oauth/callback`;
    const scope = config.scopes.join(' ');

    // Generate PKCE parameters
    const pkce = generatePKCEParams();

    // Generate base64-encoded OAuth state
    const stateData = {
      platform: 'whoop',
      provider: 'whoop',
      userId,
      reconnect: true,
      timestamp: Date.now()
    };
    const state = Buffer.from(JSON.stringify(stateData)).toString('base64');

    // Store state + code_verifier in Supabase
    await supabase
      .from('oauth_states')
      .insert({
        state,
        code_verifier: encryptToken(pkce.codeVerifier),
        data: { userId, platform: 'whoop', reconnect: true },
        expires_at: new Date(Date.now() + 1800000) // 30 minutes
      });

    // Whoop uses client_secret authentication, not PKCE
    const authUrl = `${config.authUrl}?` +
      `client_id=${process.env.WHOOP_CLIENT_ID}&` +
      `response_type=code&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `scope=${encodeURIComponent(scope)}&` +
      `state=${encodeURIComponent(state)}`;

    console.log(`🔄 Whoop reconnect initiated for user ${userId}`);

    res.json({
      success: true,
      authUrl,
      message: 'Reconnect your Whoop account to refresh your access'
    });
  } catch (error) {
    console.error('Whoop reconnect error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initialize Whoop reconnection',
      details: error.message
    });
  }
});

/**
 * Refresh Whoop Token - Manually refresh token using refresh_token
 */
router.post('/refresh/whoop', async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    // Get the existing connection
    const { data: connection, error: fetchError } = await supabase
      .from('platform_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('platform', 'whoop')
      .single();

    if (fetchError || !connection) {
      return res.status(404).json({
        success: false,
        error: 'Whoop connection not found'
      });
    }

    if (!connection.refresh_token) {
      return res.status(400).json({
        success: false,
        error: 'No refresh token available. Please reconnect your Whoop account.',
        requiresReconnect: true
      });
    }

    // Decrypt refresh token
    const refreshToken = decryptToken(connection.refresh_token);
    const config = PLATFORM_CONFIGS.whoop;

    // Exchange refresh token for new access token
    // WHOOP requires client credentials in the request BODY (not HTTP Basic Auth)
    // See: https://developer.whoop.com/docs/developing/oauth/
    const tokenParams = {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: process.env.WHOOP_CLIENT_ID,
      client_secret: process.env.WHOOP_CLIENT_SECRET,
      scope: 'offline'
    };

    const tokenResponse = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams(tokenParams)
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Whoop token refresh error:', errorText);

      // Update status to needs_reauth
      await supabase
        .from('platform_connections')
        .update({
          status: 'needs_reauth',
          error_message: 'Token refresh failed - please reconnect',
          updated_at: new Date().toISOString()
        })
        .eq('id', connection.id);

      return res.status(400).json({
        success: false,
        error: 'Token refresh failed. Please reconnect your Whoop account.',
        requiresReconnect: true
      });
    }

    const tokens = await tokenResponse.json();
    const { access_token: newAccessToken, refresh_token: newRefreshToken, expires_in: expiresIn } = tokens;

    // Encrypt and store new tokens
    const tokenExpiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;
    const encryptedAccessToken = encryptToken(newAccessToken);
    const encryptedRefreshToken = newRefreshToken ? encryptToken(newRefreshToken) : connection.refresh_token;

    await supabase
      .from('platform_connections')
      .update({
        access_token: encryptedAccessToken,
        refresh_token: encryptedRefreshToken,
        token_expires_at: tokenExpiresAt,
        status: 'connected',
        error_message: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', connection.id);

    console.log(`✅ Whoop token refreshed for user ${userId}`);

    res.json({
      success: true,
      platform: 'whoop',
      message: 'Token refreshed successfully',
      expiresAt: tokenExpiresAt
    });

  } catch (error) {
    console.error('Whoop token refresh error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to refresh Whoop token',
      details: error.message
    });
  }
});

// ============================================================================
// OURA CONNECTOR - Recovery & Sleep Patterns
// ============================================================================

/**
 * Oura Connect - Initiate OAuth flow (GET version for frontend compatibility)
 * Discovers: sleep quality, readiness patterns, HRV trends, body temperature, circadian rhythm
 */
router.get('/connect/oura', oauthAuthorizationLimiter, async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required in query params'
      });
    }

    const config = PLATFORM_CONFIGS.oura;
    const redirectUri = process.env.OURA_REDIRECT_URI || `${process.env.VITE_APP_URL || 'http://localhost:8086'}/oauth/callback`;
    const scope = config.scopes.join(' ');

    // Generate PKCE parameters
    const pkce = generatePKCEParams();

    // Generate base64-encoded OAuth state (frontend-compatible format)
    const stateData = {
      platform: 'oura',
      provider: 'oura',
      userId,
      timestamp: Date.now()
    };
    const state = Buffer.from(JSON.stringify(stateData)).toString('base64');

    // Store state + code_verifier in Supabase
    await supabase
      .from('oauth_states')
      .insert({
        state,
        code_verifier: encryptToken(pkce.codeVerifier),
        data: { userId, platform: 'oura' },
        expires_at: new Date(Date.now() + 1800000) // 30 minutes
      });

    const authUrl = `${config.authUrl}?` +
      `client_id=${process.env.OURA_CLIENT_ID}&` +
      `response_type=code&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `scope=${encodeURIComponent(scope)}&` +
      `state=${encodeURIComponent(state)}&` +
      `code_challenge=${pkce.codeChallenge}&` +
      `code_challenge_method=S256`;

    console.log(`💍 Oura OAuth initiated (GET) for user ${userId}`);

    res.json({
      success: true,
      authUrl,
      message: 'Connect your recovery patterns - discover your rest and readiness cycles'
    });
  } catch (error) {
    console.error('Oura connection error (GET):', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initialize Oura connection',
      details: error.message
    });
  }
});

/**
 * Oura Connect - Initiate OAuth flow (POST version)
 * Discovers: sleep quality, readiness patterns, HRV trends, body temperature, circadian rhythm
 */
router.post('/connect/oura', oauthAuthorizationLimiter, async (req, res) => {
  try {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Request body is required. Ensure Content-Type is application/json'
      });
    }

    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required in request body'
      });
    }

    const config = PLATFORM_CONFIGS.oura;
    const redirectUri = process.env.OURA_REDIRECT_URI || `${process.env.VITE_APP_URL || 'http://localhost:8086'}/oauth/callback`;
    const scope = config.scopes.join(' ');

    // Generate PKCE parameters
    const pkce = generatePKCEParams();

    // Generate base64-encoded OAuth state (frontend-compatible format)
    // codeVerifier is stored encrypted in DB, not in state
    const stateData = {
      platform: 'oura',
      provider: 'oura',
      userId,
      timestamp: Date.now()
    };
    const state = Buffer.from(JSON.stringify(stateData)).toString('base64');

    // Store state + code_verifier in Supabase
    await supabase
      .from('oauth_states')
      .insert({
        state,
        code_verifier: encryptToken(pkce.codeVerifier),
        data: { userId, platform: 'oura' },
        expires_at: new Date(Date.now() + 1800000) // 30 minutes
      });

    const authUrl = `${config.authUrl}?` +
      `client_id=${process.env.OURA_CLIENT_ID}&` +
      `response_type=code&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `scope=${encodeURIComponent(scope)}&` +
      `state=${encodeURIComponent(state)}&` +
      `code_challenge=${pkce.codeChallenge}&` +
      `code_challenge_method=S256`;

    console.log(`💍 Oura OAuth initiated for user ${userId}`);

    res.json({
      success: true,
      authUrl,
      message: 'Connect your recovery patterns - discover your rest and readiness cycles'
    });
  } catch (error) {
    console.error('Oura connection error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initialize Oura connection',
      details: error.message
    });
  }
});

/**
 * Oura OAuth Callback - Exchange code for tokens
 */
router.post('/oauth/callback/oura', oauthCallbackLimiter, async (req, res) => {
  try {
    const { code, state, error: oauthError } = req.body;

    if (oauthError) {
      return res.status(400).json({
        success: false,
        error: `OAuth error: ${oauthError}`
      });
    }

    if (!code || !state) {
      return res.status(400).json({
        success: false,
        error: 'Missing authorization code or state'
      });
    }

    // Decode base64 state (frontend-compatible format)
    let stateData;
    try {
      const decodedState = Buffer.from(state, 'base64').toString('utf8');
      stateData = JSON.parse(decodedState);
    } catch (error) {
      console.warn(`⚠️ State decoding failed:`, error.message);
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired state parameter'
      });
    }

    const { userId } = stateData;

    // Atomically mark state as used
    const { data: storedState, error: stateError } = await supabase.rpc('mark_oauth_state_as_used', {
      state_param: state
    });

    if (stateError || !storedState) {
      console.warn(`⚠️ Invalid, expired, or already used state parameter`);
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired state parameter'
      });
    }

    // Decrypt the code_verifier from the stored state
    let codeVerifier;
    if (storedState.code_verifier) {
      try {
        codeVerifier = decryptToken(storedState.code_verifier);
      } catch (decryptError) {
        console.error('Failed to decrypt code_verifier:', decryptError);
        return res.status(400).json({
          success: false,
          error: 'Invalid PKCE state'
        });
      }
    }

    // Exchange code for tokens
    const config = PLATFORM_CONFIGS.oura;
    const redirectUri = process.env.OURA_REDIRECT_URI || `${process.env.VITE_APP_URL || 'http://localhost:8086'}/oauth/callback`;

    const tokenParams = {
      grant_type: 'authorization_code',
      code,
      client_id: process.env.OURA_CLIENT_ID,
      client_secret: process.env.OURA_CLIENT_SECRET,
      redirect_uri: redirectUri
    };

    // Include code_verifier for PKCE
    if (codeVerifier) {
      tokenParams.code_verifier = codeVerifier;
    }

    const tokenResponse = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams(tokenParams)
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      console.error('Oura token exchange error:', errorData);
      throw new Error(`Failed to exchange Oura authorization code: ${errorData.error_description || errorData.error}`);
    }

    const tokens = await tokenResponse.json();
    const { access_token: accessToken, refresh_token: refreshToken, expires_in: expiresIn } = tokens;

    // Store encrypted tokens
    const tokenExpiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;
    const encryptedAccessToken = encryptToken(accessToken);
    const encryptedRefreshToken = refreshToken ? encryptToken(refreshToken) : null;

    const { data: connectorData, error: connectorError } = await supabase
      .from('platform_connections')
      .upsert({
        user_id: userId,
        platform: 'oura',
        access_token: encryptedAccessToken,
        refresh_token: encryptedRefreshToken,
        token_expires_at: tokenExpiresAt,
        status: 'connected',
        connected_at: new Date().toISOString(),
        last_sync_status: 'pending',
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,platform'
      })
      .select()
      .single();

    if (connectorError) {
      console.error('Error storing Oura connector:', connectorError);
      throw new Error('Failed to store connection');
    }

    console.log(`💾 Oura tokens stored for user ${userId}`);

    res.json({
      success: true,
      platform: 'oura',
      userId,
      message: 'Successfully connected to Oura. Ready to analyze your recovery patterns.',
      connector: {
        id: connectorData.id,
        platform: 'oura',
        connected_at: connectorData.connected_at
      }
    });

  } catch (error) {
    console.error('Oura OAuth callback error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to complete Oura OAuth flow',
      details: error.message
    });
  }
});

/**
 * Extract Oura Recovery Soul Signature
 */
router.post('/extract/oura', async (req, res) => {
  try {
    const { userId, accessToken } = req.body;

    if (!userId || !accessToken) {
      return res.status(400).json({
        success: false,
        error: 'userId and accessToken are required'
      });
    }

    const config = PLATFORM_CONFIGS.oura;
    const headers = { 'Authorization': `Bearer ${accessToken}` };

    // Get date range for last 30 days
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Fetch data from multiple Oura endpoints
    const [personalInfoRes, sleepRes, activityRes, readinessRes, heartRateRes] = await Promise.all([
      fetch(`${config.apiBaseUrl}${config.endpoints.personalInfo}`, { headers }),
      fetch(`${config.apiBaseUrl}${config.endpoints.dailySleep}?start_date=${startDate}&end_date=${endDate}`, { headers }),
      fetch(`${config.apiBaseUrl}${config.endpoints.dailyActivity}?start_date=${startDate}&end_date=${endDate}`, { headers }),
      fetch(`${config.apiBaseUrl}${config.endpoints.dailyReadiness}?start_date=${startDate}&end_date=${endDate}`, { headers }),
      fetch(`${config.apiBaseUrl}${config.endpoints.heartRate}?start_date=${startDate}&end_date=${endDate}`, { headers })
    ]);

    const [personalInfo, sleepData, activityData, readinessData, heartRateData] = await Promise.all([
      personalInfoRes.json(),
      sleepRes.json(),
      activityRes.json(),
      readinessRes.json(),
      heartRateRes.json()
    ]);

    // Analyze recovery patterns for soul signature
    const recoverySoul = analyzeOuraPatterns({
      personalInfo,
      sleepData: sleepData.data || [],
      activityData: activityData.data || [],
      readinessData: readinessData.data || [],
      heartRateData: heartRateData.data || []
    });

    res.json({
      success: true,
      extractionMethod: 'direct-api',
      soulSignature: {
        oura: recoverySoul,
        summary: {
          sleepQuality: recoverySoul.avgSleepScore,
          readinessPattern: recoverySoul.readinessStyle,
          hrvTrend: recoverySoul.hrvTrend,
          circadianAlignment: recoverySoul.circadianScore
        }
      },
      metadata: {
        dataPoints: (sleepData.data?.length || 0) + (activityData.data?.length || 0) + (readinessData.data?.length || 0),
        extractedAt: new Date().toISOString(),
        method: 'direct-api'
      }
    });

  } catch (error) {
    console.error('Oura extraction error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to extract Oura data',
      details: error.message
    });
  }
});

// ============================================================================
// ANALYSIS HELPER FUNCTIONS
// ============================================================================

/**
 * Analyze Whoop data for personality correlations
 */
function analyzeWhoopPatterns({ profile, recoveries, cycles, sleepData, workouts }) {
  // Calculate averages and patterns
  const avgRecoveryScore = recoveries.length > 0
    ? recoveries.reduce((sum, r) => sum + (r.score?.recovery_score || 0), 0) / recoveries.length
    : 0;

  const avgStrainScore = cycles.length > 0
    ? cycles.reduce((sum, c) => sum + (c.score?.strain || 0), 0) / cycles.length
    : 0;

  const avgSleepPerformance = sleepData.length > 0
    ? sleepData.reduce((sum, s) => sum + (s.score?.sleep_performance_percentage || 0), 0) / sleepData.length
    : 0;

  // Calculate sleep consistency (standard deviation of bedtimes)
  const bedtimes = sleepData.map(s => {
    if (s.start) {
      const date = new Date(s.start);
      return date.getHours() * 60 + date.getMinutes();
    }
    return null;
  }).filter(t => t !== null);

  const avgBedtime = bedtimes.length > 0 ? bedtimes.reduce((a, b) => a + b, 0) / bedtimes.length : 0;
  const bedtimeVariance = bedtimes.length > 0
    ? Math.sqrt(bedtimes.reduce((sum, t) => sum + Math.pow(t - avgBedtime, 2), 0) / bedtimes.length)
    : 0;

  // Determine recovery style
  let recoveryStyle = 'balanced';
  if (avgRecoveryScore > 70) recoveryStyle = 'highly-optimized';
  else if (avgRecoveryScore > 50) recoveryStyle = 'consistent';
  else if (avgRecoveryScore > 30) recoveryStyle = 'recovering';
  else recoveryStyle = 'stressed';

  // Determine strain tolerance
  let strainTolerance = 'moderate';
  if (avgStrainScore > 15) strainTolerance = 'high-intensity';
  else if (avgStrainScore > 10) strainTolerance = 'active';
  else if (avgStrainScore > 5) strainTolerance = 'moderate';
  else strainTolerance = 'low-intensity';

  // Workout analysis
  const workoutTypes = workouts.reduce((acc, w) => {
    const type = w.sport_id || 'unknown';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  const dominantWorkoutType = Object.entries(workoutTypes)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'varied';

  // Calculate discipline score (0-100)
  const sleepConsistency = Math.max(0, 100 - bedtimeVariance);
  const workoutRegularity = Math.min(100, (workouts.length / 30) * 100);
  const recoveryAdherence = avgRecoveryScore;
  const disciplineScore = Math.round((sleepConsistency + workoutRegularity + recoveryAdherence) / 3);

  return {
    avgRecoveryScore: Math.round(avgRecoveryScore),
    avgStrainScore: Math.round(avgStrainScore * 10) / 10,
    avgSleepPerformance: Math.round(avgSleepPerformance),
    sleepConsistency: Math.round(sleepConsistency),
    recoveryStyle,
    strainTolerance,
    disciplineScore,
    dominantWorkoutType,
    workoutFrequency: workouts.length,
    totalDataDays: cycles.length,
    personalityCorrelations: {
      conscientiousness: disciplineScore > 70 ? 'high' : disciplineScore > 40 ? 'moderate' : 'developing',
      neuroticism: recoveryStyle === 'stressed' ? 'high-stress-indicators' : 'balanced',
      extraversion: strainTolerance === 'high-intensity' ? 'high-activity' : 'moderate-activity'
    }
  };
}

/**
 * Analyze Oura data for personality correlations
 */
function analyzeOuraPatterns({ personalInfo, sleepData, activityData, readinessData, heartRateData }) {
  // Calculate sleep averages
  const avgSleepScore = sleepData.length > 0
    ? sleepData.reduce((sum, s) => sum + (s.score || 0), 0) / sleepData.length
    : 0;

  const avgReadinessScore = readinessData.length > 0
    ? readinessData.reduce((sum, r) => sum + (r.score || 0), 0) / readinessData.length
    : 0;

  const avgActivityScore = activityData.length > 0
    ? activityData.reduce((sum, a) => sum + (a.score || 0), 0) / activityData.length
    : 0;

  // Analyze HRV patterns
  const hrvValues = heartRateData.map(h => h.bpm).filter(v => v);
  const avgHRV = hrvValues.length > 0
    ? hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length
    : 0;

  // Calculate bedtime consistency
  const bedtimes = sleepData.map(s => {
    if (s.bedtime_start) {
      const date = new Date(s.bedtime_start);
      return date.getHours() * 60 + date.getMinutes();
    }
    return null;
  }).filter(t => t !== null);

  const avgBedtime = bedtimes.length > 0 ? bedtimes.reduce((a, b) => a + b, 0) / bedtimes.length : 0;
  const bedtimeStdDev = bedtimes.length > 0
    ? Math.sqrt(bedtimes.reduce((sum, t) => sum + Math.pow(t - avgBedtime, 2), 0) / bedtimes.length)
    : 0;

  // Determine readiness style
  let readinessStyle = 'balanced';
  if (avgReadinessScore > 80) readinessStyle = 'peak-performer';
  else if (avgReadinessScore > 65) readinessStyle = 'well-rested';
  else if (avgReadinessScore > 50) readinessStyle = 'adequate';
  else readinessStyle = 'needs-rest';

  // Calculate circadian alignment score
  const circadianScore = Math.max(0, 100 - bedtimeStdDev);

  // Determine HRV trend interpretation
  let hrvTrend = 'stable';
  if (avgHRV > 70) hrvTrend = 'excellent-recovery';
  else if (avgHRV > 50) hrvTrend = 'good-recovery';
  else if (avgHRV > 30) hrvTrend = 'moderate';
  else hrvTrend = 'needs-attention';

  // Calculate overall wellness discipline
  const wellnessScore = Math.round((avgSleepScore + avgReadinessScore + circadianScore) / 3);

  return {
    avgSleepScore: Math.round(avgSleepScore),
    avgReadinessScore: Math.round(avgReadinessScore),
    avgActivityScore: Math.round(avgActivityScore),
    avgHRV: Math.round(avgHRV),
    circadianScore: Math.round(circadianScore),
    readinessStyle,
    hrvTrend,
    wellnessScore,
    totalDataDays: sleepData.length,
    personalityCorrelations: {
      conscientiousness: circadianScore > 70 ? 'high-consistency' : circadianScore > 40 ? 'moderate' : 'variable',
      neuroticism: hrvTrend === 'needs-attention' ? 'stress-indicators' : 'balanced',
      openness: avgActivityScore > 70 ? 'active-exploration' : 'steady-routine'
    }
  };
}

// ============================================================================
// AGGREGATE HEALTH DATA
// ============================================================================

/**
 * Aggregate health data from all connected health platforms
 */
router.post('/aggregate-health', async (req, res) => {
  try {
    const { userId, connectedPlatforms } = req.body;

    const aggregatedHealthSoul = {
      physicalDiscipline: {},
      recoveryPatterns: {},
      sleepProfile: {},
      stressIndicators: {},
      fitnessPersonality: {},
      overallWellnessScore: 0
    };

    // Combine health platform data
    if (connectedPlatforms.whoop) {
      aggregatedHealthSoul.physicalDiscipline = {
        strainTolerance: connectedPlatforms.whoop.strainTolerance,
        workoutStyle: connectedPlatforms.whoop.dominantWorkoutType,
        disciplineScore: connectedPlatforms.whoop.disciplineScore
      };
    }

    if (connectedPlatforms.oura) {
      aggregatedHealthSoul.recoveryPatterns = {
        readinessStyle: connectedPlatforms.oura.readinessStyle,
        hrvTrend: connectedPlatforms.oura.hrvTrend,
        circadianAlignment: connectedPlatforms.oura.circadianScore
      };
      aggregatedHealthSoul.sleepProfile = {
        quality: connectedPlatforms.oura.avgSleepScore,
        consistency: connectedPlatforms.oura.circadianScore
      };
    }

    // Calculate overall wellness score
    const scores = [
      connectedPlatforms.whoop?.disciplineScore,
      connectedPlatforms.oura?.wellnessScore
    ].filter(s => s !== undefined);

    aggregatedHealthSoul.overallWellnessScore = scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 0;

    // Generate health-based personality insights
    const personalityInsights = generateHealthPersonalityInsights(aggregatedHealthSoul);

    res.json({
      success: true,
      healthSoul: aggregatedHealthSoul,
      insights: personalityInsights,
      signature: {
        fitnessPersonality: determineFitnessPersonality(aggregatedHealthSoul),
        recoveryPersonality: determineRecoveryPersonality(aggregatedHealthSoul),
        wellnessArchetype: determineWellnessArchetype(aggregatedHealthSoul)
      }
    });

  } catch (error) {
    console.error('Health aggregation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to aggregate health data',
      details: error.message
    });
  }
});

/**
 * Generate personality insights from health data
 */
function generateHealthPersonalityInsights(healthSoul) {
  const insights = [];

  if (healthSoul.physicalDiscipline?.disciplineScore > 70) {
    insights.push('Your consistent physical discipline suggests high conscientiousness');
  }

  if (healthSoul.recoveryPatterns?.readinessStyle === 'peak-performer') {
    insights.push('Your optimized recovery patterns indicate excellent stress management');
  }

  if (healthSoul.sleepProfile?.consistency > 80) {
    insights.push('Your sleep consistency reveals a structured approach to self-care');
  }

  if (healthSoul.physicalDiscipline?.strainTolerance === 'high-intensity') {
    insights.push('Your high activity levels suggest extraversion and energy-seeking behavior');
  }

  return insights;
}

/**
 * Determine fitness personality type
 */
function determineFitnessPersonality(healthSoul) {
  const discipline = healthSoul.physicalDiscipline?.disciplineScore || 0;
  const strain = healthSoul.physicalDiscipline?.strainTolerance;

  if (discipline > 80 && strain === 'high-intensity') return 'Elite Performer';
  if (discipline > 60 && strain === 'active') return 'Dedicated Athlete';
  if (discipline > 40) return 'Consistent Mover';
  return 'Mindful Beginner';
}

/**
 * Determine recovery personality type
 */
function determineRecoveryPersonality(healthSoul) {
  const readiness = healthSoul.recoveryPatterns?.readinessStyle;
  const circadian = healthSoul.sleepProfile?.consistency || 0;

  if (readiness === 'peak-performer' && circadian > 80) return 'Recovery Master';
  if (readiness === 'well-rested') return 'Balanced Rester';
  if (circadian > 60) return 'Routine Keeper';
  return 'Flexible Sleeper';
}

/**
 * Determine overall wellness archetype
 */
function determineWellnessArchetype(healthSoul) {
  const wellness = healthSoul.overallWellnessScore;

  if (wellness > 80) return 'Wellness Optimizer';
  if (wellness > 60) return 'Health Conscious';
  if (wellness > 40) return 'Balance Seeker';
  return 'Wellness Explorer';
}

// ============================================================================
// WHOOP STATUS - Connection Status for Dashboard
// ============================================================================

/**
 * GET /api/health/whoop/status
 * Returns Whoop connection status for dashboard display
 */
router.get('/whoop/status', async (req, res) => {
  try {
    // Get userId from JWT token
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: 'Authorization header required'
      });
    }

    // Extract userId from JWT (simple decode for now)
    const token = authHeader.replace('Bearer ', '');
    let userId;
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      // Check all common JWT userId field names (our tokens use 'id')
      userId = payload.id || payload.sub || payload.userId || payload.user_id;
    } catch (e) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token'
      });
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId could not be extracted from token'
      });
    }

    // Check for Whoop connection
    const { data: connection, error: connError } = await supabase
      .from('platform_connections')
      .select('id, connected_at, token_expires_at, status, last_sync_status')
      .eq('user_id', userId)
      .eq('platform', 'whoop')
      .single();

    if (connError || !connection) {
      return res.json({
        success: true,
        data: {
          connected: false,
          tokenExpired: false,
          lastSync: null,
          connectedAt: null
        }
      });
    }

    // Check if token is expired
    const now = new Date();
    const tokenExpired = connection.token_expires_at && new Date(connection.token_expires_at) < now;

    res.json({
      success: true,
      data: {
        connected: !!connection.connected_at,
        tokenExpired,
        lastSync: connection.last_sync_status === 'success' ? new Date().toISOString() : null,
        connectedAt: connection.connected_at,
        status: connection.status
      }
    });
  } catch (error) {
    console.error('[Whoop Status] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get Whoop status',
      message: error.message
    });
  }
});

// ============================================================================
// WHOOP CURRENT STATE - Real-time Health Context for Recommendations
// ============================================================================

/**
 * GET /api/health/whoop/current-state
 * Returns real-time health context from Whoop for intelligent recommendations
 */
router.get('/whoop/current-state', async (req, res) => {
  try {
    // Get userId from query param or JWT token
    let userId = req.query.userId;

    // If no userId in query, try to extract from JWT
    if (!userId) {
      const authHeader = req.headers.authorization;
      if (authHeader) {
        try {
          const token = authHeader.replace('Bearer ', '');
          const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
          userId = payload.id || payload.sub || payload.userId || payload.user_id;
        } catch (e) {
          // Token parsing failed
        }
      }
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required (via query param or JWT token)'
      });
    }

    console.log(`[Whoop Current State] Getting real-time health data for user ${userId}`);

    // Get Whoop connection
    const { data: connection, error: connError } = await supabase
      .from('platform_connections')
      .select('access_token, token_expires_at, refresh_token')
      .eq('user_id', userId)
      .eq('platform', 'whoop')
      .single();

    if (connError || !connection) {
      return res.status(404).json({
        success: false,
        error: 'Whoop not connected',
        needsConnection: true
      });
    }

    // Check token expiration and refresh if needed
    let accessToken = decryptToken(connection.access_token);

    if (connection.token_expires_at && new Date(connection.token_expires_at) < new Date()) {
      console.log('[Whoop Current State] Token expired, refreshing...');
      const refreshedToken = await refreshWhoopToken(userId, connection.refresh_token);
      if (!refreshedToken) {
        return res.status(401).json({
          success: false,
          error: 'Failed to refresh Whoop token',
          needsReconnect: true
        });
      }
      accessToken = refreshedToken;
    }

    // Fetch current cycle (today's data)
    const cycleResponse = await fetch('https://api.prod.whoop.com/developer/v2/cycle?limit=1', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    let currentCycle = null;
    if (cycleResponse.ok) {
      const cycleData = await cycleResponse.json();
      currentCycle = cycleData.records?.[0] || null;
    }

    // Fetch latest recovery
    const recoveryResponse = await fetch('https://api.prod.whoop.com/developer/v2/recovery?limit=1', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    let latestRecovery = null;
    if (recoveryResponse.ok) {
      const recoveryData = await recoveryResponse.json();
      latestRecovery = recoveryData.records?.[0] || null;
    }

    // Fetch latest sleep
    const sleepResponse = await fetch('https://api.prod.whoop.com/developer/v2/activity/sleep?limit=1', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    let latestSleep = null;
    if (sleepResponse.ok) {
      const sleepData = await sleepResponse.json();
      latestSleep = sleepData.records?.[0] || null;
    }

    // Build current state response
    const recovery = latestRecovery?.score?.recovery_score;
    const strain = currentCycle?.score?.strain;
    const hrv = latestRecovery?.score?.hrv_rmssd_milli;
    const rhr = latestRecovery?.score?.resting_heart_rate;
    const sleepPerformance = latestSleep?.score?.stage_summary?.sleep_performance_percentage;
    const totalSleepMs = latestSleep?.score?.stage_summary?.total_in_bed_time_milli;
    const sleepHours = totalSleepMs ? totalSleepMs / (1000 * 60 * 60) : null;

    // Helper functions for labels
    const getRecoveryLabel = (score) => {
      if (score === undefined || score === null) return 'unknown';
      if (score >= 67) return 'high';
      if (score >= 34) return 'moderate';
      return 'low';
    };

    const getStrainLabel = (score) => {
      if (score === undefined || score === null) return 'unknown';
      if (score >= 18) return 'overreaching';
      if (score >= 14) return 'very high';
      if (score >= 10) return 'high';
      if (score >= 5) return 'moderate';
      return 'low';
    };

    // Calculate activity capacity based on recovery and strain
    const calculateActivityCapacity = () => {
      if (!recovery) return 'unknown';
      if (recovery >= 67 && (!strain || strain < 14)) return 'high';
      if (recovery >= 34 && (!strain || strain < 18)) return 'moderate';
      return 'low';
    };

    // Calculate optimal bedtime based on sleep debt
    const calculateOptimalBedtime = () => {
      if (!sleepPerformance || sleepPerformance >= 85) return null;
      // If sleep performance is low, suggest earlier bedtime
      const baseHour = 22; // 10 PM
      const adjustment = Math.floor((85 - sleepPerformance) / 10);
      return `${Math.max(20, baseHour - adjustment)}:00`;
    };

    res.json({
      success: true,
      currentState: {
        recovery: {
          score: recovery,
          label: getRecoveryLabel(recovery),
          components: {
            hrv: hrv ? Math.round(hrv) : null,
            rhr: rhr ? Math.round(rhr) : null,
            sleepQuality: sleepPerformance
          }
        },
        sleep: {
          hours: sleepHours ? Math.round(sleepHours * 10) / 10 : null,
          efficiency: sleepPerformance,
          quality: sleepPerformance >= 85 ? 'excellent' : sleepPerformance >= 70 ? 'good' : sleepPerformance >= 50 ? 'fair' : 'poor'
        },
        strain: {
          current: strain ? Math.round(strain * 10) / 10 : null,
          max: 21,
          label: getStrainLabel(strain)
        },
        recommendations: {
          activityCapacity: calculateActivityCapacity(),
          optimalBedtime: calculateOptimalBedtime(),
          recoveryNeeded: strain && strain > 15,
          message: recovery < 34
            ? 'Your recovery is low - prioritize rest and recovery activities today.'
            : recovery >= 67
              ? 'You\'re well recovered - great day for intense activities!'
              : 'Moderate recovery - balance activity with rest.'
        }
      },
      lastUpdated: latestRecovery?.created_at || latestSleep?.created_at || new Date().toISOString()
    });
  } catch (error) {
    console.error('[Whoop Current State] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get Whoop current state',
      message: error.message
    });
  }
});

/**
 * Helper: Refresh Whoop access token
 */
async function refreshWhoopToken(userId, encryptedRefreshToken) {
  try {
    const refreshToken = decryptToken(encryptedRefreshToken);
    const config = PLATFORM_CONFIGS.whoop;

    // WHOOP requires client credentials in the request BODY (not HTTP Basic Auth)
    // See: https://developer.whoop.com/docs/developing/oauth/
    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: process.env.WHOOP_CLIENT_ID,
        client_secret: process.env.WHOOP_CLIENT_SECRET,
        scope: 'offline'
      })
    });

    if (!response.ok) {
      console.error('[Whoop Token Refresh] Failed:', response.status);
      return null;
    }

    const tokens = await response.json();
    const newAccessToken = tokens.access_token;
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    // Update stored tokens
    await supabase
      .from('platform_connections')
      .update({
        access_token: encryptToken(newAccessToken),
        token_expires_at: expiresAt.toISOString(),
        ...(tokens.refresh_token ? { refresh_token: encryptToken(tokens.refresh_token) } : {})
      })
      .eq('user_id', userId)
      .eq('platform', 'whoop');

    console.log('[Whoop Token Refresh] Success');
    return newAccessToken;
  } catch (error) {
    console.error('[Whoop Token Refresh] Error:', error);
    return null;
  }
}

export default router;
