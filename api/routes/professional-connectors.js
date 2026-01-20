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
 * Professional Connectors for Soul Signature Extraction
 *
 * These connectors capture the professional identity through
 * career patterns, skills, and professional network.
 * The Professional Universe complements the Personal Universe to form
 * a complete Soul Signature.
 */

// ============================================================================
// LINKEDIN CONNECTOR - Professional Identity & Career Patterns
// ============================================================================

/**
 * LinkedIn Connect - Initiate OAuth flow (GET version for frontend compatibility)
 * Discovers: professional identity, career trajectory, skills, network breadth
 *
 * NOTE: LinkedIn's OpenID Connect API only provides basic profile (name, email, picture).
 * Full career history requires LinkedIn Marketing API partner access.
 * The Origin step and CV upload compensate for these API limitations.
 */
router.get('/connect/linkedin', oauthAuthorizationLimiter, async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required in query params'
      });
    }

    const config = PLATFORM_CONFIGS.linkedin;
    const redirectUri = process.env.LINKEDIN_REDIRECT_URI || `${process.env.VITE_APP_URL || 'http://localhost:8086'}/oauth/callback`;
    const scope = config.scopes.join(' ');

    // Generate PKCE parameters (RFC 7636 - OAuth 2.1 mandatory)
    const pkce = generatePKCEParams();

    // Generate base64-encoded OAuth state (frontend-compatible format)
    const stateData = {
      platform: 'linkedin',
      provider: 'linkedin',
      userId,
      timestamp: Date.now()
    };
    const state = Buffer.from(JSON.stringify(stateData)).toString('base64');

    // Store state + code_verifier in Supabase (CSRF protection + PKCE)
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 1800000); // 30 minutes from now

    const { error: stateInsertError } = await supabase
      .from('oauth_states')
      .insert({
        state,
        code_verifier: encryptToken(pkce.codeVerifier),
        data: { userId, platform: 'linkedin' },
        created_at: now.toISOString(),
        expires_at: expiresAt.toISOString()
      });

    if (stateInsertError) {
      console.error('Failed to store OAuth state:', stateInsertError);
      return res.status(500).json({
        success: false,
        error: 'Failed to initialize OAuth session',
        details: stateInsertError.message
      });
    }

    console.log(`OAuth state stored successfully for LinkedIn`);

    // LinkedIn uses authorization code grant with client_secret
    const authUrl = `${config.authUrl}?` +
      `response_type=code&` +
      `client_id=${process.env.LINKEDIN_CLIENT_ID}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `state=${encodeURIComponent(state)}&` +
      `scope=${encodeURIComponent(scope)}`;

    console.log(`LinkedIn OAuth initiated (GET) for user ${userId}`);
    console.log(`LinkedIn redirect_uri: ${redirectUri}`);

    res.json({
      success: true,
      authUrl,
      message: 'Connect your professional identity - discover your career patterns and expertise'
    });
  } catch (error) {
    console.error('LinkedIn connection error (GET):', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initialize LinkedIn connection',
      details: error.message
    });
  }
});

/**
 * LinkedIn Connect - Initiate OAuth flow (POST version)
 * Discovers: professional identity, career trajectory, skills, network breadth
 */
router.post('/connect/linkedin', oauthAuthorizationLimiter, async (req, res) => {
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

    const config = PLATFORM_CONFIGS.linkedin;
    const redirectUri = process.env.LINKEDIN_REDIRECT_URI || `${process.env.VITE_APP_URL || 'http://localhost:8086'}/oauth/callback`;
    const scope = config.scopes.join(' ');

    // Generate PKCE parameters
    const pkce = generatePKCEParams();

    // Generate base64-encoded OAuth state
    const stateData = {
      platform: 'linkedin',
      provider: 'linkedin',
      userId,
      timestamp: Date.now()
    };
    const state = Buffer.from(JSON.stringify(stateData)).toString('base64');

    // Store state + code_verifier in Supabase
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 1800000);

    const { error: stateInsertError } = await supabase
      .from('oauth_states')
      .insert({
        state,
        code_verifier: encryptToken(pkce.codeVerifier),
        data: { userId, platform: 'linkedin' },
        created_at: now.toISOString(),
        expires_at: expiresAt.toISOString()
      });

    if (stateInsertError) {
      console.error('Failed to store OAuth state (POST):', stateInsertError);
      return res.status(500).json({
        success: false,
        error: 'Failed to initialize OAuth session',
        details: stateInsertError.message
      });
    }

    const authUrl = `${config.authUrl}?` +
      `response_type=code&` +
      `client_id=${process.env.LINKEDIN_CLIENT_ID}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `state=${encodeURIComponent(state)}&` +
      `scope=${encodeURIComponent(scope)}`;

    console.log(`LinkedIn OAuth initiated for user ${userId}`);

    res.json({
      success: true,
      authUrl,
      message: 'Connect your professional identity - discover your career patterns and expertise'
    });
  } catch (error) {
    console.error('LinkedIn connection error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initialize LinkedIn connection',
      details: error.message
    });
  }
});

/**
 * LinkedIn OAuth Callback - Exchange code for tokens
 */
router.post('/oauth/callback/linkedin', oauthCallbackLimiter, async (req, res) => {
  try {
    console.log('[LinkedIn Callback] Starting callback processing...');
    console.log('[LinkedIn Callback] Request body:', {
      hasCode: !!req.body?.code,
      hasState: !!req.body?.state,
      error: req.body?.error
    });

    const { code, state, error: oauthError } = req.body;

    if (oauthError) {
      console.error('[LinkedIn Callback] OAuth error received:', oauthError);
      return res.status(400).json({
        success: false,
        error: `OAuth error: ${oauthError}`
      });
    }

    if (!code || !state) {
      console.error('[LinkedIn Callback] Missing code or state');
      return res.status(400).json({
        success: false,
        error: 'Missing authorization code or state'
      });
    }

    // Decode base64 state
    let stateData;
    try {
      const decodedState = Buffer.from(state, 'base64').toString('utf8');
      stateData = JSON.parse(decodedState);
      console.log('[LinkedIn Callback] State decoded:', { platform: stateData.platform, userId: stateData.userId });
    } catch (error) {
      console.warn('[LinkedIn Callback] State decoding failed:', error.message);
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired state parameter'
      });
    }

    const { userId } = stateData;

    // Atomically mark state as used (prevents replay attacks)
    console.log('[LinkedIn Callback] Marking state as used...');
    const { data: storedState, error: stateError } = await supabase.rpc('mark_oauth_state_as_used', {
      state_param: state
    });

    if (stateError) {
      console.error('[LinkedIn Callback] State RPC error:', stateError);
    }

    if (stateError || !storedState) {
      console.warn('[LinkedIn Callback] Invalid, expired, or already used state parameter');
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired state parameter'
      });
    }
    console.log('[LinkedIn Callback] State verified successfully');

    // Exchange code for tokens
    const config = PLATFORM_CONFIGS.linkedin;
    const redirectUri = process.env.LINKEDIN_REDIRECT_URI || `${process.env.VITE_APP_URL || 'http://localhost:8086'}/oauth/callback`;

    console.log('[LinkedIn Callback] Token exchange config:', {
      tokenUrl: config.tokenUrl,
      redirectUri,
      hasClientId: !!process.env.LINKEDIN_CLIENT_ID,
      hasClientSecret: !!process.env.LINKEDIN_CLIENT_SECRET
    });

    // LinkedIn requires x-www-form-urlencoded for token exchange
    const tokenParams = {
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: process.env.LINKEDIN_CLIENT_ID,
      client_secret: process.env.LINKEDIN_CLIENT_SECRET
    };

    console.log('[LinkedIn Callback] Sending token exchange request...');
    const tokenResponse = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams(tokenParams)
    });

    console.log('[LinkedIn Callback] Token response status:', tokenResponse.status);

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('[LinkedIn Callback] Token exchange error response:', errorText);
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText };
      }
      throw new Error(`Failed to exchange LinkedIn authorization code: ${errorData.error_description || errorData.error || errorText}`);
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
        platform: 'linkedin',
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
      console.error('Error storing LinkedIn connector:', connectorError);
      throw new Error('Failed to store connection');
    }

    console.log(`LinkedIn tokens stored for user ${userId}`);

    // Fetch user profile to store basic info
    try {
      const profileResponse = await fetch('https://api.linkedin.com/v2/userinfo', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (profileResponse.ok) {
        const profile = await profileResponse.json();

        // Store profile data in user_platform_data
        await supabase
          .from('user_platform_data')
          .upsert({
            user_id: userId,
            platform: 'linkedin',
            data_type: 'profile',
            raw_data: profile,
            extracted_at: new Date().toISOString()
          }, {
            onConflict: 'user_id,platform,data_type'
          });

        console.log(`LinkedIn profile stored for user ${userId}`);
      }
    } catch (profileError) {
      console.warn('Failed to fetch LinkedIn profile:', profileError.message);
      // Non-fatal - continue with connection
    }

    // Invalidate platform status cache
    await invalidatePlatformStatusCache(userId);
    console.log(`Invalidated platform status cache for user ${userId}`);

    res.json({
      success: true,
      platform: 'linkedin',
      userId,
      message: 'Successfully connected to LinkedIn. Ready to analyze your professional identity.',
      connector: {
        id: connectorData.id,
        platform: 'linkedin',
        connected_at: connectorData.connected_at
      }
    });

  } catch (error) {
    console.error('LinkedIn OAuth callback error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to complete LinkedIn OAuth flow',
      details: error.message
    });
  }
});

/**
 * Extract LinkedIn Professional Soul Signature
 */
router.post('/extract/linkedin', async (req, res) => {
  try {
    const { userId, accessToken } = req.body;

    if (!userId || !accessToken) {
      return res.status(400).json({
        success: false,
        error: 'userId and accessToken are required'
      });
    }

    // Fetch user profile (this is all we can get with basic OpenID Connect scopes)
    const profileResponse = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!profileResponse.ok) {
      throw new Error(`Failed to fetch LinkedIn profile: ${profileResponse.status}`);
    }

    const profile = await profileResponse.json();

    // Analyze professional patterns for soul signature
    // Note: With basic API access, we only get name, email, and picture
    // Full career analysis requires LinkedIn Marketing API partner access
    const professionalSoul = {
      name: profile.name,
      email: profile.email,
      picture: profile.picture,
      locale: profile.locale,
      // These would be populated with Marketing API access:
      careerTrajectory: null,
      skills: [],
      industryExpertise: null,
      professionalNetwork: null,
      note: 'Full career history requires LinkedIn Marketing API partner access. Use Origin step or CV upload for detailed career data.'
    };

    res.json({
      success: true,
      extractionMethod: 'direct-api',
      soulSignature: {
        linkedin: professionalSoul,
        summary: {
          hasProfile: true,
          hasCareerHistory: false,
          dataCompleteness: 'basic'
        }
      },
      metadata: {
        dataPoints: 1,
        extractedAt: new Date().toISOString(),
        method: 'direct-api',
        limitations: 'LinkedIn OpenID Connect only provides basic profile. Origin step compensates for career data.'
      }
    });

  } catch (error) {
    console.error('LinkedIn extraction error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to extract LinkedIn data',
      details: error.message
    });
  }
});

/**
 * Disconnect LinkedIn - Remove platform connection
 */
router.delete('/disconnect/linkedin', async (req, res) => {
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
      .eq('platform', 'linkedin');

    if (deleteError) {
      console.error('Error disconnecting LinkedIn:', deleteError);
      throw new Error('Failed to disconnect LinkedIn');
    }

    console.log(`LinkedIn disconnected for user ${userId}`);

    res.json({
      success: true,
      platform: 'linkedin',
      message: 'Successfully disconnected from LinkedIn'
    });

  } catch (error) {
    console.error('LinkedIn disconnect error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to disconnect LinkedIn',
      details: error.message
    });
  }
});

/**
 * Reconnect LinkedIn - Initiate new OAuth flow for existing user
 */
router.get('/reconnect/linkedin', oauthAuthorizationLimiter, async (req, res) => {
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
      .eq('platform', 'linkedin')
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

    const config = PLATFORM_CONFIGS.linkedin;
    const redirectUri = process.env.LINKEDIN_REDIRECT_URI || `${process.env.VITE_APP_URL || 'http://localhost:8086'}/oauth/callback`;
    const scope = config.scopes.join(' ');

    // Generate PKCE parameters
    const pkce = generatePKCEParams();

    // Generate base64-encoded OAuth state
    const stateData = {
      platform: 'linkedin',
      provider: 'linkedin',
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
        data: { userId, platform: 'linkedin', reconnect: true },
        expires_at: new Date(Date.now() + 1800000) // 30 minutes
      });

    const authUrl = `${config.authUrl}?` +
      `response_type=code&` +
      `client_id=${process.env.LINKEDIN_CLIENT_ID}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `state=${encodeURIComponent(state)}&` +
      `scope=${encodeURIComponent(scope)}`;

    console.log(`LinkedIn reconnect initiated for user ${userId}`);

    res.json({
      success: true,
      authUrl,
      message: 'Reconnect your LinkedIn account to refresh your access'
    });
  } catch (error) {
    console.error('LinkedIn reconnect error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initialize LinkedIn reconnection',
      details: error.message
    });
  }
});

/**
 * Refresh LinkedIn Token - Manually refresh token using refresh_token
 */
router.post('/refresh/linkedin', async (req, res) => {
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
      .eq('platform', 'linkedin')
      .single();

    if (fetchError || !connection) {
      return res.status(404).json({
        success: false,
        error: 'LinkedIn connection not found'
      });
    }

    if (!connection.refresh_token) {
      return res.status(400).json({
        success: false,
        error: 'No refresh token available. Please reconnect your LinkedIn account.',
        requiresReconnect: true
      });
    }

    // Decrypt refresh token
    const refreshToken = decryptToken(connection.refresh_token);
    const config = PLATFORM_CONFIGS.linkedin;

    // Exchange refresh token for new access token
    const tokenParams = {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: process.env.LINKEDIN_CLIENT_ID,
      client_secret: process.env.LINKEDIN_CLIENT_SECRET
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
      console.error('LinkedIn token refresh error:', errorText);

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
        error: 'Token refresh failed. Please reconnect your LinkedIn account.',
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

    console.log(`LinkedIn token refreshed for user ${userId}`);

    res.json({
      success: true,
      platform: 'linkedin',
      message: 'Token refreshed successfully',
      expiresAt: tokenExpiresAt
    });

  } catch (error) {
    console.error('LinkedIn token refresh error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to refresh LinkedIn token',
      details: error.message
    });
  }
});

/**
 * LinkedIn Status - Connection Status for Dashboard
 */
router.get('/linkedin/status', async (req, res) => {
  try {
    // Get userId from JWT token
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: 'Authorization header required'
      });
    }

    // Extract userId from JWT
    const token = authHeader.replace('Bearer ', '');
    let userId;
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
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

    // Check for LinkedIn connection
    const { data: connection, error: connError } = await supabase
      .from('platform_connections')
      .select('id, connected_at, token_expires_at, status, last_sync_status')
      .eq('user_id', userId)
      .eq('platform', 'linkedin')
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
    console.error('[LinkedIn Status] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get LinkedIn status',
      message: error.message
    });
  }
});

export default router;
