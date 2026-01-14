/**
 * Big Five Assessment Service
 * IPIP-NEO-120 scoring with T-score normalization and percentile calculation
 *
 * Based on: Johnson, J.A. (2014). Measuring thirty facets of the Five Factor Model
 * with a 120-item public domain inventory: Development of the IPIP-NEO-120.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { supabaseAdmin } from './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load questions
let IPIP_QUESTIONS = null;

function loadQuestions() {
  if (!IPIP_QUESTIONS) {
    const questionsPath = path.join(__dirname, '../data/ipip-neo-120-questions.json');
    const data = fs.readFileSync(questionsPath, 'utf-8');
    IPIP_QUESTIONS = JSON.parse(data);
  }
  return IPIP_QUESTIONS;
}

// Population norms from Johnson (2014) N=619,150
const POPULATION_NORMS = {
  // Domain-level norms (raw score range: 24-120 for 24 items per domain)
  domains: {
    O: { mean: 72.7, stdDev: 12.8 },
    C: { mean: 72.1, stdDev: 13.4 },
    E: { mean: 63.5, stdDev: 14.7 },
    A: { mean: 73.8, stdDev: 12.0 },
    N: { mean: 62.3, stdDev: 15.1 }
  },
  // Facet-level norms (raw score range: 4-20 for 4 items per facet)
  facets: {
    N1: { name: 'Anxiety', mean: 10.8, stdDev: 3.5 },
    N2: { name: 'Anger', mean: 9.5, stdDev: 3.4 },
    N3: { name: 'Depression', mean: 10.2, stdDev: 3.8 },
    N4: { name: 'Self-Consciousness', mean: 10.9, stdDev: 3.3 },
    N5: { name: 'Immoderation', mean: 10.1, stdDev: 3.2 },
    N6: { name: 'Vulnerability', mean: 10.8, stdDev: 3.4 },
    E1: { name: 'Friendliness', mean: 11.2, stdDev: 3.3 },
    E2: { name: 'Gregariousness', mean: 9.8, stdDev: 3.8 },
    E3: { name: 'Assertiveness', mean: 10.5, stdDev: 3.5 },
    E4: { name: 'Activity Level', mean: 10.9, stdDev: 3.2 },
    E5: { name: 'Excitement-Seeking', mean: 10.2, stdDev: 3.6 },
    E6: { name: 'Cheerfulness', mean: 10.9, stdDev: 3.4 },
    O1: { name: 'Imagination', mean: 12.3, stdDev: 3.2 },
    O2: { name: 'Artistic Interests', mean: 11.8, stdDev: 3.5 },
    O3: { name: 'Emotionality', mean: 12.5, stdDev: 2.9 },
    O4: { name: 'Adventurousness', mean: 11.2, stdDev: 3.4 },
    O5: { name: 'Intellect', mean: 13.1, stdDev: 2.8 },
    O6: { name: 'Liberalism', mean: 11.8, stdDev: 3.1 },
    A1: { name: 'Trust', mean: 11.8, stdDev: 3.2 },
    A2: { name: 'Morality', mean: 13.5, stdDev: 2.4 },
    A3: { name: 'Altruism', mean: 12.8, stdDev: 2.8 },
    A4: { name: 'Cooperation', mean: 12.2, stdDev: 2.9 },
    A5: { name: 'Modesty', mean: 11.5, stdDev: 3.1 },
    A6: { name: 'Sympathy', mean: 12.0, stdDev: 3.0 },
    C1: { name: 'Self-Efficacy', mean: 12.8, stdDev: 2.9 },
    C2: { name: 'Orderliness', mean: 11.5, stdDev: 3.6 },
    C3: { name: 'Dutifulness', mean: 13.2, stdDev: 2.5 },
    C4: { name: 'Achievement-Striving', mean: 12.1, stdDev: 3.1 },
    C5: { name: 'Self-Discipline', mean: 10.8, stdDev: 3.4 },
    C6: { name: 'Cautiousness', mean: 11.7, stdDev: 3.0 }
  }
};

/**
 * Get questions for assessment
 * @param {string} version - '120' or '50'
 * @returns {Array} Questions array
 */
export function getQuestions(version = '120') {
  const questionsData = loadQuestions();
  return questionsData.questions.filter(q => version === '50' ? q.order <= 50 : true);
}

/**
 * Get question metadata (domains, facets, scale)
 */
export function getQuestionMetadata() {
  const questionsData = loadQuestions();
  return {
    scale: questionsData.scale,
    domains: questionsData.domains,
    facets: questionsData.facets
  };
}

/**
 * Calculate raw scores from responses
 * @param {Array} responses - Array of { questionId, value } where value is 1-5
 * @returns {Object} Raw scores for domains and facets
 */
export function calculateRawScores(responses) {
  const questionsData = loadQuestions();
  const questionMap = new Map(questionsData.questions.map(q => [q.id, q]));

  // Initialize accumulators
  const domainScores = { O: 0, C: 0, E: 0, A: 0, N: 0 };
  const facetScores = {};
  const domainCounts = { O: 0, C: 0, E: 0, A: 0, N: 0 };
  const facetCounts = {};

  // Initialize facets
  for (const domain of ['N', 'E', 'O', 'A', 'C']) {
    for (let facet = 1; facet <= 6; facet++) {
      const key = `${domain}${facet}`;
      facetScores[key] = 0;
      facetCounts[key] = 0;
    }
  }

  // Process responses
  for (const response of responses) {
    const question = questionMap.get(response.questionId);
    if (!question) continue;

    // Apply reverse scoring if needed
    let value = response.value;
    if (question.keyed === '-') {
      value = 6 - value; // Reverse: 1->5, 2->4, 3->3, 4->2, 5->1
    }

    // Accumulate domain score
    domainScores[question.domain] += value;
    domainCounts[question.domain]++;

    // Accumulate facet score
    const facetKey = `${question.domain}${question.facet}`;
    facetScores[facetKey] += value;
    facetCounts[facetKey]++;
  }

  return {
    domains: domainScores,
    facets: facetScores,
    counts: {
      domains: domainCounts,
      facets: facetCounts
    }
  };
}

/**
 * Calculate T-score from raw score
 * T-score formula: T = 50 + 10 * ((raw - mean) / stdDev)
 * @param {number} raw - Raw score
 * @param {number} mean - Population mean
 * @param {number} stdDev - Population standard deviation
 * @returns {number} T-score (typically 20-80 range)
 */
export function calculateTScore(raw, mean, stdDev) {
  if (stdDev === 0) return 50;
  const z = (raw - mean) / stdDev;
  const tScore = 50 + (10 * z);
  // Clamp to reasonable range
  return Math.max(20, Math.min(80, Math.round(tScore * 10) / 10));
}

/**
 * Calculate percentile from T-score using normal distribution CDF
 * @param {number} tScore - T-score value
 * @returns {number} Percentile (0-100)
 */
export function calculatePercentile(tScore) {
  // Convert T-score to z-score: z = (T - 50) / 10
  const z = (tScore - 50) / 10;

  // Calculate CDF of standard normal distribution using error function approximation
  // Abramowitz and Stegun approximation
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.sqrt(2);
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  const cdf = 0.5 * (1 + sign * y);
  return Math.round(cdf * 100);
}

/**
 * Get interpretation label for percentile
 * @param {number} percentile - Percentile value (0-100)
 * @returns {string} Interpretation label
 */
export function getPercentileLabel(percentile) {
  if (percentile >= 90) return 'Very High';
  if (percentile >= 75) return 'High';
  if (percentile >= 60) return 'Above Average';
  if (percentile >= 40) return 'Average';
  if (percentile >= 25) return 'Below Average';
  if (percentile >= 10) return 'Low';
  return 'Very Low';
}

/**
 * Calculate all scores (raw, T-scores, percentiles) from responses
 * @param {Array} responses - Array of { questionId, value }
 * @returns {Object} Complete scoring results
 */
export function calculateAllScores(responses) {
  const rawScores = calculateRawScores(responses);

  const domainResults = {};
  const facetResults = {};

  // Calculate domain scores
  for (const [domain, rawScore] of Object.entries(rawScores.domains)) {
    const norm = POPULATION_NORMS.domains[domain];
    const tScore = calculateTScore(rawScore, norm.mean, norm.stdDev);
    const percentile = calculatePercentile(tScore);

    domainResults[domain] = {
      raw: rawScore,
      tScore,
      percentile,
      label: getPercentileLabel(percentile),
      questionsAnswered: rawScores.counts.domains[domain]
    };
  }

  // Calculate facet scores
  for (const [facetKey, rawScore] of Object.entries(rawScores.facets)) {
    const norm = POPULATION_NORMS.facets[facetKey];
    if (!norm) continue;

    const tScore = calculateTScore(rawScore, norm.mean, norm.stdDev);
    const percentile = calculatePercentile(tScore);

    facetResults[facetKey] = {
      name: norm.name,
      raw: rawScore,
      tScore,
      percentile,
      label: getPercentileLabel(percentile),
      questionsAnswered: rawScores.counts.facets[facetKey]
    };
  }

  return {
    domains: domainResults,
    facets: facetResults,
    totalQuestionsAnswered: responses.length,
    completionPercentage: Math.round((responses.length / 120) * 100)
  };
}

/**
 * Generate domain interpretation text
 * @param {string} domain - Domain code (O, C, E, A, N)
 * @param {number} percentile - Percentile score
 * @returns {string} Interpretation text
 */
export function getDomainInterpretation(domain, percentile) {
  const interpretations = {
    O: {
      high: 'You are creative, curious, and open to new experiences. You appreciate art, adventure, and unconventional ideas.',
      average: 'You balance creativity with practicality. You appreciate some variety but also value familiar routines.',
      low: 'You prefer practical, conventional approaches. You value tradition and straightforward solutions.'
    },
    C: {
      high: 'You are organized, dependable, and goal-oriented. You plan carefully and follow through on commitments.',
      average: 'You balance organization with flexibility. You can be dependable while adapting to circumstances.',
      low: 'You prefer spontaneity over strict planning. You are flexible and adaptable in your approach.'
    },
    E: {
      high: 'You are outgoing, energetic, and seek stimulation. You enjoy being around others and thrive in social situations.',
      average: 'You enjoy social interaction but also value alone time. You can adapt to different social situations.',
      low: 'You prefer solitary activities and smaller social gatherings. You recharge through quiet reflection.'
    },
    A: {
      high: 'You are compassionate, cooperative, and trusting. You value harmony and helping others.',
      average: 'You balance cooperation with self-interest. You can be both competitive and collaborative.',
      low: 'You are direct, competitive, and questioning. You prioritize your own interests and challenge others.'
    },
    N: {
      high: 'You tend to experience negative emotions more frequently. You may be sensitive to stress and prone to worry.',
      average: 'You experience a normal range of emotions. You can handle moderate stress effectively.',
      low: 'You are emotionally stable and resilient. You remain calm under pressure and recover quickly from setbacks.'
    }
  };

  const level = percentile >= 60 ? 'high' : percentile >= 40 ? 'average' : 'low';
  return interpretations[domain]?.[level] || '';
}

/**
 * Save assessment responses to database
 * @param {string} userId - User ID
 * @param {Array} responses - Array of { questionId, value }
 * @param {string} sessionId - Optional session ID
 */
export async function saveResponses(userId, responses, sessionId = null) {
  const responsesToSave = responses.map(r => ({
    user_id: userId,
    question_id: r.questionId,
    response_value: r.value,
    response_time_ms: r.responseTime || null,
    session_id: sessionId
  }));

  // Upsert responses (update if exists, insert if not)
  const { data, error } = await supabaseAdmin
    .from('big_five_responses')
    .upsert(responsesToSave, {
      onConflict: 'user_id,question_id'
    });

  if (error) {
    console.error('[BigFive] Error saving responses:', error);
    throw error;
  }

  return data;
}

/**
 * Calculate and save Big Five scores
 * @param {string} userId - User ID
 * @param {Array} responses - Array of { questionId, value }
 * @returns {Object} Calculated scores
 */
export async function calculateAndSaveScores(userId, responses) {
  const scores = calculateAllScores(responses);

  // Prepare scores for database
  const scoreRecord = {
    user_id: userId,
    openness_raw: scores.domains.O?.raw,
    conscientiousness_raw: scores.domains.C?.raw,
    extraversion_raw: scores.domains.E?.raw,
    agreeableness_raw: scores.domains.A?.raw,
    neuroticism_raw: scores.domains.N?.raw,
    openness_t: scores.domains.O?.tScore,
    conscientiousness_t: scores.domains.C?.tScore,
    extraversion_t: scores.domains.E?.tScore,
    agreeableness_t: scores.domains.A?.tScore,
    neuroticism_t: scores.domains.N?.tScore,
    openness_percentile: scores.domains.O?.percentile,
    conscientiousness_percentile: scores.domains.C?.percentile,
    extraversion_percentile: scores.domains.E?.percentile,
    agreeableness_percentile: scores.domains.A?.percentile,
    neuroticism_percentile: scores.domains.N?.percentile,
    questionnaire_version: '120',
    questions_answered: scores.totalQuestionsAnswered,
    source_type: 'questionnaire',
    updated_at: new Date().toISOString()
  };

  // Upsert main scores
  const { data: savedScores, error: scoresError } = await supabaseAdmin
    .from('big_five_scores')
    .upsert(scoreRecord, { onConflict: 'user_id' })
    .select()
    .single();

  if (scoresError) {
    console.error('[BigFive] Error saving scores:', scoresError);
    throw scoresError;
  }

  // Save facet scores
  const facetRecords = Object.entries(scores.facets).map(([key, facet]) => ({
    user_id: userId,
    domain: key[0],
    facet_number: parseInt(key[1]),
    facet_name: facet.name,
    raw_score: facet.raw,
    t_score: facet.tScore,
    percentile: facet.percentile,
    confidence: calculateFacetConfidence(facet.questionsAnswered),
    updated_at: new Date().toISOString()
  }));

  const { error: facetError } = await supabaseAdmin
    .from('facet_scores')
    .upsert(facetRecords, { onConflict: 'user_id,domain,facet_number' });

  if (facetError) {
    console.error('[BigFive] Error saving facet scores:', facetError);
    // Don't throw - main scores are saved
  }

  // Sync to personality_estimates for behavioral learning integration
  // This allows the behavioral learning service to refine questionnaire scores
  await syncToPersonalityEstimates(userId, scores);

  return {
    ...scores,
    savedAt: new Date().toISOString()
  };
}

/**
 * Sync Big Five scores to personality_estimates table for behavioral learning
 * @param {string} userId - User ID
 * @param {Object} scores - Calculated Big Five scores
 */
async function syncToPersonalityEstimates(userId, scores) {
  try {
    // Map Big Five scores to personality_estimates format
    // Use percentiles (0-100) for consistency with behavioral learning
    const estimateRecord = {
      user_id: userId,
      openness: scores.domains.O?.percentile || 50,
      conscientiousness: scores.domains.C?.percentile || 50,
      extraversion: scores.domains.E?.percentile || 50,
      agreeableness: scores.domains.A?.percentile || 50,
      neuroticism: scores.domains.N?.percentile || 50,
      questionnaire_score_weight: 1.0, // Full weight for questionnaire
      behavioral_score_weight: 0, // Will be updated by behavioral learning
      total_questionnaire_questions: scores.totalQuestionsAnswered,
      total_behavioral_signals: 0,
      last_questionnaire_update_at: new Date().toISOString(),
      assessment_source: 'ipip_neo_120',
      updated_at: new Date().toISOString()
    };

    // Calculate archetype from the scores
    try {
      const { mapToArchetype } = await import('./personalityAssessmentService.js');
      const archetype = mapToArchetype({
        extraversion: estimateRecord.extraversion,
        openness: estimateRecord.openness,
        conscientiousness: estimateRecord.conscientiousness,
        agreeableness: estimateRecord.agreeableness,
        neuroticism: estimateRecord.neuroticism
      });
      estimateRecord.archetype_code = archetype.code;
    } catch (err) {
      console.warn('[BigFive] Could not calculate archetype:', err.message);
    }

    const { error } = await supabaseAdmin
      .from('personality_estimates')
      .upsert(estimateRecord, { onConflict: 'user_id' });

    if (error) {
      console.error('[BigFive] Error syncing to personality_estimates:', error);
      // Don't throw - this is a secondary operation
    } else {
      console.log(`[BigFive] Synced scores to personality_estimates for user ${userId}`);
    }
  } catch (err) {
    console.error('[BigFive] Error in syncToPersonalityEstimates:', err);
  }
}

/**
 * Calculate confidence based on questions answered per facet
 * @param {number} questionsAnswered - Number of questions answered (max 4 per facet)
 * @returns {number} Confidence score (0-100)
 */
function calculateFacetConfidence(questionsAnswered) {
  const maxQuestions = 4;
  return Math.min(100, Math.round((questionsAnswered / maxQuestions) * 100));
}

/**
 * Get user's current Big Five scores
 * @param {string} userId - User ID
 * @returns {Object|null} Scores or null if not found
 */
export async function getUserScores(userId) {
  const { data: scores, error } = await supabaseAdmin
    .from('big_five_scores')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 = not found
    console.error('[BigFive] Error fetching scores:', error);
    throw error;
  }

  return scores;
}

/**
 * Get user's facet scores
 * @param {string} userId - User ID
 * @returns {Array} Facet scores
 */
export async function getUserFacetScores(userId) {
  const { data: facets, error } = await supabaseAdmin
    .from('facet_scores')
    .select('*')
    .eq('user_id', userId)
    .order('domain')
    .order('facet_number');

  if (error) {
    console.error('[BigFive] Error fetching facet scores:', error);
    throw error;
  }

  return facets || [];
}

/**
 * Get user's responses for resuming assessment
 * @param {string} userId - User ID
 * @returns {Array} Previous responses
 */
export async function getUserResponses(userId) {
  const { data: responses, error } = await supabaseAdmin
    .from('big_five_responses')
    .select('question_id, response_value')
    .eq('user_id', userId);

  if (error) {
    console.error('[BigFive] Error fetching responses:', error);
    throw error;
  }

  return (responses || []).map(r => ({
    questionId: r.question_id,
    value: r.response_value
  }));
}

/**
 * Format scores for API response (matches demo data structure)
 * @param {Object} scores - Calculated scores
 * @returns {Object} Formatted response
 */
export function formatScoresForResponse(scores) {
  const domainNames = {
    O: 'openness',
    C: 'conscientiousness',
    E: 'extraversion',
    A: 'agreeableness',
    N: 'neuroticism'
  };

  const response = {
    // Domain scores (compatible with demo format)
    openness: scores.domains.O?.tScore || 50,
    conscientiousness: scores.domains.C?.tScore || 50,
    extraversion: scores.domains.E?.tScore || 50,
    agreeableness: scores.domains.A?.tScore || 50,
    neuroticism: scores.domains.N?.tScore || 50,

    // Percentiles
    openness_percentile: scores.domains.O?.percentile || 50,
    conscientiousness_percentile: scores.domains.C?.percentile || 50,
    extraversion_percentile: scores.domains.E?.percentile || 50,
    agreeableness_percentile: scores.domains.A?.percentile || 50,
    neuroticism_percentile: scores.domains.N?.percentile || 50,

    // Confidence intervals
    openness_confidence: 85,
    conscientiousness_confidence: 85,
    extraversion_confidence: 85,
    agreeableness_confidence: 85,
    neuroticism_confidence: 85,

    // Detailed domain results
    domains: {},

    // Facet results
    facets: scores.facets || {},

    // Metadata
    questionnaire_version: '120',
    questions_answered: scores.totalQuestionsAnswered || 0,
    completion_percentage: scores.completionPercentage || 0,
    source_type: 'questionnaire'
  };

  // Add detailed domain info with interpretations
  for (const [code, name] of Object.entries(domainNames)) {
    const domain = scores.domains[code];
    if (domain) {
      response.domains[name] = {
        raw: domain.raw,
        tScore: domain.tScore,
        percentile: domain.percentile,
        label: domain.label,
        interpretation: getDomainInterpretation(code, domain.percentile)
      };
    }
  }

  return response;
}

/**
 * Behavioral correlation mappings for Big Five domains
 * Based on personality psychology research
 */
const BEHAVIORAL_CORRELATIONS = {
  spotify: {
    genre_diversity: { O: 0.40, E: 0.15 },
    tempo_preference: { E: 0.25, N: -0.15 },
    discovery_rate: { O: 0.45, C: -0.10 },
    energy_preference: { E: 0.35, N: -0.20 },
    valence_preference: { E: 0.25, N: -0.30, A: 0.15 },
    acoustic_preference: { A: 0.15, N: 0.10 }
  },
  calendar: {
    meeting_density: { E: 0.40, C: 0.20 },
    focus_block_count: { C: 0.35, E: -0.25 },
    schedule_regularity: { C: 0.45, O: -0.20 }
  },
  whoop: {
    recovery_variance: { N: 0.35 },
    sleep_consistency: { C: 0.40 },
    strain_level_avg: { E: 0.20, C: 0.15 }
  }
};

/**
 * Generate behavioral evidence for Big Five domains from platform data
 * @param {Object} platformData - Data from connected platforms
 * @returns {Object} Evidence organized by domain
 */
export function generateBehavioralEvidence(platformData) {
  const evidence = {
    O: [],
    C: [],
    E: [],
    A: [],
    N: []
  };

  if (!platformData) return evidence;

  // Process Spotify data
  if (platformData.spotify) {
    const spotify = platformData.spotify;

    if (spotify.genre_diversity !== undefined) {
      const value = spotify.genre_diversity;
      evidence.O.push({
        platform: 'spotify',
        feature: 'genre_diversity',
        value: Math.round(value * 100),
        description: value > 0.6 ? 'Explores diverse music genres' : 'Focused music preferences',
        correlation: BEHAVIORAL_CORRELATIONS.spotify.genre_diversity.O
      });
    }

    if (spotify.energy_preference !== undefined) {
      const value = spotify.energy_preference;
      evidence.E.push({
        platform: 'spotify',
        feature: 'energy_preference',
        value: Math.round(value * 100),
        description: value > 0.6 ? 'Prefers high-energy music' : 'Prefers calm, relaxed music',
        correlation: BEHAVIORAL_CORRELATIONS.spotify.energy_preference.E
      });
    }

    if (spotify.discovery_rate !== undefined) {
      const value = spotify.discovery_rate;
      evidence.O.push({
        platform: 'spotify',
        feature: 'discovery_rate',
        value: Math.round(value * 100),
        description: value > 0.5 ? 'Frequently discovers new artists' : 'Sticks to familiar music',
        correlation: BEHAVIORAL_CORRELATIONS.spotify.discovery_rate.O
      });
    }

    if (spotify.valence_preference !== undefined) {
      const value = spotify.valence_preference;
      evidence.N.push({
        platform: 'spotify',
        feature: 'valence_preference',
        value: Math.round(value * 100),
        description: value > 0.5 ? 'Prefers positive, upbeat music' : 'Drawn to melancholic music',
        correlation: Math.abs(BEHAVIORAL_CORRELATIONS.spotify.valence_preference.N)
      });
    }
  }

  // Process Calendar data
  if (platformData.calendar) {
    const calendar = platformData.calendar;

    if (calendar.meeting_density !== undefined) {
      const value = calendar.meeting_density;
      evidence.E.push({
        platform: 'calendar',
        feature: 'meeting_density',
        value: Math.round(value * 100),
        description: value > 0.5 ? 'Frequently scheduled meetings' : 'Fewer scheduled interactions',
        correlation: BEHAVIORAL_CORRELATIONS.calendar.meeting_density.E
      });
    }

    if (calendar.focus_block_count !== undefined) {
      const value = calendar.focus_block_count;
      evidence.C.push({
        platform: 'calendar',
        feature: 'focus_blocks',
        value: Math.round(value * 100),
        description: value > 0.3 ? 'Schedules dedicated focus time' : 'Flexible, unstructured schedule',
        correlation: BEHAVIORAL_CORRELATIONS.calendar.focus_block_count.C
      });
    }

    if (calendar.schedule_regularity !== undefined) {
      const value = calendar.schedule_regularity;
      evidence.C.push({
        platform: 'calendar',
        feature: 'schedule_regularity',
        value: Math.round(value * 100),
        description: value > 0.5 ? 'Consistent daily routines' : 'Variable, flexible scheduling',
        correlation: BEHAVIORAL_CORRELATIONS.calendar.schedule_regularity.C
      });
    }
  }

  // Process Whoop data
  if (platformData.whoop) {
    const whoop = platformData.whoop;

    if (whoop.recovery_variance !== undefined) {
      const value = whoop.recovery_variance;
      evidence.N.push({
        platform: 'whoop',
        feature: 'recovery_variance',
        value: Math.round(value * 100),
        description: value > 0.5 ? 'Variable recovery patterns' : 'Stable recovery patterns',
        correlation: BEHAVIORAL_CORRELATIONS.whoop.recovery_variance.N
      });
    }

    if (whoop.sleep_consistency !== undefined) {
      const value = whoop.sleep_consistency;
      evidence.C.push({
        platform: 'whoop',
        feature: 'sleep_consistency',
        value: Math.round(value * 100),
        description: value > 0.6 ? 'Consistent sleep schedule' : 'Variable sleep patterns',
        correlation: BEHAVIORAL_CORRELATIONS.whoop.sleep_consistency.C
      });
    }

    if (whoop.strain_level_avg !== undefined) {
      const value = whoop.strain_level_avg / 21; // Normalize strain (0-21 scale)
      evidence.E.push({
        platform: 'whoop',
        feature: 'strain_level',
        value: Math.round(value * 100),
        description: value > 0.5 ? 'High activity and strain levels' : 'Moderate activity levels',
        correlation: BEHAVIORAL_CORRELATIONS.whoop.strain_level_avg.E
      });
    }
  }

  return evidence;
}

/**
 * Calculate behavioral adjustment for Big Five scores
 * @param {Object} questionnaireScores - Scores from questionnaire
 * @param {Object} platformData - Data from connected platforms
 * @param {number} behavioralWeight - Weight for behavioral data (0-0.3 recommended)
 * @returns {Object} Adjusted scores with behavioral integration
 */
export function integrateBehavioralData(questionnaireScores, platformData, behavioralWeight = 0.2) {
  if (!platformData || behavioralWeight === 0) {
    return questionnaireScores;
  }

  const evidence = generateBehavioralEvidence(platformData);
  const adjustedScores = { ...questionnaireScores };

  // Calculate behavioral scores for each domain
  const behavioralScores = {};

  for (const [domain, domainEvidence] of Object.entries(evidence)) {
    if (domainEvidence.length === 0) continue;

    // Weighted average of evidence values
    let weightedSum = 0;
    let totalWeight = 0;

    for (const e of domainEvidence) {
      const weight = Math.abs(e.correlation);
      weightedSum += e.value * weight;
      totalWeight += weight;
    }

    if (totalWeight > 0) {
      behavioralScores[domain] = weightedSum / totalWeight;
    }
  }

  // Apply Bayesian-style weighted combination
  const questionnaireWeight = 1 - behavioralWeight;

  for (const [domain, behavioralScore] of Object.entries(behavioralScores)) {
    if (adjustedScores.domains && adjustedScores.domains[domain]) {
      const qScore = adjustedScores.domains[domain].percentile;
      const combined = (qScore * questionnaireWeight) + (behavioralScore * behavioralWeight);
      adjustedScores.domains[domain].percentile = Math.round(combined);
      adjustedScores.domains[domain].behavioralAdjustment = Math.round(behavioralScore - qScore);
    }
  }

  return adjustedScores;
}

/**
 * Get behavioral evidence for a user from their connected platforms
 * @param {string} userId - User ID
 * @returns {Object} Behavioral evidence organized by domain
 */
export async function getUserBehavioralEvidence(userId) {
  try {
    // Fetch platform features from database
    const { data: features, error } = await supabaseAdmin
      .from('behavioral_features')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      console.error('[BigFive] Error fetching behavioral features:', error);
      return { O: [], C: [], E: [], A: [], N: [] };
    }

    // Organize features by platform
    const platformData = {};
    for (const feature of (features || [])) {
      if (!platformData[feature.platform]) {
        platformData[feature.platform] = {};
      }
      platformData[feature.platform][feature.feature_type] = feature.feature_value / 100;
    }

    return generateBehavioralEvidence(platformData);
  } catch (err) {
    console.error('[BigFive] Error getting behavioral evidence:', err);
    return { O: [], C: [], E: [], A: [], N: [] };
  }
}

export default {
  getQuestions,
  getQuestionMetadata,
  calculateRawScores,
  calculateTScore,
  calculatePercentile,
  calculateAllScores,
  getDomainInterpretation,
  saveResponses,
  calculateAndSaveScores,
  getUserScores,
  getUserFacetScores,
  getUserResponses,
  formatScoresForResponse,
  generateBehavioralEvidence,
  integrateBehavioralData,
  getUserBehavioralEvidence,
  BEHAVIORAL_CORRELATIONS
};
