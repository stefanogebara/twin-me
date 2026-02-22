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
import patternLearningBridge from '../services/patternLearningBridge.js';

const router = express.Router();

// Whoop webhook secret (from Developer Dashboard)
const WHOOP_WEBHOOK_SECRET = process.env.WHOOP_WEBHOOK_SECRET;

const WEBHOOK_TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Verify Whoop webhook signature and timestamp freshness.
 * Prevents replay attacks by rejecting requests older than 5 minutes.
 */
function verifyWebhookSignature(payload, signature, timestamp) {
  if (!WHOOP_WEBHOOK_SECRET) {
    console.warn('⚠️ WHOOP_WEBHOOK_SECRET not configured');
    return false;
  }

  if (!signature || !timestamp) {
    return false;
  }

  // Validate timestamp freshness to prevent replay attacks
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts) || Math.abs(Date.now() - ts * 1000) > WEBHOOK_TIMESTAMP_TOLERANCE_MS) {
    console.warn('[Whoop Webhook] Timestamp outside acceptable window (possible replay)');
    return false;
  }

  const signaturePayload = `${timestamp}.${JSON.stringify(payload)}`;
  const expectedSignature = crypto
    .createHmac('sha256', WHOOP_WEBHOOK_SECRET)
    .update(signaturePayload)
    .digest('hex');

  // timingSafeEqual throws RangeError if buffers have different lengths
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSignature);
  if (sigBuf.length !== expBuf.length) return false;

  return crypto.timingSafeEqual(sigBuf, expBuf);
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

  try {
    // Fetch full recovery data from Whoop API
    const recoveryData = await fetchWhoopRecovery(userId, cycleId);

    if (recoveryData) {
      // Store in user_platform_data
      await supabaseAdmin.from('user_platform_data').upsert({
        user_id: userId,
        platform: 'whoop',
        data_type: 'recovery',
        raw_data: recoveryData,
        extracted_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,platform,data_type'
      });

      // Push to Pattern Learning System
      await patternLearningBridge.pushWhoopRecovery(userId, recoveryData);
      console.log(`✅ [Whoop Webhook] Recovery data pushed to pattern learning`);
    }
  } catch (err) {
    console.error(`[Whoop Webhook] Error fetching recovery:`, err.message);
    // Still record the webhook event
    await supabaseAdmin.from('user_platform_data').upsert({
      user_id: userId,
      platform: 'whoop',
      data_type: 'recovery_webhook',
      raw_data: {
        cycle_id: cycleId,
        whoop_user_id: whoopUserId,
        event_type: 'recovery.updated',
        received_at: new Date().toISOString(),
        fetch_error: err.message
      },
      extracted_at: new Date().toISOString()
    }, {
      onConflict: 'user_id,platform,data_type'
    });
  }
}

/**
 * Handle sleep data updates
 */
async function handleSleepUpdate(userId, sleepId, whoopUserId) {
  console.log(`😴 [Whoop Webhook] Processing sleep update for sleep ${sleepId}`);

  try {
    const sleepData = await fetchWhoopSleep(userId, sleepId);

    if (sleepData) {
      await supabaseAdmin.from('user_platform_data').upsert({
        user_id: userId,
        platform: 'whoop',
        data_type: 'sleep',
        raw_data: sleepData,
        extracted_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,platform,data_type'
      });

      // Push to Pattern Learning System
      await patternLearningBridge.pushWhoopSleep(userId, sleepData);
      console.log(`✅ [Whoop Webhook] Sleep data pushed to pattern learning`);
    }
  } catch (err) {
    console.error(`[Whoop Webhook] Error fetching sleep:`, err.message);
    await supabaseAdmin.from('user_platform_data').upsert({
      user_id: userId,
      platform: 'whoop',
      data_type: 'sleep_webhook',
      raw_data: {
        sleep_id: sleepId,
        whoop_user_id: whoopUserId,
        event_type: 'sleep.updated',
        received_at: new Date().toISOString(),
        fetch_error: err.message
      },
      extracted_at: new Date().toISOString()
    }, {
      onConflict: 'user_id,platform,data_type'
    });
  }
}

/**
 * Handle workout data updates
 */
async function handleWorkoutUpdate(userId, workoutId, whoopUserId) {
  console.log(`💪 [Whoop Webhook] Processing workout update for workout ${workoutId}`);

  try {
    const workoutData = await fetchWhoopWorkout(userId, workoutId);

    if (workoutData) {
      await supabaseAdmin.from('user_platform_data').upsert({
        user_id: userId,
        platform: 'whoop',
        data_type: 'workout',
        raw_data: workoutData,
        extracted_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,platform,data_type'
      });

      // Push to Pattern Learning System
      await patternLearningBridge.pushWhoopWorkout(userId, workoutData);
      console.log(`✅ [Whoop Webhook] Workout data pushed to pattern learning`);
    }
  } catch (err) {
    console.error(`[Whoop Webhook] Error fetching workout:`, err.message);
    await supabaseAdmin.from('user_platform_data').upsert({
      user_id: userId,
      platform: 'whoop',
      data_type: 'workout_webhook',
      raw_data: {
        workout_id: workoutId,
        whoop_user_id: whoopUserId,
        event_type: 'workout.updated',
        received_at: new Date().toISOString(),
        fetch_error: err.message
      },
      extracted_at: new Date().toISOString()
    }, {
      onConflict: 'user_id,platform,data_type'
    });
  }
}

// ============================================================================
// WHOOP API FETCH FUNCTIONS
// ============================================================================

/**
 * Get valid access token for user (refresh if needed)
 */
async function getWhoopAccessToken(userId) {
  const { data: connection } = await supabaseAdmin
    .from('platform_connections')
    .select('access_token, refresh_token, token_expires_at')
    .eq('user_id', userId)
    .eq('platform', 'whoop')
    .single();

  if (!connection) {
    throw new Error('No Whoop connection found');
  }

  // Check if token is expired
  const expiresAt = new Date(connection.token_expires_at);
  if (expiresAt <= new Date()) {
    // Token expired, try to refresh
    const newToken = await refreshWhoopToken(userId, connection.refresh_token);
    return newToken;
  }

  return connection.access_token;
}

/**
 * Refresh Whoop access token
 */
async function refreshWhoopToken(userId, refreshToken) {
  const response = await fetch('https://api.prod.whoop.com/oauth/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: process.env.WHOOP_CLIENT_ID,
      client_secret: process.env.WHOOP_CLIENT_SECRET
    })
  });

  if (!response.ok) {
    throw new Error(`Token refresh failed: ${response.status}`);
  }

  const tokens = await response.json();

  // Update stored tokens
  await supabaseAdmin
    .from('platform_connections')
    .update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || refreshToken,
      token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    })
    .eq('user_id', userId)
    .eq('platform', 'whoop');

  return tokens.access_token;
}

/**
 * Fetch recovery data from Whoop API
 */
async function fetchWhoopRecovery(userId, cycleId) {
  const accessToken = await getWhoopAccessToken(userId);

  // V2 API: Get recovery by cycle ID
  const response = await fetch(`https://api.prod.whoop.com/developer/v2/cycle/${cycleId}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    throw new Error(`Whoop API error: ${response.status}`);
  }

  const cycle = await response.json();
  return {
    cycle_id: cycle.id,
    recovery_score: cycle.score?.recovery_score ?? cycle.score?.recovery,
    hrv_rmssd_milli: cycle.score?.hrv_rmssd_milli ?? cycle.score?.hrv?.rmssd_milli,
    resting_heart_rate: cycle.score?.resting_heart_rate,
    spo2_percentage: cycle.score?.spo2_percentage,
    skin_temp_celsius: cycle.score?.skin_temp_celsius,
    sleep_id: cycle.sleep_id,
    start: cycle.start,
    end: cycle.end
  };
}

/**
 * Fetch sleep data from Whoop API
 */
async function fetchWhoopSleep(userId, sleepId) {
  const accessToken = await getWhoopAccessToken(userId);

  // V2 API: Get sleep by ID
  const response = await fetch(`https://api.prod.whoop.com/developer/v2/activity/sleep/${sleepId}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    throw new Error(`Whoop API error: ${response.status}`);
  }

  const sleep = await response.json();
  return {
    id: sleep.id,
    start: sleep.start,
    end: sleep.end,
    total_sleep_time_milli: sleep.score?.stage_summary?.total_in_bed_time_milli,
    sleep_efficiency: sleep.score?.sleep_efficiency_percentage,
    rem_sleep_time_milli: sleep.score?.stage_summary?.total_rem_sleep_time_milli,
    slow_wave_sleep_time_milli: sleep.score?.stage_summary?.total_slow_wave_sleep_time_milli,
    light_sleep_time_milli: sleep.score?.stage_summary?.total_light_sleep_time_milli,
    awake_time_milli: sleep.score?.stage_summary?.total_awake_time_milli,
    disturbance_count: sleep.score?.stage_summary?.disturbance_count,
    respiratory_rate: sleep.score?.respiratory_rate
  };
}

/**
 * Fetch workout data from Whoop API
 */
async function fetchWhoopWorkout(userId, workoutId) {
  const accessToken = await getWhoopAccessToken(userId);

  // V2 API: Get workout by ID
  const response = await fetch(`https://api.prod.whoop.com/developer/v2/activity/workout/${workoutId}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    throw new Error(`Whoop API error: ${response.status}`);
  }

  const workout = await response.json();
  return {
    id: workout.id,
    sport_id: workout.sport_id,
    start: workout.start,
    end: workout.end,
    strain: workout.score?.strain,
    average_heart_rate: workout.score?.average_heart_rate,
    max_heart_rate: workout.score?.max_heart_rate,
    kilojoule: workout.score?.kilojoule,
    duration_milli: workout.score?.duration_milli || (new Date(workout.end) - new Date(workout.start)),
    zone_zero_milli: workout.score?.zone_duration?.zone_zero_milli,
    zone_one_milli: workout.score?.zone_duration?.zone_one_milli,
    zone_two_milli: workout.score?.zone_duration?.zone_two_milli,
    zone_three_milli: workout.score?.zone_duration?.zone_three_milli,
    zone_four_milli: workout.score?.zone_duration?.zone_four_milli
  };
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
