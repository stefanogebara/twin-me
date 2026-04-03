/**
 * Whoop Feature Extractor
 *
 * Extracts behavioral features from Whoop biometric data that correlate
 * with Big Five personality traits.
 *
 * Key Features Extracted:
 * - Sleep consistency → Conscientiousness (r=0.40)
 * - Recovery discipline → Conscientiousness (r=0.35)
 * - Workout intensity preference → Extraversion (r=0.30)
 * - Workout frequency → Conscientiousness (r=0.38)
 * - HRV variability → Neuroticism (r=-0.30)
 * - Sleep duration adequacy → Conscientiousness (r=0.25)
 * - Recovery score trend → Neuroticism (r=-0.25)
 * - Workout diversity → Openness (r=0.28)
 * - Strain-recovery balance → Agreeableness (r=0.20)
 * - Weekend activity pattern → Extraversion (r=0.22)
 */

import { supabaseAdmin } from '../database.js';
import { createLogger } from '../logger.js';

const log = createLogger('WhoopExtractor');

class WhoopFeatureExtractor {
  constructor() {
    this.LOOKBACK_DAYS = 90;
  }

  /**
   * Extract all behavioral features from Whoop data
   */
  async extractFeatures(userId) {
    log.info(`Extracting features for user ${userId}`);

    try {
      const cutoffDate = new Date(Date.now() - this.LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

      // Fetch from BOTH tables to get all Whoop data
      const { data: platformData, error: platformError } = await supabaseAdmin
        .from('user_platform_data')
        .select('*')
        .eq('user_id', userId)
        .eq('platform', 'whoop')
        .gte('extracted_at', cutoffDate)
        .order('extracted_at', { ascending: false });

      if (platformError) {
        log.warn('Error fetching user_platform_data:', platformError.message);
      }

      const { data: soulData, error: soulError } = await supabaseAdmin
        .from('soul_data')
        .select('*')
        .eq('user_id', userId)
        .eq('platform', 'whoop')
        .gte('created_at', cutoffDate)
        .order('created_at', { ascending: false });

      if (soulError) {
        log.warn('Error fetching soul_data:', soulError.message);
      }

      // Normalize data from both tables
      const normalizedPlatformData = (platformData || []).map(entry => ({
        ...entry,
        created_at: entry.extracted_at,
        raw_data: entry.raw_data || {}
      }));

      const normalizedSoulData = (soulData || []).map(entry => ({
        ...entry,
        raw_data: entry.raw_data || {}
      }));

      const whoopData = [...normalizedPlatformData, ...normalizedSoulData];

      if (whoopData.length === 0) {
        log.info('No Whoop data found for user in either table');
        return [];
      }

      log.info(`Found ${whoopData.length} Whoop data entries (${normalizedPlatformData.length} from user_platform_data, ${normalizedSoulData.length} from soul_data)`);

      // Parse observations into structured records
      const parsed = this.parseWhoopData(whoopData);

      // Extract features
      const features = [];

      // 1. Sleep Consistency (Conscientiousness)
      const sleepConsistency = this.calculateSleepConsistency(parsed);
      if (sleepConsistency !== null) {
        features.push(this.createFeature(userId, 'sleep_consistency', sleepConsistency.value, {
          contributes_to: 'conscientiousness',
          contribution_weight: 0.40,
          description: 'Low variance in bedtime and wake time across days',
          evidence: { correlation: 0.40, citation: 'Duggan et al. (2014)' },
          raw_value: sleepConsistency.rawValue
        }));
      }

      // 2. Recovery Discipline (Conscientiousness)
      const recoveryDiscipline = this.calculateRecoveryDiscipline(parsed);
      if (recoveryDiscipline !== null) {
        features.push(this.createFeature(userId, 'recovery_discipline', recoveryDiscipline.value, {
          contributes_to: 'conscientiousness',
          contribution_weight: 0.35,
          description: 'Adjusting activity based on recovery score (lower strain on low recovery days)',
          evidence: { correlation: 0.35, citation: 'Stephan et al. (2018)' },
          raw_value: recoveryDiscipline.rawValue
        }));
      }

      // 3. Workout Intensity Preference (Extraversion)
      const workoutIntensity = this.calculateWorkoutIntensity(parsed);
      if (workoutIntensity !== null) {
        features.push(this.createFeature(userId, 'workout_intensity_preference', workoutIntensity.value, {
          contributes_to: 'extraversion',
          contribution_weight: 0.30,
          description: 'Average strain level during workouts',
          evidence: { correlation: 0.30, citation: 'Rhodes & Smith (2006)' },
          raw_value: workoutIntensity.rawValue
        }));
      }

      // 4. Workout Frequency (Conscientiousness)
      const workoutFrequency = this.calculateWorkoutFrequency(parsed);
      if (workoutFrequency !== null) {
        features.push(this.createFeature(userId, 'workout_frequency', workoutFrequency.value, {
          contributes_to: 'conscientiousness',
          contribution_weight: 0.38,
          description: 'Number of workout days per week',
          evidence: { correlation: 0.38, citation: 'Wilson & Dishman (2015)' },
          raw_value: workoutFrequency.rawValue
        }));
      }

      // 5. HRV Variability (Neuroticism - negative correlation)
      const hrvVariability = this.calculateHrvVariability(parsed);
      if (hrvVariability !== null) {
        features.push(this.createFeature(userId, 'hrv_variability', hrvVariability.value, {
          contributes_to: 'neuroticism',
          contribution_weight: -0.30,
          description: 'Heart rate variability level (higher HRV = better stress regulation)',
          evidence: { correlation: -0.30, citation: 'Kupper et al. (2015)', note: 'High HRV = low neuroticism' },
          raw_value: hrvVariability.rawValue
        }));
      }

      // 6. Sleep Duration Adequacy (Conscientiousness)
      const sleepAdequacy = this.calculateSleepDurationAdequacy(parsed);
      if (sleepAdequacy !== null) {
        features.push(this.createFeature(userId, 'sleep_duration_adequacy', sleepAdequacy.value, {
          contributes_to: 'conscientiousness',
          contribution_weight: 0.25,
          description: 'Consistently getting adequate sleep (7-9 hours)',
          evidence: { correlation: 0.25, citation: 'Duggan et al. (2014)' },
          raw_value: sleepAdequacy.rawValue
        }));
      }

      // 7. Recovery Score Trend (Neuroticism - negative correlation)
      const recoveryTrend = this.calculateRecoveryScoreTrend(parsed);
      if (recoveryTrend !== null) {
        features.push(this.createFeature(userId, 'recovery_score_trend', recoveryTrend.value, {
          contributes_to: 'neuroticism',
          contribution_weight: -0.25,
          description: 'Trend direction of recovery scores over time',
          evidence: { correlation: -0.25, note: 'Improving recovery = lower neuroticism' },
          raw_value: recoveryTrend.rawValue
        }));
      }

      // 8. Workout Diversity (Openness)
      const workoutDiversity = this.calculateWorkoutDiversity(parsed);
      if (workoutDiversity !== null) {
        features.push(this.createFeature(userId, 'workout_diversity', workoutDiversity.value, {
          contributes_to: 'openness',
          contribution_weight: 0.28,
          description: 'Variety of workout types (cardio, strength, yoga, etc.)',
          evidence: { correlation: 0.28, citation: 'Lochbaum et al. (2021)' },
          raw_value: workoutDiversity.rawValue
        }));
      }

      // 9. Strain-Recovery Balance (Agreeableness)
      const strainBalance = this.calculateStrainRecoveryBalance(parsed);
      if (strainBalance !== null) {
        features.push(this.createFeature(userId, 'strain_recovery_balance', strainBalance.value, {
          contributes_to: 'agreeableness',
          contribution_weight: 0.20,
          description: 'Balanced approach to training — not overtraining',
          evidence: { correlation: 0.20, note: 'Balanced strain relative to recovery = higher agreeableness' },
          raw_value: strainBalance.rawValue
        }));
      }

      // 10. Weekend Activity Pattern (Extraversion)
      const weekendActivity = this.calculateWeekendActivityPattern(parsed);
      if (weekendActivity !== null) {
        features.push(this.createFeature(userId, 'weekend_activity_pattern', weekendActivity.value, {
          contributes_to: 'extraversion',
          contribution_weight: 0.22,
          description: 'Higher weekend activity suggests social/outdoor lifestyle',
          evidence: { correlation: 0.22, citation: 'Rhodes & Smith (2006)' },
          raw_value: weekendActivity.rawValue
        }));
      }

      // 11. Sleep Quality Depth (Conscientiousness)
      const sleepQualityDepth = this.calculateSleepQualityDepth(parsed);
      if (sleepQualityDepth !== null) {
        features.push(this.createFeature(userId, 'sleep_quality_depth', sleepQualityDepth.value, {
          contributes_to: 'conscientiousness',
          contribution_weight: 0.30,
          description: 'Combined REM/deep sleep ratio + respiratory rate quality',
          evidence: { correlation: 0.30, citation: 'Sleep architecture and personality (2020)' },
          raw_value: sleepQualityDepth.rawValue
        }));
      }

      // 12. Physiological Stability (Neuroticism negative)
      const physioStability = this.calculatePhysiologicalStability(parsed);
      if (physioStability !== null) {
        features.push(this.createFeature(userId, 'physiological_stability', physioStability.value, {
          contributes_to: 'neuroticism',
          contribution_weight: -0.22,
          description: 'Low variance in SpO2 and skin temperature across days — stability inversely correlates with Neuroticism',
          evidence: { correlation: -0.22, citation: 'Physiological variability and emotional stability' },
          raw_value: physioStability.rawValue
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
   * Parse raw Whoop observations into structured records.
   * Handles both content strings and raw_data objects.
   */
  parseWhoopData(whoopData) {
    const records = {
      recovery: [],    // { date, score, hrv }
      sleep: [],       // { date, duration_hours, stages, bedtime, waketime }
      workouts: [],    // { date, strain, type, duration }
      strain: [],      // { date, value }
      streaks: []      // { date, type, count }
    };

    for (const entry of whoopData) {
      const raw = entry.raw_data || {};
      const content = entry.content || '';
      const date = entry.created_at || entry.extracted_at;
      const dataType = entry.data_type || '';

      // Structured raw_data takes priority
      if (raw.recovery_score !== undefined || raw.recovery !== undefined) {
        records.recovery.push({
          date,
          type: 'recovery',
          score: raw.recovery_score ?? raw.recovery ?? null,
          hrv: raw.hrv ?? raw.hrv_rmssd ?? raw.hrv_rmssd_milli ?? null,
          spo2: raw.spo2_percentage ?? null,
          skinTemp: raw.skin_temp_celsius ?? null,
        });
      }

      if (raw.sleep_duration !== undefined || raw.sleep_hours !== undefined || raw.sleep !== undefined || raw.total_sleep_hours !== undefined) {
        const totalMs = raw.rem_milli ?? 0 + (raw.deep_milli ?? 0) + (raw.light_milli ?? 0);
        const sleepMs = totalMs > 0 ? totalMs : ((raw.total_sleep_hours ?? 0) * 3600000);
        records.sleep.push({
          date,
          type: 'sleep',
          duration_hours: raw.total_sleep_hours ?? raw.sleep_hours ?? raw.sleep_duration ?? (typeof raw.sleep === 'number' ? raw.sleep : null),
          stages: raw.sleep_stages ?? raw.stages ?? null,
          bedtime: raw.bedtime ?? raw.start ?? null,
          waketime: raw.wake_time ?? raw.waketime ?? raw.end ?? null,
          remPct: sleepMs > 0 && raw.rem_milli ? Math.round((raw.rem_milli / sleepMs) * 100) : null,
          deepPct: sleepMs > 0 && raw.deep_milli ? Math.round((raw.deep_milli / sleepMs) * 100) : null,
          respiratoryRate: raw.respiratory_rate ?? null,
          disturbances: raw.disturbances ?? null,
          sleepPerformance: raw.sleep_performance_percentage ?? null,
        });
      }

      if (raw.strain !== undefined || raw.workout_strain !== undefined) {
        const strainVal = raw.strain ?? raw.workout_strain;
        records.strain.push({ date, value: strainVal });

        if (raw.workout_type || raw.activity_type || raw.sport) {
          records.workouts.push({
            date,
            strain: strainVal,
            type: raw.workout_type ?? raw.activity_type ?? raw.sport ?? 'unknown',
            duration: raw.duration ?? raw.workout_duration ?? null
          });
        }
      }

      if (raw.workouts && Array.isArray(raw.workouts)) {
        for (const w of raw.workouts) {
          records.workouts.push({
            date: w.date || date,
            strain: w.strain ?? w.workout_strain ?? null,
            type: w.workout_type ?? w.activity_type ?? w.sport ?? 'unknown',
            duration: w.duration ?? null
          });
          if (w.strain !== undefined) {
            records.strain.push({ date: w.date || date, value: w.strain });
          }
        }
      }

      // Parse content strings (observation format)
      if (content) {
        const recoveryMatch = content.match(/[Rr]ecovery\s*(?:score)?[:\s]*(\d+(?:\.\d+)?)%?/);
        if (recoveryMatch) {
          const score = parseFloat(recoveryMatch[1]);
          const existing = records.recovery.find(r => r.date === date);
          if (!existing) {
            records.recovery.push({ date, score, hrv: null });
          }
        }

        const hrvMatch = content.match(/HRV[:\s]*(\d+(?:\.\d+)?)\s*(?:ms)?/i);
        if (hrvMatch) {
          const hrvVal = parseFloat(hrvMatch[1]);
          const existingRec = records.recovery.find(r => r.date === date);
          if (existingRec) {
            existingRec.hrv = existingRec.hrv ?? hrvVal;
          } else {
            records.recovery.push({ date, score: null, hrv: hrvVal });
          }
        }

        const sleepMatch = content.match(/[Ss]lept?\s*(\d+(?:\.\d+)?)\s*(?:hours|hrs|h)/);
        if (sleepMatch) {
          const hours = parseFloat(sleepMatch[1]);
          const existing = records.sleep.find(s => s.date === date);
          if (!existing) {
            records.sleep.push({ date, duration_hours: hours, stages: null, bedtime: null, waketime: null });
          }
        }

        const strainMatch = content.match(/[Ss]train[:\s]*(\d+(?:\.\d+)?)/);
        if (strainMatch) {
          const strainVal = parseFloat(strainMatch[1]);
          const existing = records.strain.find(s => s.date === date);
          if (!existing) {
            records.strain.push({ date, value: strainVal });
          }
        }

        const streakMatch = content.match(/(\d+)[- ]day\s*(recovery|sleep|workout)\s*streak/i);
        if (streakMatch) {
          records.streaks.push({
            date,
            type: streakMatch[2].toLowerCase(),
            count: parseInt(streakMatch[1])
          });
        }
      }

      // Handle data_type based entries
      if (dataType === 'recovery' || dataType === 'recovery_score') {
        const existing = records.recovery.find(r => r.date === date);
        if (!existing) {
          records.recovery.push({
            date,
            score: raw.score ?? raw.value ?? null,
            hrv: raw.hrv ?? null
          });
        }
      }

      if (dataType === 'sleep' || dataType === 'sleep_data') {
        const existing = records.sleep.find(s => s.date === date);
        if (!existing) {
          records.sleep.push({
            date,
            duration_hours: raw.hours ?? raw.duration ?? raw.total_sleep ?? null,
            stages: raw.stages ?? null,
            bedtime: raw.bedtime ?? raw.start ?? null,
            waketime: raw.waketime ?? raw.end ?? null
          });
        }
      }

      if (dataType === 'workout' || dataType === 'activity') {
        records.workouts.push({
          date,
          strain: raw.strain ?? raw.score ?? null,
          type: raw.type ?? raw.sport ?? raw.activity ?? 'unknown',
          duration: raw.duration ?? null
        });
      }
    }

    return records;
  }

  /**
   * 1. Sleep Consistency → Conscientiousness (r=0.40)
   * Low variance in bedtime/wake time = high conscientiousness
   */
  calculateSleepConsistency(parsed) {
    const sleepRecords = parsed.sleep.filter(s => s.duration_hours !== null);
    if (sleepRecords.length < 5) return null;

    const durations = sleepRecords.map(s => s.duration_hours);
    const mean = durations.reduce((a, b) => a + b, 0) / durations.length;
    const variance = durations.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / durations.length;
    const stdDev = Math.sqrt(variance);

    // Also check bedtime consistency if available
    const bedtimes = sleepRecords
      .filter(s => s.bedtime)
      .map(s => this.timeToMinutes(s.bedtime));

    let bedtimeStdDev = null;
    if (bedtimes.length >= 3) {
      const btMean = bedtimes.reduce((a, b) => a + b, 0) / bedtimes.length;
      const btVariance = bedtimes.reduce((sum, t) => sum + Math.pow(t - btMean, 2), 0) / bedtimes.length;
      bedtimeStdDev = Math.sqrt(btVariance);
    }

    // Lower stdDev = more consistent = higher score
    // Duration stdDev: 0 = perfect (100), 2+ hours = very inconsistent (0)
    const durationScore = Math.max(0, 100 - (stdDev / 2) * 100);

    // Bedtime stdDev: 0 = perfect (100), 120+ min = very inconsistent (0)
    const bedtimeScore = bedtimeStdDev !== null
      ? Math.max(0, 100 - (bedtimeStdDev / 120) * 100)
      : null;

    const consistencyScore = bedtimeScore !== null
      ? (durationScore * 0.6 + bedtimeScore * 0.4)
      : durationScore;

    return {
      value: Math.round(consistencyScore * 100) / 100,
      rawValue: {
        duration_std_dev_hours: Math.round(stdDev * 100) / 100,
        bedtime_std_dev_minutes: bedtimeStdDev !== null ? Math.round(bedtimeStdDev) : null,
        sample_size: sleepRecords.length
      }
    };
  }

  /**
   * 2. Recovery Discipline → Conscientiousness (r=0.35)
   * Reduces activity on low recovery days
   */
  calculateRecoveryDiscipline(parsed) {
    if (parsed.recovery.length < 5 || parsed.strain.length < 5) return null;

    // Build date-indexed maps
    const recoveryByDate = {};
    for (const r of parsed.recovery) {
      if (r.score !== null) {
        const dateKey = this.toDateKey(r.date);
        recoveryByDate[dateKey] = r.score;
      }
    }

    const strainByDate = {};
    for (const s of parsed.strain) {
      const dateKey = this.toDateKey(s.date);
      if (!strainByDate[dateKey]) strainByDate[dateKey] = [];
      strainByDate[dateKey].push(s.value);
    }

    // Find days where both recovery and strain exist
    let disciplinedDays = 0;
    let totalPairedDays = 0;

    for (const dateKey of Object.keys(recoveryByDate)) {
      const dayStrain = strainByDate[dateKey];
      if (!dayStrain) continue;

      totalPairedDays++;
      const recovery = recoveryByDate[dateKey];
      const avgStrain = dayStrain.reduce((a, b) => a + b, 0) / dayStrain.length;

      // Disciplined = low recovery (<50%) AND low strain (<10) OR high recovery AND any strain
      if (recovery < 50 && avgStrain < 10) {
        disciplinedDays++;
      } else if (recovery >= 50) {
        disciplinedDays++;
      }
    }

    if (totalPairedDays < 3) return null;

    const disciplineScore = (disciplinedDays / totalPairedDays) * 100;

    return {
      value: Math.round(disciplineScore * 100) / 100,
      rawValue: {
        disciplined_days: disciplinedDays,
        total_paired_days: totalPairedDays
      }
    };
  }

  /**
   * 3. Workout Intensity Preference → Extraversion (r=0.30)
   * Average strain level during workouts
   */
  calculateWorkoutIntensity(parsed) {
    const strainValues = [
      ...parsed.workouts.filter(w => w.strain !== null).map(w => w.strain),
      ...parsed.strain.map(s => s.value)
    ];

    if (strainValues.length < 3) return null;

    const avgStrain = strainValues.reduce((a, b) => a + b, 0) / strainValues.length;

    // Whoop strain is 0-21 scale, normalize to 0-100
    const normalizedIntensity = Math.min(100, (avgStrain / 21) * 100);

    return {
      value: Math.round(normalizedIntensity * 100) / 100,
      rawValue: {
        avg_strain: Math.round(avgStrain * 100) / 100,
        max_strain: Math.round(Math.max(...strainValues) * 100) / 100,
        sample_size: strainValues.length
      }
    };
  }

  /**
   * 4. Workout Frequency → Conscientiousness (r=0.38)
   * Number of workout days per week
   */
  calculateWorkoutFrequency(parsed) {
    if (parsed.workouts.length < 2) return null;

    // Count unique workout days
    const workoutDays = new Set(
      parsed.workouts.map(w => this.toDateKey(w.date))
    );

    // Calculate time span in weeks
    const dates = parsed.workouts.map(w => new Date(w.date).getTime()).sort();
    const spanDays = Math.max(1, (dates[dates.length - 1] - dates[0]) / (24 * 60 * 60 * 1000));
    const spanWeeks = Math.max(1, spanDays / 7);

    const workoutsPerWeek = workoutDays.size / spanWeeks;

    // Normalize: 0 days/week = 0, 7 days/week = 100
    const frequencyScore = Math.min(100, (workoutsPerWeek / 7) * 100);

    return {
      value: Math.round(frequencyScore * 100) / 100,
      rawValue: {
        workouts_per_week: Math.round(workoutsPerWeek * 100) / 100,
        total_workout_days: workoutDays.size,
        span_weeks: Math.round(spanWeeks * 10) / 10
      }
    };
  }

  /**
   * 5. HRV Variability → Neuroticism (r=-0.30)
   * Higher HRV = lower neuroticism (better stress regulation)
   */
  calculateHrvVariability(parsed) {
    const hrvValues = parsed.recovery
      .filter(r => r.hrv !== null && r.hrv > 0)
      .map(r => r.hrv);

    if (hrvValues.length < 3) return null;

    const avgHrv = hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length;

    // HRV is typically 20-150ms. Normalize to 0-100
    // Higher HRV = better autonomic function = lower neuroticism
    const hrvScore = Math.min(100, Math.max(0, ((avgHrv - 20) / 130) * 100));

    return {
      value: Math.round(hrvScore * 100) / 100,
      rawValue: {
        avg_hrv_ms: Math.round(avgHrv * 100) / 100,
        min_hrv: Math.round(Math.min(...hrvValues)),
        max_hrv: Math.round(Math.max(...hrvValues)),
        sample_size: hrvValues.length
      }
    };
  }

  /**
   * 6. Sleep Duration Adequacy → Conscientiousness (r=0.25)
   * Consistently getting 7-9 hours of sleep
   */
  calculateSleepDurationAdequacy(parsed) {
    const durations = parsed.sleep
      .filter(s => s.duration_hours !== null)
      .map(s => s.duration_hours);

    if (durations.length < 5) return null;

    // Count nights with adequate sleep (7-9 hours)
    const adequateNights = durations.filter(d => d >= 7 && d <= 9).length;
    const adequacyRate = (adequateNights / durations.length) * 100;

    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;

    return {
      value: Math.round(adequacyRate * 100) / 100,
      rawValue: {
        adequate_nights: adequateNights,
        total_nights: durations.length,
        avg_duration_hours: Math.round(avgDuration * 100) / 100
      }
    };
  }

  /**
   * 7. Recovery Score Trend → Neuroticism (r=-0.25)
   * Improving trend = lower neuroticism
   */
  calculateRecoveryScoreTrend(parsed) {
    const recoveries = parsed.recovery
      .filter(r => r.score !== null)
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    if (recoveries.length < 7) return null;

    // Simple linear regression on recovery scores over time
    const n = recoveries.length;
    const xValues = recoveries.map((_, i) => i);
    const yValues = recoveries.map(r => r.score);

    const xMean = (n - 1) / 2;
    const yMean = yValues.reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let denominator = 0;
    for (let i = 0; i < n; i++) {
      numerator += (xValues[i] - xMean) * (yValues[i] - yMean);
      denominator += Math.pow(xValues[i] - xMean, 2);
    }

    const slope = denominator !== 0 ? numerator / denominator : 0;

    // Positive slope = improving, normalize to 0-100
    // slope of +1 per day = very improving, -1 = very declining
    // Map range [-0.5, 0.5] to [0, 100]
    const trendScore = Math.min(100, Math.max(0, (slope + 0.5) * 100));

    return {
      value: Math.round(trendScore * 100) / 100,
      rawValue: {
        slope_per_day: Math.round(slope * 1000) / 1000,
        avg_recovery: Math.round(yMean * 100) / 100,
        sample_size: n
      }
    };
  }

  /**
   * 8. Workout Diversity → Openness (r=0.28)
   * Variety of workout types
   */
  calculateWorkoutDiversity(parsed) {
    if (parsed.workouts.length < 3) return null;

    // Normalize workout types to lowercase
    const typeCounts = {};
    let total = 0;

    for (const w of parsed.workouts) {
      const type = (w.type || 'unknown').toLowerCase().trim();
      if (type === 'unknown') continue;
      typeCounts[type] = (typeCounts[type] || 0) + 1;
      total++;
    }

    const uniqueTypes = Object.keys(typeCounts).length;
    if (uniqueTypes === 0 || total === 0) return null;

    // Shannon entropy for diversity
    let entropy = 0;
    for (const count of Object.values(typeCounts)) {
      const p = count / total;
      entropy -= p * Math.log2(p);
    }

    const maxEntropy = Math.log2(uniqueTypes);
    const evenness = maxEntropy > 0 ? entropy / maxEntropy : 0;

    // Combine uniqueness and evenness
    // More types AND evenly distributed = higher diversity
    const typeScore = Math.min(1, uniqueTypes / 6); // 6+ types = max
    const diversityScore = (typeScore * 0.5 + evenness * 0.5) * 100;

    return {
      value: Math.round(diversityScore * 100) / 100,
      rawValue: {
        unique_types: uniqueTypes,
        type_distribution: typeCounts,
        shannon_entropy: Math.round(entropy * 100) / 100
      }
    };
  }

  /**
   * 9. Strain-Recovery Balance → Agreeableness (r=0.20)
   * Not overtraining, balanced approach
   */
  calculateStrainRecoveryBalance(parsed) {
    if (parsed.recovery.length < 5 || parsed.strain.length < 5) return null;

    const recoveryScores = parsed.recovery
      .filter(r => r.score !== null)
      .map(r => r.score);

    const strainValues = parsed.strain.map(s => s.value);

    const avgRecovery = recoveryScores.reduce((a, b) => a + b, 0) / recoveryScores.length;
    const avgStrain = strainValues.reduce((a, b) => a + b, 0) / strainValues.length;

    // Optimal balance: strain proportional to recovery
    // Recovery is 0-100%, strain is 0-21
    // Ideal ratio: strain ~= recovery * 0.21 (max strain when max recovery)
    const expectedStrain = (avgRecovery / 100) * 21;
    const strainDifference = Math.abs(avgStrain - expectedStrain);

    // Lower difference = better balance = higher score
    // Max reasonable difference is ~10 strain points
    const balanceScore = Math.max(0, 100 - (strainDifference / 10) * 100);

    return {
      value: Math.round(balanceScore * 100) / 100,
      rawValue: {
        avg_recovery: Math.round(avgRecovery * 100) / 100,
        avg_strain: Math.round(avgStrain * 100) / 100,
        expected_strain: Math.round(expectedStrain * 100) / 100,
        strain_difference: Math.round(strainDifference * 100) / 100
      }
    };
  }

  /**
   * 10. Weekend Activity Pattern → Extraversion (r=0.22)
   * Higher weekend activity suggests social/outdoor lifestyle
   */
  calculateWeekendActivityPattern(parsed) {
    const weekdayStrains = [];
    const weekendStrains = [];

    for (const s of parsed.strain) {
      const day = new Date(s.date).getDay();
      if (day === 0 || day === 6) {
        weekendStrains.push(s.value);
      } else {
        weekdayStrains.push(s.value);
      }
    }

    // Also check workouts
    for (const w of parsed.workouts) {
      if (w.strain === null) continue;
      const day = new Date(w.date).getDay();
      if (day === 0 || day === 6) {
        weekendStrains.push(w.strain);
      } else {
        weekdayStrains.push(w.strain);
      }
    }

    if (weekendStrains.length < 2 || weekdayStrains.length < 3) return null;

    const avgWeekend = weekendStrains.reduce((a, b) => a + b, 0) / weekendStrains.length;
    const avgWeekday = weekdayStrains.reduce((a, b) => a + b, 0) / weekdayStrains.length;

    // Ratio of weekend to weekday activity
    // Higher weekend relative to weekday = more extraverted
    const ratio = avgWeekday > 0 ? avgWeekend / avgWeekday : 1;

    // Normalize: ratio of 0.5 = 0, ratio of 1.0 = 50, ratio of 1.5+ = 100
    const activityScore = Math.min(100, Math.max(0, (ratio - 0.5) * 100));

    return {
      value: Math.round(activityScore * 100) / 100,
      rawValue: {
        avg_weekend_strain: Math.round(avgWeekend * 100) / 100,
        avg_weekday_strain: Math.round(avgWeekday * 100) / 100,
        weekend_to_weekday_ratio: Math.round(ratio * 100) / 100,
        weekend_samples: weekendStrains.length,
        weekday_samples: weekdayStrains.length
      }
    };
  }

  /**
   * Sleep quality depth: REM/deep sleep ratio + respiratory rate quality
   */
  calculateSleepQualityDepth(parsed) {
    const sleepRecords = (parsed.sleep || []).filter(r => r.remPct != null);
    if (sleepRecords.length < 3) return null;

    // Ideal: 20-25% REM, 15-20% deep, respiratory rate 12-20
    let qualitySum = 0;
    for (const s of sleepRecords) {
      const remScore = s.remPct >= 15 && s.remPct <= 30 ? 1 : 0.5;
      const deepScore = s.deepPct >= 10 && s.deepPct <= 25 ? 1 : 0.5;
      const respScore = s.respiratoryRate >= 12 && s.respiratoryRate <= 20 ? 1 : 0.5;
      qualitySum += (remScore + deepScore + respScore) / 3;
    }
    const avgQuality = qualitySum / sleepRecords.length;
    const value = Math.round(avgQuality * 100);
    return {
      value,
      rawValue: {
        avgRemPct: Math.round(sleepRecords.reduce((s, r) => s + (r.remPct || 0), 0) / sleepRecords.length),
        avgDeepPct: Math.round(sleepRecords.reduce((s, r) => s + (r.deepPct || 0), 0) / sleepRecords.length),
        samples: sleepRecords.length
      }
    };
  }

  /**
   * Physiological stability: low variance in SpO2 and skin temperature
   */
  calculatePhysiologicalStability(parsed) {
    const recoveryRecords = (parsed.recovery || []).filter(r => r.spo2 != null || r.skinTemp != null);
    if (recoveryRecords.length < 3) return null;

    let stabilityScore = 50; // default middle

    const spo2Values = recoveryRecords.map(r => r.spo2).filter(v => v != null);
    if (spo2Values.length >= 3) {
      const mean = spo2Values.reduce((a, b) => a + b, 0) / spo2Values.length;
      const variance = spo2Values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / spo2Values.length;
      const std = Math.sqrt(variance);
      // Low SpO2 variance (< 1%) is very stable. Scale: std 0 = 100, std 3+ = 0
      stabilityScore = Math.max(0, Math.round((1 - std / 3) * 100));
    }

    const skinTempValues = recoveryRecords.map(r => r.skinTemp).filter(v => v != null);
    if (skinTempValues.length >= 3) {
      const mean = skinTempValues.reduce((a, b) => a + b, 0) / skinTempValues.length;
      const variance = skinTempValues.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / skinTempValues.length;
      const std = Math.sqrt(variance);
      // Low skin temp variance (< 0.5°C) is stable. Scale: std 0 = 100, std 2+ = 0
      const tempScore = Math.max(0, Math.round((1 - std / 2) * 100));
      stabilityScore = Math.round((stabilityScore + tempScore) / 2);
    }

    return {
      value: stabilityScore,
      rawValue: { spo2Samples: spo2Values.length, skinTempSamples: skinTempValues.length }
    };
  }

  /**
   * Create standardized feature object
   */
  createFeature(userId, featureType, featureValue, metadata = {}) {
    return {
      user_id: userId,
      platform: 'whoop',
      feature_type: featureType,
      feature_value: featureValue,
      normalized_value: featureValue / 100,
      confidence_score: 70,
      sample_size: 1,
      contributes_to: metadata.contributes_to || null,
      contribution_weight: metadata.contribution_weight || 0,
      metadata: {
        raw_value: metadata.raw_value || {}
      },
      evidence: {
        description: metadata.description,
        correlation: metadata.evidence?.correlation,
        citation: metadata.evidence?.citation,
        note: metadata.evidence?.note,
        raw_value: metadata.raw_value || {}
      }
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
          onConflict: 'user_id,platform,feature_type'
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
   * Convert a time string (e.g. "22:30", "10:15 PM") to minutes since midnight
   */
  timeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const str = String(timeStr);

    // Handle ISO date strings
    if (str.includes('T')) {
      const d = new Date(str);
      return d.getHours() * 60 + d.getMinutes();
    }

    // Handle "HH:MM" or "HH:MM AM/PM"
    const pmMatch = str.match(/(\d+):(\d+)\s*(PM|AM)/i);
    if (pmMatch) {
      let hours = parseInt(pmMatch[1]);
      const minutes = parseInt(pmMatch[2]);
      const isPm = pmMatch[3].toUpperCase() === 'PM';
      if (isPm && hours !== 12) hours += 12;
      if (!isPm && hours === 12) hours = 0;
      return hours * 60 + minutes;
    }

    const simpleMatch = str.match(/(\d+):(\d+)/);
    if (simpleMatch) {
      return parseInt(simpleMatch[1]) * 60 + parseInt(simpleMatch[2]);
    }

    return 0;
  }

  /**
   * Convert a date to YYYY-MM-DD key for grouping
   */
  toDateKey(dateStr) {
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}

// Export singleton instance
const whoopFeatureExtractor = new WhoopFeatureExtractor();
export default whoopFeatureExtractor;
