/**
 * Personality Inference API Routes
 *
 * Endpoints for running the full personality inference pipeline
 * using specialized agents (Music Psychology, Biometric, Chronotype)
 */

import express from 'express';
import orchestrator from '../services/agentOrchestrator.js';
import { getUserEvidence, formatEvidenceResponse } from '../services/evidenceGeneratorService.js';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticateUser } from '../middleware/auth.js';

const router = express.Router();
const supabase = supabaseAdmin;

/**
 * POST /api/personality/infer
 *
 * Run the full personality inference pipeline for a user.
 * Uses all available data sources (Spotify, Whoop, Calendar) and
 * specialized agents to generate Big Five personality scores.
 *
 * Request body:
 * - user_id (required): UUID of the user
 * - force_refresh (optional): Force re-analysis even if recent data exists
 *
 * Response:
 * - personality: Big Five scores (0-100)
 * - evidence: Evidence grouped by dimension
 * - confidence: Confidence scores
 * - interpretation: AI-generated insights
 */
router.post('/infer', async (req, res) => {
  try {
    const { user_id, force_refresh = false } = req.body;

    if (!user_id) {
      return res.status(400).json({
        success: false,
        error: 'user_id is required'
      });
    }

    console.log(`[PersonalityAPI] Starting inference for user ${user_id}`);

    // Run the full inference pipeline
    const result = await orchestrator.runInferencePipeline(user_id, {
      storeEvidence: true,
      forceRefresh: force_refresh
    });

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error || 'Inference pipeline failed'
      });
    }

    res.json(result);

  } catch (error) {
    console.error('[PersonalityAPI] Inference error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/personality/evidence
 *
 * Get stored evidence for the authenticated user's personality inferences.
 * Uses JWT token to identify user.
 * Returns evidence grouped by Big Five dimension with research citations.
 */
router.get('/evidence', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    // Get stored evidence
    const evidence = await getUserEvidence(userId);

    // Get personality scores
    const { data: assessment } = await supabase
      .from('personality_assessments')
      .select('big_five_scores')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1);

    const personality = assessment?.[0]?.big_five_scores || {
      openness: 50,
      conscientiousness: 50,
      extraversion: 50,
      agreeableness: 50,
      neuroticism: 50
    };

    // Get data source info
    const dataSources = await getDataSourceInfo(userId);

    // Format response
    const response = formatEvidenceResponse(evidence, personality, dataSources);

    res.json(response);

  } catch (error) {
    console.error('[PersonalityAPI] Evidence retrieval error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/personality/evidence/:userId
 *
 * Get stored evidence for a user's personality inferences (by userId param).
 * Returns evidence grouped by Big Five dimension with research citations.
 */
router.get('/evidence/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    // Get stored evidence
    const evidence = await getUserEvidence(userId);

    // Get personality scores
    const { data: assessment } = await supabase
      .from('personality_assessments')
      .select('big_five_scores')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1);

    const personality = assessment?.[0]?.big_five_scores || {
      openness: 50,
      conscientiousness: 50,
      extraversion: 50,
      agreeableness: 50,
      neuroticism: 50
    };

    // Get data source info
    const dataSources = await getDataSourceInfo(userId);

    // Format response
    const response = formatEvidenceResponse(evidence, personality, dataSources);

    res.json(response);

  } catch (error) {
    console.error('[PersonalityAPI] Evidence retrieval error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/personality/data-sources/:userId
 *
 * Check which data sources are available for a user.
 */
router.get('/data-sources/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    const dataSources = await orchestrator.checkDataSources(userId);

    res.json({
      success: true,
      user_id: userId,
      data_sources: dataSources,
      platforms_connected: Object.values(dataSources).filter(s => s.available).length
    });

  } catch (error) {
    console.error('[PersonalityAPI] Data sources check error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/personality/health
 *
 * Get health status of the personality inference system.
 */
router.get('/health', async (req, res) => {
  try {
    const status = await orchestrator.getHealthStatus();

    res.json({
      success: true,
      status: 'healthy',
      ...status
    });

  } catch (error) {
    console.error('[PersonalityAPI] Health check error:', error);
    res.status(500).json({
      success: false,
      status: 'unhealthy',
      error: error.message
    });
  }
});

/**
 * POST /api/personality/analyze/spotify
 *
 * Run only the Music Psychology agent for Spotify data analysis.
 */
router.post('/analyze/spotify', async (req, res) => {
  try {
    const { user_id, spotify_data } = req.body;

    if (!user_id) {
      return res.status(400).json({
        success: false,
        error: 'user_id is required'
      });
    }

    const agent = orchestrator.agents.music;
    if (!agent) {
      return res.status(503).json({
        success: false,
        error: 'Music Psychology Agent not available'
      });
    }

    const result = await agent.analyzeSpotifyData(user_id, spotify_data);
    res.json(result);

  } catch (error) {
    console.error('[PersonalityAPI] Spotify analysis error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/personality/analyze/whoop
 *
 * Run only the Biometric agent for Whoop data analysis.
 */
router.post('/analyze/whoop', async (req, res) => {
  try {
    const { user_id, whoop_data } = req.body;

    if (!user_id) {
      return res.status(400).json({
        success: false,
        error: 'user_id is required'
      });
    }

    const agent = orchestrator.agents.biometric;
    if (!agent) {
      return res.status(503).json({
        success: false,
        error: 'Biometric Agent not available'
      });
    }

    const result = await agent.analyzeWhoopData(user_id, whoop_data);
    res.json(result);

  } catch (error) {
    console.error('[PersonalityAPI] Whoop analysis error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/personality/analyze/calendar
 *
 * Run only the Chronotype agent for Calendar data analysis.
 */
router.post('/analyze/calendar', async (req, res) => {
  try {
    const { user_id, calendar_data } = req.body;

    if (!user_id) {
      return res.status(400).json({
        success: false,
        error: 'user_id is required'
      });
    }

    const agent = orchestrator.agents.chronotype;
    if (!agent) {
      return res.status(503).json({
        success: false,
        error: 'Chronotype Agent not available'
      });
    }

    const result = await agent.analyzeCalendarData(user_id, calendar_data);
    res.json(result);

  } catch (error) {
    console.error('[PersonalityAPI] Calendar analysis error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Helper function to get data source info for a user
 */
async function getDataSourceInfo(userId) {
  const sources = {};

  try {
    // Get platform raw data stats
    const { data } = await supabase
      .from('platform_raw_data')
      .select('platform, extracted_at, data')
      .eq('user_id', userId);

    if (data) {
      for (const record of data) {
        const platform = record.platform;
        const extractedAt = new Date(record.extracted_at);
        const now = new Date();
        const days = Math.ceil((now - extractedAt) / (1000 * 60 * 60 * 24));

        let events = 0;
        if (platform === 'spotify') {
          events = record.data?.recent_tracks?.length || 0;
        } else if (platform === 'whoop') {
          events = record.data?.cycles?.length || 0;
        } else if (platform === 'google_calendar') {
          events = record.data?.events?.length || 0;
        }

        sources[platform] = { days, events };
      }
    }

  } catch (error) {
    console.error('[PersonalityAPI] Error getting data source info:', error);
  }

  return sources;
}

export default router;
