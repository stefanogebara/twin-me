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
    console.warn('[Nango Webhooks] NANGO_WEBHOOK_SECRET not set, rejecting webhook');
    return false;
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

  // timingSafeEqual throws if buffers have different byte lengths
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSignature);
  if (sigBuf.length !== expBuf.length) return false;

  return crypto.timingSafeEqual(sigBuf, expBuf);
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
    const { error: upsertErr } = await supabaseAdmin
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
    if (upsertErr) {
      console.error(`[Nango Webhooks] Failed to record connection for ${provider}:`, upsertErr.message);
    }

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
    const { error: statusErr } = await supabaseAdmin
      .from('platform_connections')
      .update({
        status: 'error',
        error_message: error?.description || 'Token refresh failed',
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('platform', providerConfigKey);
    if (statusErr) {
      console.error(`[Nango Webhooks] Failed to update error status for ${provider}:`, statusErr.message);
    }

    // Create notification for user
    const { error: notifErr } = await supabaseAdmin
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
    if (notifErr) {
      console.error(`[Nango Webhooks] Failed to create notification for ${provider}:`, notifErr.message);
    }
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
    const { error: syncErr } = await supabaseAdmin
      .from('platform_connections')
      .update({
        last_sync: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('platform', providerConfigKey);
    if (syncErr) {
      console.error(`[Nango Webhooks] Failed to update last_sync for ${providerConfigKey}:`, syncErr.message);
    }
  }
}

export default router;
