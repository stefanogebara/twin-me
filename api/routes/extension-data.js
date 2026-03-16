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
import { ingestWebObservations } from '../services/observationIngestion.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('ExtensionData');

const router = express.Router();

const allowedPlatforms = ['netflix', 'youtube', 'twitch', 'reddit', 'amazon', 'hbo', 'disney', 'web'];

/**
 * Map raw event types from extension to valid data_type CHECK constraint values
 */
function mapEventType(eventType, platform = '') {
  // Platform-specific mappings (search_query differs by platform)
  if (eventType === 'search_query') {
    return platform === 'web' ? 'extension_search_query' : 'extension_search';
  }

  const mapping = {
    // YouTube events
    'video_watch': 'extension_video_watch',
    'video_play': 'extension_video_watch',
    'video_pause': 'extension_video_watch',
    'video_complete': 'extension_video_watch',
    'recommendation_feed': 'extension_recommendation',
    'homepage_snapshot': 'extension_homepage',
    // Twitch events
    'stream_watch': 'extension_stream_watch',
    'category_browse': 'extension_browse',
    'chat_engagement': 'extension_chat',
    'clip_view': 'extension_clip_view',
    // Web browsing events
    'tab_visit': 'extension_page_visit',
    'page_visit': 'extension_page_visit',
    'article_read': 'extension_article_read',
    'web_video_watch': 'extension_web_video',
    // Soul observer engagement events
    'page_summary': 'extension_page_visit',
    'reading_completion': 'extension_article_read',
    'reading_analysis': 'extension_article_read',
    'page_load': 'extension_page_visit',
    // Tab pattern aggregation (15-min intervals)
    'tab_pattern': 'extension_page_visit',
    // History import (one-time bootstrap)
    'history_import': 'extension_page_visit',
    // On-demand page analysis
    'page_analysis': 'extension_page_visit',
    // Pass-throughs: already valid DB storage values
    'extension_page_visit': 'extension_page_visit',
    'extension_article_read': 'extension_article_read',
    'extension_web_video': 'extension_web_video',
    'extension_search_query': 'extension_search_query',
    'extension_search': 'extension_search',
    'extension_video_watch': 'extension_video_watch',
    'extension_recommendation': 'extension_recommendation',
    'extension_homepage': 'extension_homepage',
    'extension_stream_watch': 'extension_stream_watch',
    'extension_browse': 'extension_browse',
    'extension_chat': 'extension_chat',
    'extension_clip_view': 'extension_clip_view',
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

  log.info(`Receiving ${platform} data for user ${userId}`);

  try {
    if (!allowedPlatforms.includes(platform.toLowerCase())) {
      return res.status(400).json({
        error: 'Invalid platform',
        message: `Platform must be one of: ${allowedPlatforms.join(', ')}`
      });
    }

    const dataType = mapEventType(capturedData.data_type || capturedData.eventType || 'capture', platform);

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
      log.error(`Failed to store ${platform} data:`, error);
      throw error;
    }

    log.info(`Stored ${platform} data: ${data.id}`);

    res.json({
      success: true,
      id: data.id,
      platform,
      dataType,
      dataType: capturedData.data_type || capturedData.eventType || 'capture'
    });

  } catch (error) {
    log.error(`Error processing ${platform} data:`, error);
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

  log.info(`Receiving batch sync: ${events?.length || 0} events from ${platform || 'mixed'}`);

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
        data_type: mapEventType(event.data_type || event.eventType || 'capture', eventPlatform),
        raw_data: event.raw_data || event,
        extracted_at: event.timestamp || new Date().toISOString()
      };
    });

    // Batch insert
    const { data, error } = await supabaseAdmin
      .from('user_platform_data')
      .insert(records)
      .select();

    if (error) {
      log.error(`Batch insert failed:`, error);
      throw error;
    }

    log.info(`Batch inserted ${data.length} events`);

    // B1: Route web tab visits → memory stream via ingestWebObservations (non-blocking)
    // This converts dwell-time events into NL observations stored in user_memories.
    const WEB_INGEST_TYPES = new Set([
      'tab_visit', 'page_visit', 'page_summary', 'page_load', 'history_import', 'page_analysis',
      'reading_completion', 'reading_analysis', 'search_query',
      'extension_page_visit', 'extension_article_read', 'extension_search_query', 'extension_web_video',
    ]);
    const webEvents = events.filter(e =>
      (e.platform === 'web' || platform === 'web') &&
      WEB_INGEST_TYPES.has(e.data_type || e.eventType || '')
    );
    if (webEvents.length > 0) {
      // Normalise event shape for ingestWebObservations (expects data_type + raw_data)
      const normalised = webEvents.map(e => ({
        data_type: e.data_type || mapEventType(e.eventType || 'page_visit', 'web'),
        raw_data: e.raw_data || e,
      }));
      ingestWebObservations(userId, normalised).catch(err =>
        log.warn('Web observation ingestion failed (non-fatal):', err.message)
      );
    }

    res.json({
      success: true,
      inserted: data.length,
      platform: platform || 'mixed',
      ids: data.map(d => d.id)
    });

  } catch (error) {
    log.error(`Batch sync error:`, error);
    res.status(500).json({
      error: 'Batch sync failed',
      message: error.message
    });
  }
});

/**
 * Quick browsing analysis for periodic triggers
 */
async function quickBrowsingAnalysis(userId) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: webData } = await supabaseAdmin
    .from('user_platform_data')
    .select('raw_data, data_type')
    .eq('user_id', userId)
    .eq('platform', 'web')
    .gte('extracted_at', sevenDaysAgo)
    .limit(300);

  if (!webData) return { topCategories: [], topTopics: [], topDomains: [], recentSearches: [], pageCount: 0, searchCount: 0 };

  const pageVisits = webData.filter(d => ['extension_page_visit', 'extension_article_read'].includes(d.data_type));
  const searchEvents = webData.filter(d => d.data_type === 'extension_search_query');

  const categoryCounts = {};
  const topicCounts = {};
  const domainCounts = {};
  pageVisits.forEach(d => {
    const cat = d.raw_data?.category || 'Other';
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    const domain = d.raw_data?.domain;
    if (domain) domainCounts[domain] = (domainCounts[domain] || 0) + 1;
    (d.raw_data?.metadata?.topics || []).forEach(t => {
      topicCounts[t] = (topicCounts[t] || 0) + 1;
    });
  });

  return {
    topCategories: Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c]) => c),
    topTopics: Object.entries(topicCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([t]) => t),
    topDomains: Object.entries(domainCounts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([d]) => d),
    recentSearches: searchEvents.slice(0, 10).map(d => d.raw_data?.searchQuery).filter(Boolean),
    pageCount: pageVisits.length,
    searchCount: searchEvents.length
  };
}

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
      .like('data_type', 'extension_%')
      .order('extracted_at', { ascending: false })
      .limit(500);

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
    log.error(`Stats error:`, error);
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

    log.info(`Cleared ${data.length} records for ${platform}`);

    res.json({
      success: true,
      deleted: data.length,
      platform
    });

  } catch (error) {
    log.error(`Clear error:`, error);
    res.status(500).json({
      error: 'Failed to clear data',
      message: error.message
    });
  }
});

/**
 * POST /api/extension/analyze
 * Trigger browsing data analysis and push insights to Brain/Mem0/Soul Signature
 * Called manually or periodically after enough data accumulates
 */
router.post('/analyze', authenticateUser, async (req, res) => {
  const userId = req.user.id;

  log.info(`Triggering browsing analysis for user ${userId}`);

  try {
    // Get recent web browsing data
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: webData, error } = await supabaseAdmin
      .from('user_platform_data')
      .select('raw_data, data_type, extracted_at')
      .eq('user_id', userId)
      .eq('platform', 'web')
      .gte('extracted_at', sevenDaysAgo)
      .order('extracted_at', { ascending: false })
      .limit(300);

    if (error) throw error;

    if (!webData || webData.length === 0) {
      return res.json({ success: true, message: 'No browsing data to analyze' });
    }

    // Aggregate browsing patterns
    const pageVisits = webData.filter(d =>
      ['extension_page_visit', 'extension_article_read'].includes(d.data_type)
    );
    const searchEvents = webData.filter(d => d.data_type === 'extension_search_query');

    // Top categories
    const categoryCounts = {};
    pageVisits.forEach(d => {
      const cat = d.raw_data?.category || 'Other';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });
    const topCategories = Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([category]) => category);

    // Top topics
    const topicCounts = {};
    pageVisits.forEach(d => {
      (d.raw_data?.metadata?.topics || []).forEach(t => {
        topicCounts[t] = (topicCounts[t] || 0) + 1;
      });
    });
    const topTopics = Object.entries(topicCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([topic]) => topic);

    // Top domains
    const domainCounts = {};
    pageVisits.forEach(d => {
      const domain = d.raw_data?.domain;
      if (domain) domainCounts[domain] = (domainCounts[domain] || 0) + 1;
    });
    const topDomains = Object.entries(domainCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([domain]) => domain);

    // Recent searches
    const recentSearches = searchEvents
      .slice(0, 10)
      .map(d => d.raw_data?.searchQuery)
      .filter(Boolean);

    // Push to integrations (fire-and-forget)
    pushBrowsingToIntegrations(userId, {
      topCategories,
      topTopics,
      topDomains,
      recentSearches,
      pageCount: pageVisits.length,
      searchCount: searchEvents.length
    }).catch(err => {
      log.warn('Integration push failed (non-blocking):', err.message);
    });

    res.json({
      success: true,
      analyzed: {
        pages: pageVisits.length,
        searches: searchEvents.length,
        categories: topCategories.length,
        topics: topTopics.length
      }
    });
  } catch (error) {
    log.error(`Analysis error:`, error);
    res.status(500).json({
      error: 'Analysis failed',
      message: error.message
    });
  }
});

/**
 * Push browsing insights to Twins Brain, Mem0, and Soul Signature
 * Runs asynchronously after analysis
 */
async function pushBrowsingToIntegrations(userId, analysis) {
  log.info(`Pushing browsing insights to integrations for user ${userId}`);

  // 1. Push to Twins Brain - interest nodes from browsing categories and topics
  try {
    const { twinsBrainService } = await import('../services/twinsBrainService.js');

    // Create interest nodes from top browsing categories
    for (const category of analysis.topCategories.slice(0, 5)) {
      try {
        const existing = await twinsBrainService.findNodes(userId, {
          type: 'interest',
          search: category
        });

        if (existing?.nodes?.length > 0) {
          await twinsBrainService.reinforceNode(userId, existing.nodes[0].id, {
            source: 'browser_extension',
            reinforcement_type: 'browsing_pattern'
          });
        } else {
          await twinsBrainService.addNode(userId, {
            node_type: 'interest',
            category: 'personal',
            label: `Browses: ${category}`,
            description: `Frequently browses ${category} content`,
            confidence: 0.6,
            strength: 0.5,
            source_type: 'browser_extension',
            platform: 'web',
            tags: ['browsing', 'interest'],
            data: { source: 'browser_extension', browsingCategory: category, pageCount: analysis.pageCount }
          });
        }
      } catch (err) {
        log.warn(`Brain node error for ${category}:`, err.message);
      }
    }

    // Create interest nodes from top topics
    for (const topic of analysis.topTopics.slice(0, 5)) {
      try {
        const existing = await twinsBrainService.findNodes(userId, {
          type: 'interest',
          search: topic
        });

        if (existing?.nodes?.length > 0) {
          await twinsBrainService.reinforceNode(userId, existing.nodes[0].id, {
            source: 'browser_extension',
            reinforcement_type: 'browsing_topic'
          });
        } else {
          await twinsBrainService.addNode(userId, {
            node_type: 'interest',
            category: 'learning',
            label: `Topic: ${topic}`,
            description: `Shows recurring interest in "${topic}" through browsing`,
            confidence: 0.5,
            strength: 0.4,
            source_type: 'browser_extension',
            platform: 'web',
            tags: ['browsing', 'topic'],
            data: { source: 'browser_extension', browsingTopic: topic }
          });
        }
      } catch (err) {
        log.warn(`Brain topic node error for ${topic}:`, err.message);
      }
    }

    log.info(`Brain: Created/reinforced ${analysis.topCategories.length + analysis.topTopics.length} browsing nodes`);
  } catch (err) {
    log.warn('Brain integration error:', err.message);
  }

  // 2. Push to Mem0 - browsing summary as memories
  try {
    const { addUserFact, addPlatformMemory } = await import('../services/mem0Service.js');

    // Store browsing summary as a fact
    const summary = `Browses ${analysis.topCategories.join(', ')} content most. Frequents ${analysis.topDomains.slice(0, 4).join(', ')}. ${analysis.pageCount} pages visited, ${analysis.searchCount} searches in the last week.`;
    await addUserFact(userId, summary);

    // Store search interests as platform memory
    if (analysis.recentSearches.length > 0) {
      await addPlatformMemory(userId, 'web', 'browsing_searches', {
        searches: analysis.recentSearches,
        topics: analysis.topTopics.slice(0, 8),
        analyzedAt: new Date().toISOString()
      });
    }

    log.info('Mem0: Stored browsing summary and search memories');
  } catch (err) {
    log.warn('Mem0 integration error:', err.message);
  }

  // 3. Trigger soul signature rebuild
  try {
    const { default: soulBuilder } = await import('../services/soulSignatureBuilder.js');
    await soulBuilder.buildSoulSignature(userId);
    log.info('Soul Signature: Rebuild triggered with browsing data');
  } catch (err) {
    log.warn('Soul Signature rebuild error:', err.message);
  }
}

export default router;
