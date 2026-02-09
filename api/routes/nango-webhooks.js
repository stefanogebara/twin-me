/**
 * NANGO WEBHOOK HANDLER
 *
 * Receives webhooks from Nango for:
 * - New connection created
 * - Connection deleted
 * - Token refresh errors
 * - Sync completed events
 */

import express from 'express';
import crypto from 'crypto';
import { supabaseAdmin } from '../services/database.js';
import { extractPlatformData } from '../services/nangoService.js';

const router = express.Router();

/**
 * Verify Nango webhook signature
 */
function verifyWebhookSignature(req) {
  const signature = req.headers['x-nango-signature'];
  const webhookSecret = process.env.NANGO_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.warn('[Nango Webhooks] NANGO_WEBHOOK_SECRET not set, skipping verification');
    return true;
  }

  if (!signature) {
    console.warn('[Nango Webhooks] No signature provided');
    return false;
  }

  const payload = JSON.stringify(req.body);
  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * POST /api/nango-webhooks - Receive Nango webhooks
 */
router.post('/', express.json(), async (req, res) => {
  try {
    // Verify signature
    if (!verifyWebhookSignature(req)) {
      console.error('[Nango Webhooks] Invalid signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { type, operation, connectionId, provider, providerConfigKey, success, endUser, error } = req.body;

    console.log(`[Nango Webhooks] Received: ${type}/${operation} for ${provider} (user: ${endUser?.endUserId})`);

    // Handle different webhook types
    switch (type) {
      case 'auth':
        await handleAuthWebhook(req.body);
        break;
      case 'sync':
        await handleSyncWebhook(req.body);
        break;
      default:
        console.log(`[Nango Webhooks] Unknown webhook type: ${type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('[Nango Webhooks] Error processing webhook:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/**
 * Handle authentication webhooks (connection created/refresh error)
 */
async function handleAuthWebhook(data) {
  const { operation, connectionId, provider, providerConfigKey, success, endUser, error } = data;

  const userId = endUser?.endUserId;
  if (!userId) {
    console.error('[Nango Webhooks] No user ID in auth webhook');
    return;
  }

  if (operation === 'creation' && success) {
    console.log(`[Nango Webhooks] New connection: ${provider} for user ${userId}`);

    // Record the connection in our database
    await supabaseAdmin
      .from('platform_connections')
      .upsert({
        user_id: userId,
        platform: providerConfigKey,
        provider: provider,
        status: 'connected',
        connection_id: connectionId,
        connected_at: new Date().toISOString(),
        last_sync: null,
        metadata: {
          source: 'nango',
          email: endUser?.endUserEmail
        }
      }, {
        onConflict: 'user_id,platform'
      });

    // Trigger initial data extraction in background
    extractPlatformData(userId, providerConfigKey)
      .then(result => {
        if (result.success) {
          console.log(`[Nango Webhooks] Initial extraction complete for ${providerConfigKey}`);

          // Store extracted data
          supabaseAdmin
            .from('platform_extracted_data')
            .insert({
              user_id: userId,
              platform: providerConfigKey,
              data: result.extractedData,
              extracted_at: new Date().toISOString()
            })
            .then(() => {
              console.log(`[Nango Webhooks] Stored extracted data for ${providerConfigKey}`);
            })
            .catch(err => {
              console.error(`[Nango Webhooks] Failed to store extracted data:`, err.message);
            });
        }
      })
      .catch(err => {
        console.error(`[Nango Webhooks] Initial extraction failed:`, err.message);
      });

  } else if (operation === 'refresh' && !success) {
    console.error(`[Nango Webhooks] Token refresh failed for ${provider}: ${error?.description}`);

    // Update connection status
    await supabaseAdmin
      .from('platform_connections')
      .update({
        status: 'error',
        error_message: error?.description || 'Token refresh failed',
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('platform', providerConfigKey);

    // Create notification for user
    await supabaseAdmin
      .from('user_notifications')
      .insert({
        user_id: userId,
        type: 'connection_error',
        title: `${provider} Connection Issue`,
        message: `Your ${provider} connection needs to be reconnected. ${error?.description || ''}`,
        data: { platform: providerConfigKey, error },
        read: false,
        created_at: new Date().toISOString()
      });
  }
}

/**
 * Handle sync webhooks (data sync completed)
 */
async function handleSyncWebhook(data) {
  const { syncType, connectionId, providerConfigKey, success, modelsCount, endUser } = data;

  const userId = endUser?.endUserId;
  if (!userId) return;

  console.log(`[Nango Webhooks] Sync ${success ? 'completed' : 'failed'}: ${providerConfigKey} (${modelsCount} models)`);

  if (success) {
    // Update last sync timestamp
    await supabaseAdmin
      .from('platform_connections')
      .update({
        last_sync: new Date().toISOString(),
        sync_count: supabaseAdmin.sql`COALESCE(sync_count, 0) + 1`
      })
      .eq('user_id', userId)
      .eq('platform', providerConfigKey);
  }
}

export default router;
