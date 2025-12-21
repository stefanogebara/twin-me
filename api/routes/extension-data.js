/**
 * Browser Extension Data Capture Routes
 *
 * Receives data captured by browser extension from platforms without APIs:
 * - Netflix: viewing history, genres, watch time
 * - YouTube: actual watch time, scroll depth
 * - Reddit: time per subreddit, engagement
 */

import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { supabaseAdmin } from '../config/supabase.js';

const router = express.Router();

/**
 * POST /api/extension/capture/:platform
 * Receive individual capture event from extension
 */
router.post('/capture/:platform', authenticateUser, async (req, res) => {
  const { platform } = req.params;
  const userId = req.user.id;
  const capturedData = req.body;

  console.log(`📱 [Extension] Receiving ${platform} data for user ${userId}`);

  try {
    // Validate platform
    const allowedPlatforms = ['netflix', 'youtube', 'reddit', 'amazon', 'hbo', 'disney'];
    if (!allowedPlatforms.includes(platform.toLowerCase())) {
      return res.status(400).json({
        error: 'Invalid platform',
        message: `Platform must be one of: ${allowedPlatforms.join(', ')}`
      });
    }

    // Store in soul_data table with extension-specific data type
    const { data, error } = await supabaseAdmin
      .from('soul_data')
      .insert({
        user_id: userId,
        platform: platform,
        data_type: `extension_${capturedData.eventType || 'capture'}`,
        raw_data: capturedData,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error(`❌ [Extension] Failed to store ${platform} data:`, error);
      throw error;
    }

    console.log(`✅ [Extension] Stored ${platform} data: ${data.id}`);

    res.json({
      success: true,
      id: data.id,
      platform,
      eventType: capturedData.eventType || 'capture'
    });

  } catch (error) {
    console.error(`❌ [Extension] Error processing ${platform} data:`, error);
    res.status(500).json({
      error: 'Failed to store extension data',
      message: error.message
    });
  }
});

/**
 * POST /api/extension/batch
 * Receive batch sync from extension (multiple events)
 */
router.post('/batch', authenticateUser, async (req, res) => {
  const userId = req.user.id;
  const { platform, events } = req.body;

  console.log(`📱 [Extension] Receiving batch sync: ${events?.length || 0} events from ${platform}`);

  try {
    // Validate input
    if (!platform || !events || !Array.isArray(events)) {
      return res.status(400).json({
        error: 'Invalid batch data',
        message: 'Request must include platform and events array'
      });
    }

    if (events.length === 0) {
      return res.json({
        success: true,
        inserted: 0,
        message: 'No events to sync'
      });
    }

    // Transform events for insertion
    const records = events.map(event => ({
      user_id: userId,
      platform: platform,
      data_type: `extension_${event.eventType || 'capture'}`,
      raw_data: event,
      created_at: event.timestamp || new Date().toISOString()
    }));

    // Batch insert
    const { data, error } = await supabaseAdmin
      .from('soul_data')
      .insert(records)
      .select();

    if (error) {
      console.error(`❌ [Extension] Batch insert failed:`, error);
      throw error;
    }

    console.log(`✅ [Extension] Batch inserted ${data.length} events from ${platform}`);

    res.json({
      success: true,
      inserted: data.length,
      platform,
      ids: data.map(d => d.id)
    });

  } catch (error) {
    console.error(`❌ [Extension] Batch sync error:`, error);
    res.status(500).json({
      error: 'Batch sync failed',
      message: error.message
    });
  }
});

/**
 * GET /api/extension/stats
 * Get statistics on extension-captured data
 */
router.get('/stats', authenticateUser, async (req, res) => {
  const userId = req.user.id;

  try {
    // Get counts by platform and event type
    const { data, error } = await supabaseAdmin
      .from('soul_data')
      .select('platform, data_type, raw_data')
      .eq('user_id', userId)
      .like('data_type', 'extension_%');

    if (error) throw error;

    // Aggregate statistics
    const stats = {
      total: data.length,
      by_platform: {},
      by_event_type: {},
      recent_activity: []
    };

    // Group by platform
    data.forEach(record => {
      const platform = record.platform;
      if (!stats.by_platform[platform]) {
        stats.by_platform[platform] = {
          total: 0,
          by_type: {}
        };
      }
      stats.by_platform[platform].total++;

      // Group by event type
      const eventType = record.data_type;
      if (!stats.by_platform[platform].by_type[eventType]) {
        stats.by_platform[platform].by_type[eventType] = 0;
      }
      stats.by_platform[platform].by_type[eventType]++;

      if (!stats.by_event_type[eventType]) {
        stats.by_event_type[eventType] = 0;
      }
      stats.by_event_type[eventType]++;
    });

    // Get recent activity (last 10 events)
    stats.recent_activity = data
      .sort((a, b) => new Date(b.raw_data.timestamp || b.created_at) - new Date(a.raw_data.timestamp || a.created_at))
      .slice(0, 10)
      .map(record => ({
        platform: record.platform,
        eventType: record.data_type,
        title: record.raw_data.title || record.raw_data.subreddit || 'Unknown',
        timestamp: record.raw_data.timestamp || record.created_at
      }));

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error(`❌ [Extension] Stats error:`, error);
    res.status(500).json({
      error: 'Failed to get stats',
      message: error.message
    });
  }
});

/**
 * DELETE /api/extension/clear/:platform
 * Clear all extension data for a specific platform
 */
router.delete('/clear/:platform', authenticateUser, async (req, res) => {
  const userId = req.user.id;
  const { platform } = req.params;

  try {
    const { data, error } = await supabaseAdmin
      .from('soul_data')
      .delete()
      .eq('user_id', userId)
      .eq('platform', platform)
      .like('data_type', 'extension_%')
      .select();

    if (error) throw error;

    console.log(`🗑️ [Extension] Cleared ${data.length} records for ${platform}`);

    res.json({
      success: true,
      deleted: data.length,
      platform
    });

  } catch (error) {
    console.error(`❌ [Extension] Clear error:`, error);
    res.status(500).json({
      error: 'Failed to clear data',
      message: error.message
    });
  }
});

export default router;
