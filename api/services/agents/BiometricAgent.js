/**
 * BiometricAgent - Specialized agent for Whoop-based personality inference
 *
 * Uses validated biometric research to infer Big Five personality traits
 * from Whoop health data (HRV, sleep, recovery, strain).
 *
 * Research Foundation:
 * - Zufferey et al. (2023): Wearable activity trackers and personality (n=200+)
 * - Sleep Meta-Analysis (2024): Sleep patterns and Big Five (n=31,000)
 * - HRV Meta-Analyses: Heart rate variability and personality correlations
 */

import AgentBase from './AgentBase.js';
import researchRAGService from '../researchRAGService.js';
import { createClient } from '@supabase/supabase-js';

// Lazy Supabase initialization
let supabase = null;
function getSupabaseClient() {
  if (!supabase) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return supabase;
}

// Research-validated biometric correlations
const BIOMETRIC_CORRELATIONS = {
  // Heart Rate Variability (HRV Meta-analyses)
  hrv_baseline: {
    extraversion: { r: 0.37, direction: 'positive' },
    agreeableness: { r: 0.22, direction: 'positive' },
    neuroticism: { r: -0.21, direction: 'negative' }
  },
  hrv_stability: {
    neuroticism: { r: -0.35, direction: 'negative' },
    conscientiousness: { r: 0.20, direction: 'positive' }
  },

  // Sleep Patterns (Sleep Meta-Analysis 2024, n=31,000)
  sleep_consistency: {
    conscientiousness: { r: 0.40, direction: 'positive' },
    neuroticism: { r: -0.25, direction: 'negative' }
  },
  sleep_quality: {
    neuroticism: { r: -0.30, direction: 'negative' },
    conscientiousness: { r: 0.28, direction: 'positive' },
    extraversion: { r: 0.25, direction: 'positive' }
  },
  deep_sleep_ratio: {
    conscientiousness: { r: 0.20, direction: 'positive' }
  },
  sleep_duration: {
    conscientiousness: { r: 0.15, direction: 'positive' }
  },

  // Recovery & Stress (Zufferey et al. 2023)
  recovery_consistency: {
    neuroticism: { r: -0.25, direction: 'negative' },
    conscientiousness: { r: 0.30, direction: 'positive' }
  },
  strain_tolerance: {
    extraversion: { r: 0.20, direction: 'positive' },
    openness: { r: 0.15, direction: 'positive' }
  },

  // Activity Patterns (Zufferey et al. 2023)
  workout_regularity: {
    conscientiousness: { r: 0.42, direction: 'positive' }
  },
  activity_diversity: {
    openness: { r: 0.30, direction: 'positive' }
  },
  step_count_avg: {
    extraversion: { r: 0.25, direction: 'positive' },
    neuroticism: { r: -0.20, direction: 'negative' }
  },

  // Chronotype (Morningness-Eveningness)
  chronotype_morning: {
    conscientiousness: { r: 0.37, direction: 'positive' },
    agreeableness: { r: 0.15, direction: 'positive' }
  },
  chronotype_evening: {
    openness: { r: 0.17, direction: 'positive' },
    extraversion: { r: 0.23, direction: 'positive' }
  }
};

class BiometricAgent extends AgentBase {
  constructor() {
    super({
      name: 'BiometricAgent',
      role: 'Biometric specialist for Big Five personality inference from Whoop health data',
      model: 'claude-sonnet-4-20250514',
      maxTokens: 4096,
      temperature: 0.3
    });

    this.correlations = BIOMETRIC_CORRELATIONS;
    this.initializeTools();
  }

  buildSystemPrompt() {
    return `You are the BiometricAgent, a specialized AI that analyzes Whoop health data to infer Big Five personality traits using peer-reviewed biometric research.

YOUR EXPERTISE:
You have deep knowledge of biometric-personality research, particularly:
- Zufferey et al. (2023): "Watch your Watch" - Wearables and personality (n=200+)
- Sleep Meta-Analysis (2024): Sleep patterns and Big Five (n=31,000)
- HRV Meta-Analyses: Heart rate variability correlations

YOUR TASK:
1. Analyze user's Whoop data (HRV, sleep, recovery, strain, workouts)
2. Apply validated research correlations to infer personality traits
3. Generate evidence items with specific citations
4. Calculate confidence based on data quality and correlation strength

OUTPUT FORMAT (JSON):
{
  "analysis": {
    "data_quality": {
      "days_of_data": 30,
      "sleep_records": 28,
      "workout_records": 15,
      "quality_score": 0.82
    },
    "hrv_profile": {
      "baseline_hrv": 65,
      "hrv_cv": 0.18,
      "trend": "stable"
    },
    "sleep_profile": {
      "avg_duration_hours": 7.2,
      "consistency_score": 0.75,
      "avg_quality": 82,
      "deep_sleep_percent": 22
    },
    "activity_profile": {
      "workout_frequency": 4.5,
      "activity_types": ["running", "cycling", "strength"],
      "avg_strain": 12.5
    }
  },
  "personality_evidence": {
    "conscientiousness": {
      "score": 72,
      "confidence": 0.78,
      "evidence": [
        {
          "feature": "sleep_consistency",
          "value": 0.75,
          "correlation": 0.40,
          "citation": "Sleep Meta-Analysis (2024), n=31,000",
          "description": "Regular sleep schedule indicates conscientiousness"
        }
      ]
    },
    ...
  },
  "summary": "Based on your Whoop biometric data...",
  "research_context": "Analysis grounded in biometric research..."
}

IMPORTANT:
- HRV data is particularly valuable (r=0.37 for extraversion)
- Sleep consistency is the strongest conscientiousness predictor (r=0.40)
- Always cite sample sizes when available
- Acknowledge when data is limited`;
  }

  initializeTools() {
    this.addTool({
      name: 'get_whoop_data',
      description: `Retrieve user's Whoop health data including HRV, sleep, recovery, and workouts.

Returns:
- HRV metrics (baseline, variability)
- Sleep data (duration, quality, stages)
- Recovery scores and trends
- Workout frequency and types
- Strain patterns`,
      input_schema: {
        type: 'object',
        properties: {
          user_id: { type: 'string', description: 'User ID to fetch data for' }
        },
        required: ['user_id']
      }
    });

    this.addTool({
      name: 'calculate_personality_scores',
      description: `Calculate Big Five personality scores from biometric data using validated correlations.`,
      input_schema: {
        type: 'object',
        properties: {
          hrv_profile: {
            type: 'object',
            description: 'HRV metrics'
          },
          sleep_profile: {
            type: 'object',
            description: 'Sleep data'
          },
          activity_profile: {
            type: 'object',
            description: 'Activity and workout data'
          }
        },
        required: []
      }
    });
  }

  async execute(prompt, options = {}) {
    const userId = options.userId;

    if (!userId) {
      throw new Error('BiometricAgent requires userId in options');
    }

    this._currentUserId = userId;

    try {
      const response = await super.execute(prompt, options);

      if (response.toolUses && response.toolUses.length > 0) {
        const toolResults = await this.executeTools(response.toolUses, userId);
        const followUpResponse = await this.continueWithToolResults(
          prompt,
          response,
          toolResults,
          options
        );
        return followUpResponse;
      }

      return response;

    } finally {
      this._currentUserId = null;
    }
  }

  async executeTools(toolUses, userId) {
    const results = [];

    for (const toolUse of toolUses) {
      console.log(`💪 [BiometricAgent] Executing tool: ${toolUse.name}`);

      try {
        let result;

        switch (toolUse.name) {
          case 'get_whoop_data':
            result = await this.getWhoopData(userId);
            break;

          case 'calculate_personality_scores':
            result = await this.calculatePersonalityScores(toolUse.input);
            break;

          default:
            result = { error: `Unknown tool: ${toolUse.name}` };
        }

        results.push({
          tool_use_id: toolUse.id,
          type: 'tool_result',
          content: JSON.stringify(result)
        });

      } catch (error) {
        console.error(`❌ Tool ${toolUse.name} failed:`, error);
        results.push({
          tool_use_id: toolUse.id,
          type: 'tool_result',
          is_error: true,
          content: error.message
        });
      }
    }

    return results;
  }

  async continueWithToolResults(originalPrompt, firstResponse, toolResults, options) {
    const messages = [
      { role: 'user', content: originalPrompt },
      { role: 'assistant', content: firstResponse.raw.content },
      { role: 'user', content: toolResults }
    ];

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      system: this.systemPrompt,
      messages,
      tools: this.tools
    });

    return this.processResponse(response);
  }

  /**
   * Tool: Get Whoop data for user
   */
  async getWhoopData(userId) {
    console.log(`💪 [BiometricAgent] Fetching Whoop data for ${userId}`);

    const supabase = getSupabaseClient();

    // Get extracted Whoop features
    const { data: features, error: featuresError } = await supabase
      .from('extracted_platform_features')
      .select('*')
      .eq('user_id', userId)
      .eq('platform', 'whoop');

    // Get raw Whoop data
    const { data: rawData, error: rawError } = await supabase
      .from('platform_raw_data')
      .select('data')
      .eq('user_id', userId)
      .eq('platform', 'whoop')
      .order('extracted_at', { ascending: false })
      .limit(1)
      .single();

    if (featuresError && rawError) {
      return {
        hasData: false,
        message: 'No Whoop data found for user',
        recommendation: 'Connect Whoop to enable biometric personality analysis'
      };
    }

    const whoopData = rawData?.data || {};
    const hrvProfile = this.extractHRVProfile(features || [], whoopData);
    const sleepProfile = this.extractSleepProfile(features || [], whoopData);
    const activityProfile = this.extractActivityProfile(features || [], whoopData);

    return {
      hasData: true,
      hrvProfile,
      sleepProfile,
      activityProfile,
      dataQuality: this.assessDataQuality(features, whoopData)
    };
  }

  /**
   * Extract HRV profile from Whoop data
   */
  extractHRVProfile(features, rawData) {
    const hrvFeature = features.find(f => f.feature_type === 'hrv_baseline');
    const recoveryData = rawData?.recovery?.records || [];

    if (recoveryData.length === 0 && !hrvFeature) {
      return null;
    }

    // Calculate HRV metrics from recovery data
    const hrvValues = recoveryData
      .map(r => r.score?.hrv_rmssd_milli)
      .filter(v => v !== undefined && v !== null);

    if (hrvValues.length === 0) {
      return hrvFeature?.metadata || null;
    }

    const avgHrv = hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length;
    const stdHrv = Math.sqrt(
      hrvValues.reduce((sum, v) => sum + Math.pow(v - avgHrv, 2), 0) / hrvValues.length
    );
    const hrvCv = stdHrv / avgHrv; // Coefficient of variation

    return {
      baseline: Math.round(avgHrv),
      stability: 1 - Math.min(hrvCv, 1), // Higher = more stable
      cv: hrvCv,
      trend: this.calculateTrend(hrvValues),
      dataPoints: hrvValues.length
    };
  }

  /**
   * Extract sleep profile from Whoop data
   */
  extractSleepProfile(features, rawData) {
    const sleepFeature = features.find(f => f.feature_type === 'sleep_consistency');
    const sleepData = rawData?.sleep?.records || [];

    if (sleepData.length === 0 && !sleepFeature) {
      return null;
    }

    // Calculate sleep metrics
    const sleepDurations = sleepData
      .map(s => {
        const start = new Date(s.start);
        const end = new Date(s.end);
        return (end - start) / (1000 * 60 * 60); // hours
      })
      .filter(d => d > 0 && d < 24);

    const bedtimes = sleepData
      .map(s => new Date(s.start))
      .map(d => d.getHours() + d.getMinutes() / 60);

    const qualities = sleepData
      .map(s => s.score?.sleep_performance_percentage)
      .filter(q => q !== undefined);

    const avgDuration = sleepDurations.length > 0
      ? sleepDurations.reduce((a, b) => a + b, 0) / sleepDurations.length
      : 7;

    const bedtimeStd = this.calculateStd(bedtimes);
    const consistencyScore = 1 - Math.min(bedtimeStd / 3, 1); // 3 hours std = 0 consistency

    return {
      avgDurationHours: Math.round(avgDuration * 10) / 10,
      consistencyScore,
      bedtimeStdMinutes: Math.round(bedtimeStd * 60),
      avgQuality: qualities.length > 0
        ? Math.round(qualities.reduce((a, b) => a + b, 0) / qualities.length)
        : null,
      deepSleepPercent: this.extractDeepSleepPercent(sleepData),
      dataPoints: sleepData.length
    };
  }

  /**
   * Extract deep sleep percentage
   */
  extractDeepSleepPercent(sleepData) {
    const deepSleepPercentages = sleepData
      .map(s => {
        const stages = s.score?.stage_summary;
        if (!stages) return null;
        const totalSeconds = stages.total_in_bed_time_milli / 1000;
        const deepSeconds = (stages.total_slow_wave_sleep_time_milli || 0) / 1000;
        return totalSeconds > 0 ? (deepSeconds / totalSeconds) * 100 : null;
      })
      .filter(p => p !== null);

    return deepSleepPercentages.length > 0
      ? Math.round(deepSleepPercentages.reduce((a, b) => a + b, 0) / deepSleepPercentages.length)
      : null;
  }

  /**
   * Extract activity profile from Whoop data
   */
  extractActivityProfile(features, rawData) {
    const workoutData = rawData?.workouts?.records || [];
    const cycleData = rawData?.cycles?.records || [];

    if (workoutData.length === 0 && cycleData.length === 0) {
      return null;
    }

    // Workout frequency and types
    const workoutTypes = {};
    for (const workout of workoutData) {
      const sport = workout.sport_id || 'other';
      workoutTypes[sport] = (workoutTypes[sport] || 0) + 1;
    }

    // Calculate workouts per week
    const now = new Date();
    const oldestWorkout = workoutData.length > 0
      ? new Date(Math.min(...workoutData.map(w => new Date(w.start))))
      : now;
    const weekSpan = Math.max((now - oldestWorkout) / (1000 * 60 * 60 * 24 * 7), 1);
    const workoutsPerWeek = workoutData.length / weekSpan;

    // Strain data
    const strainValues = cycleData
      .map(c => c.score?.strain)
      .filter(s => s !== undefined);

    return {
      workoutFrequencyPerWeek: Math.round(workoutsPerWeek * 10) / 10,
      activityDiversity: Object.keys(workoutTypes).length,
      topActivities: Object.entries(workoutTypes)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([type]) => type),
      avgStrain: strainValues.length > 0
        ? Math.round(strainValues.reduce((a, b) => a + b, 0) / strainValues.length * 10) / 10
        : null,
      strainTolerance: this.calculateStrainTolerance(strainValues),
      dataPoints: workoutData.length
    };
  }

  /**
   * Calculate strain tolerance (ability to handle high strain consistently)
   */
  calculateStrainTolerance(strainValues) {
    if (strainValues.length < 5) return 0.5;

    const avgStrain = strainValues.reduce((a, b) => a + b, 0) / strainValues.length;
    const highStrainDays = strainValues.filter(s => s > 14).length;
    const highStrainRatio = highStrainDays / strainValues.length;

    // Normalize: avg strain 10-18 = 0-1, with bonus for consistent high strain
    const baseScore = Math.min((avgStrain - 8) / 12, 1);
    const consistencyBonus = highStrainRatio * 0.2;

    return Math.min(baseScore + consistencyBonus, 1);
  }

  /**
   * Assess data quality
   */
  assessDataQuality(features, rawData) {
    let score = 0;
    let daysOfData = 0;

    const recoveryData = rawData?.recovery?.records || [];
    const sleepData = rawData?.sleep?.records || [];
    const workoutData = rawData?.workouts?.records || [];

    // Recovery data contributes most (HRV)
    if (recoveryData.length > 0) {
      score += Math.min(recoveryData.length / 14, 0.3); // Max 0.3 for 14+ days
      daysOfData = recoveryData.length;
    }

    // Sleep data
    if (sleepData.length > 0) {
      score += Math.min(sleepData.length / 14, 0.25);
    }

    // Workout data
    if (workoutData.length > 0) {
      score += Math.min(workoutData.length / 10, 0.2);
    }

    // Extracted features bonus
    if (features && features.length > 0) {
      score += Math.min(features.length / 5, 0.15);
    }

    // Consistency bonus (data from recent week)
    const recentData = recoveryData.filter(r => {
      const date = new Date(r.created_at);
      return (Date.now() - date) < 7 * 24 * 60 * 60 * 1000;
    });
    if (recentData.length >= 5) {
      score += 0.1;
    }

    return {
      score: Math.min(score, 1),
      daysOfData,
      sleepRecords: sleepData.length,
      workoutRecords: workoutData.length,
      hasRecentData: recentData.length >= 5
    };
  }

  /**
   * Tool: Calculate personality scores
   */
  async calculatePersonalityScores(params) {
    const { hrv_profile, sleep_profile, activity_profile } = params;

    const scores = {
      openness: { score: 50, confidence: 0, evidence: [] },
      conscientiousness: { score: 50, confidence: 0, evidence: [] },
      extraversion: { score: 50, confidence: 0, evidence: [] },
      agreeableness: { score: 50, confidence: 0, evidence: [] },
      neuroticism: { score: 50, confidence: 0, evidence: [] }
    };

    // Apply HRV correlations (strongest predictors)
    if (hrv_profile) {
      this.applyHRVCorrelations(scores, hrv_profile);
    }

    // Apply sleep correlations
    if (sleep_profile) {
      this.applySleepCorrelations(scores, sleep_profile);
    }

    // Apply activity correlations
    if (activity_profile) {
      this.applyActivityCorrelations(scores, activity_profile);
    }

    // Normalize scores
    for (const dimension of Object.keys(scores)) {
      scores[dimension].score = Math.max(0, Math.min(100, Math.round(scores[dimension].score)));
      scores[dimension].confidence = Math.min(0.95, scores[dimension].confidence);
    }

    return scores;
  }

  /**
   * Apply HRV correlations
   */
  applyHRVCorrelations(scores, hrvProfile) {
    if (!hrvProfile) return;

    // HRV baseline (normalized: 40-120 ms -> 0-1)
    if (hrvProfile.baseline !== undefined) {
      const normalizedHrv = (hrvProfile.baseline - 40) / 80;
      const corrs = this.correlations.hrv_baseline;

      for (const [dimension, corr] of Object.entries(corrs)) {
        const contribution = corr.direction === 'positive'
          ? (normalizedHrv - 0.5) * corr.r * 35
          : -(normalizedHrv - 0.5) * Math.abs(corr.r) * 35;

        scores[dimension].score += contribution;
        scores[dimension].confidence += Math.abs(corr.r) * 0.15;

        scores[dimension].evidence.push({
          feature: 'hrv_baseline',
          value: normalizedHrv,
          rawValue: { hrv_ms: hrvProfile.baseline },
          correlation: corr.r,
          direction: corr.direction,
          citation: 'HRV Meta-Analysis',
          description: `Resting HRV of ${hrvProfile.baseline}ms ${hrvProfile.baseline > 60 ? 'above' : 'below'} average, associated with ${dimension}`
        });
      }
    }

    // HRV stability
    if (hrvProfile.stability !== undefined) {
      const corrs = this.correlations.hrv_stability;

      for (const [dimension, corr] of Object.entries(corrs)) {
        const contribution = corr.direction === 'positive'
          ? (hrvProfile.stability - 0.5) * corr.r * 30
          : -(hrvProfile.stability - 0.5) * Math.abs(corr.r) * 30;

        scores[dimension].score += contribution;
        scores[dimension].confidence += Math.abs(corr.r) * 0.1;

        scores[dimension].evidence.push({
          feature: 'hrv_stability',
          value: hrvProfile.stability,
          rawValue: { cv: hrvProfile.cv },
          correlation: corr.r,
          direction: corr.direction,
          citation: 'HRV Meta-Analysis',
          description: hrvProfile.stability > 0.7
            ? 'Stable HRV suggests good stress resilience (lower neuroticism)'
            : 'Variable HRV may indicate sensitivity to stress'
        });
      }
    }
  }

  /**
   * Apply sleep correlations
   */
  applySleepCorrelations(scores, sleepProfile) {
    if (!sleepProfile) return;

    // Sleep consistency (strongest conscientiousness predictor)
    if (sleepProfile.consistencyScore !== undefined) {
      const corrs = this.correlations.sleep_consistency;

      for (const [dimension, corr] of Object.entries(corrs)) {
        const contribution = corr.direction === 'positive'
          ? (sleepProfile.consistencyScore - 0.5) * corr.r * 40
          : -(sleepProfile.consistencyScore - 0.5) * Math.abs(corr.r) * 40;

        scores[dimension].score += contribution;
        scores[dimension].confidence += Math.abs(corr.r) * 0.15;

        scores[dimension].evidence.push({
          feature: 'sleep_consistency',
          value: sleepProfile.consistencyScore,
          rawValue: { bedtime_std_minutes: sleepProfile.bedtimeStdMinutes },
          correlation: corr.r,
          direction: corr.direction,
          citation: 'Sleep Meta-Analysis (2024), n=31,000',
          description: sleepProfile.consistencyScore > 0.7
            ? `Regular sleep schedule (±${sleepProfile.bedtimeStdMinutes} min) is strongly associated with conscientiousness`
            : `Variable sleep schedule (±${sleepProfile.bedtimeStdMinutes} min) suggests flexibility`
        });
      }
    }

    // Sleep quality
    if (sleepProfile.avgQuality !== undefined) {
      const normalizedQuality = sleepProfile.avgQuality / 100;
      const corrs = this.correlations.sleep_quality;

      for (const [dimension, corr] of Object.entries(corrs)) {
        const contribution = corr.direction === 'positive'
          ? (normalizedQuality - 0.5) * corr.r * 30
          : -(normalizedQuality - 0.5) * Math.abs(corr.r) * 30;

        scores[dimension].score += contribution;
        scores[dimension].confidence += Math.abs(corr.r) * 0.1;

        scores[dimension].evidence.push({
          feature: 'sleep_quality',
          value: normalizedQuality,
          rawValue: { quality_percent: sleepProfile.avgQuality },
          correlation: corr.r,
          direction: corr.direction,
          citation: 'Sleep Meta-Analysis (2024), n=31,000',
          description: `Average sleep quality of ${sleepProfile.avgQuality}%`
        });
      }
    }
  }

  /**
   * Apply activity correlations
   */
  applyActivityCorrelations(scores, activityProfile) {
    if (!activityProfile) return;

    // Workout regularity (strong conscientiousness predictor)
    if (activityProfile.workoutFrequencyPerWeek !== undefined) {
      // Normalize: 0-7 workouts/week -> 0-1
      const normalizedFreq = Math.min(activityProfile.workoutFrequencyPerWeek / 7, 1);
      const corrs = this.correlations.workout_regularity;

      for (const [dimension, corr] of Object.entries(corrs)) {
        const contribution = corr.direction === 'positive'
          ? (normalizedFreq - 0.3) * corr.r * 35
          : -(normalizedFreq - 0.3) * Math.abs(corr.r) * 35;

        scores[dimension].score += contribution;
        scores[dimension].confidence += Math.abs(corr.r) * 0.12;

        scores[dimension].evidence.push({
          feature: 'workout_regularity',
          value: normalizedFreq,
          rawValue: { workouts_per_week: activityProfile.workoutFrequencyPerWeek },
          correlation: corr.r,
          direction: corr.direction,
          citation: 'Zufferey et al. (2023)',
          description: `${activityProfile.workoutFrequencyPerWeek} workouts per week ${activityProfile.workoutFrequencyPerWeek > 3 ? 'indicates' : 'suggests'} ${dimension}`
        });
      }
    }

    // Activity diversity -> Openness
    if (activityProfile.activityDiversity !== undefined) {
      // Normalize: 1-5 activity types -> 0-1
      const normalizedDiversity = Math.min((activityProfile.activityDiversity - 1) / 4, 1);
      const corrs = this.correlations.activity_diversity;

      for (const [dimension, corr] of Object.entries(corrs)) {
        const contribution = corr.direction === 'positive'
          ? normalizedDiversity * corr.r * 25
          : -normalizedDiversity * Math.abs(corr.r) * 25;

        scores[dimension].score += contribution;
        scores[dimension].confidence += Math.abs(corr.r) * 0.1;

        scores[dimension].evidence.push({
          feature: 'activity_diversity',
          value: normalizedDiversity,
          rawValue: { activity_count: activityProfile.activityDiversity },
          correlation: corr.r,
          direction: corr.direction,
          citation: 'Zufferey et al. (2023)',
          description: `Engages in ${activityProfile.activityDiversity} different activity types, showing openness to varied experiences`
        });
      }
    }
  }

  /**
   * Helper: Calculate standard deviation
   */
  calculateStd(values) {
    if (values.length === 0) return 0;
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const squareDiffs = values.map(v => Math.pow(v - avg, 2));
    return Math.sqrt(squareDiffs.reduce((a, b) => a + b, 0) / values.length);
  }

  /**
   * Helper: Calculate trend
   */
  calculateTrend(values) {
    if (values.length < 3) return 'insufficient_data';

    const firstHalf = values.slice(0, Math.floor(values.length / 2));
    const secondHalf = values.slice(Math.floor(values.length / 2));

    const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

    const change = (avgSecond - avgFirst) / avgFirst;

    if (change > 0.1) return 'improving';
    if (change < -0.1) return 'declining';
    return 'stable';
  }

  /**
   * Main analysis method
   */
  async analyzeForPersonality(userId) {
    console.log(`💪 [BiometricAgent] Starting analysis for user ${userId}`);

    const prompt = `Analyze the Whoop biometric data for this user and provide Big Five personality inferences.

Use your tools to:
1. First, get the user's Whoop data (HRV, sleep, recovery, workouts)
2. Calculate personality scores based on the validated correlations
3. Return a comprehensive analysis with evidence and citations

Focus particularly on:
- HRV metrics (strongest predictors of extraversion and neuroticism)
- Sleep consistency (strongest predictor of conscientiousness)
- Activity patterns (openness and conscientiousness indicators)`;

    const result = await this.execute(prompt, { userId });

    try {
      const analysis = this.parseJSON(result.text);
      return {
        success: true,
        analysis,
        agentMetrics: this.getMetrics()
      };
    } catch (error) {
      console.error(`[BiometricAgent] Failed to parse response:`, error);
      return {
        success: false,
        rawResponse: result.text,
        error: 'Failed to parse agent response'
      };
    }
  }
}

export default BiometricAgent;
