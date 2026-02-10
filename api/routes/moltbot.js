/**
 * Moltbot API Routes
 *
 * Provides endpoints for:
 * - Gateway status and connection testing
 * - Trigger management (CRUD)
 * - Notifications retrieval
 * - Cluster personality data
 * - Extraction agent status
 * - Memory queries
 *
 * Updated: 2026-02-02 - Added OpenClaw gateway integration
 */

import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { getTriggerService, getDefaultTriggerTemplates, getAllTriggerTemplates, runPatternLearningPipeline } from '../services/moltbot/moltbotTriggerService.js';
import { getMemoryService } from '../services/moltbot/moltbotMemoryService.js';
import { getAgentScheduler } from '../services/moltbot/agentScheduler.js';
import { getClusterPersonalityBuilder, CLUSTER_DEFINITIONS } from '../services/clusterPersonalityBuilder.js';
import { getCorrelationMatcherService } from '../services/correlationMatcherService.js';
import { getMoltbotClient, getActiveClients } from '../services/moltbot/moltbotClient.js';
import config from '../config/moltbotConfig.js';

// Pattern Learning System (Layer 2-6)
import baselineEngine from '../services/baselineEngine.js';
import deviationDetector from '../services/deviationDetector.js';
import correlationDiscoveryEngine from '../services/correlationDiscoveryEngine.js';
import patternHypothesisEngine from '../services/patternHypothesisEngine.js';
import proactiveInsightService from '../services/proactiveInsightService.js';
import patternLearningBridge from '../services/patternLearningBridge.js';

const router = express.Router();

// ============================================
// Gateway Status & Connection
// ============================================

/**
 * GET /api/moltbot/status - Get OpenClaw gateway connection status
 */
router.get('/status', async (req, res) => {
  try {
    const activeClients = getActiveClients();

    res.json({
      success: true,
      gateway: {
        url: config.ws.url,
        configured: !!config.auth.apiKey,
        activeConnections: activeClients.length
      },
      clients: activeClients,
      config: {
        memoryLayers: config.workspace.memoryLayers,
        clusters: Object.keys(config.clusters)
      }
    });
  } catch (error) {
    console.error('[Moltbot API] Error getting status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get gateway status'
    });
  }
});

/**
 * POST /api/moltbot/test-connection - Test connection to OpenClaw gateway
 */
router.post('/test-connection', async (req, res) => {
  const testUserId = 'test-connection-' + Date.now();
  let client = null;

  try {
    console.log(`[Moltbot API] Testing connection to ${config.ws.url}`);

    client = getMoltbotClient(testUserId, { autoReconnect: false });

    // Try to connect with timeout
    const connectPromise = client.connect();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Connection timeout (10s)')), 10000)
    );

    await Promise.race([connectPromise, timeoutPromise]);

    const isConnected = client.isConnected();

    // Cleanup
    client.disconnect();

    res.json({
      success: true,
      connected: isConnected,
      gateway: {
        url: config.ws.url,
        hasToken: !!config.auth.apiKey
      },
      message: isConnected ? 'Successfully connected to OpenClaw gateway' : 'Connection established but not confirmed'
    });
  } catch (error) {
    console.error('[Moltbot API] Connection test failed:', error);

    // Cleanup on error
    if (client) {
      try { client.disconnect(); } catch (e) { /* ignore */ }
    }

    res.status(200).json({
      success: false,
      connected: false,
      gateway: {
        url: config.ws.url,
        hasToken: !!config.auth.apiKey
      },
      error: error.message,
      troubleshooting: [
        'Verify OpenClaw gateway is running on the VPS',
        'Check firewall allows port 18789',
        'Verify MOLTBOT_WS_URL in .env is correct',
        'Check MOLTBOT_API_KEY matches gateway token'
      ]
    });
  }
});

// ============================================
// Trigger Management
// ============================================

/**
 * GET /api/moltbot/triggers - List user's triggers
 */
router.get('/triggers', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const triggerService = getTriggerService(userId);
    const triggers = await triggerService.getUserTriggers();

    res.json({
      success: true,
      triggers,
      count: triggers.length
    });
  } catch (error) {
    console.error('[Moltbot API] Error listing triggers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list triggers'
    });
  }
});

/**
 * GET /api/moltbot/triggers/templates - Get trigger templates (learned + defaults)
 * Returns learned patterns when available, falls back to defaults
 * Requires auth to get personalized learned triggers
 */
router.get('/triggers/templates', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const allTemplates = await getAllTriggerTemplates(userId);

    res.json({
      success: true,
      // Return learned triggers first, then defaults as examples
      templates: allTemplates.hasLearnedPatterns
        ? allTemplates.learned
        : allTemplates.defaults,
      learned: allTemplates.learned,
      defaults: allTemplates.defaults,
      hasLearnedPatterns: allTemplates.hasLearnedPatterns,
      learnedCount: allTemplates.learnedCount,
      defaultCount: allTemplates.defaultCount,
      message: allTemplates.hasLearnedPatterns
        ? `Found ${allTemplates.learnedCount} patterns learned from your data!`
        : 'No learned patterns yet. Showing example templates. Run pattern learning to discover your unique patterns.'
    });
  } catch (error) {
    console.error('[Moltbot API] Error getting templates:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get trigger templates'
    });
  }
});

/**
 * POST /api/moltbot/triggers/learn - Run pattern learning pipeline
 * Syncs platform data, computes baselines, discovers correlations, generates triggers
 */
router.post('/triggers/learn', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    console.log(`[Moltbot API] Running pattern learning pipeline for user ${userId}`);

    const results = await runPatternLearningPipeline(userId);

    res.json({
      success: true,
      message: `Pattern learning complete! Discovered ${results.correlations?.discovered || 0} correlations and generated ${results.triggers?.length || 0} learned triggers.`,
      results: {
        dataSynced: results.dataSync,
        baselinesComputed: results.baselines?.computed || 0,
        correlationsDiscovered: results.correlations?.discovered || 0,
        hypothesesGenerated: results.hypotheses?.generated || 0,
        triggersGenerated: results.triggers?.length || 0
      },
      triggers: results.triggers
    });
  } catch (error) {
    console.error('[Moltbot API] Error running pattern learning:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to run pattern learning pipeline',
      details: error.message
    });
  }
});

/**
 * POST /api/moltbot/sync-platform-data - Sync existing platform data to pattern learning
 * Call this once to backfill historical data from connected platforms
 */
router.post('/sync-platform-data', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { platforms, days } = req.body;

    // Default to all supported platforms and 90 days
    const platformsToSync = platforms || ['spotify', 'whoop', 'google_calendar'];
    const daysToSync = days || 90;

    console.log(`[Moltbot API] Syncing ${daysToSync} days of platform data for user ${userId}`);

    const results = {};
    for (const platform of platformsToSync) {
      results[platform] = await patternLearningBridge.syncExistingPlatformData(userId, platform, daysToSync);
    }

    const totalSynced = Object.values(results).reduce((sum, r) => sum + (r.synced || 0), 0);

    res.json({
      success: true,
      message: `Synced ${totalSynced} events from ${platformsToSync.length} platforms`,
      results,
      nextStep: 'Now run POST /api/moltbot/triggers/learn to discover patterns in this data'
    });
  } catch (error) {
    console.error('[Moltbot API] Error syncing platform data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to sync platform data',
      details: error.message
    });
  }
});

/**
 * POST /api/moltbot/triggers - Create a new trigger
 */
router.post('/triggers', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, description, conditions, actions, cooldown_minutes, priority } = req.body;

    if (!name || !conditions || !actions) {
      return res.status(400).json({
        success: false,
        error: 'Name, conditions, and actions are required'
      });
    }

    const triggerService = getTriggerService(userId);
    const trigger = await triggerService.createTrigger({
      name,
      description,
      conditions,
      actions,
      cooldown_minutes: cooldown_minutes || 60,
      priority: priority || 50,
      enabled: true
    });

    res.json({
      success: true,
      trigger
    });
  } catch (error) {
    console.error('[Moltbot API] Error creating trigger:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create trigger'
    });
  }
});

/**
 * PUT /api/moltbot/triggers/:id - Update a trigger
 */
router.put('/triggers/:id', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const updates = req.body;

    const triggerService = getTriggerService(userId);
    const trigger = await triggerService.updateTrigger(id, updates);

    res.json({
      success: true,
      trigger
    });
  } catch (error) {
    console.error('[Moltbot API] Error updating trigger:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update trigger'
    });
  }
});

/**
 * DELETE /api/moltbot/triggers/:id - Delete a trigger
 */
router.delete('/triggers/:id', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const triggerService = getTriggerService(userId);
    await triggerService.deleteTrigger(id);

    res.json({
      success: true,
      message: 'Trigger deleted'
    });
  } catch (error) {
    console.error('[Moltbot API] Error deleting trigger:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete trigger'
    });
  }
});

/**
 * POST /api/moltbot/triggers/install-defaults - Install default triggers
 */
router.post('/triggers/install-defaults', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const triggerService = getTriggerService(userId);
    const result = await triggerService.installDefaultTriggers();

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('[Moltbot API] Error installing default triggers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to install default triggers'
    });
  }
});

// ============================================
// Notifications
// ============================================

/**
 * GET /api/moltbot/notifications - Get recent notifications
 */
router.get('/notifications', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 20, unreadOnly = false } = req.query;

    const memoryService = getMemoryService(userId);
    const events = await memoryService.getRecentEvents({
      type: 'notification',
      limit: parseInt(limit)
    });

    // Filter to just notification events
    const notifications = events
      .filter(e => e.type === 'notification' || e.type === 'suggestion')
      .map(e => ({
        id: e.id,
        type: e.type,
        message: e.data?.message,
        triggeredBy: e.data?.triggeredBy,
        timestamp: e.created_at,
        read: e.data?.read || false
      }));

    res.json({
      success: true,
      notifications,
      count: notifications.length
    });
  } catch (error) {
    console.error('[Moltbot API] Error getting notifications:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get notifications'
    });
  }
});

/**
 * GET /api/moltbot/insights - Get proactive insights
 */
router.get('/insights', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const memoryService = getMemoryService(userId);

    // Get recent events, suggestions, and inferences
    const [events, facts] = await Promise.all([
      memoryService.getRecentEvents({ limit: 50 }),
      memoryService.queryFacts(null, 20)
    ]);

    // Extract insights from events
    const insights = [];

    // Suggestions
    events
      .filter(e => e.type === 'suggestion')
      .slice(0, 5)
      .forEach(e => {
        insights.push({
          type: 'suggestion',
          message: e.data?.message,
          source: e.data?.triggeredBy,
          timestamp: e.created_at
        });
      });

    // Inferences
    events
      .filter(e => e.platform === 'inference')
      .slice(0, 5)
      .forEach(e => {
        insights.push({
          type: 'inference',
          category: e.data?.category,
          inference: e.data?.inference,
          confidence: e.data?.confidence,
          timestamp: e.created_at
        });
      });

    // Mood from music
    const moodFact = facts.find(f => f.category === 'current_mood');
    if (moodFact) {
      insights.push({
        type: 'mood',
        mood: moodFact.fact?.mood,
        source: moodFact.fact?.source,
        timestamp: moodFact.updated_at
      });
    }

    res.json({
      success: true,
      insights,
      count: insights.length
    });
  } catch (error) {
    console.error('[Moltbot API] Error getting insights:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get insights'
    });
  }
});

// ============================================
// Cluster Personalities
// ============================================

/**
 * GET /api/moltbot/clusters - Get cluster personality profiles
 */
router.get('/clusters', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const builder = getClusterPersonalityBuilder(userId);

    const [profiles, divergences] = await Promise.all([
      builder.getStoredProfiles(),
      builder.getStoredDivergences()
    ]);

    // Transform profiles into cluster map
    const clusters = {};
    for (const profile of profiles) {
      clusters[profile.cluster] = {
        ...profile,
        definition: CLUSTER_DEFINITIONS[profile.cluster]
      };
    }

    res.json({
      success: true,
      clusters,
      divergences: divergences.slice(0, 5),
      availableClusters: Object.keys(CLUSTER_DEFINITIONS)
    });
  } catch (error) {
    console.error('[Moltbot API] Error getting clusters:', error.message);
    // Return empty data instead of 500 - clusters are non-critical
    res.json({
      success: true,
      clusters: {},
      divergences: [],
      availableClusters: Object.keys(CLUSTER_DEFINITIONS)
    });
  }
});

/**
 * POST /api/moltbot/clusters/rebuild - Rebuild cluster profiles
 * Now auto-fetches behavioral_features from database if not provided
 */
router.post('/clusters/rebuild', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    let { platformData } = req.body;

    // Auto-fetch from behavioral_features table if not provided or empty
    if (!platformData || !Array.isArray(platformData) || platformData.length === 0) {
      const { supabaseAdmin } = await import('../services/database.js');
      const { data: features, error: fetchError } = await supabaseAdmin
        .from('behavioral_features')
        .select('platform, feature_type, feature_value, normalized_value, evidence')
        .eq('user_id', userId);

      if (fetchError) {
        console.error('[Moltbot API] Error fetching behavioral features:', fetchError);
        return res.status(500).json({
          success: false,
          error: 'Failed to fetch behavioral features from database'
        });
      }

      if (!features || features.length === 0) {
        return res.json({
          success: true,
          profiles: {},
          divergences: [],
          message: 'No behavioral features found. Connect platforms and extract data first.'
        });
      }

      // Map DB columns to expected format
      platformData = features.map(f => ({
        platform: f.platform,
        feature: f.feature_type,
        value: f.normalized_value,
        rawValue: f.feature_value
      }));
    }

    const builder = getClusterPersonalityBuilder(userId);
    const result = await builder.buildAllClusterProfiles(platformData);

    // Store divergences
    for (const divergence of result.divergences) {
      await builder.storeDivergence(divergence);
    }

    res.json({
      success: true,
      profiles: result.profiles,
      divergences: result.divergences
    });
  } catch (error) {
    console.error('[Moltbot API] Error rebuilding clusters:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to rebuild cluster profiles'
    });
  }
});

/**
 * GET /api/moltbot/clusters/definitions - Get cluster definitions
 */
router.get('/clusters/definitions', (req, res) => {
  res.json({
    success: true,
    definitions: CLUSTER_DEFINITIONS
  });
});

// ============================================
// Extraction Agents
// ============================================

/**
 * GET /api/moltbot/agents/status - Get extraction agent status
 */
router.get('/agents/status', async (req, res) => {
  try {
    // If no user (public access), return general system status
    if (!req.user?.id) {
      return res.json({
        success: true,
        initialized: true,
        available_platforms: ['spotify', 'whoop', 'calendar', 'github'],
        message: 'Agent system ready. Authenticate for user-specific status.'
      });
    }

    const userId = req.user.id;
    const scheduler = getAgentScheduler(userId);
    const status = await scheduler.getStatus();

    res.json({
      success: true,
      ...status
    });
  } catch (error) {
    console.error('[Moltbot API] Error getting agent status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get agent status'
    });
  }
});

/**
 * POST /api/moltbot/agents/run/:platform - Run extraction immediately
 */
router.post('/agents/run/:platform', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { platform } = req.params;

    const scheduler = getAgentScheduler(userId);
    const result = await scheduler.runNow(platform);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('[Moltbot API] Error running agent:', error);
    res.status(500).json({
      success: false,
      error: `Failed to run ${req.params.platform} extraction`
    });
  }
});

/**
 * POST /api/moltbot/agents/initialize - Initialize agents for user
 */
router.post('/agents/initialize', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const scheduler = getAgentScheduler(userId);
    const result = await scheduler.initializeUserAgents();

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('[Moltbot API] Error initializing agents:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initialize extraction agents'
    });
  }
});

/**
 * GET /api/moltbot/agents/history - Get extraction history
 */
router.get('/agents/history', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { platform, limit = 20 } = req.query;

    const scheduler = getAgentScheduler(userId);
    const history = await scheduler.getExecutionHistory(platform || null, parseInt(limit));

    res.json({
      success: true,
      history,
      count: history.length
    });
  } catch (error) {
    console.error('[Moltbot API] Error getting history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get extraction history'
    });
  }
});

// ============================================
// Memory Queries
// ============================================

/**
 * GET /api/moltbot/memory/recent - Get recent events from memory
 */
router.get('/memory/recent', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { platform, type, limit = 20 } = req.query;

    const memoryService = getMemoryService(userId);
    const events = await memoryService.getRecentEvents({
      platform: platform || undefined,
      type: type || undefined,
      limit: parseInt(limit)
    });

    res.json({
      success: true,
      events,
      count: events.length
    });
  } catch (error) {
    console.error('[Moltbot API] Error getting memory:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get memory events'
    });
  }
});

/**
 * GET /api/moltbot/memory/facts - Get learned facts
 */
router.get('/memory/facts', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { category, limit = 50 } = req.query;

    const memoryService = getMemoryService(userId);
    const facts = await memoryService.queryFacts(category || null, parseInt(limit));

    res.json({
      success: true,
      facts,
      count: facts.length
    });
  } catch (error) {
    console.error('[Moltbot API] Error getting facts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get learned facts'
    });
  }
});

// ============================================
// Correlations
// ============================================

/**
 * GET /api/moltbot/correlations/sources - Get research sources
 */
router.get('/correlations/sources', (req, res) => {
  try {
    const matcher = getCorrelationMatcherService();
    const sources = matcher.getSources();

    res.json({
      success: true,
      sources,
      count: sources.length
    });
  } catch (error) {
    console.error('[Moltbot API] Error getting sources:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get research sources'
    });
  }
});

/**
 * GET /api/moltbot/correlations/features/:platform - Get features for platform
 */
router.get('/correlations/features/:platform', (req, res) => {
  try {
    const { platform } = req.params;
    const matcher = getCorrelationMatcherService();
    const features = matcher.getPlatformFeatures(platform);

    res.json({
      success: true,
      platform,
      features,
      count: features.length
    });
  } catch (error) {
    console.error('[Moltbot API] Error getting features:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get platform features'
    });
  }
});

// ============================================
// Trigger Testing
// ============================================

/**
 * POST /api/moltbot/triggers/test-event - Fire a test event to evaluate triggers
 *
 * This endpoint allows testing triggers by simulating platform events.
 */
router.post('/triggers/test-event', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { platform, eventType, eventData } = req.body;

    if (!platform || !eventType) {
      return res.status(400).json({
        success: false,
        error: 'platform and eventType are required'
      });
    }

    console.log(`[Moltbot API] Testing trigger with event: ${platform}/${eventType}`);

    const triggerService = getTriggerService(userId);
    const result = await triggerService.processEvent(platform, eventType, eventData || {});

    res.json({
      success: true,
      ...result,
      message: result.matchedTriggers.length > 0
        ? `Matched ${result.matchedTriggers.length} triggers!`
        : 'No triggers matched this event'
    });
  } catch (error) {
    console.error('[Moltbot API] Error testing trigger:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to test trigger'
    });
  }
});

// ============================================
// Pattern Learning System (Intelligent Baselines)
// ============================================

/**
 * GET /api/moltbot/baselines - Get user's personal baselines
 */
router.get('/baselines', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { windowDays } = req.query;

    const baselines = await baselineEngine.getAllBaselines(
      userId,
      windowDays ? parseInt(windowDays) : null
    );

    res.json({
      success: true,
      baselines,
      count: baselines.length
    });
  } catch (error) {
    console.error('[Moltbot API] Error getting baselines:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get baselines'
    });
  }
});

/**
 * GET /api/moltbot/baselines/summary - Get baseline summary for display
 */
router.get('/baselines/summary', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const summary = await baselineEngine.getBaselineSummary(userId);

    res.json({
      success: true,
      summary
    });
  } catch (error) {
    console.error('[Moltbot API] Error getting baseline summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get baseline summary'
    });
  }
});

/**
 * POST /api/moltbot/baselines/compute - Trigger baseline recomputation
 */
router.post('/baselines/compute', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await baselineEngine.computeBaselines(userId);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('[Moltbot API] Error computing baselines:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to compute baselines'
    });
  }
});

/**
 * GET /api/moltbot/deviations - Get recent behavioral deviations
 */
router.get('/deviations', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 20, significance } = req.query;

    const deviations = await deviationDetector.getRecentDeviations(
      userId,
      parseInt(limit),
      significance || null
    );

    res.json({
      success: true,
      deviations,
      count: deviations.length
    });
  } catch (error) {
    console.error('[Moltbot API] Error getting deviations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get deviations'
    });
  }
});

/**
 * GET /api/moltbot/deviations/stats - Get deviation statistics
 */
router.get('/deviations/stats', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { days = 30 } = req.query;

    const stats = await deviationDetector.getDeviationStats(userId, parseInt(days));

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('[Moltbot API] Error getting deviation stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get deviation statistics'
    });
  }
});

/**
 * GET /api/moltbot/discovered-correlations - Get discovered correlations
 */
router.get('/discovered-correlations', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { minStrength } = req.query;

    const correlations = await correlationDiscoveryEngine.getActiveCorrelations(
      userId,
      minStrength || null
    );

    res.json({
      success: true,
      correlations,
      count: correlations.length
    });
  } catch (error) {
    console.error('[Moltbot API] Error getting correlations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get discovered correlations'
    });
  }
});

/**
 * GET /api/moltbot/discovered-correlations/summary - Get correlation summary
 */
router.get('/discovered-correlations/summary', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const summary = await correlationDiscoveryEngine.getCorrelationSummary(userId);

    res.json({
      success: true,
      summary
    });
  } catch (error) {
    console.error('[Moltbot API] Error getting correlation summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get correlation summary'
    });
  }
});

/**
 * GET /api/moltbot/discovered-correlations/predictive - Get predictive correlations
 */
router.get('/discovered-correlations/predictive', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const predictive = await correlationDiscoveryEngine.findPredictiveCorrelations(userId);

    res.json({
      success: true,
      predictive,
      count: predictive.length
    });
  } catch (error) {
    console.error('[Moltbot API] Error getting predictive correlations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get predictive correlations'
    });
  }
});

/**
 * POST /api/moltbot/discovered-correlations/discover - Trigger correlation discovery
 */
router.post('/discovered-correlations/discover', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { includeLagged = true } = req.body;

    const result = await correlationDiscoveryEngine.discoverCorrelations(userId, includeLagged);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('[Moltbot API] Error discovering correlations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to discover correlations'
    });
  }
});

/**
 * GET /api/moltbot/hypotheses - Get pattern hypotheses
 */
router.get('/hypotheses', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { category, minConfidence = 0 } = req.query;

    const hypotheses = await patternHypothesisEngine.getActiveHypotheses(
      userId,
      category || null,
      parseFloat(minConfidence)
    );

    res.json({
      success: true,
      hypotheses,
      count: hypotheses.length
    });
  } catch (error) {
    console.error('[Moltbot API] Error getting hypotheses:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get hypotheses'
    });
  }
});

/**
 * GET /api/moltbot/hypotheses/summary - Get hypothesis summary
 */
router.get('/hypotheses/summary', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const summary = await patternHypothesisEngine.getHypothesisSummary(userId);

    res.json({
      success: true,
      summary
    });
  } catch (error) {
    console.error('[Moltbot API] Error getting hypothesis summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get hypothesis summary'
    });
  }
});

/**
 * POST /api/moltbot/hypotheses/generate - Generate hypotheses from correlations
 */
router.post('/hypotheses/generate', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { useAI = true } = req.body;

    const result = await patternHypothesisEngine.generateHypotheses(userId, useAI);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('[Moltbot API] Error generating hypotheses:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate hypotheses'
    });
  }
});

/**
 * POST /api/moltbot/hypotheses/:id/feedback - Record hypothesis validation feedback
 */
router.post('/hypotheses/:id/feedback', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { validated } = req.body;

    if (validated === undefined) {
      return res.status(400).json({
        success: false,
        error: 'validated (boolean) is required'
      });
    }

    const result = await patternHypothesisEngine.recordValidation(id, validated);

    res.json({
      success: true,
      hypothesis: result
    });
  } catch (error) {
    console.error('[Moltbot API] Error recording feedback:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to record hypothesis feedback'
    });
  }
});

/**
 * GET /api/moltbot/proactive-insights - Get pending proactive insights
 */
router.get('/proactive-insights', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 3 } = req.query;

    const insights = await proactiveInsightService.getPendingInsights(userId, parseInt(limit));

    res.json({
      success: true,
      insights,
      count: insights.length
    });
  } catch (error) {
    console.error('[Moltbot API] Error getting insights:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get proactive insights'
    });
  }
});

/**
 * GET /api/moltbot/proactive-insights/history - Get insight history
 */
router.get('/proactive-insights/history', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { days = 30 } = req.query;

    const history = await proactiveInsightService.getInsightHistory(userId, parseInt(days));

    res.json({
      success: true,
      history,
      count: history.length
    });
  } catch (error) {
    console.error('[Moltbot API] Error getting insight history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get insight history'
    });
  }
});

/**
 * GET /api/moltbot/proactive-insights/stats - Get insight statistics
 */
router.get('/proactive-insights/stats', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const stats = await proactiveInsightService.getInsightStats(userId);

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('[Moltbot API] Error getting insight stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get insight statistics'
    });
  }
});

/**
 * POST /api/moltbot/proactive-insights/generate - Generate insights from recent deviations
 */
router.post('/proactive-insights/generate', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await proactiveInsightService.generateInsights(userId);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('[Moltbot API] Error generating insights:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate insights'
    });
  }
});

/**
 * POST /api/moltbot/proactive-insights/:id/shown - Mark insight as shown
 */
router.post('/proactive-insights/:id/shown', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const success = await proactiveInsightService.markInsightShown(id);

    res.json({ success });
  } catch (error) {
    console.error('[Moltbot API] Error marking insight shown:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark insight as shown'
    });
  }
});

/**
 * POST /api/moltbot/proactive-insights/:id/feedback - Record insight feedback
 */
router.post('/proactive-insights/:id/feedback', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { feedback, notes } = req.body;

    if (!feedback || !['helpful', 'not_helpful', 'dismiss', 'wrong'].includes(feedback)) {
      return res.status(400).json({
        success: false,
        error: 'feedback must be one of: helpful, not_helpful, dismiss, wrong'
      });
    }

    const success = await proactiveInsightService.recordInsightFeedback(id, feedback, notes);

    res.json({ success });
  } catch (error) {
    console.error('[Moltbot API] Error recording feedback:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to record insight feedback'
    });
  }
});

/**
 * POST /api/moltbot/events - Record a raw behavioral event (for testing)
 */
router.post('/events', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { platform, event_type, event_data, event_timestamp, context } = req.body;

    if (!platform || !event_type || !event_data) {
      return res.status(400).json({
        success: false,
        error: 'platform, event_type, and event_data are required'
      });
    }

    // Process the event (stores and checks for deviations)
    const result = await deviationDetector.processNewEvent(userId, {
      platform,
      event_type,
      event_data,
      event_timestamp: event_timestamp || new Date().toISOString(),
      context
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('[Moltbot API] Error recording event:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to record event'
    });
  }
});

export default router;
