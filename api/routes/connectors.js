/**
 * Connector Routes - OAuth Integration for External Data Sources
 */

import express from 'express';
import { supabase } from '../config/supabase.js';
const router = express.Router();

// Temporary in-memory storage for OAuth connections (for testing)
// In production, this should be stored in the database
// Export this so it can be shared with data-verification routes
export const tempConnections = new Map();

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

    // Store tokens temporarily in memory (for testing)
    try {
      const connectionKey = `${userId}-${provider}`;
      const connectionData = {
        user_id: userId,
        provider: provider,
        access_token: tokens.access_token, // In production, this should be encrypted
        refresh_token: tokens.refresh_token,
        expires_at: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
        connected_at: new Date(),
        last_sync: new Date(),
        is_active: true,
        permissions: {},
        total_synced: 0,
        last_sync_status: 'success',
        error_count: 0
      };

      // Store in temporary memory storage
      tempConnections.set(connectionKey, connectionData);

      console.log(`✅ Successfully stored ${provider} connection for user ${userId} (temp storage)`);
      console.log(`📊 Current connections:`, Array.from(tempConnections.keys()));

    } catch (error) {
      console.error('Error storing connection:', error);
      // Continue anyway - don't fail the OAuth flow
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

    // Get connection status from temporary storage
    const connectionStatus = {};

    // Filter connections for this user
    for (const [key, connection] of tempConnections.entries()) {
      if (connection.user_id === userId && connection.is_active) {
        connectionStatus[connection.provider] = {
          connected: true,
          isActive: connection.is_active,
          connectedAt: connection.connected_at,
          lastSync: connection.last_sync,
          status: connection.last_sync_status
        };
      }
    }

    console.log(`📊 Connection status for user ${userId}:`, connectionStatus);
    console.log(`📋 All stored connections:`, Array.from(tempConnections.keys()));

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

    // Remove all connections for this user from temporary storage
    const keysToDelete = [];
    for (const [key, connection] of tempConnections.entries()) {
      if (connection.user_id === userId) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => tempConnections.delete(key));

    console.log(`🗑️ Deleted ${keysToDelete.length} connections for user ${userId}`);

    res.json({
      success: true,
      data: {
        userId,
        reset: true,
        deletedConnections: keysToDelete.length,
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

    const connectionKey = `${userId}-${provider}`;
    const connectionData = {
      user_id: userId,
      provider: provider,
      access_token: 'test-token',
      refresh_token: 'test-refresh-token',
      expires_at: new Date(Date.now() + 3600000), // 1 hour
      connected_at: new Date(),
      last_sync: new Date(),
      is_active: true,
      permissions: {},
      total_synced: 0,
      last_sync_status: 'success',
      error_count: 0
    };

    tempConnections.set(connectionKey, connectionData);

    console.log(`🧪 Test connection added: ${connectionKey}`);

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