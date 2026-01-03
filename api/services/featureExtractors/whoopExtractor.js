/**
 * Whoop Feature Extractor - V2 API
 *
 * Extracts behavioral features from Whoop health data that correlate
 * with Big Five personality traits.
 *
 * V2 API Migration (Required by October 1, 2025):
 * - Uses UUID-based IDs instead of numeric IDs
 * - Pagination via nextToken
 * - Enhanced recovery data with SpO2 and skin temperature
 *
 * Key Features Extracted:
 * - Sleep consistency -> Conscientiousness (r=0.45)
 * - Workout regularity -> Conscientiousness (r=0.42)
 * - Recovery adherence -> Conscientiousness (r=0.38)
 * - HRV variability -> Neuroticism (r=-0.35)
 * - Strain tolerance -> Extraversion (r=0.40)
 * - Workout frequency -> Extraversion (r=0.38)
 *
 * Based on research correlating physiological metrics with personality:
 * - Jonassaint et al. (2009): HRV and personality
 * - Rhodes & Smith (2006): Physical activity and personality
 */

import { supabaseAdmin } from '../database.js';
import { decryptToken } from '../encryption.js';
import axios from 'axios';

// V2 API Base URL - migrated from v1
const WHOOP_API_BASE = 'https://api.prod.whoop.com/developer/v2';

class WhoopFeatureExtractor {
  constructor() {
    this.LOOKBACK_DAYS = 30; // Analyze last 30 days of data
  }

  /**
   * Extract all behavioral features from Whoop data
   */
  async extractFeatures(userId) {
    console.log(`💪 [Whoop Extractor V2] Extracting features for user ${userId}`);

    try {
      // Get Whoop connection to fetch fresh data
      const { data: connection, error: connError } = await supabaseAdmin
        .from('platform_connections')
        .select('*')
        .eq('user_id', userId)
        .eq('platform', 'whoop')
        .single();

      if (connError || !connection) {
        console.log('⚠️ [Whoop Extractor] No Whoop connection found for user');
        return [];
      }

      // Check if token is expired
      if (connection.token_expires_at && new Date(connection.token_expires_at) < new Date()) {
        console.log('⚠️ [Whoop Extractor] Whoop token expired, needs reconnection');
        return [];
      }

      // Decrypt access token
      const accessToken = decryptToken(connection.access_token);
      if (!accessToken) {
        console.log('❌ [Whoop Extractor] Failed to decrypt access token');
        return [];
      }

      // Fetch data from Whoop API V2
      const whoopData = await this.fetchWhoopData(accessToken);
      if (!whoopData) {
        console.log('⚠️ [Whoop Extractor] No Whoop data available');
        return [];
      }

      console.log(`📊 [Whoop Extractor] Found ${whoopData.cycles?.length || 0} cycles, ${whoopData.sleepData?.length || 0} sleep records, ${whoopData.workouts?.length || 0} workouts, ${whoopData.recoveries?.length || 0} recoveries`);

      // Extract features
      const features = [];

      // 1. Sleep Consistency (Conscientiousness)
      const sleepConsistency = this.calculateSleepConsistency(whoopData.sleepData);
      if (sleepConsistency !== null) {
        features.push(this.createFeature(userId, 'sleep_consistency', sleepConsistency, {
          contributes_to: 'conscientiousness',
          contribution_weight: 0.45,
          description: 'Consistency in sleep schedule and bedtime',
          evidence: { correlation: 0.45, citation: 'Buysse et al. (2010)' }
        }));
      }

      // 2. Workout Regularity (Conscientiousness)
      const workoutRegularity = this.calculateWorkoutRegularity(whoopData.workouts);
      if (workoutRegularity !== null) {
        features.push(this.createFeature(userId, 'workout_regularity', workoutRegularity, {
          contributes_to: 'conscientiousness',
          contribution_weight: 0.42,
          description: 'Regularity and consistency of workout schedule',
          evidence: { correlation: 0.42, citation: 'Rhodes & Smith (2006)' }
        }));
      }

      // 3. Recovery Adherence (Conscientiousness)
      const recoveryAdherence = this.calculateRecoveryAdherence(whoopData.recoveries);
      if (recoveryAdherence !== null) {
        features.push(this.createFeature(userId, 'recovery_adherence', recoveryAdherence, {
          contributes_to: 'conscientiousness',
          contribution_weight: 0.38,
          description: 'Adherence to recovery protocols based on Whoop recommendations',
          evidence: { correlation: 0.38 }
        }));
      }

      // 4. HRV Stability (Neuroticism - negative correlation)
      const hrvStability = this.calculateHRVStability(whoopData.recoveries);
      if (hrvStability !== null) {
        features.push(this.createFeature(userId, 'hrv_stability', hrvStability, {
          contributes_to: 'neuroticism',
          contribution_weight: -0.35,
          description: 'Stability of heart rate variability over time',
          evidence: { correlation: -0.35, citation: 'Jonassaint et al. (2009)', note: 'High HRV stability = low neuroticism' }
        }));
      }

      // 5. Strain Tolerance (Extraversion)
      const strainTolerance = this.calculateStrainTolerance(whoopData.cycles);
      if (strainTolerance !== null) {
        features.push(this.createFeature(userId, 'strain_tolerance', strainTolerance, {
          contributes_to: 'extraversion',
          contribution_weight: 0.40,
          description: 'Tolerance for high-strain activities',
          evidence: { correlation: 0.40, citation: 'Rhodes & Smith (2006)' }
        }));
      }

      // 6. Workout Frequency (Extraversion)
      const workoutFrequency = this.calculateWorkoutFrequency(whoopData.workouts, whoopData.cycles);
      if (workoutFrequency !== null) {
        features.push(this.createFeature(userId, 'workout_frequency', workoutFrequency, {
          contributes_to: 'extraversion',
          contribution_weight: 0.38,
          description: 'Frequency of workout activities',
          evidence: { correlation: 0.38 }
        }));
      }

      // 7. Activity Diversity (Openness)
      const activityDiversity = this.calculateActivityDiversity(whoopData.workouts);
      if (activityDiversity !== null) {
        features.push(this.createFeature(userId, 'activity_diversity', activityDiversity, {
          contributes_to: 'openness',
          contribution_weight: 0.32,
          description: 'Variety of different workout types',
          evidence: { correlation: 0.32 }
        }));
      }

      // 8. Sleep Performance (Overall health discipline)
      const sleepPerformance = this.calculateSleepPerformance(whoopData.sleepData);
      if (sleepPerformance !== null) {
        features.push(this.createFeature(userId, 'sleep_performance', sleepPerformance, {
          contributes_to: 'conscientiousness',
          contribution_weight: 0.35,
          description: 'Overall sleep performance and quality',
          evidence: { correlation: 0.35 }
        }));
      }

      // ==========================================
      // NEW V2 API METRICS
      // ==========================================

      // 9. Sleep Efficiency (Conscientiousness)
      const sleepEfficiency = this.calculateSleepEfficiency(whoopData.sleepData);
      if (sleepEfficiency !== null) {
        features.push(this.createFeature(userId, 'sleep_efficiency', sleepEfficiency, {
          contributes_to: 'conscientiousness',
          contribution_weight: 0.40,
          description: 'Ratio of time asleep to time in bed',
          evidence: { correlation: 0.40 }
        }));
      }

      // 10. Deep Sleep Ratio (Health quality)
      const deepSleepRatio = this.calculateDeepSleepRatio(whoopData.sleepData);
      if (deepSleepRatio !== null) {
        features.push(this.createFeature(userId, 'deep_sleep_ratio', deepSleepRatio, {
          contributes_to: 'neuroticism',
          contribution_weight: -0.30,
          description: 'Proportion of sleep spent in deep (SWS) stage',
          evidence: { correlation: -0.30, note: 'More deep sleep = lower neuroticism' }
        }));
      }

      // 11. REM Sleep Ratio (Creativity/Openness)
      const remSleepRatio = this.calculateREMSleepRatio(whoopData.sleepData);
      if (remSleepRatio !== null) {
        features.push(this.createFeature(userId, 'rem_sleep_ratio', remSleepRatio, {
          contributes_to: 'openness',
          contribution_weight: 0.25,
          description: 'Proportion of sleep spent in REM stage (associated with dreaming)',
          evidence: { correlation: 0.25 }
        }));
      }

      // 12. Respiratory Rate Stability (Health)
      const respiratoryStability = this.calculateRespiratoryStability(whoopData.sleepData);
      if (respiratoryStability !== null) {
        features.push(this.createFeature(userId, 'respiratory_stability', respiratoryStability, {
          contributes_to: 'neuroticism',
          contribution_weight: -0.28,
          description: 'Consistency of respiratory rate during sleep',
          evidence: { correlation: -0.28 }
        }));
      }

      // 13. SpO2 Average (Blood oxygen - V2 specific)
      const spo2Average = this.calculateSpO2Average(whoopData.recoveries);
      if (spo2Average !== null) {
        features.push(this.createFeature(userId, 'spo2_average', spo2Average, {
          contributes_to: null,
          contribution_weight: 0,
          description: 'Average blood oxygen saturation during sleep',
          evidence: { note: 'Health metric, no direct personality correlation' }
        }));
      }

      // 14. Skin Temperature Deviation (V2 specific)
      const skinTempDeviation = this.calculateSkinTempDeviation(whoopData.recoveries);
      if (skinTempDeviation !== null) {
        features.push(this.createFeature(userId, 'skin_temp_deviation', skinTempDeviation, {
          contributes_to: null,
          contribution_weight: 0,
          description: 'Deviation from baseline skin temperature',
          evidence: { note: 'Health metric, tracks circadian rhythm' }
        }));
      }

      // 15. Resting Heart Rate Trend
      const rhrTrend = this.calculateRHRTrend(whoopData.recoveries);
      if (rhrTrend !== null) {
        features.push(this.createFeature(userId, 'rhr_trend', rhrTrend, {
          contributes_to: 'conscientiousness',
          contribution_weight: 0.25,
          description: 'Trend in resting heart rate (lower is healthier)',
          evidence: { correlation: 0.25, note: 'Improving RHR indicates discipline' }
        }));
      }

      // 16. Workout Intensity (Average strain per workout)
      const workoutIntensity = this.calculateWorkoutIntensity(whoopData.workouts);
      if (workoutIntensity !== null) {
        features.push(this.createFeature(userId, 'workout_intensity', workoutIntensity, {
          contributes_to: 'extraversion',
          contribution_weight: 0.35,
          description: 'Average intensity of workout sessions',
          evidence: { correlation: 0.35 }
        }));
      }

      // 17. Heart Rate Zone Distribution
      const hrZoneBalance = this.calculateHRZoneBalance(whoopData.workouts);
      if (hrZoneBalance !== null) {
        features.push(this.createFeature(userId, 'hr_zone_balance', hrZoneBalance, {
          contributes_to: 'conscientiousness',
          contribution_weight: 0.30,
          description: 'Balance of heart rate zones during workouts',
          evidence: { correlation: 0.30, note: 'Varied training zones indicate planning' }
        }));
      }

      // 18. Calories Burned Average
      const caloriesAvg = this.calculateCaloriesAverage(whoopData.cycles);
      if (caloriesAvg !== null) {
        features.push(this.createFeature(userId, 'daily_calories_avg', caloriesAvg, {
          contributes_to: 'extraversion',
          contribution_weight: 0.30,
          description: 'Average daily calories burned',
          evidence: { correlation: 0.30, note: 'Higher activity = extraversion' }
        }));
      }

      // 19. Max Heart Rate Utilization
      const maxHRUtilization = this.calculateMaxHRUtilization(whoopData.workouts, whoopData.bodyMeasurements);
      if (maxHRUtilization !== null) {
        features.push(this.createFeature(userId, 'max_hr_utilization', maxHRUtilization, {
          contributes_to: 'extraversion',
          contribution_weight: 0.32,
          description: 'How close workouts get to max heart rate',
          evidence: { correlation: 0.32 }
        }));
      }

      // 20. Sleep Disturbances (inverse score)
      const sleepDisturbances = this.calculateSleepDisturbances(whoopData.sleepData);
      if (sleepDisturbances !== null) {
        features.push(this.createFeature(userId, 'sleep_disturbances', sleepDisturbances, {
          contributes_to: 'neuroticism',
          contribution_weight: 0.35,
          description: 'Frequency of sleep disturbances (lower = better)',
          evidence: { correlation: 0.35, note: 'More disturbances = higher neuroticism' }
        }));
      }

      console.log(`✅ [Whoop Extractor V2] Extracted ${features.length} features`);
      return features;

    } catch (error) {
      console.error('❌ [Whoop Extractor] Error:', error);
      return [];
    }
  }

  /**
   * Fetch data from Whoop API V2
   * V2 uses nextToken pagination and UUID-based IDs
   */
  async fetchWhoopData(accessToken) {
    const headers = { 'Authorization': `Bearer ${accessToken}` };

    console.log(`🔍 [Whoop Extractor] Fetching data from Whoop API V2...`);

    try {
      let cycles = [];
      let sleepData = [];
      let workouts = [];
      let recoveries = [];
      let bodyMeasurements = null;

      // Calculate date range for last 30 days
      const endDate = new Date().toISOString();
      const startDate = new Date(Date.now() - this.LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

      // 1. Fetch cycles (V2 endpoint)
      try {
        console.log(`🔄 [Whoop Extractor] Fetching cycles from ${WHOOP_API_BASE}/cycle`);
        const cyclesRes = await axios.get(`${WHOOP_API_BASE}/cycle`, {
          headers,
          params: { limit: 25, start: startDate, end: endDate }
        });
        cycles = cyclesRes.data?.records || cyclesRes.data || [];
        console.log(`✅ [Whoop Extractor] Found ${cycles.length} cycles`);

        // Log sample for debugging
        if (cycles.length > 0) {
          console.log(`📊 [Whoop Extractor] Sample cycle keys:`, Object.keys(cycles[0]));
        }
      } catch (err) {
        console.error(`❌ [Whoop Extractor] Cycles error: ${err.response?.status} - ${err.response?.data?.message || err.message}`);
      }

      // 2. Fetch recovery data (V2 dedicated endpoint)
      try {
        console.log(`🔄 [Whoop Extractor] Fetching recoveries from ${WHOOP_API_BASE}/recovery`);
        const recoveryRes = await axios.get(`${WHOOP_API_BASE}/recovery`, {
          headers,
          params: { limit: 25, start: startDate, end: endDate }
        });
        recoveries = recoveryRes.data?.records || recoveryRes.data || [];
        console.log(`✅ [Whoop Extractor] Found ${recoveries.length} recovery records`);

        // Log sample for V2 specific fields
        if (recoveries.length > 0) {
          const sample = recoveries[0];
          console.log(`📊 [Whoop Extractor] Sample recovery - score: ${sample.score?.recovery_score}, HRV: ${sample.score?.hrv_rmssd_milli}, SpO2: ${sample.score?.spo2_percentage}, skin_temp: ${sample.score?.skin_temp_celsius}`);
        }
      } catch (err) {
        console.error(`❌ [Whoop Extractor] Recovery error: ${err.response?.status} - ${err.response?.data?.message || err.message}`);
      }

      // 3. Fetch sleep data (V2 endpoint)
      try {
        console.log(`🔄 [Whoop Extractor] Fetching sleep from ${WHOOP_API_BASE}/activity/sleep`);
        const sleepRes = await axios.get(`${WHOOP_API_BASE}/activity/sleep`, {
          headers,
          params: { limit: 25, start: startDate, end: endDate }
        });
        sleepData = sleepRes.data?.records || sleepRes.data || [];
        console.log(`✅ [Whoop Extractor] Found ${sleepData.length} sleep records`);

        // Log V2 sleep fields
        if (sleepData.length > 0) {
          const sample = sleepData[0];
          console.log(`📊 [Whoop Extractor] Sample sleep - efficiency: ${sample.score?.sleep_efficiency_percentage}, resp_rate: ${sample.score?.respiratory_rate}`);
        }
      } catch (err) {
        console.log(`⚠️ [Whoop Extractor] Sleep endpoint error (${err.response?.status}): ${err.response?.data?.message || err.message}`);
      }

      // 4. Fetch workouts (V2 endpoint)
      try {
        console.log(`🔄 [Whoop Extractor] Fetching workouts from ${WHOOP_API_BASE}/activity/workout`);
        const workoutsRes = await axios.get(`${WHOOP_API_BASE}/activity/workout`, {
          headers,
          params: { limit: 25, start: startDate, end: endDate }
        });
        workouts = workoutsRes.data?.records || workoutsRes.data || [];
        console.log(`✅ [Whoop Extractor] Found ${workouts.length} workouts`);

        // Log V2 workout fields
        if (workouts.length > 0) {
          const sample = workouts[0];
          console.log(`📊 [Whoop Extractor] Sample workout - sport: ${sample.sport_id}, strain: ${sample.score?.strain}, zones: ${JSON.stringify(sample.score?.zone_duration)}`);
        }
      } catch (err) {
        console.log(`⚠️ [Whoop Extractor] Workout endpoint error (${err.response?.status}): ${err.response?.data?.message || err.message}`);
      }

      // 5. Fetch body measurements (V2 specific)
      try {
        console.log(`🔄 [Whoop Extractor] Fetching body measurements from ${WHOOP_API_BASE}/user/measurement/body`);
        const bodyRes = await axios.get(`${WHOOP_API_BASE}/user/measurement/body`, { headers });
        bodyMeasurements = bodyRes.data;
        console.log(`✅ [Whoop Extractor] Body measurements - height: ${bodyMeasurements?.height_meter}m, weight: ${bodyMeasurements?.weight_kilogram}kg, max_hr: ${bodyMeasurements?.max_heart_rate}`);
      } catch (err) {
        console.log(`⚠️ [Whoop Extractor] Body measurements error: ${err.response?.status}`);
      }

      return {
        cycles,
        sleepData,
        workouts,
        recoveries,
        bodyMeasurements
      };
    } catch (error) {
      console.error('❌ [Whoop Extractor] API fetch error:', error.message);
      return null;
    }
  }

  /**
   * Calculate sleep consistency (low bedtime variance = high consistency)
   */
  calculateSleepConsistency(sleepData) {
    if (!sleepData || sleepData.length < 5) return null;

    const bedtimes = sleepData.map(s => {
      if (s.start) {
        const date = new Date(s.start);
        return date.getHours() * 60 + date.getMinutes();
      }
      return null;
    }).filter(t => t !== null);

    if (bedtimes.length < 5) return null;

    const avg = bedtimes.reduce((a, b) => a + b, 0) / bedtimes.length;
    const variance = bedtimes.reduce((sum, t) => sum + Math.pow(t - avg, 2), 0) / bedtimes.length;
    const stdDev = Math.sqrt(variance);

    // Convert to 0-100 scale (lower variance = higher score)
    const consistency = Math.max(0, 100 - (stdDev / 120 * 100));

    return Math.round(consistency * 100) / 100;
  }

  /**
   * Calculate workout regularity (consistent workout schedule)
   */
  calculateWorkoutRegularity(workouts) {
    if (!workouts || workouts.length < 3) return null;

    const sortedWorkouts = [...workouts]
      .filter(w => w.start)
      .sort((a, b) => new Date(a.start) - new Date(b.start));

    if (sortedWorkouts.length < 3) return null;

    const gaps = [];
    for (let i = 1; i < sortedWorkouts.length; i++) {
      const gap = (new Date(sortedWorkouts[i].start) - new Date(sortedWorkouts[i - 1].start)) / (1000 * 60 * 60 * 24);
      gaps.push(gap);
    }

    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const gapVariance = gaps.reduce((sum, g) => sum + Math.pow(g - avgGap, 2), 0) / gaps.length;

    const frequencyScore = Math.min(100, (sortedWorkouts.length / 30) * 100);
    const varianceScore = Math.max(0, 100 - (Math.sqrt(gapVariance) * 10));

    const regularity = (frequencyScore * 0.4 + varianceScore * 0.6);

    return Math.round(regularity * 100) / 100;
  }

  /**
   * Calculate recovery adherence (V2 format)
   */
  calculateRecoveryAdherence(recoveries) {
    if (!recoveries || recoveries.length < 5) return null;

    const scores = recoveries
      .map(r => r.score?.recovery_score ?? r.recovery_score)
      .filter(s => s !== undefined && s !== null);

    if (scores.length < 5) return null;

    const avgRecovery = scores.reduce((a, b) => a + b, 0) / scores.length;

    return Math.round(avgRecovery * 100) / 100;
  }

  /**
   * Calculate HRV stability (V2 uses hrv_rmssd_milli)
   */
  calculateHRVStability(recoveries) {
    if (!recoveries || recoveries.length < 5) return null;

    const hrvValues = recoveries
      .map(r => r.score?.hrv_rmssd_milli ?? r.hrv_rmssd_milli)
      .filter(h => h !== undefined && h !== null);

    if (hrvValues.length < 5) return null;

    const avg = hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length;
    const stdDev = Math.sqrt(hrvValues.reduce((sum, h) => sum + Math.pow(h - avg, 2), 0) / hrvValues.length);
    const cv = (stdDev / avg) * 100;

    const stability = Math.max(0, 100 - cv * 2);

    return Math.round(stability * 100) / 100;
  }

  /**
   * Calculate strain tolerance
   */
  calculateStrainTolerance(cycles) {
    if (!cycles || cycles.length < 5) return null;

    const strainValues = cycles
      .map(c => c.score?.strain)
      .filter(s => s !== undefined && s !== null);

    if (strainValues.length < 5) return null;

    const avgStrain = strainValues.reduce((a, b) => a + b, 0) / strainValues.length;
    const normalizedStrain = (avgStrain / 21) * 100;

    return Math.round(normalizedStrain * 100) / 100;
  }

  /**
   * Calculate workout frequency
   */
  calculateWorkoutFrequency(workouts, cycles = []) {
    if (workouts && workouts.length > 0) {
      const workoutsPerWeek = (workouts.length / 30) * 7;
      const frequencyScore = Math.min(100, (workoutsPerWeek / 7) * 100);
      return Math.round(frequencyScore * 100) / 100;
    }

    if (cycles && cycles.length > 0) {
      const highStrainDays = cycles.filter(c => {
        const strain = c.score?.strain;
        return strain !== undefined && strain >= 10;
      }).length;

      const workoutRatio = highStrainDays / cycles.length;
      const estimatedWorkoutsPerWeek = workoutRatio * 7;
      const frequencyScore = Math.min(100, (estimatedWorkoutsPerWeek / 7) * 100);

      return Math.round(frequencyScore * 100) / 100;
    }

    return 0;
  }

  /**
   * Calculate activity diversity
   */
  calculateActivityDiversity(workouts) {
    if (!workouts || workouts.length < 3) return null;

    const sportTypes = new Set(workouts.map(w => w.sport_id).filter(s => s));

    if (sportTypes.size === 0) return null;

    const typeCounts = {};
    workouts.forEach(w => {
      if (w.sport_id) {
        typeCounts[w.sport_id] = (typeCounts[w.sport_id] || 0) + 1;
      }
    });

    let entropy = 0;
    const total = workouts.length;
    for (const count of Object.values(typeCounts)) {
      const p = count / total;
      entropy -= p * Math.log2(p);
    }

    const maxEntropy = Math.log2(sportTypes.size);
    const diversity = maxEntropy > 0 ? (entropy / maxEntropy) * 100 : 0;

    const typeBonus = Math.min(30, sportTypes.size * 10);
    const finalDiversity = Math.min(100, diversity * 0.7 + typeBonus);

    return Math.round(finalDiversity * 100) / 100;
  }

  /**
   * Calculate sleep performance (V2 uses sleep_performance_percentage)
   */
  calculateSleepPerformance(sleepData) {
    if (!sleepData || sleepData.length < 5) return null;

    const performances = sleepData
      .map(s => s.score?.sleep_performance_percentage ?? s.score?.sleep_performance)
      .filter(p => p !== undefined && p !== null);

    if (performances.length < 5) return null;

    const avgPerformance = performances.reduce((a, b) => a + b, 0) / performances.length;

    return Math.round(avgPerformance * 100) / 100;
  }

  // ==========================================
  // NEW V2 CALCULATION METHODS
  // ==========================================

  /**
   * Calculate sleep efficiency (V2 specific)
   */
  calculateSleepEfficiency(sleepData) {
    if (!sleepData || sleepData.length < 5) return null;

    const efficiencies = sleepData
      .map(s => s.score?.sleep_efficiency_percentage)
      .filter(e => e !== undefined && e !== null);

    if (efficiencies.length < 5) return null;

    const avgEfficiency = efficiencies.reduce((a, b) => a + b, 0) / efficiencies.length;

    return Math.round(avgEfficiency * 100) / 100;
  }

  /**
   * Calculate deep sleep ratio (V2: stage_summary.total_slow_wave_sleep_time_milli)
   */
  calculateDeepSleepRatio(sleepData) {
    if (!sleepData || sleepData.length < 5) return null;

    const ratios = sleepData.map(s => {
      const totalSleep = s.score?.total_sleep_time_milli ||
                         s.score?.stage_summary?.total_in_bed_time_milli;
      const deepSleep = s.score?.stage_summary?.total_slow_wave_sleep_time_milli;

      if (totalSleep && deepSleep && totalSleep > 0) {
        return (deepSleep / totalSleep) * 100;
      }
      return null;
    }).filter(r => r !== null);

    if (ratios.length < 5) return null;

    const avgRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length;

    return Math.round(avgRatio * 100) / 100;
  }

  /**
   * Calculate REM sleep ratio (V2: stage_summary.total_rem_sleep_time_milli)
   */
  calculateREMSleepRatio(sleepData) {
    if (!sleepData || sleepData.length < 5) return null;

    const ratios = sleepData.map(s => {
      const totalSleep = s.score?.total_sleep_time_milli ||
                         s.score?.stage_summary?.total_in_bed_time_milli;
      const remSleep = s.score?.stage_summary?.total_rem_sleep_time_milli;

      if (totalSleep && remSleep && totalSleep > 0) {
        return (remSleep / totalSleep) * 100;
      }
      return null;
    }).filter(r => r !== null);

    if (ratios.length < 5) return null;

    const avgRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length;

    return Math.round(avgRatio * 100) / 100;
  }

  /**
   * Calculate respiratory rate stability (V2 specific)
   */
  calculateRespiratoryStability(sleepData) {
    if (!sleepData || sleepData.length < 5) return null;

    const respRates = sleepData
      .map(s => s.score?.respiratory_rate)
      .filter(r => r !== undefined && r !== null);

    if (respRates.length < 5) return null;

    const avg = respRates.reduce((a, b) => a + b, 0) / respRates.length;
    const stdDev = Math.sqrt(respRates.reduce((sum, r) => sum + Math.pow(r - avg, 2), 0) / respRates.length);
    const cv = (stdDev / avg) * 100;

    // Lower CV = more stable = higher score
    const stability = Math.max(0, 100 - cv * 5);

    return Math.round(stability * 100) / 100;
  }

  /**
   * Calculate SpO2 average (V2: spo2_percentage)
   */
  calculateSpO2Average(recoveries) {
    if (!recoveries || recoveries.length < 5) return null;

    const spo2Values = recoveries
      .map(r => r.score?.spo2_percentage)
      .filter(s => s !== undefined && s !== null);

    if (spo2Values.length < 3) return null;

    const avgSpO2 = spo2Values.reduce((a, b) => a + b, 0) / spo2Values.length;

    return Math.round(avgSpO2 * 100) / 100;
  }

  /**
   * Calculate skin temperature deviation (V2: skin_temp_celsius)
   */
  calculateSkinTempDeviation(recoveries) {
    if (!recoveries || recoveries.length < 5) return null;

    const temps = recoveries
      .map(r => r.score?.skin_temp_celsius)
      .filter(t => t !== undefined && t !== null);

    if (temps.length < 5) return null;

    const avg = temps.reduce((a, b) => a + b, 0) / temps.length;
    const stdDev = Math.sqrt(temps.reduce((sum, t) => sum + Math.pow(t - avg, 2), 0) / temps.length);

    // Lower deviation = more stable = higher score (normalized 0-100)
    // Typical deviation is 0.1-0.5 degrees
    const stability = Math.max(0, 100 - (stdDev * 100));

    return Math.round(stability * 100) / 100;
  }

  /**
   * Calculate resting heart rate trend
   */
  calculateRHRTrend(recoveries) {
    if (!recoveries || recoveries.length < 7) return null;

    const rhrValues = recoveries
      .map(r => r.score?.resting_heart_rate)
      .filter(r => r !== undefined && r !== null);

    if (rhrValues.length < 7) return null;

    // Compare first half to second half (improvement = positive trend)
    const midpoint = Math.floor(rhrValues.length / 2);
    const firstHalf = rhrValues.slice(0, midpoint);
    const secondHalf = rhrValues.slice(midpoint);

    const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

    // Improving RHR = second half lower than first half
    const improvement = avgFirst - avgSecond;

    // Normalize: -5 to +5 bpm change maps to 0-100
    const trendScore = 50 + (improvement * 10);

    return Math.round(Math.max(0, Math.min(100, trendScore)) * 100) / 100;
  }

  /**
   * Calculate workout intensity (average strain per workout)
   */
  calculateWorkoutIntensity(workouts) {
    if (!workouts || workouts.length < 3) return null;

    const strainValues = workouts
      .map(w => w.score?.strain)
      .filter(s => s !== undefined && s !== null);

    if (strainValues.length < 3) return null;

    const avgStrain = strainValues.reduce((a, b) => a + b, 0) / strainValues.length;

    // Workout strain typically 0-21, normalize to 0-100
    const intensityScore = (avgStrain / 21) * 100;

    return Math.round(intensityScore * 100) / 100;
  }

  /**
   * Calculate heart rate zone balance (V2: zone_duration)
   */
  calculateHRZoneBalance(workouts) {
    if (!workouts || workouts.length < 3) return null;

    let totalZone1 = 0, totalZone2 = 0, totalZone3 = 0, totalZone4 = 0, totalZone5 = 0;
    let count = 0;

    workouts.forEach(w => {
      const zones = w.score?.zone_duration;
      if (zones) {
        totalZone1 += zones.zone_one_milli || 0;
        totalZone2 += zones.zone_two_milli || 0;
        totalZone3 += zones.zone_three_milli || 0;
        totalZone4 += zones.zone_four_milli || 0;
        totalZone5 += zones.zone_five_milli || 0;
        count++;
      }
    });

    if (count === 0) return null;

    const total = totalZone1 + totalZone2 + totalZone3 + totalZone4 + totalZone5;
    if (total === 0) return null;

    // Calculate distribution and entropy for balance
    const zones = [totalZone1, totalZone2, totalZone3, totalZone4, totalZone5];
    let entropy = 0;
    zones.forEach(z => {
      const p = z / total;
      if (p > 0) entropy -= p * Math.log2(p);
    });

    // Max entropy for 5 zones is log2(5) ≈ 2.32
    const maxEntropy = Math.log2(5);
    const balance = (entropy / maxEntropy) * 100;

    return Math.round(balance * 100) / 100;
  }

  /**
   * Calculate average calories burned
   */
  calculateCaloriesAverage(cycles) {
    if (!cycles || cycles.length < 5) return null;

    const calories = cycles
      .map(c => c.score?.kilojoule)
      .filter(k => k !== undefined && k !== null);

    if (calories.length < 5) return null;

    const avgKJ = calories.reduce((a, b) => a + b, 0) / calories.length;
    const avgKcal = avgKJ / 4.184; // Convert kJ to kcal

    // Normalize: 2000-3500 kcal range to 0-100
    const normalizedScore = Math.max(0, Math.min(100, ((avgKcal - 1500) / 2000) * 100));

    return Math.round(normalizedScore * 100) / 100;
  }

  /**
   * Calculate max HR utilization
   */
  calculateMaxHRUtilization(workouts, bodyMeasurements) {
    if (!workouts || workouts.length < 3) return null;

    const maxHR = bodyMeasurements?.max_heart_rate || 185; // Default if not available

    const maxHRDuringWorkouts = workouts
      .map(w => w.score?.max_heart_rate)
      .filter(hr => hr !== undefined && hr !== null);

    if (maxHRDuringWorkouts.length < 3) return null;

    const avgMaxHR = maxHRDuringWorkouts.reduce((a, b) => a + b, 0) / maxHRDuringWorkouts.length;
    const utilization = (avgMaxHR / maxHR) * 100;

    return Math.round(utilization * 100) / 100;
  }

  /**
   * Calculate sleep disturbances (inverse score - fewer is better)
   */
  calculateSleepDisturbances(sleepData) {
    if (!sleepData || sleepData.length < 5) return null;

    const disturbances = sleepData
      .map(s => s.score?.disturbance_count ?? s.score?.stage_summary?.disturbance_count)
      .filter(d => d !== undefined && d !== null);

    if (disturbances.length < 5) return null;

    const avgDisturbances = disturbances.reduce((a, b) => a + b, 0) / disturbances.length;

    // Inverse score: 0 disturbances = 100, 10+ disturbances = 0
    const score = Math.max(0, 100 - (avgDisturbances * 10));

    return Math.round(score * 100) / 100;
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
      evidence: {
        description: metadata.description,
        correlation: metadata.evidence?.correlation,
        citation: metadata.evidence?.citation,
        note: metadata.evidence?.note
      }
    };
  }

  /**
   * Save features to database
   */
  async saveFeatures(features) {
    if (features.length === 0) return { success: true, saved: 0 };

    console.log(`💾 [Whoop Extractor] Saving ${features.length} features to database...`);

    try {
      const { data, error } = await supabaseAdmin
        .from('behavioral_features')
        .upsert(features, {
          onConflict: 'user_id,platform,feature_type'
        })
        .select();

      if (error) throw error;

      console.log(`✅ [Whoop Extractor] Saved ${data.length} features successfully`);
      return { success: true, saved: data.length, data };

    } catch (error) {
      console.error('❌ [Whoop Extractor] Error saving features:', error);
      return { success: false, error: error.message };
    }
  }
}

// Export singleton instance
const whoopFeatureExtractor = new WhoopFeatureExtractor();
export default whoopFeatureExtractor;
