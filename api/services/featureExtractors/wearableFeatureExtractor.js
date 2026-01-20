/**
 * Wearable Feature Extractor
 *
 * Extracts personality-relevant features from wearable data
 * and maps them to Big Five personality traits for the Soul Signature.
 *
 * Data sources: activities, sleep, daily summaries, heart rate
 * Traits mapped: Conscientiousness, Neuroticism, Extraversion
 */

import { supabaseAdmin } from '../../config/supabase.js';

class WearableFeatureExtractor {
  /**
   * Extract personality-relevant features from wearable data
   * @param {string} userId - TwinMe user ID
   * @returns {Object|null} Extracted features or null if no data
   */
  async extractFeatures(userId) {
    const data = await this.getRecentData(userId, 30);

    // Check if we have enough data
    if (!data.daily.length && !data.workouts.length && !data.sleep.length) {
      console.log('[WearableFeatures] No wearable data available for user:', userId);
      return null;
    }

    console.log('[WearableFeatures] Extracting features from:', {
      daily: data.daily.length,
      workouts: data.workouts.length,
      sleep: data.sleep.length,
      heartRate: data.heartRate.length
    });

    return {
      // Activity patterns -> Conscientiousness
      activityConsistency: this.calculateConsistency(data.daily, 'steps'),
      workoutRegularity: this.calculateWorkoutFrequency(data.workouts),

      // Sleep patterns -> Conscientiousness + Neuroticism
      sleepConsistency: this.calculateConsistency(data.sleep, 'duration'),
      sleepQuality: this.calculateAverage(data.sleep, 'efficiency'),
      averageSleepDuration: this.calculateAverage(data.sleep, 'duration'),

      // Heart metrics -> Neuroticism (inverse) + stress indicators
      restingHeartRate: this.calculateAverage(data.daily, 'resting_hr'),
      hrvVariability: this.calculateHRVTrend(data.heartRate),
      heartRateVariability: this.calculateHRVAverage(data.heartRate),

      // Activity intensity -> Extraversion
      activityIntensity: this.calculateAverageIntensity(data.workouts),
      weeklyActiveMinutes: this.calculateWeeklyActiveMinutes(data.daily),

      // Additional metrics
      averageSteps: this.calculateAverage(data.daily, 'steps'),
      caloriesBurned: this.calculateAverage(data.daily, 'calories')
    };
  }

  /**
   * Get recent wearable data from database
   */
  async getRecentData(userId, days) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data: rawData, error } = await supabaseAdmin
      .from('user_platform_data')
      .select('*')
      .eq('user_id', userId)
      .eq('platform', 'wearable')
      .gte('extracted_at', startDate);

    if (error) {
      console.error('[WearableFeatures] Error fetching data:', error);
      return { daily: [], workouts: [], sleep: [], heartRate: [] };
    }

    return {
      daily: rawData?.filter(d => d.data_type === 'daily_summary').map(d => d.raw_data) || [],
      workouts: rawData?.filter(d => d.data_type === 'workout').map(d => d.raw_data) || [],
      sleep: rawData?.filter(d => d.data_type === 'sleep').map(d => d.raw_data) || [],
      heartRate: rawData?.filter(d => d.data_type === 'heart_rate').map(d => d.raw_data) || []
    };
  }

  /**
   * Calculate consistency score (lower coefficient of variation = higher consistency)
   */
  calculateConsistency(data, field) {
    if (!data.length) return 0;

    const values = data.map(d => d[field]).filter(v => v != null && v > 0);
    if (values.length < 7) return 0; // Need at least a week of data

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    if (mean === 0) return 0;

    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    const cv = stdDev / mean; // Coefficient of variation

    // Lower CV = higher consistency (score 0-1)
    // CV of 0.2 (20%) = 0.8 consistency, CV of 0.5 (50%) = 0.5 consistency
    return Math.max(0, Math.min(1, 1 - cv));
  }

  /**
   * Calculate workout frequency score
   */
  calculateWorkoutFrequency(workouts) {
    if (!workouts.length) return 0;

    // Assuming 30 days of data, ideal is 4+ workouts/week = 17+ total
    const idealWorkouts = 17;
    return Math.min(1, workouts.length / idealWorkouts);
  }

  /**
   * Calculate average of a field
   */
  calculateAverage(data, field) {
    const values = data.map(d => d[field]).filter(v => v != null && v > 0);
    if (!values.length) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  /**
   * Calculate HRV trend (normalized)
   */
  calculateHRVTrend(heartRateData) {
    // Higher HRV = better recovery/lower stress
    const hrvValues = heartRateData
      .map(d => d.hrv || d.hrv_rmssd || d.avg_hrv)
      .filter(v => v != null && v > 0);

    if (!hrvValues.length) return 0;

    const avgHrv = hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length;

    // Normalize: 20-100ms HRV range, higher is better
    return Math.min(1, Math.max(0, (avgHrv - 20) / 80));
  }

  /**
   * Calculate raw HRV average
   */
  calculateHRVAverage(heartRateData) {
    const hrvValues = heartRateData
      .map(d => d.hrv || d.hrv_rmssd || d.avg_hrv)
      .filter(v => v != null && v > 0);

    if (!hrvValues.length) return 0;
    return hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length;
  }

  /**
   * Calculate average workout intensity
   */
  calculateAverageIntensity(workouts) {
    if (!workouts.length) return 0;

    const intensities = workouts.map(w => {
      // Use heart rate as primary intensity indicator
      const maxHR = 220 - (w.age || 30); // Estimate max HR
      const hrIntensity = w.avg_heart_rate ? w.avg_heart_rate / maxHR : 0;

      // Also consider duration (longer = more committed)
      const durationMinutes = w.duration ? w.duration / 60 : (w.duration_seconds ? w.duration_seconds / 60 : 0);
      const durationIntensity = Math.min(1, durationMinutes / 60); // 60 min = max

      // Weight heart rate more if available
      if (w.avg_heart_rate) {
        return hrIntensity * 0.6 + durationIntensity * 0.4;
      }
      return durationIntensity;
    });

    return intensities.reduce((a, b) => a + b, 0) / intensities.length;
  }

  /**
   * Calculate weekly active minutes average
   */
  calculateWeeklyActiveMinutes(dailyData) {
    if (!dailyData.length) return 0;

    const totalActiveMinutes = dailyData.reduce((sum, d) => {
      const minutes = d.active_minutes || d.activeMinutes || d.activity_minutes || 0;
      return sum + minutes;
    }, 0);

    // Convert to weekly average
    const weeks = dailyData.length / 7;
    return weeks > 0 ? totalActiveMinutes / weeks : 0;
  }

  /**
   * Map extracted features to Big Five personality traits
   * @param {Object} features - Extracted features from extractFeatures()
   * @returns {Object|null} Personality trait scores
   */
  mapToPersonality(features) {
    if (!features) return null;

    return {
      conscientiousness: {
        score: this.weightedScore([
          { value: features.activityConsistency, weight: 0.35 },
          { value: features.workoutRegularity, weight: 0.3 },
          { value: features.sleepConsistency, weight: 0.35 }
        ]),
        confidence: this.calculateConfidence([
          features.activityConsistency,
          features.workoutRegularity,
          features.sleepConsistency
        ]),
        evidence: ['Activity patterns', 'Sleep regularity', 'Workout consistency'],
        insights: this.getConscientiousnessInsights(features)
      },
      neuroticism: {
        score: this.weightedScore([
          { value: 1 - features.hrvVariability, weight: 0.5 },
          { value: 1 - (features.sleepQuality || 0.5), weight: 0.5 }
        ]),
        confidence: this.calculateConfidence([features.hrvVariability, features.sleepQuality]),
        evidence: ['HRV patterns', 'Sleep quality'],
        insights: this.getNeuroticismInsights(features)
      },
      extraversion: {
        score: this.weightedScore([
          { value: features.workoutRegularity, weight: 0.4 },
          { value: features.activityIntensity, weight: 0.6 }
        ]),
        confidence: this.calculateConfidence([features.workoutRegularity, features.activityIntensity]),
        evidence: ['Workout frequency', 'Activity intensity'],
        insights: this.getExtraversionInsights(features)
      }
    };
  }

  /**
   * Calculate weighted score
   */
  weightedScore(items) {
    const validItems = items.filter(i => i.value != null && !isNaN(i.value));
    if (!validItems.length) return 0.5; // Default to neutral

    const totalWeight = validItems.reduce((sum, i) => sum + i.weight, 0);
    return validItems.reduce((sum, i) => sum + i.value * i.weight, 0) / totalWeight;
  }

  /**
   * Calculate confidence based on data availability
   */
  calculateConfidence(values) {
    const validValues = values.filter(v => v != null && v > 0);
    if (!validValues.length) return 0;
    // More data points = higher confidence, max 0.8
    return Math.min(0.8, validValues.length * 0.25);
  }

  /**
   * Generate insights for conscientiousness
   */
  getConscientiousnessInsights(features) {
    const insights = [];

    if (features.activityConsistency > 0.7) {
      insights.push('Highly consistent daily activity patterns');
    } else if (features.activityConsistency < 0.3) {
      insights.push('Variable activity levels day-to-day');
    }

    if (features.sleepConsistency > 0.7) {
      insights.push('Regular sleep schedule');
    }

    if (features.workoutRegularity > 0.7) {
      insights.push('Dedicated exercise routine');
    }

    return insights;
  }

  /**
   * Generate insights for neuroticism
   */
  getNeuroticismInsights(features) {
    const insights = [];

    if (features.hrvVariability > 0.7) {
      insights.push('Good stress recovery indicators');
    } else if (features.hrvVariability < 0.3) {
      insights.push('May benefit from stress management');
    }

    if (features.sleepQuality > 0.7) {
      insights.push('High quality sleep patterns');
    }

    return insights;
  }

  /**
   * Generate insights for extraversion
   */
  getExtraversionInsights(features) {
    const insights = [];

    if (features.activityIntensity > 0.7) {
      insights.push('High-energy workout style');
    }

    if (features.workoutRegularity > 0.7 && features.activityIntensity > 0.5) {
      insights.push('Active, energetic lifestyle');
    }

    return insights;
  }

  /**
   * Get a summary of wearable-derived personality traits
   */
  async getPersonalitySummary(userId) {
    const features = await this.extractFeatures(userId);
    const personality = this.mapToPersonality(features);

    if (!personality) {
      return {
        available: false,
        message: 'Connect a wearable device to unlock health-based personality insights'
      };
    }

    return {
      available: true,
      features,
      personality,
      dataSource: 'wearable',
      lastUpdated: new Date().toISOString()
    };
  }
}

export default new WearableFeatureExtractor();
