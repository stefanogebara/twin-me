/**
 * NANGO WEBHOOK HANDLER
 *
 * Receives webhooks from Nango for:
 * - New connection created (auth/creation)
 * - Token refresh errors (auth/refresh)
 * - Sync completed events (sync) → triggers observation ingestion
 *
 * On sync completion:
 *   1. Update last_sync_at timestamp
 *   2. Run platform-specific observation fetcher → memory stream
 *   3. Check prospective memory condition triggers against new data
 *   4. Log agent event for audit trail
 *
 * Setup: Configure webhook URL in Nango Dashboard → Settings → Webhooks
 *   URL: https://twin-ai-learn.vercel.app/api/nango-webhooks
 *   Secret: NANGO_WEBHOOK_SECRET env var
 */

import express from 'express';
import crypto from 'crypto';
import { supabaseAdmin } from '../services/database.js';
import { extractPlatformData } from '../services/nangoService.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('NangoWebhooks');

const router = express.Router();

/**
 * Verify Nango webhook signature
 */
function verifyWebhookSignature(req) {
  const signature = req.headers['x-nango-signature'];
  const webhookSecret = process.env.NANGO_WEBHOOK_SECRET;

  if (!webhookSecret) {
    log.warn('NANGO_WEBHOOK_SECRET not set, rejecting webhook');
    return false;
  }

  if (!signature) {
    log.warn('No signature provided');
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
      log.error('Invalid signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { type, operation, connectionId, provider, providerConfigKey, success, endUser, error } = req.body;

    log.info(`Received: ${type}/${operation} for ${provider} (user: ${endUser?.endUserId})`);

    // Handle different webhook types
    switch (type) {
      case 'auth':
        await handleAuthWebhook(req.body);
        break;
      case 'sync':
        await handleSyncWebhook(req.body);
        break;
      default:
        log.info(`Unknown webhook type: ${type}`);
    }

    res.json({ received: true });
  } catch (error) {
    log.error('Error processing webhook:', error);
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
    log.error('No user ID in auth webhook');
    return;
  }

  if (operation === 'creation' && success) {
    log.info(`New connection: ${provider} for user ${userId}`);

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
        last_sync_at: null,
        metadata: {
          source: 'nango',
          email: endUser?.endUserEmail
        }
      }, {
        onConflict: 'user_id,platform'
      });
    if (upsertErr) {
      log.error(`Failed to record connection for ${provider}:`, upsertErr.message);
    }

    // Trigger initial data extraction in background
    extractPlatformData(userId, providerConfigKey)
      .then(result => {
        if (result.success) {
          log.info(`Initial extraction complete for ${providerConfigKey}`);

          // Store extracted data (fire-and-forget — don't block webhook response)
          supabaseAdmin
            .from('platform_extracted_data')
            .insert({
              user_id: userId,
              platform: providerConfigKey,
              data: result.extractedData,
              extracted_at: new Date().toISOString()
            })
            .then(({ error: insertErr }) => {
              if (insertErr) log.error(`Failed to store extracted data:`, insertErr.message);
              else log.info(`Stored extracted data for ${providerConfigKey}`);
            });
        }
      })
      .catch(err => {
        log.error(`Initial extraction failed:`, err.message);
      });

  } else if (operation === 'refresh' && !success) {
    log.error(`Token refresh failed for ${provider}: ${error?.description}`);

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
      log.error(`Failed to update error status for ${provider}:`, statusErr.message);
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
      log.error(`Failed to create notification for ${provider}:`, notifErr.message);
    }
  }
}

// Map Nango providerConfigKey → our internal platform name
const NANGO_TO_PLATFORM = {
  'spotify': 'spotify',
  'google-calendar': 'google_calendar',
  'whoop': 'whoop',
  'discord': 'discord',
  'github-getting-started': 'github',
  'linkedin': 'linkedin',
  'youtube': 'youtube',
  'reddit': 'reddit',
  'google-mail': 'google_gmail',
  'twitch': 'twitch',
  'outlook': 'outlook',
  'garmin': 'garmin',
  'strava': 'strava',
  'fitbit': 'fitbit',
  'oura': 'oura',
};

/**
 * Handle sync webhooks (data sync completed).
 * Triggers real-time observation ingestion into the memory stream
 * instead of waiting for the 30-min polling cron.
 */
async function handleSyncWebhook(data) {
  const { syncType, connectionId, providerConfigKey, success, modelsCount, endUser } = data;

  const userId = endUser?.endUserId;
  if (!userId) return;

  log.info(`Sync ${success ? 'completed' : 'failed'}: ${providerConfigKey} (${modelsCount} models)`);

  if (!success) return;

  const now = new Date().toISOString();

  // 1. Update last sync timestamp
  await supabaseAdmin
    .from('platform_connections')
    .update({ last_sync_at: now })
    .eq('user_id', userId)
    .eq('platform', providerConfigKey)
    .then(({ error }) => {
      if (error) log.error(`Failed to update last_sync_at for ${providerConfigKey}:`, error.message);
    });

  // Also update nango_connection_mappings
  const platform = NANGO_TO_PLATFORM[providerConfigKey] || providerConfigKey;
  await supabaseAdmin
    .from('nango_connection_mappings')
    .update({ last_synced_at: now })
    .eq('user_id', userId)
    .eq('platform', platform)
    .then(({ error }) => {
      if (error) log.warn(`Failed to update nango mapping sync time`, { error: error.message });
    });

  // 2. Trigger real-time observation ingestion (fire-and-forget)
  ingestPlatformObservations(userId, platform, providerConfigKey).catch(err => {
    log.error('Sync-triggered ingestion failed', { userId, platform, error: err.message });
  });

  // 3. Log agent event
  supabaseAdmin
    .from('agent_events')
    .insert({
      user_id: userId,
      event_type: 'nango_sync_completed',
      event_data: { platform, providerConfigKey, modelsCount, syncType },
    })
    .catch(() => {});
}

/**
 * Run observation ingestion for a single platform after sync webhook.
 * Fetches fresh data, stores as observations in memory stream,
 * and checks prospective memory condition triggers.
 */
async function ingestPlatformObservations(userId, platform, providerConfigKey) {
  // Lazy imports to avoid circular dependencies
  const { addPlatformObservation } = await import('../services/memoryStreamService.js');
  const { checkConditionTriggered } = await import('../services/prospectiveMemoryService.js');

  // Platform fetcher map — import from sub-files (observationIngestion no longer re-exports these)
  const fetcherMap = {
    spotify: () => import('../services/observationFetchers/spotify.js').then(m => m.fetchSpotifyObservations),
    google_calendar: () => import('../services/observationFetchers/calendar.js').then(m => m.fetchCalendarObservations),
    youtube: () => import('../services/observationFetchers/youtube.js').then(m => m.fetchYouTubeObservations),
    whoop: () => import('../services/observationFetchers/whoop.js').then(m => m.fetchWhoopObservations),
    discord: () => import('../services/observationFetchers/discord.js').then(m => m.fetchDiscordObservations),
    github: () => import('../services/observationFetchers/github.js').then(m => m.fetchGitHubObservations),
    linkedin: () => import('../services/observationFetchers/linkedin.js').then(m => m.fetchLinkedInObservations),
    reddit: () => import('../services/observationFetchers/reddit.js').then(m => m.fetchRedditObservations),
    google_gmail: () => import('../services/observationFetchers/gmail.js').then(m => m.fetchGmailObservations),
    twitch: () => import('../services/observationFetchers/twitch.js').then(m => m.fetchTwitchObservations),
    outlook: () => import('../services/observationFetchers/outlook.js').then(m => m.fetchOutlookObservations),
    garmin: () => import('../services/observationFetchers/garmin.js').then(m => m.fetchGarminObservations),
    strava: () => import('../services/observationFetchers/strava.js').then(m => m.fetchStravaObservations),
    fitbit: () => import('../services/observationFetchers/fitbit.js').then(m => m.fetchFitbitObservations),
    oura: () => import('../services/observationFetchers/oura.js').then(m => m.fetchOuraObservations),
  };

  const fetcherFactory = fetcherMap[platform];
  if (!fetcherFactory) {
    log.warn(`No observation fetcher for platform: ${platform}`);
    return;
  }

  const fetcher = await fetcherFactory();
  const observations = await fetcher(userId);

  if (!observations || observations.length === 0) {
    log.info(`No new observations from ${platform} sync`, { userId });
    return;
  }

  // Store observations in memory stream
  let stored = 0;
  for (const obs of observations) {
    const content = typeof obs === 'string' ? obs : obs.content || JSON.stringify(obs);
    const ok = await addPlatformObservation(userId, content, platform, {
      ingestion_source: 'nango_sync_webhook',
    });
    if (ok) stored++;
  }

  log.info(`Sync-triggered ingestion complete`, { userId, platform, fetched: observations.length, stored });

  // Check prospective memory condition triggers against new data
  if (stored > 0) {
    try {
      const metrics = observations.slice(0, 5).map(o =>
        typeof o === 'string' ? o : o.content || ''
      );
      await checkConditionTriggered(userId, { platform, metrics });
    } catch (err) {
      log.warn('Prospective memory check failed', { userId, error: err.message });
    }
  }
}

export default router;
