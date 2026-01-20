/**
 * Agent Orchestrator Service
 *
 * Coordinates specialized agents (MusicPsychologyAgent, BiometricAgent, ChronotypeAgent)
 * to generate comprehensive Big Five personality inferences from behavioral data.
 *
 * This service:
 * 1. Runs agents in parallel for each available data source
 * 2. Combines personality adjustments from all agents
 * 3. Integrates with evidence generator for human-readable explanations
 * 4. Calculates final personality scores with confidence levels
 *
 * Research Foundation:
 * Multi-platform behavioral inference based on:
 * - Anderson et al. (2021) - Music preferences
 * - Stachl et al. (2020) - Smartphone patterns
 * - Zufferey et al. (2023) - Wearable biometrics
 * - Chronotype Meta-Analysis (2024) - Sleep/schedule
 */

import MusicPsychologyAgent from './agents/MusicPsychologyAgent.js';
import BiometricAgent from './agents/BiometricAgent.js';
import ChronotypeAgent from './agents/ChronotypeAgent.js';
import {
  generateAllEvidence,
  calculateConfidenceScores,
  storeEvidence,
  formatEvidenceResponse
} from './evidenceGeneratorService.js';
import { supabaseAdmin } from '../config/supabase.js';

// Use shared Supabase client
const supabase = supabaseAdmin;

// Default baseline scores (neutral 50%)
const BASELINE_SCORES = {
  openness: 50,
  conscientiousness: 50,
  extraversion: 50,
  agreeableness: 50,
  neuroticism: 50
};

class AgentOrchestrator {
  constructor() {
    this.agents = {
      music: null,
      biometric: null,
      chronotype: null
    };

    this.initializeAgents();
  }

  /**
   * Initialize all specialized agents
   */
  initializeAgents() {
    try {
      this.agents.music = new MusicPsychologyAgent();
      console.log('[AgentOrchestrator] MusicPsychologyAgent initialized');
    } catch (error) {
      console.error('[AgentOrchestrator] Failed to initialize MusicPsychologyAgent:', error);
    }

    try {
      this.agents.biometric = new BiometricAgent();
      console.log('[AgentOrchestrator] BiometricAgent initialized');
    } catch (error) {
      console.error('[AgentOrchestrator] Failed to initialize BiometricAgent:', error);
    }

    try {
      this.agents.chronotype = new ChronotypeAgent();
      console.log('[AgentOrchestrator] ChronotypeAgent initialized');
    } catch (error) {
      console.error('[AgentOrchestrator] Failed to initialize ChronotypeAgent:', error);
    }
  }

  /**
   * Run complete personality inference pipeline for a user
   * @param {string} userId - User ID
   * @param {Object} options - Options for the pipeline
   * @returns {Object} Complete personality inference results
   */
  async runInferencePipeline(userId, options = {}) {
    console.log(`[AgentOrchestrator] Starting inference pipeline for user ${userId}`);
    const startTime = Date.now();

    try {
      // Step 1: Check available data sources
      const dataSources = await this.checkDataSources(userId);
      console.log(`[AgentOrchestrator] Available data sources:`, Object.keys(dataSources).filter(k => dataSources[k].available));

      // Step 2: Run agents in parallel
      const agentResults = await this.runAgentsParallel(userId, dataSources, options);

      // Step 3: Combine personality adjustments
      const combinedAdjustments = this.combineAdjustments(agentResults);

      // Step 4: Calculate final personality scores
      const baselineScores = await this.getBaselineScores(userId);
      const finalScores = this.calculateFinalScores(baselineScores, combinedAdjustments);

      // Step 5: Combine all evidence
      const allEvidence = this.combineEvidence(agentResults);

      // Step 6: Calculate confidence scores
      const confidence = this.calculateOverallConfidence(agentResults, dataSources);

      // Step 7: Store evidence in database
      if (options.storeEvidence !== false) {
        await this.storeAllEvidence(userId, allEvidence);
      }

      // Step 8: Generate interpretations
      const interpretation = this.generateInterpretation(agentResults, finalScores);

      const duration = Date.now() - startTime;
      console.log(`[AgentOrchestrator] Pipeline completed in ${duration}ms`);

      return {
        success: true,
        user_id: userId,
        personality: finalScores,
        confidence,
        evidence: allEvidence,
        agent_results: this.summarizeAgentResults(agentResults),
        interpretation,
        data_sources: dataSources,
        metadata: {
          pipeline_version: '1.0',
          duration_ms: duration,
          agents_used: Object.keys(agentResults).filter(k => agentResults[k].success)
        }
      };

    } catch (error) {
      console.error(`[AgentOrchestrator] Pipeline failed:`, error);
      return {
        success: false,
        error: error.message,
        user_id: userId
      };
    }
  }

  /**
   * Check which data sources are available for a user
   */
  async checkDataSources(userId) {
    const sources = {
      spotify: { available: false, days: 0, events: 0 },
      whoop: { available: false, days: 0, events: 0 },
      calendar: { available: false, days: 0, events: 0 }
    };

    try {
      // Check for Spotify data
      const { data: spotifyData } = await supabase
        .from('platform_raw_data')
        .select('extracted_at, data')
        .eq('user_id', userId)
        .eq('platform', 'spotify')
        .order('extracted_at', { ascending: false })
        .limit(1);

      if (spotifyData?.length > 0) {
        sources.spotify.available = true;
        sources.spotify.events = spotifyData[0].data?.recent_tracks?.length || 0;
        sources.spotify.days = this.calculateDaysCovered(spotifyData[0].extracted_at);
      }

      // Check for Whoop data
      const { data: whoopData } = await supabase
        .from('platform_raw_data')
        .select('extracted_at, data')
        .eq('user_id', userId)
        .eq('platform', 'whoop')
        .order('extracted_at', { ascending: false })
        .limit(1);

      if (whoopData?.length > 0) {
        sources.whoop.available = true;
        sources.whoop.events = whoopData[0].data?.cycles?.length || 0;
        sources.whoop.days = this.calculateDaysCovered(whoopData[0].extracted_at);
      }

      // Check for Calendar data
      const { data: calendarData } = await supabase
        .from('platform_raw_data')
        .select('extracted_at, data')
        .eq('user_id', userId)
        .eq('platform', 'google_calendar')
        .order('extracted_at', { ascending: false })
        .limit(1);

      if (calendarData?.length > 0) {
        sources.calendar.available = true;
        sources.calendar.events = calendarData[0].data?.events?.length || 0;
        sources.calendar.days = this.calculateDaysCovered(calendarData[0].extracted_at);
      }

    } catch (error) {
      console.error('[AgentOrchestrator] Error checking data sources:', error);
    }

    return sources;
  }

  /**
   * Calculate days covered from extraction date
   */
  calculateDaysCovered(extractedAt) {
    if (!extractedAt) return 0;
    const extracted = new Date(extractedAt);
    const now = new Date();
    return Math.max(1, Math.ceil((now - extracted) / (1000 * 60 * 60 * 24)));
  }

  /**
   * Run all available agents in parallel
   */
  async runAgentsParallel(userId, dataSources, options) {
    const results = {};
    const promises = [];

    // Run Music Psychology Agent if Spotify data available
    if (dataSources.spotify.available && this.agents.music) {
      promises.push(
        this.runAgentSafe('music', () => this.agents.music.analyzeSpotifyData(userId))
          .then(result => { results.music = result; })
      );
    }

    // Run Biometric Agent if Whoop data available
    if (dataSources.whoop.available && this.agents.biometric) {
      promises.push(
        this.runAgentSafe('biometric', () => this.agents.biometric.analyzeWhoopData(userId))
          .then(result => { results.biometric = result; })
      );
    }

    // Run Chronotype Agent if Calendar data available
    if (dataSources.calendar.available && this.agents.chronotype) {
      promises.push(
        this.runAgentSafe('chronotype', () => this.agents.chronotype.analyzeCalendarData(userId))
          .then(result => { results.chronotype = result; })
      );
    }

    // Wait for all agents to complete
    await Promise.all(promises);

    return results;
  }

  /**
   * Run an agent with error handling
   */
  async runAgentSafe(agentName, fn) {
    try {
      console.log(`[AgentOrchestrator] Running ${agentName} agent...`);
      const result = await fn();
      console.log(`[AgentOrchestrator] ${agentName} agent completed`);
      return result;
    } catch (error) {
      console.error(`[AgentOrchestrator] ${agentName} agent failed:`, error);
      return {
        success: false,
        error: error.message,
        agent: agentName
      };
    }
  }

  /**
   * Combine personality adjustments from all agents
   */
  combineAdjustments(agentResults) {
    const combined = {
      openness: { totalValue: 0, totalWeight: 0, count: 0 },
      conscientiousness: { totalValue: 0, totalWeight: 0, count: 0 },
      extraversion: { totalValue: 0, totalWeight: 0, count: 0 },
      agreeableness: { totalValue: 0, totalWeight: 0, count: 0 },
      neuroticism: { totalValue: 0, totalWeight: 0, count: 0 }
    };

    // Agent weights based on research validity
    const agentWeights = {
      music: 0.35,      // Strong music-personality correlations
      biometric: 0.35,  // Strong HRV/sleep correlations
      chronotype: 0.30  // Good chronotype correlations
    };

    for (const [agentName, result] of Object.entries(agentResults)) {
      if (!result?.success || !result.personality_adjustments) continue;

      const weight = agentWeights[agentName] || 0.33;

      for (const [dimension, adjustment] of Object.entries(result.personality_adjustments)) {
        if (!combined[dimension]) continue;

        const value = adjustment.value || 0;
        const confidence = adjustment.confidence || 0.5;

        // Weighted adjustment: value * agent_weight * confidence
        const weightedValue = value * weight * confidence;

        combined[dimension].totalValue += weightedValue;
        combined[dimension].totalWeight += weight * confidence;
        combined[dimension].count++;
      }
    }

    // Calculate final adjustments
    const finalAdjustments = {};
    for (const [dimension, data] of Object.entries(combined)) {
      if (data.totalWeight > 0) {
        finalAdjustments[dimension] = data.totalValue / data.totalWeight;
      } else {
        finalAdjustments[dimension] = 0;
      }
    }

    return finalAdjustments;
  }

  /**
   * Get baseline scores for a user (from previous assessments or defaults)
   */
  async getBaselineScores(userId) {
    try {
      // Try to get existing personality scores
      const { data } = await supabase
        .from('personality_assessments')
        .select('big_five_scores')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (data?.length > 0 && data[0].big_five_scores) {
        return data[0].big_five_scores;
      }
    } catch (error) {
      console.log('[AgentOrchestrator] No baseline scores found, using defaults');
    }

    return { ...BASELINE_SCORES };
  }

  /**
   * Calculate final personality scores
   */
  calculateFinalScores(baselineScores, adjustments) {
    const final = {};

    for (const dimension of Object.keys(BASELINE_SCORES)) {
      const baseline = baselineScores[dimension] || 50;
      const adjustment = adjustments[dimension] || 0;

      // Adjustments are on a -0.5 to 0.5 scale, convert to percentage
      // adjustment * 50 = -25 to +25 points
      const adjustedScore = baseline + (adjustment * 50);

      // Clamp to 0-100 range
      final[dimension] = Math.max(0, Math.min(100, Math.round(adjustedScore)));
    }

    return final;
  }

  /**
   * Combine evidence from all agents
   */
  combineEvidence(agentResults) {
    const combined = {
      openness: [],
      conscientiousness: [],
      extraversion: [],
      agreeableness: [],
      neuroticism: []
    };

    const dimensionMap = {
      O: 'openness',
      C: 'conscientiousness',
      E: 'extraversion',
      A: 'agreeableness',
      N: 'neuroticism'
    };

    for (const [agentName, result] of Object.entries(agentResults)) {
      if (!result?.success || !result.evidence) continue;

      for (const evidenceItem of result.evidence) {
        const dimension = evidenceItem.dimension?.toLowerCase() ||
                         dimensionMap[evidenceItem.dimension?.toUpperCase()];

        if (dimension && combined[dimension]) {
          combined[dimension].push({
            ...evidenceItem,
            source_agent: agentName
          });
        }
      }
    }

    // Sort each dimension by effect size
    const effectSizeOrder = { large: 0, medium: 1, small: 2 };
    for (const dimension of Object.keys(combined)) {
      combined[dimension].sort((a, b) => {
        const aOrder = effectSizeOrder[a.effect_size] ?? 2;
        const bOrder = effectSizeOrder[b.effect_size] ?? 2;
        return aOrder - bOrder;
      });
    }

    return combined;
  }

  /**
   * Calculate overall confidence across all agents
   */
  calculateOverallConfidence(agentResults, dataSources) {
    const confidence = {
      overall: 0,
      by_dimension: {
        openness: 0,
        conscientiousness: 0,
        extraversion: 0,
        agreeableness: 0,
        neuroticism: 0
      },
      by_agent: {}
    };

    let totalAgentConfidence = 0;
    let agentCount = 0;

    for (const [agentName, result] of Object.entries(agentResults)) {
      if (!result?.success) continue;

      // Extract agent's dimension confidences
      const adjustments = result.personality_adjustments || {};
      let agentAvgConfidence = 0;
      let dimCount = 0;

      for (const [dimension, data] of Object.entries(adjustments)) {
        const dimConfidence = data.confidence || 0.3;
        agentAvgConfidence += dimConfidence;
        dimCount++;

        // Add to dimension confidence
        if (confidence.by_dimension[dimension] !== undefined) {
          confidence.by_dimension[dimension] += dimConfidence;
        }
      }

      if (dimCount > 0) {
        agentAvgConfidence /= dimCount;
      }

      confidence.by_agent[agentName] = agentAvgConfidence;
      totalAgentConfidence += agentAvgConfidence;
      agentCount++;
    }

    // Average dimension confidences
    for (const dimension of Object.keys(confidence.by_dimension)) {
      if (agentCount > 0) {
        confidence.by_dimension[dimension] /= agentCount;
      }
    }

    // Boost confidence for multiple data sources
    const sourcesAvailable = Object.values(dataSources).filter(s => s.available).length;
    const multiSourceBoost = sourcesAvailable > 1 ? 0.1 * (sourcesAvailable - 1) : 0;

    // Calculate overall confidence
    if (agentCount > 0) {
      confidence.overall = Math.min(0.95, (totalAgentConfidence / agentCount) + multiSourceBoost);
    }

    return confidence;
  }

  /**
   * Store all evidence in the database
   */
  async storeAllEvidence(userId, evidence) {
    try {
      await storeEvidence(userId, evidence);
    } catch (error) {
      console.error('[AgentOrchestrator] Error storing evidence:', error);
    }
  }

  /**
   * Generate interpretation summary
   */
  generateInterpretation(agentResults, finalScores) {
    const interpretations = [];

    // Music interpretation
    if (agentResults.music?.interpretation) {
      interpretations.push({
        source: 'music',
        summary: agentResults.music.interpretation.music_personality_summary ||
                agentResults.music.interpretation.key_insight ||
                'Music preferences analyzed'
      });
    }

    // Biometric interpretation
    if (agentResults.biometric?.interpretation) {
      interpretations.push({
        source: 'biometric',
        summary: agentResults.biometric.interpretation.overall_health_personality_link ||
                agentResults.biometric.interpretation.key_insight ||
                'Biometric data analyzed'
      });
    }

    // Chronotype interpretation
    if (agentResults.chronotype?.interpretation) {
      interpretations.push({
        source: 'chronotype',
        summary: agentResults.chronotype.interpretation.chronotype_summary ||
                agentResults.chronotype.interpretation.key_insight ||
                'Schedule patterns analyzed'
      });
    }

    // Generate overall summary
    const dominant = this.findDominantTraits(finalScores);

    return {
      agent_insights: interpretations,
      dominant_traits: dominant,
      summary: this.generateOverallSummary(dominant, interpretations)
    };
  }

  /**
   * Find dominant personality traits
   */
  findDominantTraits(scores) {
    const traits = Object.entries(scores)
      .map(([name, score]) => ({ name, score, deviation: Math.abs(score - 50) }))
      .sort((a, b) => b.deviation - a.deviation);

    return traits.slice(0, 3).map(t => ({
      trait: t.name,
      score: t.score,
      level: t.score > 65 ? 'high' : t.score < 35 ? 'low' : 'moderate'
    }));
  }

  /**
   * Generate overall summary text
   */
  generateOverallSummary(dominantTraits, agentInsights) {
    const traitDescriptions = dominantTraits.map(t => {
      const level = t.level === 'high' ? 'notably high' : t.level === 'low' ? 'notably low' : 'moderate';
      return `${level} ${t.trait}`;
    });

    let summary = `Based on multi-platform behavioral analysis, your profile shows ${traitDescriptions.join(', ')}.`;

    if (agentInsights.length > 0) {
      summary += ` Key insights: ${agentInsights.map(i => i.summary).join(' ')}`;
    }

    return summary;
  }

  /**
   * Summarize agent results for API response
   */
  summarizeAgentResults(agentResults) {
    const summary = {};

    for (const [agentName, result] of Object.entries(agentResults)) {
      summary[agentName] = {
        success: result?.success || false,
        features_extracted: result?.features ? Object.keys(result.features).length : 0,
        evidence_generated: result?.evidence?.length || 0,
        data_quality: result?.data_quality?.quality_score || null
      };
    }

    return summary;
  }

  /**
   * Get health status of all agents
   */
  async getHealthStatus() {
    const status = {
      orchestrator: 'healthy',
      agents: {}
    };

    for (const [name, agent] of Object.entries(this.agents)) {
      if (agent) {
        status.agents[name] = {
          initialized: true,
          metrics: agent.getMetrics()
        };
      } else {
        status.agents[name] = {
          initialized: false,
          error: 'Agent not initialized'
        };
      }
    }

    return status;
  }
}

// Export singleton instance
const orchestrator = new AgentOrchestrator();
export default orchestrator;

export {
  AgentOrchestrator
};
