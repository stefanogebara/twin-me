/**
 * Pipedream Connect Integration Routes
 * Handles OAuth token generation and webhooks for platform connections
 */

import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { encryptToken } from '../services/encryption.js';

const router = express.Router();

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Lazy initialization of Pipedream backend client
let pdBackend = null;
async function getPipedreamClient() {
  if (!pdBackend) {
    const { PipedreamClient } = await import('@pipedream/sdk');
    pdBackend = new PipedreamClient({
      clientId: process.env.PIPEDREAM_CLIENT_ID,
      clientSecret: process.env.PIPEDREAM_CLIENT_SECRET,
      projectId: process.env.PIPEDREAM_PROJECT_ID,
      projectEnvironment: process.env.PIPEDREAM_ENV || 'development'
    });
  }
  return pdBackend;
}

/**
 * POST /api/pipedream/connect-token
 * Generate Connect token for a user to connect their accounts
 */
router.post('/connect-token', async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    console.log(`[Pipedream] Generating Connect token for user ${userId}`);

    // Get Pipedream client
    const pd = await getPipedreamClient();

    // Create Connect token for this user
    const token = await pd.tokens.create({
      externalUserId: userId
    });

    console.log(`[Pipedream] Connect token generated for user ${userId}`);

    res.json({
      success: true,
      token
    });
  } catch (error) {
    console.error('[Pipedream] Error generating Connect token:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate Connect token',
      message: error.message
    });
  }
});

/**
 * POST /api/pipedream/webhooks/account-connected
 * Webhook handler for when a user connects a platform account
 */
router.post('/webhooks/account-connected', async (req, res) => {
  try {
    const { external_user_id, account, app } = req.body;

    console.log(`[Pipedream Webhook] Account connected:`, {
      userId: external_user_id,
      platform: app?.name_slug,
      accountId: account?.id
    });

    // Save connection to database (upsert to handle existing connections)
    const { error: dbError } = await supabase
      .from('platform_connections')
      .upsert({
        user_id: external_user_id,
        platform: app.name_slug,
        pipedream_account_id: account.id,
        connected: true,
        metadata: {
          connected_at: new Date().toISOString(),
          app_name: app.name,
          external_account_id: account.external_id
        }
      }, {
        onConflict: 'user_id,platform'
      });

    if (dbError) {
      console.error('[Pipedream Webhook] Database error:', dbError);
      return res.status(500).json({
        success: false,
        error: dbError.message
      });
    }

    console.log(`[Pipedream Webhook] Connection saved to database`);

    // TODO: Trigger initial data extraction workflow
    // await triggerExtractionWorkflow(external_user_id, app.name_slug);

    res.json({
      success: true,
      message: 'Account connection saved'
    });
  } catch (error) {
    console.error('[Pipedream Webhook] Error processing account connection:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process account connection',
      message: error.message
    });
  }
});

/**
 * POST /api/pipedream/webhooks/account-disconnected
 * Webhook handler for when a user disconnects a platform account
 */
router.post('/webhooks/account-disconnected', async (req, res) => {
  try {
    const { external_user_id, account, app } = req.body;

    console.log(`[Pipedream Webhook] Account disconnected:`, {
      userId: external_user_id,
      platform: app?.name_slug
    });

    // Update connection status in database
    const { error: dbError } = await supabase
      .from('platform_connections')
      .update({
        connected: false,
        disconnected_at: new Date().toISOString()
      })
      .eq('user_id', external_user_id)
      .eq('platform', app.name_slug);

    if (dbError) {
      console.error('[Pipedream Webhook] Database error:', dbError);
      return res.status(500).json({
        success: false,
        error: dbError.message
      });
    }

    console.log(`[Pipedream Webhook] Disconnection saved to database`);

    res.json({
      success: true,
      message: 'Account disconnection saved'
    });
  } catch (error) {
    console.error('[Pipedream Webhook] Error processing account disconnection:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process account disconnection',
      message: error.message
    });
  }
});

/**
 * GET /api/pipedream/accounts/:userId
 * Get all connected accounts for a user
 */
router.get('/accounts/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    console.log(`[Pipedream] Fetching connected accounts for user ${userId}`);

    // Get from database
    const { data: connections, error } = await supabase
      .from('platform_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('connected', true);

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      accounts: connections,
      count: connections.length
    });
  } catch (error) {
    console.error('[Pipedream] Error fetching connected accounts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch connected accounts',
      message: error.message
    });
  }
});

/**
 * DELETE /api/pipedream/accounts/:userId/:platform
 * Disconnect a platform for a user
 */
router.delete('/accounts/:userId/:platform', async (req, res) => {
  try {
    const { userId, platform } = req.params;

    console.log(`[Pipedream] Disconnecting ${platform} for user ${userId}`);

    // Get Pipedream account ID from database
    const { data: connection } = await supabase
      .from('platform_connections')
      .select('pipedream_account_id')
      .eq('user_id', userId)
      .eq('platform', platform)
      .single();

    if (!connection || !connection.pipedream_account_id) {
      return res.status(404).json({
        success: false,
        error: 'Account not found'
      });
    }

    // Disconnect via Pipedream API
    const pd = await getPipedreamClient();
    await pd.accounts.delete({
      id: connection.pipedream_account_id
    });

    // Update database
    const { error: dbError } = await supabase
      .from('platform_connections')
      .update({
        connected: false,
        disconnected_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('platform', platform);

    if (dbError) {
      throw dbError;
    }

    console.log(`[Pipedream] Successfully disconnected ${platform}`);

    res.json({
      success: true,
      message: `${platform} disconnected successfully`
    });
  } catch (error) {
    console.error('[Pipedream] Error disconnecting account:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to disconnect account',
      message: error.message
    });
  }
});

/**
 * POST /api/pipedream/trigger-extraction/:userId/:platform
 * Manually trigger data extraction for a platform
 */
router.post('/trigger-extraction/:userId/:platform', async (req, res) => {
  try {
    const { userId, platform } = req.params;

    console.log(`[Pipedream] Triggering extraction for ${platform}, user ${userId}`);

    // Get workflow URL from environment
    const workflowUrl = process.env[`PIPEDREAM_WORKFLOW_${platform.toUpperCase()}`];

    if (!workflowUrl) {
      return res.status(404).json({
        success: false,
        error: `No workflow configured for ${platform}`
      });
    }

    // Trigger workflow
    const response = await fetch(workflowUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-pd-external-user-id': userId,
        'Authorization': `Bearer ${process.env.PIPEDREAM_WORKFLOW_TOKEN || ''}`
      },
      body: JSON.stringify({
        userId,
        platform,
        triggeredAt: new Date().toISOString()
      })
    });

    if (!response.ok) {
      throw new Error(`Workflow trigger failed: ${response.status}`);
    }

    const result = await response.json();

    console.log(`[Pipedream] Extraction triggered successfully`);

    res.json({
      success: true,
      message: 'Extraction workflow triggered',
      result
    });
  } catch (error) {
    console.error('[Pipedream] Error triggering extraction:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to trigger extraction',
      message: error.message
    });
  }
});

export default router;
