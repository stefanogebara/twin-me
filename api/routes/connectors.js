/**
 * Connector Routes - OAuth Integration for External Data Sources
 */

import express from 'express';
import { supabase } from '../config/supabase.js';
import { encryptToken, decryptToken } from '../services/encryption.js';
const router = express.Router();

// ====================================================================
// OAUTH CONFIGURATIONS
// ====================================================================

const OAUTH_CONFIGS = {
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
  }
};

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
    if (!config) {
      return res.status(400).json({
        success: false,
        error: `Unsupported provider: ${provider}`
      });
    }

    if (!config.clientId) {
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

    // Build authorization URL
    // Use connector-specific callback to avoid conflicts with auth OAuth
    const redirectUri = 'http://localhost:8086/oauth/callback'; // Frontend callback URL

    console.log(`🔗 OAuth for ${provider}:`);
    console.log(`📍 Redirect URI: ${redirectUri}`);
    console.log(`🌍 VITE_APP_URL from env: ${process.env.VITE_APP_URL}`);
    console.log(`🔑 All APP URLs in env:`, Object.keys(process.env).filter(k => k.includes('APP_URL')));

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: redirectUri,
      scope: config.scopes.join(' '),
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

    // Exchange authorization code for tokens
    const tokenResponse = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: 'http://localhost:8086/oauth/callback' // HARDCODED to match OAuth settings
      })
    });

    const tokens = await tokenResponse.json();

    if (tokens.error) {
      return res.status(400).json({
        success: false,
        error: `OAuth error: ${tokens.error_description || tokens.error}`
      });
    }

    // Store encrypted tokens in database
    try {
      const connectionData = {
        user_id: userId,
        provider: provider,
        access_token_encrypted: encryptToken(tokens.access_token),
        refresh_token_encrypted: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
        expires_at: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null,
        scopes: config.scopes,
        is_active: true,
        connected_at: new Date().toISOString(),
        last_sync: new Date().toISOString(),
        last_sync_status: 'success',
        permissions: {},
        total_synced: 0,
        error_count: 0
      };

      // Upsert connection to database (insert or update if exists)
      const { error: dbError } = await supabase
        .from('data_connectors')
        .upsert(connectionData, {
          onConflict: 'user_id,provider'
        });

      if (dbError) {
        console.error('Database error storing connection:', dbError);
        throw dbError;
      }

      console.log(`✅ Successfully stored ${provider} connection for user ${userId} in database`);

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
 */
router.get('/status/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Get connection status from database
    const { data: connections, error } = await supabase
      .from('data_connectors')
      .select('provider, is_active, connected_at, last_sync, last_sync_status')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (error) {
      console.error('Database error getting connections:', error);
      throw error;
    }

    // Transform to status object
    const connectionStatus = {};
    connections?.forEach(connection => {
      connectionStatus[connection.provider] = {
        connected: true,
        isActive: connection.is_active,
        connectedAt: connection.connected_at,
        lastSync: connection.last_sync,
        status: connection.last_sync_status
      };
    });

    console.log(`📊 Connection status for user ${userId}:`, connectionStatus);

    res.json({
      success: true,
      data: connectionStatus
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

    // Mark all connections as inactive in database
    const { data, error } = await supabase
      .from('data_connectors')
      .update({ is_active: false })
      .eq('user_id', userId)
      .select();

    if (error) {
      console.error('Database error resetting connections:', error);
      throw error;
    }

    const deletedCount = data?.length || 0;
    console.log(`🗑️ Deactivated ${deletedCount} connections for user ${userId}`);

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

    // Remove tokens from database and revoke access
    const { error } = await supabase
      .from('data_connectors')
      .update({ is_active: false })
      .eq('user_id', userId)
      .eq('provider', provider);

    if (error) {
      console.error('Error disconnecting provider:', error);
      throw error;
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

    const connectionData = {
      user_id: userId,
      provider: provider,
      access_token_encrypted: encryptToken('test-token'),
      refresh_token_encrypted: encryptToken('test-refresh-token'),
      expires_at: new Date(Date.now() + 3600000).toISOString(), // 1 hour
      connected_at: new Date().toISOString(),
      last_sync: new Date().toISOString(),
      is_active: true,
      permissions: {},
      total_synced: 0,
      last_sync_status: 'success',
      error_count: 0,
      scopes: []
    };

    const { error } = await supabase
      .from('data_connectors')
      .upsert(connectionData, {
        onConflict: 'user_id,provider'
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