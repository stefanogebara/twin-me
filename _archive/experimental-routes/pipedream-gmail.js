/**
 * Pipedream Gmail OAuth Integration
 *
 * PIPEDREAM SETUP INSTRUCTIONS:
 * ==============================
 *
 * 1. Create Pipedream Connect Project:
 *    - Go to https://pipedream.com/connect
 *    - Click "Create Project"
 *    - Name: "Twin AI Learn Gmail"
 *    - Copy your Project ID and OAuth Secret
 *
 * 2. Configure Gmail OAuth App:
 *    - In your Pipedream project, add Gmail as an app
 *    - Configure OAuth scopes:
 *      * https://www.googleapis.com/auth/gmail.readonly
 *      * https://www.googleapis.com/auth/gmail.metadata
 *      * https://www.googleapis.com/auth/userinfo.email
 *      * https://www.googleapis.com/auth/userinfo.profile
 *    - Set redirect URI: http://127.0.0.1:8086/oauth/gmail/callback
 *
 * 3. Set Environment Variables (.env):
 *    PIPEDREAM_PROJECT_ID=your-pipedream-project-id
 *    PIPEDREAM_PROJECT_KEY=your-pipedream-oauth-secret
 *    PIPEDREAM_ENVIRONMENT=development
 *
 * 4. Install Pipedream SDK (already installed):
 *    npm install @pipedream/sdk
 *
 * ARCHITECTURE:
 * =============
 * This endpoint provides Gmail OAuth via Pipedream Connect, which handles:
 * - OAuth popup/modal UI (like Cofounder)
 * - Token management and refresh
 * - Secure credential storage
 * - Gmail API access
 */

import express from 'express';
import { serverDb } from '../services/database.js';
import { authenticateUser } from '../middleware/auth.js';
import { extractGmailData } from '../services/gmail-extractor.js';
import { analyzeEmailStyle } from '../services/email-analyzer.js';

const router = express.Router();

/**
 * Initiate Pipedream Gmail OAuth Flow
 * Returns Pipedream Connect URL for popup
 */
router.post('/connect', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { returnUrl } = req.body;

    console.log('🔵 [Pipedream Gmail] Initiating OAuth for user:', userId);

    // Validate Pipedream configuration
    if (!process.env.PIPEDREAM_PROJECT_ID || !process.env.PIPEDREAM_PROJECT_KEY) {
      console.error('❌ [Pipedream Gmail] Missing Pipedream credentials');
      return res.status(500).json({
        success: false,
        error: 'Pipedream Connect is not configured. Please set PIPEDREAM_PROJECT_ID and PIPEDREAM_PROJECT_KEY in .env'
      });
    }

    // Generate state for OAuth security
    const state = Buffer.from(JSON.stringify({
      userId,
      timestamp: Date.now(),
      returnUrl: returnUrl || '/onboarding/analysis'
    })).toString('base64');

    // Pipedream Connect URL
    // Documentation: https://pipedream.com/docs/connect
    const pipedreamConnectUrl = `https://connect.pipedream.com/oauth/connect?` +
      new URLSearchParams({
        app: 'gmail', // App identifier in Pipedream
        project_id: process.env.PIPEDREAM_PROJECT_ID,
        state: state,
        redirect_uri: `${process.env.APP_URL}/oauth/gmail/callback`
      }).toString();

    console.log('✅ [Pipedream Gmail] Generated OAuth URL');

    res.json({
      success: true,
      data: {
        oauthUrl: pipedreamConnectUrl,
        state
      }
    });
  } catch (error) {
    console.error('❌ [Pipedream Gmail] Connect error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initiate Gmail OAuth',
      details: error.message
    });
  }
});

/**
 * Handle Pipedream OAuth Callback
 * Receives account_id and tokens from Pipedream
 */
router.post('/callback', async (req, res) => {
  try {
    const { account_id, state, error } = req.body;

    console.log('🟢 [Pipedream Gmail] OAuth callback received:', {
      hasAccountId: !!account_id,
      hasState: !!state,
      hasError: !!error
    });

    // Handle OAuth errors
    if (error) {
      console.error('❌ [Pipedream Gmail] OAuth error:', error);
      return res.status(400).json({
        success: false,
        error: 'Gmail OAuth failed',
        details: error
      });
    }

    // Validate state
    if (!state) {
      console.error('❌ [Pipedream Gmail] Missing state parameter');
      return res.status(400).json({
        success: false,
        error: 'Invalid OAuth callback: missing state'
      });
    }

    // Decode state
    let stateData;
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64').toString('utf-8'));
    } catch (err) {
      console.error('❌ [Pipedream Gmail] Failed to decode state:', err);
      return res.status(400).json({
        success: false,
        error: 'Invalid state parameter'
      });
    }

    const { userId, returnUrl } = stateData;

    if (!userId) {
      console.error('❌ [Pipedream Gmail] Missing userId in state');
      return res.status(400).json({
        success: false,
        error: 'Invalid OAuth state'
      });
    }

    // Store Pipedream account connection in database
    await serverDb.upsertPlatformConnection({
      userId,
      platform: 'gmail',
      accountId: account_id,
      connectedAt: new Date().toISOString(),
      status: 'connected',
      metadata: {
        provider: 'pipedream',
        environment: process.env.PIPEDREAM_ENVIRONMENT || 'development'
      }
    });

    console.log('✅ [Pipedream Gmail] Connection saved to database');

    res.json({
      success: true,
      data: {
        accountId: account_id,
        platform: 'gmail',
        returnUrl: returnUrl || '/onboarding/analysis'
      }
    });
  } catch (error) {
    console.error('❌ [Pipedream Gmail] Callback error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process Gmail OAuth callback',
      details: error.message
    });
  }
});

/**
 * Extract Gmail Data
 * Fetches recent emails and analyzes communication style
 */
router.post('/extract', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 50 } = req.body;

    console.log('📧 [Pipedream Gmail] Starting data extraction for user:', userId);

    // Get Pipedream connection from database
    const connection = await serverDb.getPlatformConnection(userId, 'gmail');

    if (!connection || !connection.accountId) {
      console.error('❌ [Pipedream Gmail] No connection found');
      return res.status(404).json({
        success: false,
        error: 'Gmail not connected. Please connect your account first.'
      });
    }

    // Extract Gmail data using Pipedream account
    console.log('📧 [Pipedream Gmail] Extracting emails (limit:', limit, ')');
    const emailData = await extractGmailData(connection.accountId, limit);

    if (!emailData || emailData.length === 0) {
      console.log('⚠️ [Pipedream Gmail] No emails found');
      return res.json({
        success: true,
        data: {
          emailCount: 0,
          message: 'No emails found to analyze'
        }
      });
    }

    console.log('✅ [Pipedream Gmail] Extracted', emailData.length, 'emails');

    // Analyze email writing style using Anthropic Claude
    console.log('🤖 [Pipedream Gmail] Analyzing email style with Claude...');
    const styleAnalysis = await analyzeEmailStyle(emailData);

    // Store extracted data in soul_data table
    await serverDb.storeSoulData({
      userId,
      platform: 'gmail',
      dataType: 'email_communication',
      rawData: {
        emailCount: emailData.length,
        emails: emailData.slice(0, 10), // Store sample for privacy
        extractedAt: new Date().toISOString()
      },
      extractedPatterns: styleAnalysis,
      privacyLevel: 70 // Default privacy level for email data
    });

    console.log('✅ [Pipedream Gmail] Analysis complete and stored');

    res.json({
      success: true,
      data: {
        emailCount: emailData.length,
        analysis: styleAnalysis,
        extractedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('❌ [Pipedream Gmail] Extract error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to extract Gmail data',
      details: error.message
    });
  }
});

/**
 * Get Gmail Connection Status
 * Check if user has connected Gmail
 */
router.get('/status', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

    const connection = await serverDb.getPlatformConnection(userId, 'gmail');

    if (!connection) {
      return res.json({
        success: true,
        data: {
          connected: false,
          platform: 'gmail'
        }
      });
    }

    res.json({
      success: true,
      data: {
        connected: true,
        platform: 'gmail',
        connectedAt: connection.connectedAt,
        accountId: connection.accountId,
        lastSync: connection.lastSync
      }
    });
  } catch (error) {
    console.error('❌ [Pipedream Gmail] Status check error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check Gmail status',
      details: error.message
    });
  }
});

/**
 * Disconnect Gmail
 * Remove connection and revoke access
 */
router.delete('/disconnect', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

    console.log('🔌 [Pipedream Gmail] Disconnecting for user:', userId);

    // Remove connection from database
    await serverDb.deletePlatformConnection(userId, 'gmail');

    console.log('✅ [Pipedream Gmail] Disconnected successfully');

    res.json({
      success: true,
      message: 'Gmail disconnected successfully'
    });
  } catch (error) {
    console.error('❌ [Pipedream Gmail] Disconnect error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to disconnect Gmail',
      details: error.message
    });
  }
});

export default router;
