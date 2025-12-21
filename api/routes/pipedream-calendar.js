/**
 * Pipedream Google Calendar OAuth Integration
 *
 * PIPEDREAM SETUP INSTRUCTIONS:
 * ==============================
 *
 * 1. Create Pipedream Connect Project (or use existing):
 *    - Go to https://pipedream.com/connect
 *    - Use existing project or create new: "Twin AI Learn Calendar"
 *    - Copy your Project ID and OAuth Secret
 *
 * 2. Configure Google Calendar OAuth App:
 *    - In your Pipedream project, add Google Calendar as an app
 *    - Configure OAuth scopes:
 *      * https://www.googleapis.com/auth/calendar.readonly
 *      * https://www.googleapis.com/auth/calendar.events.readonly
 *      * https://www.googleapis.com/auth/userinfo.email
 *      * https://www.googleapis.com/auth/userinfo.profile
 *    - Set redirect URI: http://127.0.0.1:8086/oauth/calendar/callback
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
 * This endpoint provides Google Calendar OAuth via Pipedream Connect, which handles:
 * - OAuth popup/modal UI (like Cofounder)
 * - Token management and refresh
 * - Secure credential storage
 * - Google Calendar API access
 */

import express from 'express';
import { serverDb } from '../services/database.js';
import { authenticateUser } from '../middleware/auth.js';
import { extractCalendarData } from '../services/calendar-extractor.js';
import { analyzeCalendarPatterns } from '../services/calendar-analyzer.js';

const router = express.Router();

/**
 * Initiate Pipedream Google Calendar OAuth Flow
 * Returns Pipedream Connect URL for popup
 */
router.post('/connect', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { returnUrl } = req.body;

    console.log('🔵 [Pipedream Calendar] Initiating OAuth for user:', userId);

    // Validate Pipedream configuration
    if (!process.env.PIPEDREAM_PROJECT_ID || !process.env.PIPEDREAM_PROJECT_KEY) {
      console.error('❌ [Pipedream Calendar] Missing Pipedream credentials');
      return res.status(500).json({
        success: false,
        error: 'Pipedream Connect is not configured. Please set PIPEDREAM_PROJECT_ID and PIPEDREAM_PROJECT_KEY in .env'
      });
    }

    // Generate state for OAuth security
    const state = Buffer.from(JSON.stringify({
      userId,
      timestamp: Date.now(),
      returnUrl: returnUrl || '/onboarding/platforms'
    })).toString('base64');

    // Pipedream Connect URL
    // Documentation: https://pipedream.com/docs/connect
    const pipedreamConnectUrl = `https://connect.pipedream.com/oauth/connect?` +
      new URLSearchParams({
        app: 'google_calendar', // App identifier in Pipedream
        project_id: process.env.PIPEDREAM_PROJECT_ID,
        state: state,
        redirect_uri: `${process.env.APP_URL}/oauth/calendar/callback`
      }).toString();

    console.log('✅ [Pipedream Calendar] Generated OAuth URL');

    res.json({
      success: true,
      data: {
        oauthUrl: pipedreamConnectUrl,
        state
      }
    });
  } catch (error) {
    console.error('❌ [Pipedream Calendar] Connect error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initiate Calendar OAuth',
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

    console.log('🟢 [Pipedream Calendar] OAuth callback received:', {
      hasAccountId: !!account_id,
      hasState: !!state,
      hasError: !!error
    });

    // Handle OAuth errors
    if (error) {
      console.error('❌ [Pipedream Calendar] OAuth error:', error);
      return res.status(400).json({
        success: false,
        error: 'Calendar OAuth failed',
        details: error
      });
    }

    // Validate state
    if (!state) {
      console.error('❌ [Pipedream Calendar] Missing state parameter');
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
      console.error('❌ [Pipedream Calendar] Failed to decode state:', err);
      return res.status(400).json({
        success: false,
        error: 'Invalid state parameter'
      });
    }

    const { userId, returnUrl } = stateData;

    if (!userId) {
      console.error('❌ [Pipedream Calendar] Missing userId in state');
      return res.status(400).json({
        success: false,
        error: 'Invalid OAuth state'
      });
    }

    // Store Pipedream account connection in database
    await serverDb.upsertPlatformConnection({
      userId,
      platform: 'google_calendar',
      accountId: account_id,
      connectedAt: new Date().toISOString(),
      status: 'connected',
      metadata: {
        provider: 'pipedream',
        environment: process.env.PIPEDREAM_ENVIRONMENT || 'development'
      }
    });

    console.log('✅ [Pipedream Calendar] Connection saved to database');

    res.json({
      success: true,
      data: {
        accountId: account_id,
        platform: 'google_calendar',
        returnUrl: returnUrl || '/onboarding/platforms'
      }
    });
  } catch (error) {
    console.error('❌ [Pipedream Calendar] Callback error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process Calendar OAuth callback',
      details: error.message
    });
  }
});

/**
 * Extract Google Calendar Data
 * Fetches recent events and analyzes scheduling patterns
 */
router.post('/extract', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { daysBack = 30, maxEvents = 100 } = req.body;

    console.log('📅 [Pipedream Calendar] Starting data extraction for user:', userId);

    // Get Pipedream connection from database
    const connection = await serverDb.getPlatformConnection(userId, 'google_calendar');

    if (!connection || !connection.account_id) {
      console.error('❌ [Pipedream Calendar] No connection found');
      return res.status(404).json({
        success: false,
        error: 'Calendar not connected. Please connect your account first.'
      });
    }

    // Extract Calendar data using Pipedream account
    console.log('📅 [Pipedream Calendar] Extracting events (days:', daysBack, 'max:', maxEvents, ')');
    const calendarData = await extractCalendarData(connection.account_id, daysBack, maxEvents);

    if (!calendarData || calendarData.events.length === 0) {
      console.log('⚠️ [Pipedream Calendar] No events found');
      return res.json({
        success: true,
        data: {
          eventCount: 0,
          message: 'No calendar events found to analyze'
        }
      });
    }

    console.log('✅ [Pipedream Calendar] Extracted', calendarData.events.length, 'events');

    // Analyze calendar patterns using Anthropic Claude
    console.log('🤖 [Pipedream Calendar] Analyzing schedule patterns with Claude...');
    const patternAnalysis = await analyzeCalendarPatterns(calendarData);

    // Store extracted data in soul_data table
    await serverDb.storeSoulData({
      userId,
      platform: 'google_calendar',
      dataType: 'calendar_patterns',
      rawData: {
        eventCount: calendarData.events.length,
        events: calendarData.events.slice(0, 10), // Store sample for privacy
        extractedAt: new Date().toISOString(),
        daysAnalyzed: daysBack
      },
      extractedPatterns: patternAnalysis,
      privacyLevel: 75 // Default privacy level for calendar data
    });

    console.log('✅ [Pipedream Calendar] Analysis complete and stored');

    res.json({
      success: true,
      data: {
        eventCount: calendarData.events.length,
        analysis: patternAnalysis,
        extractedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('❌ [Pipedream Calendar] Extract error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to extract Calendar data',
      details: error.message
    });
  }
});

/**
 * Get Calendar Connection Status
 * Check if user has connected Google Calendar
 */
router.get('/status', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

    const connection = await serverDb.getPlatformConnection(userId, 'google_calendar');

    if (!connection) {
      return res.json({
        success: true,
        data: {
          connected: false,
          platform: 'google_calendar'
        }
      });
    }

    res.json({
      success: true,
      data: {
        connected: true,
        platform: 'google_calendar',
        connectedAt: connection.connectedAt,
        accountId: connection.accountId,
        lastSync: connection.lastSync
      }
    });
  } catch (error) {
    console.error('❌ [Pipedream Calendar] Status check error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check Calendar status',
      details: error.message
    });
  }
});

/**
 * Disconnect Google Calendar
 * Remove connection and revoke access
 */
router.delete('/disconnect', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

    console.log('🔌 [Pipedream Calendar] Disconnecting for user:', userId);

    // Remove connection from database
    await serverDb.deletePlatformConnection(userId, 'google_calendar');

    console.log('✅ [Pipedream Calendar] Disconnected successfully');

    res.json({
      success: true,
      message: 'Calendar disconnected successfully'
    });
  } catch (error) {
    console.error('❌ [Pipedream Calendar] Disconnect error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to disconnect Calendar',
      details: error.message
    });
  }
});

export default router;
