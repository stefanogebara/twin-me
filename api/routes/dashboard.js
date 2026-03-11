import express from 'express';
import { supabaseAdmin } from '../services/database.js';
import { authenticateUser } from '../middleware/auth.js';
import { get as cacheGet, set as cacheSet } from '../services/redisClient.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('Dashboard');

const router = express.Router();

const DASHBOARD_STATS_TTL = 300; // 5 minutes
const dashboardStatsCacheKey = (userId) => `dashboard_stats:${userId}`;

/**
 * GET /api/dashboard/stats
 * Get dashboard statistics for the user
 * Optimized: parallel DB queries + Redis caching (5-min TTL)
 */
router.get('/stats', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

    // Check Redis cache first
    const cached = await cacheGet(dashboardStatsCacheKey(userId));
    if (cached) {
      return res.json({ success: true, stats: cached });
    }

    // Run all 5 DB queries in parallel
    const [platformsResult, dataPointsResult, soulProfileResult, lastSyncResult, modelResult] = await Promise.all([
      // 1. Connected platforms count
      supabaseAdmin
        .from('platform_connections')
        .select('platform', { count: 'exact' })
        .eq('user_id', userId)
        .eq('status', 'connected'),

      // 2. Total data points count (head-only, no row transfer)
      supabaseAdmin
        .from('user_platform_data')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId),

      // 3. Soul signature progress
      supabaseAdmin
        .from('soul_signature_profile')
        .select('confidence_score, data_completeness')
        .eq('user_id', userId)
        .single(),

      // 4. Last sync time
      supabaseAdmin
        .from('platform_connections')
        .select('last_sync_at')
        .eq('user_id', userId)
        .eq('status', 'connected')
        .order('last_sync_at', { ascending: false })
        .limit(1)
        .single(),

      // 5. Training status (digital twin exists?)
      supabaseAdmin
        .from('digital_twins')
        .select('id')
        .eq('user_id', userId)
        .limit(1)
        .single(),
    ]);

    // Process results
    if (platformsResult.error) {
      log.error('Error fetching platforms', { error: platformsResult.error });
    }
    if (dataPointsResult.error) {
      log.error('Error fetching data points', { error: dataPointsResult.error });
    }
    if (soulProfileResult.error && soulProfileResult.error.code !== 'PGRST116') {
      log.error('Error fetching soul signature profile', { error: soulProfileResult.error });
    }
    if (lastSyncResult.error && lastSyncResult.error.code !== 'PGRST116') {
      log.error('Error fetching last sync', { error: lastSyncResult.error });
    }
    if (modelResult.error && modelResult.error.code !== 'PGRST116') {
      log.error('Error fetching model status', { error: modelResult.error });
    }

    const connectedPlatforms = platformsResult.data?.length || 0;
    const totalDataPoints = dataPointsResult.count || 0;
    const soulProfile = soulProfileResult.data;
    const lastSync = lastSyncResult.data?.last_sync_at || new Date().toISOString();
    const trainingStatus = modelResult.data ? 'ready' : 'idle';

    // Calculate soul signature progress
    let soulSignatureProgress = 0;
    if (soulProfile?.confidence_score) {
      soulSignatureProgress = Math.round(parseFloat(soulProfile.confidence_score) * 100);
    } else if (soulProfile?.data_completeness) {
      soulSignatureProgress = Math.round(parseFloat(soulProfile.data_completeness));
    } else if (connectedPlatforms > 0) {
      soulSignatureProgress = Math.min((connectedPlatforms / 5) * 100, 100);
    }

    const stats = {
      connectedPlatforms,
      totalDataPoints,
      soulSignatureProgress: Math.round(soulSignatureProgress),
      lastSync,
      trainingStatus,
    };

    // Cache in Redis (fire-and-forget, don't block response)
    cacheSet(dashboardStatsCacheKey(userId), stats, DASHBOARD_STATS_TTL).catch(() => {});

    res.json({ success: true, stats });
  } catch (error) {
    log.error('Error fetching dashboard stats', { error });
    res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
  }
});

/**
 * GET /api/dashboard/activity
 * Get recent activity feed for the user
 */
router.get('/activity', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);

    // Get recent analytics events for this user
    const { data: events, error: eventsError } = await supabaseAdmin
      .from('analytics_events')
      .select('*')
      .eq('user_id', userId)
      .order('timestamp', { ascending: false })
      .limit(limit * 2); // Get more to filter

    if (eventsError) {
      log.error('Error fetching activity events', { error: eventsError });
    }

    const activity = [];

    // Process events into activity items
    if (events && events.length > 0) {
      const seenTypes = new Set();

      for (const event of events) {
        if (activity.length >= limit) break;

        let activityItem = null;

        switch (event.event_type) {
          case 'platform_connected':
            if (!seenTypes.has('platform_connected')) {
              activityItem = {
                id: event.id,
                type: 'connection',
                message: `Connected to ${event.event_data?.platform || 'a platform'} successfully`,
                timestamp: event.timestamp,
                icon: 'CheckCircle2',
              };
              seenTypes.add('platform_connected');
            }
            break;

          case 'soul_analysis':
            if (!seenTypes.has('soul_analysis')) {
              activityItem = {
                id: event.id,
                type: 'analysis',
                message: 'Soul signature analysis in progress',
                timestamp: event.timestamp,
                icon: 'Activity',
              };
              seenTypes.add('soul_analysis');
            }
            break;

          case 'twin_created':
            if (!seenTypes.has('twin_created')) {
              activityItem = {
                id: event.id,
                type: 'twin_created',
                message: 'Digital twin created successfully',
                timestamp: event.timestamp,
                icon: 'CheckCircle2',
              };
              seenTypes.add('twin_created');
            }
            break;

          case 'training_started':
            if (!seenTypes.has('training_started')) {
              activityItem = {
                id: event.id,
                type: 'training',
                message: 'Model training started',
                timestamp: event.timestamp,
                icon: 'Brain',
              };
              seenTypes.add('training_started');
            }
            break;

          case 'data_sync':
            if (!seenTypes.has('data_sync')) {
              activityItem = {
                id: event.id,
                type: 'sync',
                message: 'Data synchronized across platforms',
                timestamp: event.timestamp,
                icon: 'RefreshCw',
              };
              seenTypes.add('data_sync');
            }
            break;
        }

        if (activityItem) {
          activity.push(activityItem);
        }
      }
    }

    // If no events found, provide contextual default activity items
    if (activity.length === 0) {
      // Check if user has connected platforms
      const { data: connectedPlatforms, error: platformsError } = await supabaseAdmin
        .from('platform_connections')
        .select('platform', { count: 'exact' })
        .eq('user_id', userId)
        .eq('is_active', true);

      if (platformsError) {
        log.error('Error checking connected platforms', { error: platformsError });
      }

      const hasConnections = connectedPlatforms && connectedPlatforms.length > 0;

      if (hasConnections) {
        // User has connections but no recent events
        activity.push({
          id: '1',
          type: 'sync',
          message: `${connectedPlatforms.length} platforms connected and ready for data extraction`,
          timestamp: new Date().toISOString(),
          icon: 'CheckCircle2',
        });
      } else {
        // User has no connections yet
        activity.push({
          id: '1',
          type: 'connection',
          message: 'Ready to connect your first platform',
          timestamp: new Date().toISOString(),
          icon: 'Sparkles',
        });
      }
    }

    res.json({ success: true, activity });
  } catch (error) {
    log.error('Error fetching dashboard activity', { error });
    res.status(500).json({ error: 'Failed to fetch activity feed' });
  }
});

export default router;
