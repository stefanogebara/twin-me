/**
 * Whoop Webhook Handler
 *
 * Receives push notifications from Whoop when data changes.
 * This eliminates the need for OAuth token refresh issues.
 *
 * Setup: Add your webhook URL to Whoop Developer Dashboard:
 * https://developer.whoop.com/
 */

import express from 'express';
import crypto from 'crypto';
import { supabaseAdmin } from '../services/database.js';

const router = express.Router();

// Whoop webhook secret (from Developer Dashboard)
const WHOOP_WEBHOOK_SECRET = process.env.WHOOP_WEBHOOK_SECRET;

/**
 * Verify Whoop webhook signature
 */
function verifyWebhookSignature(payload, signature, timestamp) {
  if (!WHOOP_WEBHOOK_SECRET) {
    console.warn('⚠️ WHOOP_WEBHOOK_SECRET not configured');
    return false;
  }

  const signaturePayload = `${timestamp}.${JSON.stringify(payload)}`;
  const expectedSignature = crypto
    .createHmac('sha256', WHOOP_WEBHOOK_SECRET)
    .update(signaturePayload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Main webhook endpoint
 * POST /api/webhooks/whoop
 */
router.post('/', express.json(), async (req, res) => {
  const startTime = Date.now();

  try {
    const signature = req.headers['x-whoop-signature'];
    const timestamp = req.headers['x-whoop-signature-timestamp'];
    const payload = req.body;

    console.log('🔔 [Whoop Webhook] Received event:', payload.type);

    // Verify signature (optional in dev, required in prod)
    if (process.env.NODE_ENV === 'production') {
      if (!verifyWebhookSignature(payload, signature, timestamp)) {
        console.error('❌ [Whoop Webhook] Invalid signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    // Extract event data
    const { user_id: whoopUserId, id: resourceId, type, trace_id } = payload;

    // Find our user by Whoop user ID
    const { data: connection } = await supabaseAdmin
      .from('platform_connections')
      .select('user_id')
      .eq('platform', 'whoop')
      .eq('platform_user_id', whoopUserId.toString())
      .single();

    if (!connection) {
      console.warn('⚠️ [Whoop Webhook] No user found for Whoop ID:', whoopUserId);
      // Still return 200 to prevent retries
      return res.status(200).json({ status: 'user_not_found' });
    }

    const userId = connection.user_id;

    // Handle different event types
    switch (type) {
      case 'recovery.updated':
        await handleRecoveryUpdate(userId, resourceId, whoopUserId);
        break;
      case 'sleep.updated':
        await handleSleepUpdate(userId, resourceId, whoopUserId);
        break;
      case 'workout.updated':
        await handleWorkoutUpdate(userId, resourceId, whoopUserId);
        break;
      case 'recovery.deleted':
      case 'sleep.deleted':
      case 'workout.deleted':
        await handleDataDeleted(userId, resourceId, type);
        break;
      default:
        console.log('📝 [Whoop Webhook] Unhandled event type:', type);
    }

    // Respond within 1 second as required by Whoop
    const elapsed = Date.now() - startTime;
    console.log(`✅ [Whoop Webhook] Processed ${type} in ${elapsed}ms`);

    return res.status(200).json({
      status: 'processed',
      trace_id,
      elapsed_ms: elapsed
    });

  } catch (error) {
    console.error('❌ [Whoop Webhook] Error:', error.message);
    // Return 200 to prevent excessive retries
    return res.status(200).json({ status: 'error', message: error.message });
  }
});

/**
 * Handle recovery data updates
 */
async function handleRecoveryUpdate(userId, cycleId, whoopUserId) {
  console.log(`📊 [Whoop Webhook] Processing recovery update for cycle ${cycleId}`);

  // In a full implementation, you would:
  // 1. Use stored refresh token to get new access token
  // 2. Fetch full recovery data from Whoop API
  // 3. Store in user_platform_data table

  // For now, just record the event
  await supabaseAdmin.from('user_platform_data').upsert({
    user_id: userId,
    platform: 'whoop',
    data_type: 'recovery_webhook',
    raw_data: {
      cycle_id: cycleId,
      whoop_user_id: whoopUserId,
      event_type: 'recovery.updated',
      received_at: new Date().toISOString()
    },
    extracted_at: new Date().toISOString()
  }, {
    onConflict: 'user_id,platform,data_type'
  });
}

/**
 * Handle sleep data updates
 */
async function handleSleepUpdate(userId, sleepId, whoopUserId) {
  console.log(`😴 [Whoop Webhook] Processing sleep update for sleep ${sleepId}`);

  await supabaseAdmin.from('user_platform_data').upsert({
    user_id: userId,
    platform: 'whoop',
    data_type: 'sleep_webhook',
    raw_data: {
      sleep_id: sleepId,
      whoop_user_id: whoopUserId,
      event_type: 'sleep.updated',
      received_at: new Date().toISOString()
    },
    extracted_at: new Date().toISOString()
  }, {
    onConflict: 'user_id,platform,data_type'
  });
}

/**
 * Handle workout data updates
 */
async function handleWorkoutUpdate(userId, workoutId, whoopUserId) {
  console.log(`💪 [Whoop Webhook] Processing workout update for workout ${workoutId}`);

  await supabaseAdmin.from('user_platform_data').upsert({
    user_id: userId,
    platform: 'whoop',
    data_type: 'workout_webhook',
    raw_data: {
      workout_id: workoutId,
      whoop_user_id: whoopUserId,
      event_type: 'workout.updated',
      received_at: new Date().toISOString()
    },
    extracted_at: new Date().toISOString()
  }, {
    onConflict: 'user_id,platform,data_type'
  });
}

/**
 * Handle deleted data
 */
async function handleDataDeleted(userId, resourceId, eventType) {
  console.log(`🗑️ [Whoop Webhook] Data deleted:`, eventType, resourceId);

  // Record deletion event for audit trail
  await supabaseAdmin.from('user_platform_data').insert({
    user_id: userId,
    platform: 'whoop',
    data_type: 'deletion_event',
    raw_data: {
      resource_id: resourceId,
      event_type: eventType,
      deleted_at: new Date().toISOString()
    },
    extracted_at: new Date().toISOString()
  });
}

export default router;
