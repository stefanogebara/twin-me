import express from 'express';
import { supabaseAdmin } from '../services/database.js';

const router = express.Router();

/**
 * GET /api/dashboard/stats
 * Get dashboard statistics for the user
 */
router.get('/stats', async (req, res) => {
  try {
    const userId = req.query.userId || req.user?.id;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // Get connected platforms count from data_connectors
    const { data: platforms, error: platformsError } = await supabaseAdmin
      .from('data_connectors')
      .select('provider', { count: 'exact' })
      .eq('user_id', userId)
      .eq('is_active', true);

    if (platformsError) {
      console.error('Error fetching platforms:', platformsError);
    }

    const connectedPlatforms = platforms?.length || 0;

    // Get total data points count from soul_signature_data
    const { count: dataPointsCount, error: dataPointsError } = await supabaseAdmin
      .from('soul_signature_data')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (dataPointsError) {
      console.error('Error fetching data points:', dataPointsError);
    }

    const totalDataPoints = dataPointsCount || 0;

    // Get soul signature progress (calculated from data completeness)
    let soulSignatureProgress = 0;
    if (connectedPlatforms > 0) {
      // Base progress: 20% per platform (up to 5 platforms = 100%)
      soulSignatureProgress = Math.min((connectedPlatforms / 5) * 100, 100);
    }

    // Get last sync time from data_connectors
    const { data: lastSyncData, error: lastSyncError } = await supabaseAdmin
      .from('data_connectors')
      .select('last_sync')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('last_sync', { ascending: false })
      .limit(1)
      .single();

    if (lastSyncError && lastSyncError.code !== 'PGRST116') {
      console.error('Error fetching last sync:', lastSyncError);
    }

    const lastSync = lastSyncData?.last_sync || new Date().toISOString();

    // Get training status (check if model exists for user)
    const { data: modelData, error: modelError } = await supabaseAdmin
      .from('digital_twins')
      .select('id')
      .eq('user_id', userId)
      .limit(1)
      .single();

    if (modelError && modelError.code !== 'PGRST116') {
      console.error('Error fetching model status:', modelError);
    }

    const trainingStatus = modelData ? 'ready' : 'idle';

    const stats = {
      connectedPlatforms,
      totalDataPoints,
      soulSignatureProgress: Math.round(soulSignatureProgress),
      lastSync,
      trainingStatus,
    };

    res.json({ success: true, stats });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
  }
});

/**
 * GET /api/dashboard/activity
 * Get recent activity feed for the user
 */
router.get('/activity', async (req, res) => {
  try {
    const userId = req.query.userId || req.user?.id;
    const limit = parseInt(req.query.limit) || 10;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // Get recent analytics events for this user
    const { data: events, error: eventsError } = await supabaseAdmin
      .from('analytics_events')
      .select('*')
      .eq('user_id', userId)
      .order('timestamp', { ascending: false })
      .limit(limit * 2); // Get more to filter

    if (eventsError) {
      console.error('Error fetching activity events:', eventsError);
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

    // If no events found, provide default activity items
    if (activity.length === 0) {
      activity.push(
        {
          id: '1',
          type: 'connection',
          message: 'Ready to connect your first platform',
          timestamp: new Date().toISOString(),
          icon: 'Sparkles',
        }
      );
    }

    res.json({ success: true, activity });
  } catch (error) {
    console.error('Error fetching dashboard activity:', error);
    res.status(500).json({ error: 'Failed to fetch activity feed' });
  }
});

export default router;
