/**
 * Oura Ring Feature Extractor
 *
 * Extracts behavioral features from Oura Ring biometric data that correlate
 * with Big Five personality traits.
 *
 * Key Features Extracted:
 * - Sleep consistency → Conscientiousness (r=0.40)
 * - Sleep duration adequacy → Conscientiousness (r=0.25)
 * - Readiness discipline → Conscientiousness (r=0.35)
 * - HRV baseline → Neuroticism (r=-0.30)
 * - Readiness score trend → Neuroticism (r=-0.25)
 * - Activity level → Extraversion (r=0.28)
 * - Workout diversity → Openness (r=0.28)
 * - Step pattern regularity → Conscientiousness (r=0.32)
 */

import { supabaseAdmin } from '../database.js';
import { createLogger } from '../logger.js';

const log = createLogger('OuraExtractor');

class OuraFeatureExtractor {
  constructor() {
    this.LOOKBACK_DAYS = 90;
  }

  /**
   * Extract all behavioral features from Oura data
   */
  async extractFeatures(userId) {
    log.info(`Extracting features for user ${userId}`);

    try {
      const cutoffDate = new Date(Date.now() - this.LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

      // Fetch from user_platform_data
      const { data: platformData, error: platformError } = await supabaseAdmin
        .from('user_platform_data')
        .select('*')
        .eq('user_id', userId)
        .eq('platform', 'oura')
        .gte('extracted_at', cutoffDate)
        .order('extracted_at', { ascending: false });

      if (platformError) {
        log.warn('Error fetching user_platform_data:', platformError.message);
      }

      // Also check soul_data
      const { data: soulData, error: soulError } = await supabaseAdmin
        .from('soul_data')
        .select('*')
        .eq('user_id', userId)
        .eq('platform', 'oura')
        .gte('created_at', cutoffDate)
        .order('created_at', { ascending: false });

      if (soulError) {
        log.warn('Error fetching soul_data:', soulError.message);
      }

      // Also scan memory stream for Oura observations
      const { data: memories, error: memError } = await supabaseAdmin
        .from('user_memories')
        .select('content, created_at, metadata')
        .eq('user_id', userId)
        .eq('memory_type', 'platform_data')
        .gte('created_at', cutoffDate)
        .order('created_at', { ascending: false })
        .limit(200);

      if (memError) {
        log.warn('Error fetching memories:', memError.message);
      }

      const ouraMemories = (memories || []).filter(m =>
        m.metadata?.source === 'oura' || (m.content && m.content.toLowerCase().includes('oura'))
      );

      // Normalize data
      const normalizedPlatformData = (platformData || []).map(entry => ({
        ...entry,
        created_at: entry.extracted_at,
        raw_data: entry.raw_data || {},
      }));

      const normalizedSoulData = (soulData || []).map(entry => ({
        ...entry,
        raw_data: entry.raw_data || {},
      }));

      const allData = [...normalizedPlatformData, ...normalizedSoulData];

      if (allData.length === 0 && ouraMemories.length === 0) {
        log.info('No Oura data found for user');
        return [];
      }

      log.info(`Found ${allData.length} Oura data entries + ${ouraMemories.length} memories`);

      // Parse into structured records
      const parsed = this.parseOuraData(allData, ouraMemories);
      const features = [];

      // 1. Sleep Consistency (Conscientiousness)
      const sleepConsistency = this.calculateSleepConsistency(parsed);
      if (sleepConsistency !== null) {
        features.push(this.createFeature(userId, 'sleep_consistency', sleepConsistency.value, {
          contributes_to: 'conscientiousness',
          contribution_weight: 0.40,
          description: 'Low variance in sleep scores across days',
          evidence: { correlation: 0.40, citation: 'Duggan et al. (2014)' },
          raw_value: sleepConsistency.rawValue,
        }));
      }

      // 2. Sleep Duration Adequacy (Conscientiousness)
      const sleepAdequacy = this.calculateSleepDurationAdequacy(parsed);
      if (sleepAdequacy !== null) {
        features.push(this.createFeature(userId, 'sleep_duration_adequacy', sleepAdequacy.value, {
          contributes_to: 'conscientiousness',
          contribution_weight: 0.25,
          description: 'Consistently getting adequate sleep (7-9 hours)',
          evidence: { correlation: 0.25, citation: 'Duggan et al. (2014)' },
          raw_value: sleepAdequacy.rawValue,
        }));
      }

      // 3. Readiness Discipline (Conscientiousness)
      const readinessDiscipline = this.calculateReadinessDiscipline(parsed);
      if (readinessDiscipline !== null) {
        features.push(this.createFeature(userId, 'readiness_discipline', readinessDiscipline.value, {
          contributes_to: 'conscientiousness',
          contribution_weight: 0.35,
          description: 'Maintaining high readiness scores through consistent behavior',
          evidence: { correlation: 0.35, citation: 'Stephan et al. (2018)' },
          raw_value: readinessDiscipline.rawValue,
        }));
      }

      // 4. HRV Baseline (Neuroticism - negative)
      const hrvBaseline = this.calculateHrvBaseline(parsed);
      if (hrvBaseline !== null) {
        features.push(this.createFeature(userId, 'hrv_baseline', hrvBaseline.value, {
          contributes_to: 'neuroticism',
          contribution_weight: -0.30,
          description: 'Heart rate variability level (higher HRV = better stress regulation)',
          evidence: { correlation: -0.30, citation: 'Kupper et al. (2015)', note: 'High HRV = low neuroticism' },
          raw_value: hrvBaseline.rawValue,
        }));
      }

      // 5. Readiness Score Trend (Neuroticism - negative)
      const readinessTrend = this.calculateReadinessTrend(parsed);
      if (readinessTrend !== null) {
        features.push(this.createFeature(userId, 'readiness_score_trend', readinessTrend.value, {
          contributes_to: 'neuroticism',
          contribution_weight: -0.25,
          description: 'Trend direction of readiness scores over time',
          evidence: { correlation: -0.25, note: 'Improving readiness = lower neuroticism' },
          raw_value: readinessTrend.rawValue,
        }));
      }

      // 6. Activity Level (Extraversion)
      const activityLevel = this.calculateActivityLevel(parsed);
      if (activityLevel !== null) {
        features.push(this.createFeature(userId, 'activity_level', activityLevel.value, {
          contributes_to: 'extraversion',
          contribution_weight: 0.28,
          description: 'Daily step count and activity score',
          evidence: { correlation: 0.28, citation: 'Rhodes & Smith (2006)' },
          raw_value: activityLevel.rawValue,
        }));
      }

      // 7. Step Pattern Regularity (Conscientiousness)
      const stepRegularity = this.calculateStepRegularity(parsed);
      if (stepRegularity !== null) {
        features.push(this.createFeature(userId, 'step_pattern_regularity', stepRegularity.value, {
          contributes_to: 'conscientiousness',
          contribution_weight: 0.32,
          description: 'Consistency of daily step counts',
          evidence: { correlation: 0.32, citation: 'Wilson & Dishman (2015)' },
          raw_value: stepRegularity.rawValue,
        }));
      }

      log.info(`Extracted ${features.length} features`);
      return features;

    } catch (error) {
      log.error('Error:', error);
      throw error;
    }
  }

  /**
   * Parse raw Oura data into structured records.
   */
  parseOuraData(ouraData, ouraMemories) {
    const records = {
      sleep: [],      // { date, score, duration_hours }
      readiness: [],  // { date, score, hrv_balance, temp_deviation }
      activity: [],   // { date, score, steps, calories }
    };

    for (const entry of ouraData) {
      const raw = entry.raw_data || {};
      const date = entry.created_at || entry.extracted_at;
      const dataType = entry.data_type || '';

      if (dataType === 'sleep') {
        records.sleep.push({
          date,
          score: raw.score ?? null,
          duration_hours: raw.contributors?.total_sleep ? raw.contributors.total_sleep / 3600 : null,
        });
      }

      if (dataType === 'readiness') {
        records.readiness.push({
          date,
          score: raw.score ?? null,
          hrv_balance: raw.contributors?.hrv_balance ?? null,
          temp_deviation: raw.temperature_deviation ?? raw.contributors?.body_temperature ?? null,
        });
      }

      if (dataType === 'activity') {
        records.activity.push({
          date,
          score: raw.score ?? null,
          steps: raw.steps ?? null,
          calories: raw.total_calories ?? null,
        });
      }
    }

    // Parse memory content as fallback
    for (const mem of ouraMemories) {
      const content = mem.content || '';
      const date = mem.created_at;

      const sleepScoreMatch = content.match(/[Ss]leep score (\d+)/);
      if (sleepScoreMatch) {
        const existing = records.sleep.find(s => this.toDateKey(s.date) === this.toDateKey(date));
        if (!existing) {
          records.sleep.push({ date, score: parseInt(sleepScoreMatch[1]), duration_hours: null });
        }
      }

      const readinessMatch = content.match(/[Rr]eadiness score (\d+)/);
      if (readinessMatch) {
        const existing = records.readiness.find(r => this.toDateKey(r.date) === this.toDateKey(date));
        if (!existing) {
          records.readiness.push({ date, score: parseInt(readinessMatch[1]), hrv_balance: null, temp_deviation: null });
        }
      }

      const stepsMatch = content.match(/([\d,]+)\s*steps/);
      if (stepsMatch) {
        const steps = parseInt(stepsMatch[1].replace(/,/g, ''));
        const existing = records.activity.find(a => this.toDateKey(a.date) === this.toDateKey(date));
        if (!existing) {
          records.activity.push({ date, score: null, steps, calories: null });
        }
      }
    }

    return records;
  }

  /**
   * 1. Sleep Consistency → Conscientiousness (r=0.40)
   */
  calculateSleepConsistency(parsed) {
    const scores = parsed.sleep.filter(s => s.score !== null).map(s => s.score);
    if (scores.length < 5) return null;

    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / scores.length;
    const stdDev = Math.sqrt(variance);

    // Lower stdDev = more consistent = higher score
    // stdDev 0 = perfect (100), stdDev 15+ = very inconsistent (0)
    const consistencyScore = Math.max(0, 100 - (stdDev / 15) * 100);

    return {
      value: Math.round(consistencyScore * 100) / 100,
      rawValue: {
        score_std_dev: Math.round(stdDev * 100) / 100,
        avg_sleep_score: Math.round(mean * 100) / 100,
        sample_size: scores.length,
      },
    };
  }

  /**
   * 2. Sleep Duration Adequacy → Conscientiousness (r=0.25)
   */
  calculateSleepDurationAdequacy(parsed) {
    const durations = parsed.sleep.filter(s => s.duration_hours !== null).map(s => s.duration_hours);
    if (durations.length < 5) return null;

    const adequateNights = durations.filter(d => d >= 7 && d <= 9).length;
    const adequacyRate = (adequateNights / durations.length) * 100;
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;

    return {
      value: Math.round(adequacyRate * 100) / 100,
      rawValue: {
        adequate_nights: adequateNights,
        total_nights: durations.length,
        avg_duration_hours: Math.round(avgDuration * 100) / 100,
      },
    };
  }

  /**
   * 3. Readiness Discipline → Conscientiousness (r=0.35)
   */
  calculateReadinessDiscipline(parsed) {
    const scores = parsed.readiness.filter(r => r.score !== null).map(r => r.score);
    if (scores.length < 5) return null;

    // High average readiness with low variance = disciplined lifestyle
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const highReadinessDays = scores.filter(s => s >= 70).length;
    const disciplineScore = (highReadinessDays / scores.length) * 100;

    return {
      value: Math.round(disciplineScore * 100) / 100,
      rawValue: {
        high_readiness_days: highReadinessDays,
        total_days: scores.length,
        avg_readiness: Math.round(avg * 100) / 100,
      },
    };
  }

  /**
   * 4. HRV Baseline → Neuroticism (r=-0.30)
   */
  calculateHrvBaseline(parsed) {
    const hrvValues = parsed.readiness
      .filter(r => r.hrv_balance !== null && r.hrv_balance > 0)
      .map(r => r.hrv_balance);

    if (hrvValues.length < 3) return null;

    const avgHrv = hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length;

    // HRV balance from Oura is typically 0-100. Normalize.
    const hrvScore = Math.min(100, Math.max(0, avgHrv));

    return {
      value: Math.round(hrvScore * 100) / 100,
      rawValue: {
        avg_hrv_balance: Math.round(avgHrv * 100) / 100,
        sample_size: hrvValues.length,
      },
    };
  }

  /**
   * 5. Readiness Score Trend → Neuroticism (r=-0.25)
   */
  calculateReadinessTrend(parsed) {
    const readiness = parsed.readiness
      .filter(r => r.score !== null)
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    if (readiness.length < 7) return null;

    const n = readiness.length;
    const yValues = readiness.map(r => r.score);
    const xMean = (n - 1) / 2;
    const yMean = yValues.reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let denominator = 0;
    for (let i = 0; i < n; i++) {
      numerator += (i - xMean) * (yValues[i] - yMean);
      denominator += Math.pow(i - xMean, 2);
    }

    const slope = denominator !== 0 ? numerator / denominator : 0;
    const trendScore = Math.min(100, Math.max(0, (slope + 0.5) * 100));

    return {
      value: Math.round(trendScore * 100) / 100,
      rawValue: {
        slope_per_day: Math.round(slope * 1000) / 1000,
        avg_readiness: Math.round(yMean * 100) / 100,
        sample_size: n,
      },
    };
  }

  /**
   * 6. Activity Level → Extraversion (r=0.28)
   */
  calculateActivityLevel(parsed) {
    const stepCounts = parsed.activity.filter(a => a.steps !== null).map(a => a.steps);
    if (stepCounts.length < 3) return null;

    const avgSteps = stepCounts.reduce((a, b) => a + b, 0) / stepCounts.length;

    // Normalize: 0 steps = 0, 15000+ = 100
    const activityScore = Math.min(100, (avgSteps / 15000) * 100);

    return {
      value: Math.round(activityScore * 100) / 100,
      rawValue: {
        avg_steps: Math.round(avgSteps),
        max_steps: Math.max(...stepCounts),
        sample_size: stepCounts.length,
      },
    };
  }

  /**
   * 7. Step Pattern Regularity → Conscientiousness (r=0.32)
   */
  calculateStepRegularity(parsed) {
    const stepCounts = parsed.activity.filter(a => a.steps !== null).map(a => a.steps);
    if (stepCounts.length < 5) return null;

    const mean = stepCounts.reduce((a, b) => a + b, 0) / stepCounts.length;
    const variance = stepCounts.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / stepCounts.length;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 1; // coefficient of variation

    // Lower CV = more regular = higher score
    // CV 0 = perfect regularity (100), CV 0.5+ = very irregular (0)
    const regularityScore = Math.max(0, 100 - (cv / 0.5) * 100);

    return {
      value: Math.round(regularityScore * 100) / 100,
      rawValue: {
        coefficient_of_variation: Math.round(cv * 1000) / 1000,
        avg_steps: Math.round(mean),
        sample_size: stepCounts.length,
      },
    };
  }

  /**
   * Create standardized feature object
   */
  createFeature(userId, featureType, featureValue, metadata = {}) {
    return {
      user_id: userId,
      platform: 'oura',
      feature_type: featureType,
      feature_value: featureValue,
      normalized_value: featureValue / 100,
      confidence_score: 70,
      sample_size: 1,
      contributes_to: metadata.contributes_to || null,
      contribution_weight: metadata.contribution_weight || 0,
      metadata: {
        raw_value: metadata.raw_value || {},
      },
      evidence: {
        description: metadata.description,
        correlation: metadata.evidence?.correlation,
        citation: metadata.evidence?.citation,
        note: metadata.evidence?.note,
        raw_value: metadata.raw_value || {},
      },
    };
  }

  /**
   * Save features to database
   */
  async saveFeatures(features) {
    if (features.length === 0) return { success: true, saved: 0 };

    log.info(`Saving ${features.length} features to database...`);

    try {
      const { data, error } = await supabaseAdmin
        .from('behavioral_features')
        .upsert(features, {
          onConflict: 'user_id,platform,feature_type',
        })
        .select();

      if (error) throw error;

      log.info(`Saved ${data.length} features successfully`);
      return { success: true, saved: data.length, data };

    } catch (error) {
      log.error('Error saving features:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Convert a date to YYYY-MM-DD key for grouping
   */
  toDateKey(dateStr) {
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}

const ouraFeatureExtractor = new OuraFeatureExtractor();
export default ouraFeatureExtractor;
