/**
 * Big Five Personality Assessment API
 *
 * IPIP-NEO-120 assessment endpoints with T-score normalization
 * Based on Johnson (2014) - Measuring thirty facets of the Five Factor Model
 *
 * Domains: Openness, Conscientiousness, Extraversion, Agreeableness, Neuroticism
 * 30 facets (6 per domain), 120 questions total
 */

import express from 'express';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';
import {
  getQuestions,
  getQuestionMetadata,
  calculateAllScores,
  saveResponses,
  calculateAndSaveScores,
  getUserScores,
  getUserFacetScores,
  getUserResponses,
  formatScoresForResponse,
  getDomainInterpretation
} from '../services/bigFiveAssessmentService.js';

const router = express.Router();

/**
 * GET /api/big-five/questions
 * Get IPIP-NEO assessment questions
 * Query params:
 *   - version: '120' (full) or '50' (short form)
 *   - randomize: 'true' to randomize order
 */
router.get('/questions', optionalAuth, async (req, res) => {
  try {
    const version = req.query.version || '120';
    const randomize = req.query.randomize === 'true';
    const isDemo = !req.user; // Demo mode if not authenticated

    let questions = getQuestions(version);
    const metadata = getQuestionMetadata();

    // Optionally randomize question order
    if (randomize) {
      questions = [...questions].sort(() => Math.random() - 0.5);
    }

    // Get user's previous responses if resuming (only for authenticated users)
    let previousResponses = [];
    if (req.user) {
      const userId = req.user.id;
      previousResponses = await getUserResponses(userId);
    }
    const answeredIds = new Set(previousResponses.map(r => r.questionId));

    // Mark questions as answered
    const questionsForClient = questions.map(q => ({
      id: q.id,
      domain: q.domain,
      facet: q.facet,
      facetName: q.facet_name,
      text: q.text,
      keyed: q.keyed,
      order: q.order,
      answered: answeredIds.has(q.id),
      previousValue: previousResponses.find(r => r.questionId === q.id)?.value || null
    }));

    res.json({
      success: true,
      version,
      isDemo,
      questions: questionsForClient,
      totalQuestions: questionsForClient.length,
      questionsAnswered: previousResponses.length,
      percentComplete: Math.round((previousResponses.length / questionsForClient.length) * 100),
      scale: metadata.scale,
      domains: metadata.domains,
      facets: metadata.facets
    });
  } catch (error) {
    console.error('[BigFive] Error fetching questions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch questions'
    });
  }
});

/**
 * POST /api/big-five/responses
 * Save user responses and calculate scores
 * Body: { responses: [{ questionId: string, value: 1-5, responseTime?: number }], final?: boolean }
 */
router.post('/responses', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { responses, sessionId, final = false } = req.body;

    if (!responses || !Array.isArray(responses)) {
      return res.status(400).json({
        success: false,
        error: 'Responses array required'
      });
    }

    // Validate response values (5-point Likert scale)
    for (const r of responses) {
      if (!r.questionId || !r.value || r.value < 1 || r.value > 5) {
        return res.status(400).json({
          success: false,
          error: `Invalid response: questionId and value (1-5) required. Got: ${JSON.stringify(r)}`
        });
      }
    }

    console.log(`[BigFive] Processing ${responses.length} responses for user ${userId}`);

    // Save responses to database
    await saveResponses(userId, responses, sessionId);

    // Get all user responses (including previous ones)
    const allResponses = await getUserResponses(userId);

    // Calculate scores
    let result;
    if (final || allResponses.length >= 120) {
      // Full calculation and save to scores table
      result = await calculateAndSaveScores(userId, allResponses);
      console.log(`[BigFive] Saved final scores for user ${userId}`);
    } else {
      // Preview calculation (not saved to scores table)
      result = calculateAllScores(allResponses);
    }

    // Format for API response
    const formattedScores = formatScoresForResponse(result);

    res.json({
      success: true,
      message: final ? 'Assessment complete! Scores saved.' : 'Responses saved',
      scores: formattedScores,
      questionsAnswered: allResponses.length,
      totalQuestions: 120,
      completionPercentage: Math.round((allResponses.length / 120) * 100),
      isComplete: allResponses.length >= 120,
      savedAt: result.savedAt || null
    });
  } catch (error) {
    console.error('[BigFive] Error saving responses:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save responses'
    });
  }
});

/**
 * GET /api/big-five/scores
 * Get user's Big Five scores (T-scores and percentiles)
 */
router.get('/scores', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const scores = await getUserScores(userId);

    if (!scores) {
      // Try calculating from responses
      const responses = await getUserResponses(userId);

      if (responses.length === 0) {
        return res.json({
          success: true,
          hasScores: false,
          message: 'No assessment data yet. Complete the Big Five assessment to see your results.'
        });
      }

      // Calculate scores from responses
      const calculatedScores = calculateAllScores(responses);
      const formattedScores = formatScoresForResponse(calculatedScores);

      return res.json({
        success: true,
        hasScores: true,
        isComplete: responses.length >= 120,
        questionsAnswered: responses.length,
        scores: formattedScores
      });
    }

    // Format saved scores for response
    const domainResults = {
      O: {
        raw: scores.openness_raw,
        tScore: parseFloat(scores.openness_t),
        percentile: scores.openness_percentile,
        label: getPercentileLabel(scores.openness_percentile),
        interpretation: getDomainInterpretation('O', scores.openness_percentile)
      },
      C: {
        raw: scores.conscientiousness_raw,
        tScore: parseFloat(scores.conscientiousness_t),
        percentile: scores.conscientiousness_percentile,
        label: getPercentileLabel(scores.conscientiousness_percentile),
        interpretation: getDomainInterpretation('C', scores.conscientiousness_percentile)
      },
      E: {
        raw: scores.extraversion_raw,
        tScore: parseFloat(scores.extraversion_t),
        percentile: scores.extraversion_percentile,
        label: getPercentileLabel(scores.extraversion_percentile),
        interpretation: getDomainInterpretation('E', scores.extraversion_percentile)
      },
      A: {
        raw: scores.agreeableness_raw,
        tScore: parseFloat(scores.agreeableness_t),
        percentile: scores.agreeableness_percentile,
        label: getPercentileLabel(scores.agreeableness_percentile),
        interpretation: getDomainInterpretation('A', scores.agreeableness_percentile)
      },
      N: {
        raw: scores.neuroticism_raw,
        tScore: parseFloat(scores.neuroticism_t),
        percentile: scores.neuroticism_percentile,
        label: getPercentileLabel(scores.neuroticism_percentile),
        interpretation: getDomainInterpretation('N', scores.neuroticism_percentile)
      }
    };

    res.json({
      success: true,
      hasScores: true,
      isComplete: scores.questions_answered >= 120,
      questionsAnswered: scores.questions_answered,
      scores: {
        openness: domainResults.O.tScore,
        conscientiousness: domainResults.C.tScore,
        extraversion: domainResults.E.tScore,
        agreeableness: domainResults.A.tScore,
        neuroticism: domainResults.N.tScore,
        openness_percentile: domainResults.O.percentile,
        conscientiousness_percentile: domainResults.C.percentile,
        extraversion_percentile: domainResults.E.percentile,
        agreeableness_percentile: domainResults.A.percentile,
        neuroticism_percentile: domainResults.N.percentile,
        domains: {
          openness: domainResults.O,
          conscientiousness: domainResults.C,
          extraversion: domainResults.E,
          agreeableness: domainResults.A,
          neuroticism: domainResults.N
        },
        questionnaire_version: scores.questionnaire_version,
        source_type: scores.source_type,
        behavioral_weight: parseFloat(scores.behavioral_weight) || 0,
        lastUpdated: scores.updated_at
      }
    });
  } catch (error) {
    console.error('[BigFive] Error fetching scores:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch scores'
    });
  }
});

/**
 * GET /api/big-five/facets
 * Get user's 30 facet-level scores
 */
router.get('/facets', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const facets = await getUserFacetScores(userId);

    if (!facets || facets.length === 0) {
      return res.json({
        success: true,
        hasFacets: false,
        message: 'No facet data yet. Complete the Big Five assessment to see detailed results.'
      });
    }

    // Group facets by domain
    const facetsByDomain = {
      O: { name: 'Openness', facets: [] },
      C: { name: 'Conscientiousness', facets: [] },
      E: { name: 'Extraversion', facets: [] },
      A: { name: 'Agreeableness', facets: [] },
      N: { name: 'Neuroticism', facets: [] }
    };

    for (const facet of facets) {
      const facetData = {
        number: facet.facet_number,
        name: facet.facet_name,
        raw: facet.raw_score,
        tScore: parseFloat(facet.t_score),
        percentile: facet.percentile,
        confidence: parseFloat(facet.confidence),
        behavioralSupport: facet.behavioral_support || []
      };

      if (facetsByDomain[facet.domain]) {
        facetsByDomain[facet.domain].facets.push(facetData);
      }
    }

    // Sort facets by number within each domain
    for (const domain of Object.values(facetsByDomain)) {
      domain.facets.sort((a, b) => a.number - b.number);
    }

    res.json({
      success: true,
      hasFacets: true,
      totalFacets: facets.length,
      facetsByDomain,
      facets: facets.map(f => ({
        id: `${f.domain}${f.facet_number}`,
        domain: f.domain,
        number: f.facet_number,
        name: f.facet_name,
        raw: f.raw_score,
        tScore: parseFloat(f.t_score),
        percentile: f.percentile,
        confidence: parseFloat(f.confidence)
      }))
    });
  } catch (error) {
    console.error('[BigFive] Error fetching facets:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch facets'
    });
  }
});

/**
 * GET /api/big-five/status
 * Get user's assessment completion status
 */
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const responses = await getUserResponses(userId);
    const scores = await getUserScores(userId);

    const totalQuestions = 120;
    const shortFormQuestions = 50;

    res.json({
      success: true,
      questionsAnswered: responses.length,
      totalQuestions,
      percentComplete: Math.round((responses.length / totalQuestions) * 100),
      hasShortForm: responses.length >= shortFormQuestions,
      hasFullAssessment: responses.length >= totalQuestions,
      hasScores: !!scores,
      lastUpdated: scores?.updated_at || null
    });
  } catch (error) {
    console.error('[BigFive] Error fetching status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch status'
    });
  }
});

/**
 * POST /api/big-five/calculate-preview
 * Calculate scores without saving (for real-time preview during assessment)
 */
router.post('/calculate-preview', optionalAuth, async (req, res) => {
  try {
    const { responses } = req.body;

    if (!responses || !Array.isArray(responses)) {
      return res.status(400).json({
        success: false,
        error: 'Responses array required'
      });
    }

    const scores = calculateAllScores(responses);
    const formattedScores = formatScoresForResponse(scores);

    res.json({
      success: true,
      isPreview: true,
      scores: formattedScores,
      questionsAnswered: responses.length,
      completionPercentage: Math.round((responses.length / 120) * 100)
    });
  } catch (error) {
    console.error('[BigFive] Error calculating preview:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate preview'
    });
  }
});

/**
 * DELETE /api/big-five/reset
 * Reset user's Big Five assessment
 */
router.delete('/reset', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Import supabaseAdmin for deletion
    const { supabaseAdmin } = await import('../config/supabase.js');

    // Delete responses
    await supabaseAdmin
      .from('big_five_responses')
      .delete()
      .eq('user_id', userId);

    // Delete scores
    await supabaseAdmin
      .from('big_five_scores')
      .delete()
      .eq('user_id', userId);

    // Delete facet scores
    await supabaseAdmin
      .from('facet_scores')
      .delete()
      .eq('user_id', userId);

    console.log(`[BigFive] Reset assessment for user ${userId}`);

    res.json({
      success: true,
      message: 'Big Five assessment reset successfully'
    });
  } catch (error) {
    console.error('[BigFive] Error resetting:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset assessment'
    });
  }
});

/**
 * GET /api/big-five/interpretation/:domain
 * Get detailed interpretation for a specific domain
 */
router.get('/interpretation/:domain', authenticateToken, async (req, res) => {
  try {
    const { domain } = req.params;
    const validDomains = ['O', 'C', 'E', 'A', 'N', 'openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism'];

    const domainMap = {
      openness: 'O',
      conscientiousness: 'C',
      extraversion: 'E',
      agreeableness: 'A',
      neuroticism: 'N'
    };

    const domainCode = domainMap[domain.toLowerCase()] || domain.toUpperCase();

    if (!['O', 'C', 'E', 'A', 'N'].includes(domainCode)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid domain. Use O, C, E, A, N or full names'
      });
    }

    const userId = req.user.id;
    const scores = await getUserScores(userId);

    if (!scores) {
      return res.status(404).json({
        success: false,
        error: 'No scores found. Complete the assessment first.'
      });
    }

    const domainScoreMap = {
      O: { percentile: scores.openness_percentile, tScore: scores.openness_t },
      C: { percentile: scores.conscientiousness_percentile, tScore: scores.conscientiousness_t },
      E: { percentile: scores.extraversion_percentile, tScore: scores.extraversion_t },
      A: { percentile: scores.agreeableness_percentile, tScore: scores.agreeableness_t },
      N: { percentile: scores.neuroticism_percentile, tScore: scores.neuroticism_t }
    };

    const domainNames = {
      O: 'Openness to Experience',
      C: 'Conscientiousness',
      E: 'Extraversion',
      A: 'Agreeableness',
      N: 'Neuroticism'
    };

    const domainData = domainScoreMap[domainCode];
    const interpretation = getDomainInterpretation(domainCode, domainData.percentile);

    // Get facets for this domain
    const facets = await getUserFacetScores(userId);
    const domainFacets = facets.filter(f => f.domain === domainCode);

    res.json({
      success: true,
      domain: {
        code: domainCode,
        name: domainNames[domainCode],
        tScore: parseFloat(domainData.tScore),
        percentile: domainData.percentile,
        label: getPercentileLabel(domainData.percentile),
        interpretation
      },
      facets: domainFacets.map(f => ({
        name: f.facet_name,
        tScore: parseFloat(f.t_score),
        percentile: f.percentile,
        label: getPercentileLabel(f.percentile)
      }))
    });
  } catch (error) {
    console.error('[BigFive] Error fetching interpretation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch interpretation'
    });
  }
});

// Helper function to get percentile label
function getPercentileLabel(percentile) {
  if (percentile >= 90) return 'Very High';
  if (percentile >= 75) return 'High';
  if (percentile >= 60) return 'Above Average';
  if (percentile >= 40) return 'Average';
  if (percentile >= 25) return 'Below Average';
  if (percentile >= 10) return 'Low';
  return 'Very Low';
}

export default router;
