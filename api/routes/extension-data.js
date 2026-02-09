/**
 * Browser Extension Data Capture Routes
 *
 * Receives data captured by browser extension from platforms:
 * - YouTube: watch history, search queries, recommendations
 * - Twitch: stream watches, browse history, chat engagement
 * - Netflix: viewing history, genres, watch time
 *
 * Stores in user_platform_data table with extension-specific data_type values.
 */

import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { supabaseAdmin } from '../config/supabase.js';

const router = express.Router();

const allowedPlatforms = ['netflix', 'youtube', 'twitch', 'reddit', 'amazon', 'hbo', 'disney', 'web'];

/**
 * Map raw event types from extension to valid data_type CHECK constraint values
 */
function mapEventType(eventType) {
  const mapping = {
    // YouTube events
    'video_watch': 'extension_video_watch',
    'video_play': 'extension_video_watch',
    'video_pause': 'extension_video_watch',
    'video_complete': 'extension_video_watch',
    'search_query': 'extension_search',
    'recommendation_feed': 'extension_recommendation',
    'homepage_snapshot': 'extension_homepage',
    // Twitch events
    'stream_watch': 'extension_stream_watch',
    'category_browse': 'extension_browse',
    'chat_engagement': 'extension_chat',
    'clip_view': 'extension_clip_view',
    // Web browsing events
    'page_visit': 'extension_page_visit',
    'search_query': 'extension_search_query',
    'article_read': 'extension_article_read',
    'web_video_watch': 'extension_web_video',
    // Generic
    'capture': 'activity'
  };
  return mapping[eventType] || 'activity';
}

/**
 * POST /api/extension/capture/:platform
 * Receive individual capture event from extension
 */
router.post('/capture/:platform', authenticateUser, async (req, res) => {
  const { platform } = req.params;
  const userId = req.user.id;
  const capturedData = req.body;

  console.log(`[Extension] Receiving ${platform} data for user ${userId}`);

  try {
    if (!allowedPlatforms.includes(platform.toLowerCase())) {
      return res.status(400).json({
        error: 'Invalid platform',
        message: `Platform must be one of: ${allowedPlatforms.join(', ')}`
      });
    }

    const dataType = mapEventType(capturedData.eventType || 'capture');

    const { data, error } = await supabaseAdmin
      .from('user_platform_data')
      .insert({
        user_id: userId,
        platform: platform.toLowerCase(),
        data_type: dataType,
        raw_data: capturedData,
        extracted_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error(`[Extension] Failed to store ${platform} data:`, error);
      throw error;
    }

    console.log(`[Extension] Stored ${platform} data: ${data.id}`);

    res.json({
      success: true,
      id: data.id,
      platform,
      dataType,
      eventType: capturedData.eventType || 'capture'
    });

  } catch (error) {
    console.error(`[Extension] Error processing ${platform} data:`, error);
    res.status(500).json({
      error: 'Failed to store extension data',
      message: error.message
    });
  }
});

/**
 * POST /api/extension/batch
 * Receive batch sync from extension (multiple events, possibly mixed platforms)
 */
router.post('/batch', authenticateUser, async (req, res) => {
  const userId = req.user.id;
  const { platform, events } = req.body;

  console.log(`[Extension] Receiving batch sync: ${events?.length || 0} events from ${platform || 'mixed'}`);

  try {
    if (!events || !Array.isArray(events)) {
      return res.status(400).json({
        error: 'Invalid batch data',
        message: 'Request must include events array'
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
    const records = events.map(event => {
      const eventPlatform = (event.platform || platform || 'unknown').toLowerCase();
      return {
        user_id: userId,
        platform: eventPlatform,
        data_type: mapEventType(event.eventType || 'capture'),
        raw_data: event,
        extracted_at: event.timestamp || new Date().toISOString()
      };
    });

    // Batch insert
    const { data, error } = await supabaseAdmin
      .from('user_platform_data')
      .insert(records)
      .select();

    if (error) {
      console.error(`[Extension] Batch insert failed:`, error);
      throw error;
    }

    console.log(`[Extension] Batch inserted ${data.length} events`);

    res.json({
      success: true,
      inserted: data.length,
      platform: platform || 'mixed',
      ids: data.map(d => d.id)
    });

  } catch (error) {
    console.error(`[Extension] Batch sync error:`, error);
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
    const { data, error } = await supabaseAdmin
      .from('user_platform_data')
      .select('platform, data_type, raw_data, extracted_at')
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

    data.forEach(record => {
      const plat = record.platform;
      if (!stats.by_platform[plat]) {
        stats.by_platform[plat] = { total: 0, by_type: {} };
      }
      stats.by_platform[plat].total++;

      const eventType = record.data_type;
      if (!stats.by_platform[plat].by_type[eventType]) {
        stats.by_platform[plat].by_type[eventType] = 0;
      }
      stats.by_platform[plat].by_type[eventType]++;

      if (!stats.by_event_type[eventType]) {
        stats.by_event_type[eventType] = 0;
      }
      stats.by_event_type[eventType]++;
    });

    // Recent activity (last 10)
    stats.recent_activity = data
      .sort((a, b) => new Date(b.extracted_at) - new Date(a.extracted_at))
      .slice(0, 10)
      .map(record => ({
        platform: record.platform,
        eventType: record.data_type,
        title: record.raw_data?.title || record.raw_data?.videoId || record.raw_data?.channelName || 'Unknown',
        timestamp: record.extracted_at
      }));

    res.json({ success: true, stats });

  } catch (error) {
    console.error(`[Extension] Stats error:`, error);
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
      .from('user_platform_data')
      .delete()
      .eq('user_id', userId)
      .eq('platform', platform)
      .like('data_type', 'extension_%')
      .select();

    if (error) throw error;

    console.log(`[Extension] Cleared ${data.length} records for ${platform}`);

    res.json({
      success: true,
      deleted: data.length,
      platform
    });

  } catch (error) {
    console.error(`[Extension] Clear error:`, error);
    res.status(500).json({
      error: 'Failed to clear data',
      message: error.message
    });
  }
});

export default router;
