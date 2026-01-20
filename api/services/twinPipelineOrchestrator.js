/**
 * TwinPipelineOrchestrator
 *
 * Master coordinator for the complete digital twin formation pipeline.
 * Orchestrates the end-to-end flow from data extraction to twin formation.
 *
 * Pipeline Stages:
 * 1. Validate Connections - Check OAuth tokens are valid
 * 2. Extract Platforms - Run feature extractors for all connected platforms
 * 3. Aggregate Personality - Calculate Big Five scores from features
 * 4. Form Digital Twin - Generate AI narratives and archetype
 * 5. Record Evolution - Track personality changes over time
 * 6. Update Status - Mark pipeline complete
 */

import { supabaseAdmin } from './database.js';
import extractionOrchestrator from './extractionOrchestrator.js';
import personalityAggregator from './personalityAggregator.js';
import twinFormationService from './twinFormationService.js';
import twinEvolutionService from './twinEvolutionService.js';
import behavioralEvidencePipeline from './behavioralEvidencePipeline.js';

// Pipeline status constants
const PIPELINE_STATUS = {
  IDLE: 'idle',
  VALIDATING: 'validating',
  EXTRACTING: 'extracting',
  GENERATING_EVIDENCE: 'generating_evidence',
  AGGREGATING: 'aggregating',
  FORMING: 'forming',
  RECORDING: 'recording',
  COMPLETE: 'complete',
  FAILED: 'failed'
};

class TwinPipelineOrchestrator {
  constructor() {
    this.runningPipelines = new Map(); // Track running pipelines by userId
  }

  /**
   * Run the full twin formation pipeline
   * @param {string} userId - User ID
   * @param {Object} options - Pipeline options
   * @returns {Object} Pipeline result
   */
  async runFullPipeline(userId, options = {}) {
    const { forceRefresh = false } = options;

    // Check if pipeline is already running
    if (this.runningPipelines.has(userId)) {
      const current = this.runningPipelines.get(userId);
      return {
        success: false,
        error: 'Pipeline already running',
        currentStage: current.stage,
        startedAt: current.startedAt
      };
    }

    const pipelineId = `pipeline-${userId}-${Date.now()}`;
    const startTime = new Date();

    // Initialize pipeline tracking
    this.runningPipelines.set(userId, {
      id: pipelineId,
      stage: PIPELINE_STATUS.IDLE,
      startedAt: startTime.toISOString(),
      stages: {}
    });

    try {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`🚀 [TwinPipeline] Starting full pipeline for user ${userId}`);
      console.log(`${'='.repeat(60)}`);

      // Stage 1: Validate Connections
      this.updateStage(userId, PIPELINE_STATUS.VALIDATING);
      const connectionResult = await this.validateConnections(userId);

      if (!connectionResult.success) {
        throw new Error(`Connection validation failed: ${connectionResult.error}`);
      }

      if (connectionResult.connectedPlatforms.length === 0) {
        return this.completePipeline(userId, {
          success: false,
          error: 'No platforms connected',
          message: 'Please connect at least one platform to form your twin'
        });
      }

      console.log(`   ✅ Found ${connectionResult.connectedPlatforms.length} connected platform(s)`);

      // Stage 2: Extract from all platforms
      this.updateStage(userId, PIPELINE_STATUS.EXTRACTING);
      const extractionResult = await this.extractAllPlatforms(userId, connectionResult.connectedPlatforms);

      if (!extractionResult.success && extractionResult.successful === 0) {
        throw new Error('All platform extractions failed');
      }

      console.log(`   ✅ Extracted from ${extractionResult.successful}/${extractionResult.total} platform(s)`);

      // Stage 2.5: Generate behavioral evidence
      this.updateStage(userId, PIPELINE_STATUS.GENERATING_EVIDENCE);
      const evidenceResult = await this.generateBehavioralEvidence(userId);

      if (evidenceResult.success) {
        console.log(`   ✅ Generated ${evidenceResult.evidenceGenerated || 0} evidence items from ${evidenceResult.platformsProcessed?.length || 0} platform(s)`);
      } else {
        console.log(`   ⚠️ Evidence generation: ${evidenceResult.message || evidenceResult.error || 'No features available'}`);
      }

      // Stage 3: Aggregate personality scores
      this.updateStage(userId, PIPELINE_STATUS.AGGREGATING);
      const aggregationResult = await this.aggregatePersonality(userId);

      if (!aggregationResult.success) {
        throw new Error(`Aggregation failed: ${aggregationResult.error}`);
      }

      console.log(`   ✅ Aggregated ${aggregationResult.featureCount} features into personality scores`);

      // Stage 4: Form the digital twin
      this.updateStage(userId, PIPELINE_STATUS.FORMING);
      const formationResult = await this.formDigitalTwin(userId);

      if (!formationResult.success) {
        throw new Error(`Twin formation failed: ${formationResult.error}`);
      }

      console.log(`   ✅ Formed twin as ${formationResult.twin.archetype.name}`);

      // Stage 5: Record evolution (if previous data exists)
      this.updateStage(userId, PIPELINE_STATUS.RECORDING);
      const evolutionResult = await this.recordEvolution(userId, aggregationResult.scores);

      if (evolutionResult.evolutionDetected) {
        console.log(`   ✅ Evolution detected and recorded`);
      } else {
        console.log(`   ℹ️ No significant evolution detected`);
      }

      // Stage 6: Update status and complete
      this.updateStage(userId, PIPELINE_STATUS.COMPLETE);
      await this.updatePipelineRecord(userId, pipelineId, 'complete', {
        extractionResult,
        aggregationResult,
        formationResult,
        evolutionResult
      });

      const duration = (Date.now() - startTime.getTime()) / 1000;
      console.log(`\n${'='.repeat(60)}`);
      console.log(`✨ [TwinPipeline] Complete in ${duration.toFixed(1)}s`);
      console.log(`${'='.repeat(60)}\n`);

      return this.completePipeline(userId, {
        success: true,
        pipelineId,
        duration: `${duration.toFixed(1)}s`,
        twin: formationResult.twin,
        extraction: {
          platforms: extractionResult.results,
          successful: extractionResult.successful,
          failed: extractionResult.failed
        },
        personality: {
          scores: aggregationResult.scores,
          confidence: aggregationResult.confidence,
          featureCount: aggregationResult.featureCount
        },
        evolution: evolutionResult
      });

    } catch (error) {
      console.error(`❌ [TwinPipeline] Failed:`, error);

      this.updateStage(userId, PIPELINE_STATUS.FAILED);
      await this.updatePipelineRecord(userId, pipelineId, 'failed', {
        error: error.message
      });

      return this.completePipeline(userId, {
        success: false,
        pipelineId,
        error: error.message,
        failedAtStage: this.runningPipelines.get(userId)?.stage
      });
    }
  }

  /**
   * Run incremental update for a single platform
   * @param {string} userId - User ID
   * @param {string} platform - Platform to refresh
   */
  async runIncrementalUpdate(userId, platform) {
    console.log(`🔄 [TwinPipeline] Incremental update for ${platform}`);

    try {
      // Extract from single platform
      const extractionResult = await extractionOrchestrator.extractPlatform(userId, platform);

      if (!extractionResult.success) {
        return {
          success: false,
          error: extractionResult.error,
          platform
        };
      }

      // Re-aggregate personality
      const aggregationResult = await this.aggregatePersonality(userId);

      // Check for evolution
      const evolutionResult = await this.recordEvolution(userId, aggregationResult.scores);

      // Re-form twin if significant changes
      let formationResult = null;
      if (evolutionResult.evolutionDetected) {
        formationResult = await this.formDigitalTwin(userId);
      }

      return {
        success: true,
        platform,
        itemsExtracted: extractionResult.itemsExtracted,
        aggregation: aggregationResult,
        evolutionDetected: evolutionResult.evolutionDetected,
        twinUpdated: formationResult !== null
      };

    } catch (error) {
      console.error(`❌ [TwinPipeline] Incremental update failed:`, error);
      return {
        success: false,
        platform,
        error: error.message
      };
    }
  }

  /**
   * Validate platform connections
   */
  async validateConnections(userId) {
    try {
      const { data: connections, error } = await supabaseAdmin
        .from('platform_connections')
        .select('platform, access_token, refresh_token, token_expires_at, last_sync_at')
        .eq('user_id', userId)
        .not('access_token', 'is', null);

      if (error) throw error;

      const connectedPlatforms = [];
      const expiredTokens = [];

      for (const conn of connections || []) {
        // Check if token is expired
        if (conn.token_expires_at && new Date(conn.token_expires_at) < new Date()) {
          expiredTokens.push(conn.platform);
        } else {
          connectedPlatforms.push({
            platform: conn.platform,
            lastSynced: conn.last_sync_at,
            hasRefreshToken: !!conn.refresh_token
          });
        }
      }

      return {
        success: true,
        connectedPlatforms,
        expiredTokens,
        totalConnections: connections?.length || 0
      };

    } catch (error) {
      console.error('[TwinPipeline] Connection validation error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Extract data from all connected platforms
   */
  async extractAllPlatforms(userId, connectedPlatforms) {
    const results = await extractionOrchestrator.extractAllPlatforms(userId);
    return results;
  }

  /**
   * Generate behavioral evidence from extracted features
   * This creates research-backed evidence for personality inferences
   */
  async generateBehavioralEvidence(userId) {
    try {
      const result = await behavioralEvidencePipeline.runPipeline(userId);
      return result;
    } catch (error) {
      console.error('[TwinPipeline] Evidence generation error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Aggregate personality from behavioral features
   */
  async aggregatePersonality(userId) {
    const result = await personalityAggregator.aggregateFeatures(userId);

    if (!result.success) {
      return result;
    }

    // Save the aggregated scores
    await personalityAggregator.savePersonalityScores(
      userId,
      result.scores,
      result.confidence
    );

    return result;
  }

  /**
   * Form the digital twin with AI narratives
   */
  async formDigitalTwin(userId) {
    return await twinFormationService.formTwin(userId);
  }

  /**
   * Record evolution snapshot
   */
  async recordEvolution(userId, scores) {
    const result = await twinEvolutionService.recordSnapshot(userId, scores, {
      source: 'pipeline',
      confidenceLevel: 'aggregated'
    });

    return {
      success: result.success,
      evolutionDetected: result.evolutionDetected || false,
      changes: result.changes || null
    };
  }

  /**
   * Get current pipeline status
   */
  getPipelineStatus(userId) {
    const running = this.runningPipelines.get(userId);

    if (running) {
      return {
        isRunning: true,
        ...running
      };
    }

    return {
      isRunning: false,
      stage: PIPELINE_STATUS.IDLE
    };
  }

  /**
   * Get comprehensive twin status including all components
   */
  async getFullTwinStatus(userId) {
    try {
      // Get pipeline status
      const pipelineStatus = this.getPipelineStatus(userId);

      // Get extraction status
      const extractionStatus = await extractionOrchestrator.getExtractionStatus(userId);

      // Get latest twin
      const twinResult = await twinFormationService.getTwin(userId);

      // Get evolution summary
      const evolutionResult = await twinEvolutionService.getEvolutionSummary(userId);

      // Get platform coverage
      const profileResult = await personalityAggregator.getPersonalityProfile(userId);

      return {
        success: true,
        pipeline: pipelineStatus,
        extraction: extractionStatus,
        twin: twinResult.success ? twinResult.twin : null,
        hasTwin: twinResult.success,
        evolution: evolutionResult.success ? evolutionResult.summary : null,
        personality: profileResult.success ? {
          scores: profileResult.profile.scores,
          confidence: profileResult.profile.confidence,
          profileStrength: profileResult.profile.profileStrength
        } : null,
        lastUpdated: twinResult.twin?.updated_at || null
      };

    } catch (error) {
      console.error('[TwinPipeline] Status check error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Update pipeline stage tracking
   */
  updateStage(userId, stage) {
    const pipeline = this.runningPipelines.get(userId);
    if (pipeline) {
      pipeline.stage = stage;
      pipeline.stages[stage] = new Date().toISOString();
      console.log(`📍 [TwinPipeline] Stage: ${stage}`);
    }
  }

  /**
   * Complete pipeline and clean up
   */
  completePipeline(userId, result) {
    this.runningPipelines.delete(userId);
    return result;
  }

  /**
   * Update pipeline record in database
   */
  async updatePipelineRecord(userId, pipelineId, status, data) {
    try {
      await supabaseAdmin
        .from('data_extraction_jobs')
        .insert({
          user_id: userId,
          platform: 'pipeline',
          status,
          started_at: this.runningPipelines.get(userId)?.startedAt || new Date().toISOString(),
          completed_at: new Date().toISOString(),
          total_items: data?.aggregationResult?.featureCount || 0,
          processed_items: data?.extractionResult?.successful || 0,
          error_message: data?.error || null
        });

    } catch (error) {
      console.error('[TwinPipeline] Failed to record pipeline:', error);
    }
  }
}

// Export singleton instance
const twinPipelineOrchestrator = new TwinPipelineOrchestrator();
export default twinPipelineOrchestrator;
