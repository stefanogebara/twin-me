/**
 * NANGO API ROUTES
 *
 * Endpoints for managing platform connections and data extraction
 * via Nango unified API
 */

import crypto from 'crypto';
import express from 'express';
import { Nango } from '@nangohq/node';
import { authenticateUser } from '../middleware/auth.js';
import nangoService from '../services/nangoService.js';
import { supabaseAdmin } from '../services/database.js';
import { saveConnectionMapping, deleteConnectionMapping } from '../services/connectionMappingService.js';
import { runPostOnboardingIngestion } from '../services/observationIngestion.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('NangoRoutes');

// Direct Nango client for connection lookups by end_user
let nango = null;
if (process.env.NANGO_SECRET_KEY) {
  nango = new Nango({ secretKey: process.env.NANGO_SECRET_KEY });
} else {
  log.warn('NANGO_SECRET_KEY not configured - Nango routes will return errors');
}

const router = express.Router();

/**
 * GET /api/nango/platforms - Get list of supported platforms
 */
router.get('/platforms', (req, res) => {
  const platforms = Object.entries(nangoService.PLATFORM_CONFIGS).map(([key, config]) => ({
    id: key,
    name: config.name,
    category: config.category,
    soulDataPoints: config.soulDataPoints
  }));

  res.json({
    success: true,
    count: platforms.length,
    platforms
  });
});

/**
 * POST /api/nango/connect-session - Create OAuth connect session
 */
router.post('/connect-session', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const userEmail = req.user.email;
    const { integrationId, allowedIntegrations } = req.body;

    log.info(`Creating connect session for user ${userId}`);

    const result = await nangoService.createConnectSession(userId, userEmail, {
      integrationId,
      allowedIntegrations
    });

    if (result.success) {
      res.json({
        success: true,
        sessionToken: result.token,
        connectUrl: result.connectLink || `https://connect.nango.dev?session_token=${result.token}`
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    log.error('Connect session error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create connect session'
    });
  }
});

/**
 * POST /api/nango/verify-connection - Verify and register a Nango connection after popup OAuth
 *
 * Called by the frontend after the Nango Connect popup is closed.
 * Checks if the connection was actually established in Nango, and if so,
 * registers it in our platform_connections DB (since the webhook can't reach localhost).
 */
router.post('/verify-connection', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const userEmail = req.user.email;
    const { integrationId } = req.body;

    if (!integrationId) {
      return res.status(400).json({ success: false, error: 'integrationId is required' });
    }

    // Allowlist: only permit known Nango integration IDs to prevent SSRF via arbitrary provider keys
    const ALLOWED_INTEGRATION_IDS = new Set([
      'spotify', 'spotify-getting-started',
      'google-calendar', 'google-calendar-getting-started',
      'google-mail', 'google-mail-getting-started',
      'youtube', 'youtube-getting-started',
      'discord', 'discord-getting-started',
      'reddit', 'reddit-getting-started',
      'linkedin', 'linkedin-getting-started',
      'whoop', 'whoop-getting-started',
      'strava', 'strava-getting-started',
      'oura', 'oura-getting-started',
      'twitch', 'twitch-getting-started',
      'github', 'github-getting-started',
      'fitbit', 'fitbit-getting-started',
      'garmin', 'garmin-getting-started',
      'outlook', 'outlook-getting-started',
    ]);
    if (!ALLOWED_INTEGRATION_IDS.has(integrationId)) {
      log.warn(`Rejected unknown integrationId: ${integrationId}`);
      return res.status(400).json({ success: false, error: 'Unknown integration' });
    }

    log.info(`Verifying connection for ${integrationId} (user: ${userId})`);

    // Query Nango for connections belonging to this end_user and integration
    // We use listConnections instead of getConnection because getConnection requires
    // the Nango connection_id, which we don't have yet for new connections.
    if (!nango) {
      return res.status(503).json({ success: false, error: 'Nango not configured (NANGO_SECRET_KEY missing)' });
    }
    const { connections } = await nango.listConnections({ endUserId: userId });
    const match = connections.find(c => c.provider_config_key === integrationId);

    if (!match) {
      // User cancelled or connection doesn't exist
      return res.json({ success: true, connected: false });
    }

    const nangoConnectionId = match.connection_id;

    // Map Nango integration IDs to our platform_connections platform keys
    const platformKeyMap = {
      'spotify': 'spotify',
      'google-calendar': 'google_calendar',
      'google-mail': 'google_gmail',
      'discord': 'discord',
      'github': 'github',
      'github-getting-started': 'github',
      'youtube': 'youtube',
      'reddit': 'reddit',
      'outlook': 'outlook',
      'linkedin': 'linkedin',
      'whoop': 'whoop',
      'strava': 'strava',
      'oura': 'oura',
      'twitch': 'twitch',
      'fitbit': 'fitbit',
      'garmin': 'garmin',
    };

    const platformKey = platformKeyMap[integrationId] || integrationId;

    // Upsert into platform_connections with NANGO_MANAGED placeholder tokens
    // (Nango manages the real tokens; we just need a record for status tracking)
    // Clear token_expires_at so the status endpoint doesn't think the token is expired
    // (Nango handles token refresh internally)
    const { error: upsertError } = await supabaseAdmin
      .from('platform_connections')
      .upsert({
        user_id: userId,
        platform: platformKey,
        access_token: 'NANGO_MANAGED',
        refresh_token: 'NANGO_MANAGED',
        token_expires_at: null,
        status: 'connected',
        connected_at: new Date().toISOString(),
        metadata: {
          source: 'nango',
          nango_connection_id: nangoConnectionId,
          email: userEmail
        }
      }, {
        onConflict: 'user_id,platform'
      });

    if (upsertError) {
      log.error(`DB upsert error for ${platformKey}:`, upsertError);
      // Still return connected=true since Nango has the connection
    } else {
      log.info(`Registered ${platformKey} connection for user ${userId}`);

      // Auto-dismiss stale "expired"/"error" notifications for this platform
      // so users don't see old warnings after reconnecting
      try {
        const { data: dismissed, error: dismissErr } = await supabaseAdmin
          .from('user_notifications')
          .update({
            dismissed: true,
            read: true,
            read_at: new Date().toISOString()
          })
          .eq('user_id', userId)
          .eq('platform', platformKey)
          .eq('dismissed', false)
          .in('type', ['token_expired', 'token_expiring', 'connection_error', 'sync_error'])
          .select('id');

        if (dismissErr) {
          log.warn(`Failed to dismiss stale notifications for ${platformKey}:`, dismissErr.message);
        } else if (dismissed?.length > 0) {
          log.info(`Auto-dismissed ${dismissed.length} stale notification(s) for ${platformKey}`);
        }
      } catch (notifErr) {
        // Non-blocking — don't fail the connection flow for notification cleanup
        log.warn(`Notification cleanup error for ${platformKey}:`, notifErr.message);
      }
    }

    // Save connection mapping for Nango connection ID lookups
    try {
      await saveConnectionMapping(userId, integrationId, nangoConnectionId, integrationId);
    } catch (mappingErr) {
      log.error(`Connection mapping error:`, mappingErr);
    }

    // Trigger initial data extraction in background (non-blocking)
    // After extraction, persist to user_platform_data for downstream systems
    nangoService.extractPlatformData(userId, integrationId)
      .then(async (result) => {
        if (result.success) {
          await nangoService.storeNangoExtractionData(userId, integrationId, result);
          log.info(`Initial extraction stored for ${integrationId}`);

          // Immediately ingest extracted data into memory stream (don't wait for 30-min cron)
          runPostOnboardingIngestion(userId).catch(err =>
            log.warn(`Post-connection ingestion error for ${integrationId}:`, err.message)
          );

          // Run feature extraction after raw data is stored
          try {
            const featureExtractorMap = {
              // Gmail, Outlook, LinkedIn, Whoop, Twitch extractors removed
              'spotify': (await import('../services/featureExtractors/spotifyExtractor.js')).default,
              'google-calendar': (await import('../services/featureExtractors/calendarExtractor.js')).default,
              'youtube': (await import('../services/featureExtractors/youtubeFeatureExtractor.js')).default,
            };
            const extractor = featureExtractorMap[integrationId];
            if (extractor) {
              const features = await extractor.extractFeatures(userId);
              if (features.length > 0) {
                await extractor.saveFeatures(features);
                log.info(`Extracted ${features.length} behavioral features for ${integrationId}`);
              }
            }
          } catch (featureErr) {
            log.warn(`Feature extraction skipped for ${integrationId}:`, featureErr.message);
          }
        }
      })
      .catch(err => {
        log.error(`Background extraction error for ${integrationId}:`, err.message);
      });

    res.json({
      success: true,
      connected: true,
      platform: platformKey,
      connectionId: nangoConnectionId
    });
  } catch (error) {
    log.error('Verify connection error:', error);

    // If the error is a "not found" type, the user likely cancelled
    if (error.message?.includes('not found') || error.status === 404) {
      return res.json({ success: true, connected: false });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to verify connection'
    });
  }
});

/**
 * GET /api/nango/connections - Get all platform connections
 */
router.get('/connections', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const connections = await nangoService.getAllConnections(userId);

    // Count connected platforms
    const connectedCount = Object.values(connections).filter(c => c.connected).length;

    res.json({
      success: true,
      connectedCount,
      totalPlatforms: Object.keys(nangoService.PLATFORM_CONFIGS).length,
      connections
    });
  } catch (error) {
    log.error('Get connections error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get connections'
    });
  }
});

/**
 * GET /api/nango/connections/:platform - Get specific platform connection
 */
router.get('/connections/:platform', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { platform } = req.params;

    const connection = await nangoService.getConnection(userId, platform);

    res.json(connection);
  } catch (error) {
    log.error(`Get connection error for ${req.params.platform}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to get connection'
    });
  }
});

/**
 * DELETE /api/nango/connections/:platform - Disconnect a platform
 */
router.delete('/connections/:platform', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { platform } = req.params;

    const result = await nangoService.deleteConnection(userId, platform);

    if (result.success) {
      // Also remove from our database
      const { error: deleteErr } = await supabaseAdmin
        .from('platform_connections')
        .delete()
        .eq('user_id', userId)
        .eq('platform', platform);

      if (deleteErr) {
        log.error(`Failed to remove ${platform} connection from DB:`, deleteErr.message);
        return res.status(500).json({ success: false, error: 'Failed to remove connection record' });
      }

      res.json({
        success: true,
        message: `Disconnected from ${platform}`
      });
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    log.error(`Disconnect error for ${req.params.platform}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to disconnect'
    });
  }
});

/**
 * GET /api/nango/extract/:platform - Extract data from a specific platform
 */
router.get('/extract/:platform', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    let { platform } = req.params;

    // Normalize platform names: frontend uses underscores, Nango uses hyphens
    const platformNameMap = {
      'google_calendar': 'google-calendar',
      'google_mail': 'google-mail',
      'google_gmail': 'google-mail',
      'google_drive': 'google-drive',
    };
    platform = platformNameMap[platform] || platform;

    log.info(`Extracting data from ${platform} for user ${userId}`);

    const result = await nangoService.extractPlatformData(userId, platform);

    if (result.success) {
      // Store extracted data to user_platform_data
      await nangoService.storeNangoExtractionData(userId, platform, result);

      // Immediately ingest into memory stream after on-demand extraction
      runPostOnboardingIngestion(userId).catch(err =>
        log.warn(`Post-extraction ingestion error for ${platform}:`, err.message)
      );

      // Also update platform_connections.last_sync_at so the frontend shows the correct sync date
      const platformKey = platform === 'google-calendar' ? 'google_calendar' :
                          platform === 'google-mail' ? 'google_gmail' : platform;
      const { error: syncUpdateErr } = await supabaseAdmin
        .from('platform_connections')
        .update({ last_sync_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('platform', platformKey);
      if (syncUpdateErr) {
        log.error(`Failed to update last_sync_at for ${platformKey}:`, syncUpdateErr.message);
      }

      // Run feature extraction after raw data is stored
      try {
        const featureExtractorMap = {
          // Gmail, Outlook, LinkedIn, Whoop, Twitch extractors removed
          'spotify': (await import('../services/featureExtractors/spotifyExtractor.js')).default,
          'google-calendar': (await import('../services/featureExtractors/calendarExtractor.js')).default,
          'youtube': (await import('../services/featureExtractors/youtubeFeatureExtractor.js')).default,
        };
        const extractor = featureExtractorMap[platform];
        if (extractor) {
          const features = await extractor.extractFeatures(userId);
          if (features.length > 0) {
            await extractor.saveFeatures(features);
            log.info(`Extracted ${features.length} behavioral features for ${platform}`);
          }
        }
      } catch (featureErr) {
        log.warn(`Feature extraction skipped for ${platform}:`, featureErr.message);
      }

      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    log.error(`Extract error for ${req.params.platform}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to extract data'
    });
  }
});

/**
 * GET /api/nango/extract-all - Extract data from all connected platforms
 */
router.get('/extract-all', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

    log.info(`Extracting data from all platforms for user ${userId}`);

    const result = await nangoService.extractAllPlatformData(userId);

    // Update last_sync_at for all successfully extracted platforms
    const now = new Date().toISOString();
    for (const [platform, platformResult] of Object.entries(result.platforms || {})) {
      if (platformResult.success) {
        const platformKey = platform === 'google-calendar' ? 'google_calendar' :
                            platform === 'google-mail' ? 'google_gmail' : platform;
        const { error: syncErr } = await supabaseAdmin
          .from('platform_connections')
          .update({ last_sync_at: now })
          .eq('user_id', userId)
          .eq('platform', platformKey);
        if (syncErr) {
          log.error(`Failed to update last_sync_at for ${platformKey}:`, syncErr.message);
        }
      }
    }

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    log.error('Extract all error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to extract data'
    });
  }
});

/**
 * POST /api/nango/proxy/:platform - Make a proxy request to platform API
 */
router.post('/proxy/:platform', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { platform } = req.params;
    const { endpoint, method = 'GET', params, data, headers } = req.body;

    if (!endpoint) {
      return res.status(400).json({
        success: false,
        error: 'Endpoint is required'
      });
    }

    const result = await nangoService.proxyRequest(userId, platform, endpoint, {
      method,
      params,
      data,
      headers
    });

    if (result.success) {
      res.json(result);
    } else {
      res.status(result.status || 400).json(result);
    }
  } catch (error) {
    log.error(`Proxy error for ${req.params.platform}:`, error);
    res.status(500).json({
      success: false,
      error: 'Proxy request failed'
    });
  }
});

// ============================================================================
// PLATFORM-SPECIFIC CONVENIENCE ENDPOINTS
// ============================================================================

/**
 * GET /api/nango/spotify/recent-tracks - Get recent Spotify tracks
 */
router.get('/spotify/recent-tracks', authenticateUser, async (req, res) => {
  try {
    const result = await nangoService.spotify.getRecentTracks(req.user.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal server error' });
  }
});

/**
 * GET /api/nango/spotify/top-tracks - Get top Spotify tracks
 */
router.get('/spotify/top-tracks', authenticateUser, async (req, res) => {
  try {
    const { timeRange = 'medium_term' } = req.query;
    const result = await nangoService.spotify.getTopTracks(req.user.id, timeRange);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal server error' });
  }
});

/**
 * GET /api/nango/spotify/currently-playing - Get currently playing track
 */
router.get('/spotify/currently-playing', authenticateUser, async (req, res) => {
  try {
    const result = await nangoService.spotify.getCurrentlyPlaying(req.user.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal server error' });
  }
});

/**
 * GET /api/nango/whoop/recovery - Get Whoop recovery data
 */
router.get('/whoop/recovery', authenticateUser, async (req, res) => {
  try {
    const { limit = 30 } = req.query;
    const result = await nangoService.whoop.getRecovery(req.user.id, parseInt(limit));
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal server error' });
  }
});

/**
 * GET /api/nango/whoop/workouts - Get Whoop workouts
 */
router.get('/whoop/workouts', authenticateUser, async (req, res) => {
  try {
    const { limit = 30 } = req.query;
    const result = await nangoService.whoop.getWorkouts(req.user.id, parseInt(limit));
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal server error' });
  }
});

/**
 * GET /api/nango/whoop/sleep - Get Whoop sleep data
 */
router.get('/whoop/sleep', authenticateUser, async (req, res) => {
  try {
    const { limit = 30 } = req.query;
    const result = await nangoService.whoop.getSleep(req.user.id, parseInt(limit));
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal server error' });
  }
});

/**
 * GET /api/nango/calendar/events - Get calendar events
 */
router.get('/calendar/events', authenticateUser, async (req, res) => {
  try {
    const { maxResults = 100 } = req.query;
    const result = await nangoService.calendar.getEvents(req.user.id, parseInt(maxResults));
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal server error' });
  }
});

/**
 * GET /api/nango/github/repos - Get GitHub repos
 */
router.get('/github/repos', authenticateUser, async (req, res) => {
  try {
    const result = await nangoService.github.getRepos(req.user.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal server error' });
  }
});

/**
 * GET /api/nango/discord/guilds - Get Discord guilds/servers
 */
router.get('/discord/guilds', authenticateUser, async (req, res) => {
  try {
    const result = await nangoService.discord.getGuilds(req.user.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal server error' });
  }
});

/**
 * GET /api/nango/youtube/subscriptions - Get YouTube subscriptions
 */
router.get('/youtube/subscriptions', authenticateUser, async (req, res) => {
  try {
    const result = await nangoService.youtube.getSubscriptions(req.user.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal server error' });
  }
});

/**
 * GET /api/nango/reddit/subreddits - Get subscribed subreddits
 */
router.get('/reddit/subreddits', authenticateUser, async (req, res) => {
  try {
    const result = await nangoService.reddit.getSubreddits(req.user.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal server error' });
  }
});

/**
 * GET /api/nango/outlook/profile - Get Microsoft/Outlook profile
 */
router.get('/outlook/profile', authenticateUser, async (req, res) => {
  try {
    const result = await nangoService.outlook.getProfile(req.user.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal server error' });
  }
});

/**
 * GET /api/nango/outlook/messages - Get recent Outlook messages
 */
router.get('/outlook/messages', authenticateUser, async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const result = await nangoService.outlook.getRecentMessages(req.user.id, parseInt(limit));
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal server error' });
  }
});

/**
 * GET /api/nango/outlook/calendar - Get Outlook calendar events
 */
router.get('/outlook/calendar', authenticateUser, async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    const result = await nangoService.outlook.getCalendarEvents(req.user.id, parseInt(limit));
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal server error' });
  }
});

/**
 * GET /api/nango/outlook/calendars - Get list of Outlook calendars
 */
router.get('/outlook/calendars', authenticateUser, async (req, res) => {
  try {
    const result = await nangoService.outlook.getCalendars(req.user.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal server error' });
  }
});

/**
 * GET /api/nango/outlook/contacts - Get Outlook contacts
 */
router.get('/outlook/contacts', authenticateUser, async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    const result = await nangoService.outlook.getContacts(req.user.id, parseInt(limit));
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal server error' });
  }
});

/**
 * GET /api/nango/outlook/mail-folders - Get Outlook mail folders
 */
router.get('/outlook/mail-folders', authenticateUser, async (req, res) => {
  try {
    const result = await nangoService.outlook.getMailFolders(req.user.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal server error' });
  }
});

/**
 * GET /api/nango/twitch/user - Get Twitch user info
 */
router.get('/twitch/user', authenticateUser, async (req, res) => {
  try {
    const result = await nangoService.twitch.getUser(req.user.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal server error' });
  }
});

/**
 * GET /api/nango/twitch/followed - Get Twitch followed channels
 */
router.get('/twitch/followed', authenticateUser, async (req, res) => {
  try {
    // First get Twitch user ID
    const userResult = await nangoService.twitch.getUser(req.user.id);
    if (!userResult.success || !userResult.data?.data?.[0]?.id) {
      return res.status(400).json({ success: false, error: 'Could not get Twitch user ID' });
    }
    const twitchUserId = userResult.data.data[0].id;

    // Then get followed channels
    const result = await nangoService.twitch.getFollowedChannels(req.user.id, twitchUserId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal server error' });
  }
});

/**
 * GET /api/nango/gmail/profile - Get Gmail profile
 */
router.get('/gmail/profile', authenticateUser, async (req, res) => {
  try {
    const result = await nangoService.proxyRequest(req.user.id, 'google-mail', '/users/me/profile');
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal server error' });
  }
});

/**
 * GET /api/nango/gmail/messages - Get recent Gmail messages
 */
router.get('/gmail/messages', authenticateUser, async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const result = await nangoService.proxyRequest(req.user.id, 'google-mail', `/users/me/messages?maxResults=${limit}`);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal server error' });
  }
});

/**
 * GET /api/nango/gmail/labels - Get Gmail labels
 */
router.get('/gmail/labels', authenticateUser, async (req, res) => {
  try {
    const result = await nangoService.proxyRequest(req.user.id, 'google-mail', '/users/me/labels');
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal server error' });
  }
});

// ============================================================================
// WEBHOOK HANDLER FOR NANGO CONNECTION EVENTS
// ============================================================================

/**
 * POST /api/nango/webhook - Handle Nango connection webhooks
 * Configure in Nango Dashboard > Settings > Webhooks
 */
router.post('/webhook', async (req, res) => {
  // Verify Nango webhook signature to prevent spoofed events
  const webhookSecret = process.env.NANGO_WEBHOOK_SECRET;
  if (webhookSecret) {
    const signature = req.headers['x-nango-signature'];
    if (!signature) {
      log.warn('Missing signature header — rejecting');
      return res.status(401).json({ success: false, error: 'Missing webhook signature' });
    }
    // Body has already been parsed by express.json(), re-serialize for HMAC
    const bodyStr = JSON.stringify(req.body);
    const expected = crypto.createHmac('sha256', webhookSecret).update(bodyStr).digest('hex');
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      log.warn('Signature mismatch — rejecting');
      return res.status(401).json({ success: false, error: 'Invalid webhook signature' });
    }
  } else {
    log.error('NANGO_WEBHOOK_SECRET not set — rejecting webhook for security');
    return res.status(500).json({ success: false, error: 'Webhook authentication not configured' });
  }

  try {
    const { type, connectionId, providerConfigKey, endUser } = req.body;

    log.info(`Received: ${type} for ${providerConfigKey}`);

    if (type === 'connection.created' || type === 'connection.updated') {
      // Extract user ID from endUser object
      const userId = endUser?.id;

      if (userId && connectionId && providerConfigKey) {
        // Map provider config key to our platform key
        const platform = providerConfigKey.replace('-getting-started', '');

        await saveConnectionMapping(userId, platform, connectionId, providerConfigKey);
        log.info(`Saved connection mapping for ${platform}`);
      }
    }

    if (type === 'connection.deleted') {
      const userId = endUser?.id;
      const platform = providerConfigKey?.replace('-getting-started', '');

      if (userId && platform) {
        await deleteConnectionMapping(userId, platform);
        log.info(`Deleted connection mapping for ${platform}`);
      }
    }

    res.json({ success: true });
  } catch (error) {
    log.error('Error:', error);
    res.status(500).json({ success: false, error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal server error' });
  }
});

export default router;
