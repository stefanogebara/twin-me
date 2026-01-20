/**
 * Personality Assessment API
 *
 * 16personalities-style MBTI assessment endpoints
 * 5 dimensions: Mind (I/E), Energy (S/N), Nature (T/F), Tactics (J/P), Identity (A/T)
 */

import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticateToken } from '../middleware/auth.js';
import {
  getQuestions,
  calculateBigFiveScores,
  mapToArchetype,
  saveAssessmentResponses,
  getPersonalityEstimate,
  seedQuestionsToDatabase,
  seedArchetypesToDatabase,
  generatePersonalityInsights,
  DIMENSIONS,
  ARCHETYPES
} from '../services/personalityAssessmentService.js';
import {
  processAllPlatformData,
  seedInitialCorrelations,
  extractSpotifyFeatures,
  extractCalendarFeatures,
  extractWhoopFeatures
} from '../services/behavioralLearningService.js';
import {
  generateAllEvidence,
  calculateConfidenceScores,
  formatEvidenceResponse,
  storeEvidence,
  getUserEvidence
} from '../services/evidenceGeneratorService.js';

const router = express.Router();

/**
 * GET /api/personality/questions
 * Get personality assessment questions
 * Query params:
 *   - mode: 'quick_pulse' (12 questions), 'deep' (remaining 48), 'full' (all 60)
 */
router.get('/questions', authenticateToken, (req, res) => {
  try {
    const mode = req.query.mode || 'quick_pulse';
    const questions = getQuestions(mode);

    // Return questions formatted for the client
    const questionsForClient = questions.map(q => ({
      id: q.id,
      dimension: q.dimension,
      facet: q.facet,
      question: q.question_text,
      order: q.order
    }));

    res.json({
      success: true,
      mode,
      questions: questionsForClient,
      totalQuestions: questionsForClient.length,
      scale: {
        1: 'Strongly Disagree',
        2: 'Disagree',
        3: 'Slightly Disagree',
        4: 'Neutral',
        5: 'Slightly Agree',
        6: 'Agree',
        7: 'Strongly Agree'
      }
    });
  } catch (error) {
    console.error('[Personality] Error fetching questions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch questions'
    });
  }
});

/**
 * POST /api/personality/responses
 * Save user's personality assessment responses
 * Body: { responses: [{ question_id: string, value: 1-5, response_time_ms?: number }] }
 */
router.post('/responses', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { responses, sessionId } = req.body;

    if (!responses || !Array.isArray(responses)) {
      return res.status(400).json({
        success: false,
        error: 'Responses array required'
      });
    }

    // Validate response values (7-point Likert scale)
    for (const r of responses) {
      if (!r.question_id || !r.value || r.value < 1 || r.value > 7) {
        return res.status(400).json({
          success: false,
          error: `Invalid response: question_id and value (1-7) required`
        });
      }
    }

    console.log(`[Personality] Processing ${responses.length} responses for user ${userId}`);

    const result = await saveAssessmentResponses(userId, responses, sessionId);

    // Generate insights
    const insights = generatePersonalityInsights(result.scores, result.archetype);

    res.json({
      success: true,
      message: 'Responses saved successfully',
      scores: result.scores,
      archetype: result.archetype,
      insights,
      questionsAnswered: result.questionsAnswered,
      totalQuestions: result.totalQuestions,
      completionPercentage: result.completionPercentage
    });
  } catch (error) {
    console.error('[Personality] Error saving responses:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save responses'
    });
  }
});

/**
 * GET /api/personality/estimate
 * Get user's current personality estimate
 */
router.get('/estimate', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const estimate = await getPersonalityEstimate(userId);

    if (!estimate) {
      return res.json({
        success: true,
        hasEstimate: false,
        message: 'No personality estimate yet. Complete the assessment to see your results.'
      });
    }

    // Generate insights
    const insights = generatePersonalityInsights({
      extraversion: estimate.extraversion,
      openness: estimate.openness,
      conscientiousness: estimate.conscientiousness,
      agreeableness: estimate.agreeableness,
      neuroticism: estimate.neuroticism
    }, estimate.archetype);

    res.json({
      success: true,
      hasEstimate: true,
      estimate: {
        dimensions: {
          extraversion: { score: estimate.extraversion, ci: estimate.extraversion_ci },
          openness: { score: estimate.openness, ci: estimate.openness_ci },
          conscientiousness: { score: estimate.conscientiousness, ci: estimate.conscientiousness_ci },
          agreeableness: { score: estimate.agreeableness, ci: estimate.agreeableness_ci },
          neuroticism: { score: estimate.neuroticism, ci: estimate.neuroticism_ci }
        },
        archetype: estimate.archetype,
        questionsAnswered: estimate.total_questions_answered,
        behavioralSignals: estimate.total_behavioral_signals,
        lastUpdated: estimate.updated_at
      },
      insights
    });
  } catch (error) {
    console.error('[Personality] Error fetching estimate:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch estimate'
    });
  }
});

/**
 * GET /api/personality/archetypes
 * Get all 16 personality archetypes
 */
router.get('/archetypes', (req, res) => {
  try {
    const archetypes = Object.entries(ARCHETYPES).map(([code, info]) => ({
      code,
      ...info
    }));

    res.json({
      success: true,
      archetypes
    });
  } catch (error) {
    console.error('[Personality] Error fetching archetypes:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch archetypes'
    });
  }
});

/**
 * GET /api/personality/archetype/:code
 * Get details about a specific archetype
 */
router.get('/archetype/:code', (req, res) => {
  try {
    const { code } = req.params;
    const archetype = ARCHETYPES[code.toUpperCase()];

    if (!archetype) {
      return res.status(404).json({
        success: false,
        error: 'Archetype not found'
      });
    }

    res.json({
      success: true,
      archetype: {
        code: code.toUpperCase(),
        ...archetype
      }
    });
  } catch (error) {
    console.error('[Personality] Error fetching archetype:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch archetype'
    });
  }
});

/**
 * POST /api/personality/calculate-preview
 * Calculate scores without saving (for preview during assessment)
 */
router.post('/calculate-preview', authenticateToken, (req, res) => {
  try {
    const { responses } = req.body;

    if (!responses || !Array.isArray(responses)) {
      return res.status(400).json({
        success: false,
        error: 'Responses array required'
      });
    }

    const scores = calculateBigFiveScores(responses);
    const archetype = mapToArchetype(scores);

    res.json({
      success: true,
      scores,
      archetype,
      isPreview: true
    });
  } catch (error) {
    console.error('[Personality] Error calculating preview:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate preview'
    });
  }
});

/**
 * POST /api/personality/learn-from-behavior
 * Trigger behavioral learning from connected platforms
 */
router.post('/learn-from-behavior', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { platformData } = req.body;

    if (!platformData || typeof platformData !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Platform data object required'
      });
    }

    console.log(`[Personality] Processing behavioral data for user ${userId}`);

    const results = await processAllPlatformData(userId, platformData);

    res.json({
      success: true,
      message: 'Behavioral learning complete',
      platformsProcessed: results.length,
      results: results.map(r => ({
        platform: r.platform,
        featuresExtracted: Object.keys(r.features).length
      }))
    });
  } catch (error) {
    console.error('[Personality] Error learning from behavior:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process behavioral data'
    });
  }
});

/**
 * GET /api/personality/status
 * Get user's assessment completion status
 */
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const estimate = await getPersonalityEstimate(userId);

    const quickPulseQuestions = getQuestions('quick_pulse');
    const allQuestions = getQuestions('full');

    const questionsAnswered = estimate?.total_questions_answered || 0;
    const hasQuickPulse = questionsAnswered >= quickPulseQuestions.length;
    const hasFullAssessment = questionsAnswered >= allQuestions.length;

    res.json({
      success: true,
      hasQuickPulse,
      hasFullAssessment,
      questionsAnswered,
      quickPulseTotal: quickPulseQuestions.length,
      fullAssessmentTotal: allQuestions.length,
      percentComplete: Math.round((questionsAnswered / allQuestions.length) * 100),
      archetype: estimate?.archetype || null,
      hasBehavioralData: (estimate?.total_behavioral_signals || 0) > 0
    });
  } catch (error) {
    console.error('[Personality] Error fetching status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch status'
    });
  }
});

/**
 * DELETE /api/personality/reset
 * Reset user's personality assessment
 */
router.delete('/reset', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Delete responses
    await supabaseAdmin
      .from('personality_responses')
      .delete()
      .eq('user_id', userId);

    // Delete estimate
    await supabaseAdmin
      .from('personality_estimates')
      .delete()
      .eq('user_id', userId);

    console.log(`[Personality] Reset assessment for user ${userId}`);

    res.json({
      success: true,
      message: 'Personality assessment reset'
    });
  } catch (error) {
    console.error('[Personality] Error resetting:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset assessment'
    });
  }
});

/**
 * POST /api/personality/seed
 * Seed questions, archetypes, and correlations (admin only)
 */
router.post('/seed', async (req, res) => {
  try {
    // In production, add admin authentication here
    console.log('[Personality] Starting database seeding...');

    await seedQuestionsToDatabase();
    await seedArchetypesToDatabase();
    await seedInitialCorrelations();

    console.log('[Personality] Database seeding complete');

    res.json({
      success: true,
      message: 'Database seeded successfully'
    });
  } catch (error) {
    console.error('[Personality] Error seeding:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to seed database'
    });
  }
});

/**
 * GET /api/personality/evidence
 * Get personality evidence from behavioral data with research citations
 * Returns evidence grouped by Big Five dimension with confidence scores
 */
router.get('/evidence', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get personality estimate
    const estimate = await getPersonalityEstimate(userId);

    if (!estimate) {
      return res.status(404).json({
        success: false,
        error: 'No personality estimate found. Complete the assessment first.'
      });
    }

    // Check for cached evidence in database
    const cachedEvidence = await getUserEvidence(userId);
    const hasCachedEvidence = Object.values(cachedEvidence).some(arr => arr.length > 0);

    if (hasCachedEvidence) {
      // Return cached evidence
      const confidence = calculateConfidenceScores(cachedEvidence);

      console.log('[Evidence API] Returning evidence for user:', userId);
      console.log('[Evidence API] Evidence counts:', Object.fromEntries(
        Object.entries(cachedEvidence).map(([k, v]) => [k, v.length])
      ));
      console.log('[Evidence API] Confidence scores:', confidence);

      return res.json({
        success: true,
        personality: {
          openness: Math.round(estimate.openness || 50),
          conscientiousness: Math.round(estimate.conscientiousness || 50),
          extraversion: Math.round(estimate.extraversion || 50),
          agreeableness: Math.round(estimate.agreeableness || 50),
          neuroticism: Math.round(estimate.neuroticism || 50)
        },
        evidence: cachedEvidence,
        confidence,
        data_sources: {},
        cached: true
      });
    }

    // No cached evidence - return estimate without behavioral evidence
    res.json({
      success: true,
      personality: {
        openness: Math.round(estimate.openness || 50),
        conscientiousness: Math.round(estimate.conscientiousness || 50),
        extraversion: Math.round(estimate.extraversion || 50),
        agreeableness: Math.round(estimate.agreeableness || 50),
        neuroticism: Math.round(estimate.neuroticism || 50)
      },
      evidence: {
        openness: [],
        conscientiousness: [],
        extraversion: [],
        agreeableness: [],
        neuroticism: []
      },
      confidence: {
        overall: estimate.total_questions_answered > 0 ? 0.5 : 0,
        by_dimension: {
          openness: estimate.total_questions_answered > 0 ? 0.5 : 0,
          conscientiousness: estimate.total_questions_answered > 0 ? 0.5 : 0,
          extraversion: estimate.total_questions_answered > 0 ? 0.5 : 0,
          agreeableness: estimate.total_questions_answered > 0 ? 0.5 : 0,
          neuroticism: estimate.total_questions_answered > 0 ? 0.5 : 0
        }
      },
      data_sources: {},
      message: 'Connect platforms (Spotify, Calendar, Whoop) to see behavioral evidence'
    });
  } catch (error) {
    console.error('[Personality] Error fetching evidence:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch personality evidence'
    });
  }
});

/**
 * POST /api/personality/evidence/generate
 * Generate evidence from platform data and store it
 * Body: { spotify?: {...}, calendar?: {...}, whoop?: {...} }
 */
router.post('/evidence/generate', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { spotify, calendar, whoop } = req.body;

    console.log(`[Personality] Generating evidence for user ${userId}`);

    // Extract features from each platform
    const platformFeatures = {};
    const dataSources = {};

    if (spotify) {
      platformFeatures.spotify = extractSpotifyFeatures(spotify);
      dataSources.spotify = {
        days: spotify.recentlyPlayed?.length > 0 ? 30 : 0,
        events: (spotify.topArtists?.length || 0) + (spotify.recentlyPlayed?.length || 0)
      };
    }

    if (calendar) {
      platformFeatures.calendar = extractCalendarFeatures(calendar);
      dataSources.calendar = {
        days: 30,
        events: calendar.events?.length || 0
      };
    }

    if (whoop) {
      const whoopResult = extractWhoopFeatures(whoop);
      // Handle both old format (just features) and new format ({ features, rawValues })
      platformFeatures.whoop = whoopResult.features || whoopResult;
      dataSources.whoop = {
        days: whoop.recoveries?.length || whoop.sleeps?.length || 0,
        events: (whoop.recoveries?.length || 0) + (whoop.sleeps?.length || 0) + (whoop.workouts?.length || 0)
      };
    }

    // Generate evidence from features
    const evidence = generateAllEvidence(platformFeatures);

    // Store evidence in database
    try {
      await storeEvidence(userId, evidence);
    } catch (storeError) {
      console.warn('[Personality] Could not store evidence (table may not exist):', storeError.message);
    }

    // Get personality estimate
    const estimate = await getPersonalityEstimate(userId);

    // Format response
    const response = formatEvidenceResponse(
      evidence,
      estimate || { openness: 50, conscientiousness: 50, extraversion: 50, agreeableness: 50, neuroticism: 50 },
      dataSources
    );

    // Also update personality from behavioral data
    if (Object.keys(platformFeatures).length > 0) {
      await processAllPlatformData(userId, {
        spotify: spotify || null,
        calendar: calendar || null,
        whoop: whoop || null
      });
    }

    res.json(response);
  } catch (error) {
    console.error('[Personality] Error generating evidence:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate personality evidence'
    });
  }
});

/**
 * POST /api/personality/evidence/pipeline
 * Run the full behavioral evidence pipeline
 * Extracts features from all connected platforms and generates evidence
 */
import behavioralEvidencePipeline from '../services/behavioralEvidencePipeline.js';

router.post('/evidence/pipeline', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { platforms } = req.body; // Optional: specific platforms to process

    console.log(`[Personality] Running evidence pipeline for user ${userId}`);

    const result = await behavioralEvidencePipeline.runPipeline(userId, platforms);

    if (!result.success) {
      return res.status(400).json(result);
    }

    // Get updated personality estimate
    const estimate = await getPersonalityEstimate(userId);

    res.json({
      success: true,
      ...result,
      personality: estimate ? {
        openness: Math.round(estimate.openness || 50),
        conscientiousness: Math.round(estimate.conscientiousness || 50),
        extraversion: Math.round(estimate.extraversion || 50),
        agreeableness: Math.round(estimate.agreeableness || 50),
        neuroticism: Math.round(estimate.neuroticism || 50)
      } : null
    });
  } catch (error) {
    console.error('[Personality] Error running evidence pipeline:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to run evidence pipeline',
      message: error.message
    });
  }
});

/**
 * GET /api/personality/evidence/status
 * Check current evidence status for user
 */
router.get('/evidence/status', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get evidence counts by dimension
    const evidence = await getUserEvidence(userId);
    const evidenceCounts = {};
    let totalEvidence = 0;

    for (const [dim, items] of Object.entries(evidence)) {
      evidenceCounts[dim] = items.length;
      totalEvidence += items.length;
    }

    // Get connected platforms
    const { data: connections } = await supabaseAdmin
      .from('platform_connections')
      .select('platform, status, last_sync_at')
      .eq('user_id', userId)
      .in('status', ['connected', 'token_refreshed', 'pending']);

    res.json({
      success: true,
      hasEvidence: totalEvidence > 0,
      totalEvidence,
      evidenceByDimension: evidenceCounts,
      connectedPlatforms: connections?.map(c => c.platform) || [],
      platformStatus: connections || []
    });
  } catch (error) {
    console.error('[Personality] Error checking evidence status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check evidence status'
    });
  }
});

export default router;
