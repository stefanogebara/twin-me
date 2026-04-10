/**
 * In-Silico Engine
 * ================
 * Scores stimuli against a user's ICA personality axes to predict engagement.
 *
 * Core idea: Each personality axis is a direction in embedding space that captures
 * a behavioral dimension. Stimuli that align with dominant axes (weighted by
 * variance explained) are predicted to engage the user more.
 *
 * Scoring formula per stimulus:
 *   centroidRelevance = cosineSimilarity(stimEmb, centroid)
 *   weightedAxisScore = sum(|activation_i| * variance_i) / sum(variance_i)
 *   predictedEngagement = 0.4 * centroidRelevance + 0.6 * weightedAxisScore
 *
 * Usage:
 *   import { predictEngagement, scoreForInsightSelection } from './inSilicoEngine.js';
 */

import { generateEmbedding } from './embeddingService.js';
import { cosineSimilarity, dotProduct, spearmanCorrelation } from './statsUtils.js';
import { supabaseAdmin } from './database.js';
import { createLogger } from './logger.js';

const log = createLogger('InSilicoEngine');

const MAX_STIMULI = 50;
const TOP_AXES_COUNT = 3;

// ─── Embedding Helper ───────────────────────────────────────────────────

/**
 * Embed all stimuli texts in parallel.
 * @param {Array<{ text: string, id?: string }>} stimuli
 * @returns {Promise<Array<{ text: string, id: string|null, embedding: number[]|null }>>}
 */
async function embedStimuli(stimuli) {
  const results = await Promise.all(
    stimuli.map(async (s) => {
      const embedding = await generateEmbedding(s.text);
      return {
        text: s.text,
        id: s.id || null,
        embedding,
      };
    })
  );
  return results;
}

// ─── Scoring ────────────────────────────────────────────────────────────

/**
 * Compute engagement scores for a single embedded stimulus.
 * @param {number[]} stimEmb - Stimulus embedding
 * @param {number[]|null} centroid - User personality centroid
 * @param {Array<{ label: string, mixing_vector: number[], variance_explained: number }>} axes
 * @returns {{ predictedEngagement: number, centroidRelevance: number, topAxes: Array }}
 */
function scoreStimulus(stimEmb, centroid, axes) {
  const centroidRelevance = centroid
    ? cosineSimilarity(stimEmb, centroid)
    : 0;

  if (axes.length === 0) {
    return {
      predictedEngagement: centroidRelevance,
      centroidRelevance,
      topAxes: [],
    };
  }

  // Compute activation on each axis
  const axisActivations = axes.map((a) => ({
    label: a.label,
    varianceExplained: a.variance_explained,
    activation: dotProduct(stimEmb, a.mixing_vector),
  }));

  // Weighted axis score: sum(|activation| * variance) / sum(variance)
  const totalVariance = axes.reduce((sum, a) => sum + a.variance_explained, 0);
  const weightedAxisScore = totalVariance > 0
    ? axisActivations.reduce(
        (sum, a) => sum + Math.abs(a.activation) * a.varianceExplained,
        0
      ) / totalVariance
    : 0;

  // Combined score
  const predictedEngagement = 0.4 * centroidRelevance + 0.6 * weightedAxisScore;

  // Top 3 activating axes (by absolute activation)
  const topAxes = [...axisActivations]
    .sort((a, b) => Math.abs(b.activation) - Math.abs(a.activation))
    .slice(0, TOP_AXES_COUNT)
    .map((a) => ({
      label: a.label,
      activation: a.activation,
      varianceExplained: a.varianceExplained,
    }));

  return { predictedEngagement, centroidRelevance, topAxes };
}

// ─── Public API ─────────────────────────────────────────────────────────

/**
 * Predict engagement for a list of stimuli against a user's personality axes.
 * @param {string} userId
 * @param {Array<{ text: string, id?: string }>} stimuli - Max 50 items
 * @returns {Promise<{ predictions: Array, userId: string, axesUsed: number }|{ error: string, message: string }>}
 */
export async function predictEngagement(userId, stimuli) {
  try {
    if (!Array.isArray(stimuli) || stimuli.length === 0) {
      return { error: 'invalid_input', message: 'stimuli must be a non-empty array' };
    }

    if (stimuli.length > MAX_STIMULI) {
      return { error: 'too_many_stimuli', message: `Maximum ${MAX_STIMULI} stimuli per request` };
    }

    // Get personality embedding centroid from DB (ICA axes removed)
    const { data: profileRow } = await supabaseAdmin
      .from('user_personality_profiles')
      .select('personality_embedding')
      .eq("user_id", userId)
      .maybeSingle();
    const axes = [];
    const centroid = profileRow?.personality_embedding ?? null;

    log.info('Scoring stimuli', {
      userId,
      stimuliCount: stimuli.length,
      axesCount: axes.length,
      hasCentroid: !!centroid,
    });

    // Embed all stimuli in parallel
    const embeddedStimuli = await embedStimuli(stimuli);

    // Score each stimulus
    const scored = embeddedStimuli.map((s) => {
      if (!s.embedding) {
        return {
          text: s.text,
          id: s.id,
          predictedEngagement: 0,
          centroidRelevance: 0,
          topAxes: [],
          embeddingFailed: true,
        };
      }

      const scores = scoreStimulus(s.embedding, centroid, axes);
      return {
        text: s.text,
        id: s.id,
        predictedEngagement: scores.predictedEngagement,
        centroidRelevance: scores.centroidRelevance,
        topAxes: scores.topAxes,
      };
    });

    // Sort descending by predicted engagement
    const sorted = [...scored].sort(
      (a, b) => b.predictedEngagement - a.predictedEngagement
    );

    return {
      predictions: sorted,
      userId,
      axesUsed: axes.length,
    };
  } catch (err) {
    log.error('predictEngagement failed', { userId, error: err.message });
    return { error: 'unexpected', message: err.message };
  }
}

/**
 * Validate predictions against actual engagement data from an experiment.
 * @param {string} userId
 * @param {string} experimentId
 * @returns {Promise<{ experiment: object, validation: object|null }|{ error: string, message: string }>}
 */
export async function validatePredictions(userId, experimentId) {
  try {
    const { data: experiment, error } = await supabaseAdmin
      .from('in_silico_experiments')
      .select('*')
      .eq('id', experimentId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      log.error('Failed to fetch experiment', { experimentId, error: error.message });
      return { error: 'db_error', message: 'Failed to fetch experiment' };
    }

    if (!experiment) {
      return { error: 'not_found', message: 'Experiment not found' };
    }

    // Extract predicted rankings
    const predictions = experiment.results || [];
    const predictedRanks = predictions.map((p, i) => ({
      text: p.text,
      id: p.id,
      predictedRank: i + 1,
      predictedEngagement: p.predictedEngagement,
    }));

    // Actual validation requires conversation engagement data.
    // For now, return the predicted rankings and mark as pending validation.
    const validationResult = {
      predictedRanks,
      actualRanks: null,
      correlation: null,
      status: 'pending_actual_data',
    };

    // Update experiment with validation attempt
    const { error: updateError } = await supabaseAdmin
      .from('in_silico_experiments')
      .update({
        validation: validationResult,
        validated_at: new Date().toISOString(),
      })
      .eq('id', experimentId);

    if (updateError) {
      log.warn('Failed to update experiment validation', {
        experimentId,
        error: updateError.message,
      });
    }

    return { experiment, validation: validationResult };
  } catch (err) {
    log.error('validatePredictions failed', { experimentId, error: err.message });
    return { error: 'unexpected', message: err.message };
  }
}

/**
 * Lightweight wrapper for scoring insight candidates.
 * Returns insights with engagement_score added.
 * @param {string} userId
 * @param {string[]} candidateInsights - Array of insight text strings
 * @returns {Promise<Array<{ text: string, engagement_score: number, topAxes: Array }>>}
 */
export async function scoreForInsightSelection(userId, candidateInsights) {
  try {
    if (!Array.isArray(candidateInsights) || candidateInsights.length === 0) {
      return [];
    }

    const stimuli = candidateInsights.map((text) => ({ text }));
    const result = await predictEngagement(userId, stimuli);

    if (result.error) {
      log.warn('Insight scoring failed, returning unscored', {
        userId,
        error: result.error,
      });
      return candidateInsights.map((text) => ({
        text,
        engagement_score: 0,
        topAxes: [],
      }));
    }

    return result.predictions.map((p) => ({
      text: p.text,
      engagement_score: p.predictedEngagement,
      topAxes: p.topAxes,
    }));
  } catch (err) {
    log.error('scoreForInsightSelection failed', { userId, error: err.message });
    return candidateInsights.map((text) => ({
      text,
      engagement_score: 0,
      topAxes: [],
    }));
  }
}
