/**
 * GNN Pattern Detection API Routes
 *
 * RESTful endpoints for Graph Neural Network based behavioral pattern detection.
 *
 * Endpoints:
 * - POST /api/gnn-patterns/build-graph - Build user behavior graph in Neo4j
 * - POST /api/gnn-patterns/train - Train GNN model
 * - POST /api/gnn-patterns/detect - Detect patterns using trained model
 * - GET  /api/gnn-patterns/embeddings/:userId - Get pattern embeddings
 * - GET  /api/gnn-patterns/correlation/:userId/:patternId1/:patternId2 - Calculate pattern correlation
 * - GET  /api/gnn-patterns/health - Check GNN system health
 */

import express from 'express';
import neo4jGraphService from '../services/neo4jGraphService.js';
import gnnPatternDetector from '../services/gnnPatternDetector.js';
import { authenticateUser } from '../middleware/auth.js';
import { serverDb } from '../services/database.js';

const router = express.Router();

/**
 * Build user behavior graph from platform data
 * POST /api/gnn-patterns/build-graph
 */
router.post('/build-graph', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { lookbackDays = 90, platforms = ['calendar', 'spotify', 'youtube'] } = req.body;

    console.log(`📊 Building behavior graph for user ${userId}...`);

    // Connect to Neo4j
    if (!neo4jGraphService.isConnected) {
      await neo4jGraphService.connect();
    }

    // Get user's calendar events
    const calendarEvents = await serverDb
      .from('calendar_events')
      .select('*')
      .eq('user_id', userId)
      .gte('start_time', new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString())
      .order('start_time', { ascending: false });

    console.log(`📅 Found ${calendarEvents.data?.length || 0} calendar events`);

    // Create calendar event nodes
    for (const event of (calendarEvents.data || [])) {
      await neo4jGraphService.createCalendarEventNode(userId, {
        eventId: event.id,
        summary: event.summary || 'Untitled Event',
        description: event.description,
        startTime: event.start_time,
        endTime: event.end_time,
        importance: event.importance || 50,
        attendeeCount: event.attendee_count || 0,
        duration: event.duration_minutes || 60,
        eventType: event.event_type || 'general'
      });
    }

    // Get user's music activities (from Spotify)
    const musicActivities = await serverDb
      .from('soul_data')
      .select('*')
      .eq('user_id', userId)
      .eq('platform', 'spotify')
      .eq('data_type', 'listening_history')
      .gte('created_at', new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(1000);

    console.log(`🎵 Found ${musicActivities.data?.length || 0} music activities`);

    // Process music activities
    let precedesCount = 0;
    for (const activity of (musicActivities.data || [])) {
      const rawData = activity.raw_data;
      if (!rawData || !rawData.track) continue;

      const result = await neo4jGraphService.createMusicActivityNode(userId, {
        activityId: activity.id,
        trackName: rawData.track.name,
        artist: rawData.track.artists?.[0]?.name || 'Unknown',
        album: rawData.track.album?.name || 'Unknown',
        genre: rawData.track.genre || 'Unknown',
        timestamp: rawData.played_at || activity.created_at,
        audioFeatures: rawData.audioFeatures || {}
      });

      precedesCount += result.precedingEvents?.length || 0;
    }

    // Get graph stats
    const stats = await neo4jGraphService.getUserGraphStats(userId);

    res.json({
      success: true,
      message: 'User behavior graph built successfully',
      stats: {
        calendarEvents: calendarEvents.data?.length || 0,
        musicActivities: musicActivities.data?.length || 0,
        precedesEdges: precedesCount,
        graphStats: stats
      }
    });

  } catch (error) {
    console.error('❌ Error building behavior graph:', error);
    res.status(500).json({
      error: 'Failed to build behavior graph',
      message: error.message
    });
  }
});

/**
 * Train GNN model on user's behavior graph
 * POST /api/gnn-patterns/train
 */
router.post('/train', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      epochs = 100,
      learningRate = 0.001,
      hiddenChannels = 128,
      numLayers = 4
    } = req.body;

    console.log(`🧠 Training GNN model for user ${userId}...`);

    // Check Python environment
    const pyEnv = await gnnPatternDetector.checkPythonEnvironment();
    if (!pyEnv.available) {
      return res.status(500).json({
        error: 'Python environment not available',
        message: pyEnv.error,
        instructions: 'Install Python and run: pip install -r ml/requirements.txt'
      });
    }

    // Train model
    const result = await gnnPatternDetector.trainModel(userId, {
      epochs,
      learningRate,
      hiddenChannels,
      numLayers
    });

    res.json({
      success: true,
      message: 'GNN model trained successfully',
      ...result
    });

  } catch (error) {
    console.error('❌ Error training GNN model:', error);
    res.status(500).json({
      error: 'Failed to train GNN model',
      message: error.message
    });
  }
});

/**
 * Detect patterns using trained GNN model
 * POST /api/gnn-patterns/detect
 */
router.post('/detect', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { minConfidence = 0.75, topK = 10 } = req.body;

    console.log(`🔍 Detecting patterns for user ${userId}...`);

    // Detect patterns
    const patterns = await gnnPatternDetector.detectPatterns(userId, {
      minConfidence,
      topK
    });

    // Save detected patterns to database
    for (const pattern of patterns) {
      await serverDb.from('behavioral_patterns').insert({
        user_id: userId,
        pattern_type: pattern.pattern_type,
        trigger_event: pattern.trigger?.type,
        response_action: pattern.response?.type,
        time_offset_minutes: pattern.time_offset_minutes,
        occurrence_count: pattern.occurrence_count || 1,
        confidence_score: pattern.confidence_score,
        consistency_rate: pattern.confidence_score,
        description: `User ${pattern.response?.type} (${pattern.response?.genre}) ${pattern.time_offset_minutes} minutes before ${pattern.trigger?.event_type}`,
        is_active: true,
        source: 'gnn_model'
      });
    }

    res.json({
      success: true,
      message: `Detected ${patterns.length} behavioral patterns`,
      patterns
    });

  } catch (error) {
    console.error('❌ Error detecting patterns:', error);
    res.status(500).json({
      error: 'Failed to detect patterns',
      message: error.message
    });
  }
});

/**
 * Get pattern embeddings for clustering
 * GET /api/gnn-patterns/embeddings/:userId
 */
router.get('/embeddings/:userId', authenticateUser, async (req, res) => {
  try {
    const { userId } = req.params;

    // Verify user has access
    if (userId !== req.user.userId) {
      return res.status(403).json({
        error: 'Unauthorized access to user embeddings'
      });
    }

    console.log(`🧬 Generating embeddings for user ${userId}...`);

    const embeddings = await gnnPatternDetector.getPatternEmbeddings(userId);

    res.json({
      success: true,
      ...embeddings
    });

  } catch (error) {
    console.error('❌ Error generating embeddings:', error);
    res.status(500).json({
      error: 'Failed to generate embeddings',
      message: error.message
    });
  }
});

/**
 * Calculate correlation strength between two patterns
 * GET /api/gnn-patterns/correlation/:userId/:patternId1/:patternId2
 */
router.get('/correlation/:userId/:patternId1/:patternId2', authenticateUser, async (req, res) => {
  try {
    const { userId, patternId1, patternId2 } = req.params;

    // Verify user has access
    if (userId !== req.user.userId) {
      return res.status(403).json({
        error: 'Unauthorized access to pattern correlation'
      });
    }

    console.log(`🔗 Calculating correlation between ${patternId1} and ${patternId2}...`);

    const correlation = await gnnPatternDetector.calculateCorrelationStrength(
      userId,
      patternId1,
      patternId2
    );

    res.json({
      success: true,
      ...correlation
    });

  } catch (error) {
    console.error('❌ Error calculating correlation:', error);
    res.status(500).json({
      error: 'Failed to calculate correlation',
      message: error.message
    });
  }
});

/**
 * Health check for GNN system
 * GET /api/gnn-patterns/health
 */
router.get('/health', async (req, res) => {
  try {
    const health = await gnnPatternDetector.healthCheck();

    res.json({
      status: health.healthy ? 'healthy' : 'unhealthy',
      ...health,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Get Neo4j graph statistics for a user
 * GET /api/gnn-patterns/graph-stats/:userId
 */
router.get('/graph-stats/:userId', authenticateUser, async (req, res) => {
  try {
    const { userId } = req.params;

    // Verify user has access
    if (userId !== req.user.userId) {
      return res.status(403).json({
        error: 'Unauthorized access to graph stats'
      });
    }

    if (!neo4jGraphService.isConnected) {
      await neo4jGraphService.connect();
    }

    const stats = await neo4jGraphService.getUserGraphStats(userId);

    if (!stats) {
      return res.json({
        success: true,
        stats: null,
        message: 'No graph data found for user'
      });
    }

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('❌ Error fetching graph stats:', error);
    res.status(500).json({
      error: 'Failed to fetch graph stats',
      message: error.message
    });
  }
});

/**
 * Detect temporal patterns using Neo4j Cypher queries (faster than GNN)
 * GET /api/gnn-patterns/temporal-patterns/:userId
 */
router.get('/temporal-patterns/:userId', authenticateUser, async (req, res) => {
  try {
    const { userId } = req.params;
    const {
      minOccurrences = 3,
      minConfidence = 0.7,
      timeWindowMinutes = 30
    } = req.query;

    // Verify user has access
    if (userId !== req.user.userId) {
      return res.status(403).json({
        error: 'Unauthorized access to temporal patterns'
      });
    }

    if (!neo4jGraphService.isConnected) {
      await neo4jGraphService.connect();
    }

    console.log(`⏱️ Detecting temporal patterns for user ${userId}...`);

    const patterns = await neo4jGraphService.detectTemporalPatterns(userId, {
      minOccurrences: parseInt(minOccurrences),
      minConfidence: parseFloat(minConfidence),
      timeWindowMinutes: parseInt(timeWindowMinutes)
    });

    res.json({
      success: true,
      message: `Found ${patterns.length} temporal patterns`,
      patterns
    });

  } catch (error) {
    console.error('❌ Error detecting temporal patterns:', error);
    res.status(500).json({
      error: 'Failed to detect temporal patterns',
      message: error.message
    });
  }
});

export default router;
