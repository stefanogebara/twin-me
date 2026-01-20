/**
 * SpecialistOrchestrator - Multi-Agent Coordination for Science-Backed Personality Inference
 *
 * Coordinates specialist agents to produce unified, research-backed personality analysis.
 * Handles evidence aggregation, conflict resolution, and synthesis.
 *
 * Philosophy: "Powered by science from Stanford, Cambridge, Berkeley, and Johns Hopkins"
 *
 * Architecture:
 * 1. Route - Determine which specialists have relevant data
 * 2. Analyze - Run specialists in parallel
 * 3. Aggregate - Combine evidence from all domains
 * 4. Resolve - Handle conflicting inferences
 * 5. Synthesize - Generate unified response with full citations
 */

import MusicPsychologistAgent from './MusicPsychologistAgent.js';
import BiometricsSpecialistAgent from './BiometricsSpecialistAgent.js';
import CalendarBehaviorAgent from './CalendarBehaviorAgent.js';
import { RESEARCH_SOURCES } from './SpecialistAgentBase.js';

class SpecialistOrchestrator {
  constructor() {
    this.musicAgent = new MusicPsychologistAgent();
    this.biometricsAgent = new BiometricsSpecialistAgent();
    this.calendarAgent = new CalendarBehaviorAgent();

    this.agents = {
      spotify: this.musicAgent,
      whoop: this.biometricsAgent,
      calendar: this.calendarAgent
    };

    this.researchSources = RESEARCH_SOURCES;

    console.log('[SpecialistOrchestrator] Initialized with science-backed specialist agents');
  }

  /**
   * Run full multi-agent personality analysis
   *
   * @param {string} userId - User ID
   * @param {Object} platformData - Data from connected platforms
   * @returns {Object} Unified personality analysis with citations
   */
  async analyze(userId, platformData) {
    console.log(`🔬 [SpecialistOrchestrator] Starting science-backed analysis for user ${userId}`);

    const startTime = Date.now();
    const results = {
      success: true,
      userId,
      timestamp: new Date().toISOString(),
      domains: {},
      personality: {
        openness: { score: 50, evidence: [], confidence: 0 },
        conscientiousness: { score: 50, evidence: [], confidence: 0 },
        extraversion: { score: 50, evidence: [], confidence: 0 },
        agreeableness: { score: 50, evidence: [], confidence: 0 },
        neuroticism: { score: 50, evidence: [], confidence: 0 }
      },
      citations: [],
      methodology: {
        agentsUsed: [],
        totalEvidence: 0,
        effectSizeSummary: { large: 0, medium: 0, small: 0 },
        limitations: []
      }
    };

    try {
      // 1. Route - Determine which agents have data
      const availableData = {
        spotify: platformData.spotify,
        whoop: platformData.whoop,
        calendar: platformData.calendar
      };

      const activeDomains = Object.entries(availableData)
        .filter(([_, data]) => data && Object.keys(data).length > 0)
        .map(([domain]) => domain);

      if (activeDomains.length === 0) {
        return {
          success: false,
          error: 'No platform data available for analysis',
          message: 'Connect platforms (Spotify, Whoop, Calendar) to get personality insights'
        };
      }

      console.log(`   📊 Active domains: ${activeDomains.join(', ')}`);

      // 2. Analyze - Run specialists in parallel
      const analysisPromises = activeDomains.map(domain =>
        this.runAgentAnalysis(domain, userId, availableData[domain])
      );

      const domainResults = await Promise.all(analysisPromises);

      // 3. Aggregate - Combine evidence from all domains
      for (const result of domainResults) {
        if (result.success) {
          results.domains[result.domain] = result;
          results.methodology.agentsUsed.push(result.domainLabel);

          // Aggregate inferences into personality scores
          this.aggregateIntoPersonality(results.personality, result);

          // Collect all citations
          if (result.citations) {
            results.citations.push(...result.citations);
          }

          // Collect limitations
          if (result.limitations) {
            results.methodology.limitations.push(...result.limitations);
          }
        }
      }

      // 4. Resolve - Handle conflicting inferences
      this.resolveConflicts(results.personality);

      // 5. Synthesize - Calculate final scores and confidence
      this.synthesizeResults(results);

      // De-duplicate citations
      results.citations = [...new Set(results.citations)];

      // Calculate timing
      results.duration = `${((Date.now() - startTime) / 1000).toFixed(2)}s`;

      console.log(`✅ [SpecialistOrchestrator] Analysis complete in ${results.duration}`);
      console.log(`   📈 Evidence items: ${results.methodology.totalEvidence}`);
      console.log(`   📚 Citations: ${results.citations.length}`);

      return results;

    } catch (error) {
      console.error(`❌ [SpecialistOrchestrator] Analysis failed:`, error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Run analysis for a single domain
   */
  async runAgentAnalysis(domain, userId, data) {
    const agent = this.agents[domain];
    if (!agent) {
      console.warn(`[SpecialistOrchestrator] No agent for domain: ${domain}`);
      return { success: false, domain, error: 'No agent available' };
    }

    try {
      console.log(`   🔍 Running ${agent.name}...`);
      const result = await agent.analyze(userId, data);
      return result;
    } catch (error) {
      console.error(`[SpecialistOrchestrator] ${domain} analysis failed:`, error);
      return { success: false, domain, error: error.message };
    }
  }

  /**
   * Aggregate domain results into personality scores
   */
  aggregateIntoPersonality(personality, domainResult) {
    if (!domainResult.inferences) return;

    for (const [dimension, inference] of Object.entries(domainResult.inferences)) {
      if (!personality[dimension]) continue;

      // Add score adjustment
      personality[dimension].score += inference.scoreAdjustment;

      // Add all evidence items
      if (inference.allEvidence) {
        personality[dimension].evidence.push(...inference.allEvidence.map(e => ({
          ...e,
          domain: domainResult.domain
        })));
      }

      // Track effect sizes
      if (inference.allEvidence) {
        for (const evidence of inference.allEvidence) {
          const effectSize = evidence.effectSize;
          // Tracked in methodology later
        }
      }
    }
  }

  /**
   * Resolve conflicting inferences between domains
   */
  resolveConflicts(personality) {
    const dimensions = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism'];

    for (const dimension of dimensions) {
      const evidence = personality[dimension].evidence;
      if (evidence.length < 2) continue;

      // Check for conflicting evidence (some positive, some negative)
      const positiveEvidence = evidence.filter(e => e.direction === 'positive');
      const negativeEvidence = evidence.filter(e => e.direction === 'negative');

      if (positiveEvidence.length > 0 && negativeEvidence.length > 0) {
        // Weight by effect size
        const effectWeight = { large: 3, medium: 2, small: 1 };

        const positiveWeight = positiveEvidence.reduce((sum, e) =>
          sum + (effectWeight[e.effectSize] || 1), 0);
        const negativeWeight = negativeEvidence.reduce((sum, e) =>
          sum + (effectWeight[e.effectSize] || 1), 0);

        // Add conflict note
        personality[dimension].conflictNote = positiveWeight > negativeWeight
          ? `Conflicting evidence - weighted toward positive (${positiveWeight} vs ${negativeWeight})`
          : `Conflicting evidence - weighted toward negative (${negativeWeight} vs ${positiveWeight})`;

        // Reduce confidence due to conflict
        personality[dimension].conflictPenalty = 0.1;
      }
    }
  }

  /**
   * Synthesize final results
   */
  synthesizeResults(results) {
    const dimensions = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism'];

    for (const dimension of dimensions) {
      const dimData = results.personality[dimension];

      // Clamp score to 0-100
      dimData.score = Math.max(0, Math.min(100, dimData.score));

      // Calculate confidence based on evidence
      if (dimData.evidence.length > 0) {
        // Base confidence on evidence count and effect sizes
        const effectWeight = { large: 0.3, medium: 0.2, small: 0.1 };
        let confidenceBoost = 0;

        for (const evidence of dimData.evidence) {
          confidenceBoost += effectWeight[evidence.effectSize] || 0.05;
          results.methodology.totalEvidence++;

          // Track effect size summary
          if (evidence.effectSize in results.methodology.effectSizeSummary) {
            results.methodology.effectSizeSummary[evidence.effectSize]++;
          }
        }

        dimData.confidence = Math.min(0.95, 0.5 + confidenceBoost);

        // Apply conflict penalty if present
        if (dimData.conflictPenalty) {
          dimData.confidence -= dimData.conflictPenalty;
        }

        // Round confidence
        dimData.confidence = Math.round(dimData.confidence * 100) / 100;
      }

      // Sort evidence by effect size
      dimData.evidence.sort((a, b) => {
        const order = { large: 0, medium: 1, small: 2 };
        return (order[a.effectSize] || 3) - (order[b.effectSize] || 3);
      });
    }
  }

  /**
   * Format results for UI display
   */
  formatForUI(results) {
    if (!results.success) {
      return {
        success: false,
        error: results.error,
        message: results.message
      };
    }

    const dimensions = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism'];
    const uiResults = {
      success: true,
      scores: {},
      topEvidence: [],
      methodology: {
        agentsUsed: results.methodology.agentsUsed,
        totalEvidence: results.methodology.totalEvidence,
        citationCount: results.citations.length,
        effectSizes: results.methodology.effectSizeSummary
      },
      citations: results.citations.slice(0, 10), // Top 10 citations
      limitations: results.methodology.limitations
    };

    for (const dimension of dimensions) {
      const dimData = results.personality[dimension];
      uiResults.scores[dimension] = {
        score: Math.round(dimData.score),
        confidence: dimData.confidence,
        evidenceCount: dimData.evidence.length,
        topEvidence: dimData.evidence.slice(0, 3).map(e => ({
          humanReadable: e.humanReadable,
          citation: `${e.citation.source} (r=${e.citation.r})`
        }))
      };

      // Add top evidence to global list
      for (const evidence of dimData.evidence.slice(0, 2)) {
        uiResults.topEvidence.push({
          dimension,
          humanReadable: evidence.humanReadable,
          effectSize: evidence.effectSize,
          domain: evidence.domain,
          citation: evidence.citation
        });
      }
    }

    // Sort top evidence by effect size
    uiResults.topEvidence.sort((a, b) => {
      const order = { large: 0, medium: 1, small: 2 };
      return (order[a.effectSize] || 3) - (order[b.effectSize] || 3);
    });

    // Limit to top 10
    uiResults.topEvidence = uiResults.topEvidence.slice(0, 10);

    return uiResults;
  }

  /**
   * Get status of all agents
   */
  getAgentStatus() {
    return {
      musicAgent: {
        name: this.musicAgent.name,
        domain: this.musicAgent.domain,
        model: this.musicAgent.model
      },
      biometricsAgent: {
        name: this.biometricsAgent.name,
        domain: this.biometricsAgent.domain,
        model: this.biometricsAgent.model
      },
      calendarAgent: {
        name: this.calendarAgent.name,
        domain: this.calendarAgent.domain,
        model: this.calendarAgent.model
      }
    };
  }
}

// Export singleton instance
const specialistOrchestrator = new SpecialistOrchestrator();
export default specialistOrchestrator;
