/**
 * Multi-Agent Orchestrator API Routes
 *
 * RESTful endpoints for the master orchestrator system.
 * Coordinates task decomposition, agent execution, and result synthesis.
 *
 * Endpoints:
 * - POST /api/orchestrator/query - Main orchestration endpoint
 * - POST /api/orchestrator/recommend - Quick recommendations
 * - POST /api/orchestrator/insights - Analytics insights
 * - GET  /api/orchestrator/health - System health check
 * - GET  /api/orchestrator/agents - List registered agents
 * - GET  /api/orchestrator/metrics - Orchestrator metrics
 */

import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import MasterOrchestrator from '../services/agents/MasterOrchestrator.js';
import TaskDecomposer from '../services/agents/TaskDecomposer.js';
import ResultSynthesizer from '../services/agents/ResultSynthesizer.js';
import PatternDetectorAgent from '../services/agents/PatternDetectorAgent.js';
import RecommendationAgent from '../services/agents/RecommendationAgent.js';
import InsightAgent from '../services/agents/InsightAgent.js';
import PersonalityAgent from '../services/agents/PersonalityAgent.js';
import { serverDb } from '../services/database.js';

const router = express.Router();

// Initialize orchestrator and agents (singleton pattern)
let orchestrator = null;
let agents = {
  patternDetector: null,
  recommendation: null,
  insight: null,
  personality: null
};

/**
 * Initialize orchestrator and agents
 */
function initializeOrchestrator() {
  if (orchestrator) {
    return orchestrator; // Already initialized
  }

  console.log('🎭 [Orchestrator API] Initializing multi-agent system...');

  // Create orchestrator
  orchestrator = new MasterOrchestrator({
    maxParallelAgents: 4,
    agentTimeout: 30000, // 30 seconds
    enableRetry: true,
    maxRetries: 1
  });

  // Create specialized agents
  agents.patternDetector = new PatternDetectorAgent();
  agents.recommendation = new RecommendationAgent();
  agents.insight = new InsightAgent();
  agents.personality = new PersonalityAgent();

  // Register agents with orchestrator
  orchestrator.registerAgent('PatternDetectorAgent', agents.patternDetector);
  orchestrator.registerAgent('RecommendationAgent', agents.recommendation);
  orchestrator.registerAgent('InsightAgent', agents.insight);
  orchestrator.registerAgent('PersonalityAgent', agents.personality);

  console.log('✅ [Orchestrator API] Multi-agent system initialized');
  console.log(`📋 Registered agents: ${orchestrator.getRegisteredAgents().join(', ')}`);

  return orchestrator;
}

/**
 * Main orchestration endpoint
 * POST /api/orchestrator/query
 */
router.post('/query', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { query, context = {} } = req.body;

    if (!query) {
      return res.status(400).json({
        error: 'Query is required',
        example: { query: "What music should I listen to before my presentation?" }
      });
    }

    console.log(`\n🎭 [Orchestrator API] Processing query for user ${userId}`);
    console.log(`📝 Query: "${query}"`);

    // Initialize orchestrator if needed
    const orch = initializeOrchestrator();

    // Build enhanced context
    const enhancedContext = await buildUserContext(userId, context);

    // Process query through orchestrator
    const startTime = Date.now();
    const result = await orch.processQuery(query, {
      userId,
      context: enhancedContext,
      sessionId: req.body.sessionId || undefined
    });

    const latency = Date.now() - startTime;

    console.log(`✅ [Orchestrator API] Query processed in ${latency}ms`);

    // Return result
    res.json({
      success: true,
      ...result,
      latencyMs: latency
    });

  } catch (error) {
    console.error('❌ [Orchestrator API] Query failed:', error);
    res.status(500).json({
      error: 'Orchestration failed',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * Quick recommendations endpoint
 * POST /api/orchestrator/recommend
 */
router.post('/recommend', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { type = 'music', context = {} } = req.body;

    console.log(`🎵 [Orchestrator API] Quick recommendation: ${type}`);

    // Initialize orchestrator
    const orch = initializeOrchestrator();

    // Build quick recommendation query
    let query;
    if (type === 'music') {
      query = 'Recommend music for me right now based on my patterns';
    } else if (type === 'video') {
      query = 'Suggest videos I might enjoy based on my interests';
    } else {
      query = `Recommend ${type} for me`;
    }

    // Process query
    const result = await orch.processQuery(query, {
      userId,
      context: await buildUserContext(userId, context)
    });

    res.json({
      success: true,
      type,
      ...result
    });

  } catch (error) {
    console.error('❌ [Orchestrator API] Recommendation failed:', error);
    res.status(500).json({
      error: 'Recommendation failed',
      message: error.message
    });
  }
});

/**
 * Analytics insights endpoint
 * POST /api/orchestrator/insights
 */
router.post('/insights', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.userId;

    console.log(`📊 [Orchestrator API] Generating insights for user ${userId}`);

    // Initialize orchestrator
    const orch = initializeOrchestrator();

    // Query for insights
    const query = 'What patterns do you see in my behavior? Give me insights and analytics.';

    const result = await orch.processQuery(query, {
      userId,
      context: await buildUserContext(userId, {})
    });

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('❌ [Orchestrator API] Insights failed:', error);
    res.status(500).json({
      error: 'Insights generation failed',
      message: error.message
    });
  }
});

/**
 * Health check endpoint
 * GET /api/orchestrator/health
 */
router.get('/health', async (req, res) => {
  try {
    console.log('🏥 [Orchestrator API] Health check');

    // Initialize if needed
    const orch = initializeOrchestrator();

    // Run health check
    const health = await orch.healthCheck();

    res.json({
      status: health.orchestrator.healthy ? 'healthy' : 'unhealthy',
      ...health,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ [Orchestrator API] Health check failed:', error);
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * List registered agents
 * GET /api/orchestrator/agents
 */
router.get('/agents', async (req, res) => {
  try {
    const orch = initializeOrchestrator();

    const registeredAgents = orch.getRegisteredAgents();

    res.json({
      success: true,
      agents: registeredAgents,
      count: registeredAgents.length,
      details: {
        PatternDetectorAgent: {
          role: 'Behavioral pattern detection using GNN and Neo4j',
          tools: agents.patternDetector.tools.map(t => t.name)
        },
        RecommendationAgent: {
          role: 'Personalized content and activity recommendations',
          tools: agents.recommendation.tools.map(t => t.name)
        },
        InsightAgent: {
          role: 'Behavioral analytics and insight generation',
          tools: agents.insight.tools.map(t => t.name)
        },
        PersonalityAgent: {
          role: '16 Personalities assessment and pattern validation',
          tools: agents.personality.tools.map(t => t.name)
        }
      }
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to list agents',
      message: error.message
    });
  }
});

/**
 * Get orchestrator metrics
 * GET /api/orchestrator/metrics
 */
router.get('/metrics', async (req, res) => {
  try {
    const orch = initializeOrchestrator();

    const metrics = orch.getMetrics();

    // Get individual agent metrics
    const agentMetrics = {};
    for (const [name, agent] of Object.entries(agents)) {
      if (agent && typeof agent.getMetrics === 'function') {
        agentMetrics[name] = agent.getMetrics();
      }
    }

    res.json({
      success: true,
      orchestrator: metrics,
      agents: agentMetrics,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to get metrics',
      message: error.message
    });
  }
});

/**
 * Build user context from database
 */
async function buildUserContext(userId, additionalContext = {}) {
  try {
    const context = { ...additionalContext };

    // Get upcoming calendar events
    const { data: upcomingEvents } = await serverDb
      .from('calendar_events')
      .select('*')
      .eq('user_id', userId)
      .gte('start_time', new Date().toISOString())
      .order('start_time', { ascending: true })
      .limit(5);

    if (upcomingEvents && upcomingEvents.length > 0) {
      context.upcomingEvents = upcomingEvents;
    }

    // Get recent patterns
    const { data: recentPatterns } = await serverDb
      .from('behavioral_patterns')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .gte('confidence_score', 70)
      .order('confidence_score', { ascending: false })
      .limit(5);

    if (recentPatterns && recentPatterns.length > 0) {
      context.recentPatterns = recentPatterns;
    }

    // TODO: Get personality type from user profile
    // context.personalityType = 'INTJ';

    return context;

  } catch (error) {
    console.error('⚠️ Failed to build user context:', error);
    return additionalContext;
  }
}

/**
 * Get session state (for debugging)
 * GET /api/orchestrator/session/:sessionId
 */
router.get('/session/:sessionId', authenticateUser, async (req, res) => {
  try {
    const { sessionId } = req.params;

    const orch = initializeOrchestrator();
    const state = orch.getSessionState(sessionId);

    if (!state) {
      return res.status(404).json({
        error: 'Session not found',
        sessionId
      });
    }

    res.json({
      success: true,
      sessionId,
      state
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to get session state',
      message: error.message
    });
  }
});

export default router;
