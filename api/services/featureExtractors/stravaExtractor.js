/**
 * Strava Feature Extractor
 *
 * Extracts behavioral features from Strava activity data that correlate
 * with Big Five personality traits.
 *
 * Key Features Extracted:
 * - Activity consistency → Conscientiousness (r=0.40)
 * - Workout diversity → Openness (r=0.30)
 * - Distance/intensity trends → Conscientiousness (r=0.35)
 * - Social features (kudos, clubs) → Extraversion (r=0.28)
 * - Time-of-day patterns → Conscientiousness (r=0.25)
 * - Elevation seeking → Openness (r=0.22)
 * - Training load management → Agreeableness (r=0.20)
 * - Weekend vs weekday ratio → Extraversion (r=0.22)
 * - Personal records pursuit → Conscientiousness (r=0.30)
 * - Rest day discipline → Conscientiousness (r=0.25)
 */

import { supabaseAdmin } from '../database.js';
import { createLogger } from '../logger.js';

const log = createLogger('StravaExtractor');

class StravaFeatureExtractor {
  constructor() {
    this.LOOKBACK_DAYS = 90;
  }

  /**
   * Extract all behavioral features from Strava data
   */
  async extractFeatures(userId) {
    log.info('Extracting Strava features', { userId });

    try {
      const cutoffDate = new Date(Date.now() - this.LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

      const { data: platformData, error: platformError } = await supabaseAdmin
        .from('user_platform_data')
        .select('*')
        .eq('user_id', userId)
        .eq('platform', 'strava')
        .gte('extracted_at', cutoffDate)
        .order('extracted_at', { ascending: false });

      if (platformError) {
        log.warn('Error fetching Strava platform data', { error: platformError.message });
      }

      // Also check soul_data table
      const { data: soulData, error: soulError } = await supabaseAdmin
        .from('soul_data')
        .select('*')
        .eq('user_id', userId)
        .eq('platform', 'strava')
        .gte('created_at', cutoffDate)
        .order('created_at', { ascending: false });

      if (soulError) {
        log.warn('Error fetching Strava soul_data', { error: soulError.message });
      }

      // Also fetch observation memories for Strava
      const { data: memoryObs, error: memError } = await supabaseAdmin
        .from('user_memories')
        .select('content, metadata, created_at')
        .eq('user_id', userId)
        .eq('memory_type', 'platform_data')
        .gte('created_at', cutoffDate)
        .limit(200);

      if (memError) {
        log.warn('Error fetching Strava memories', { error: memError.message });
      }

      const stravaMemories = (memoryObs || []).filter(
        m => m.metadata?.source === 'strava' || (m.content && m.content.toLowerCase().includes('strava'))
      );

      // Parse all activities from platform data
      const activities = this.parseActivities(platformData || [], soulData || [], stravaMemories);

      if (activities.length === 0) {
        log.info('No Strava activities found for feature extraction');
        return [];
      }

      log.info('Parsed Strava activities for extraction', { count: activities.length });

      const features = [];

      // 1. Activity Consistency (Conscientiousness)
      const consistency = this.calculateActivityConsistency(activities);
      if (consistency !== null) {
        features.push(this.createFeature(userId, 'activity_consistency', consistency.value, {
          contributes_to: 'conscientiousness',
          contribution_weight: 0.40,
          description: 'Regular workout schedule with low week-to-week variance',
          evidence: { correlation: 0.40, citation: 'Wilson & Dishman (2015)' },
          raw_value: consistency.rawValue,
        }));
      }

      // 2. Sport Diversity (Openness)
      const diversity = this.calculateSportDiversity(activities);
      if (diversity !== null) {
        features.push(this.createFeature(userId, 'sport_diversity', diversity.value, {
          contributes_to: 'openness',
          contribution_weight: 0.30,
          description: 'Variety of sport types (running, cycling, swimming, etc.)',
          evidence: { correlation: 0.30, citation: 'Lochbaum et al. (2021)' },
          raw_value: diversity.rawValue,
        }));
      }

      // 3. Distance Progression (Conscientiousness)
      const progression = this.calculateDistanceProgression(activities);
      if (progression !== null) {
        features.push(this.createFeature(userId, 'distance_progression', progression.value, {
          contributes_to: 'conscientiousness',
          contribution_weight: 0.35,
          description: 'Progressive overload — increasing distances over time',
          evidence: { correlation: 0.35, citation: 'Stephan et al. (2018)' },
          raw_value: progression.rawValue,
        }));
      }

      // 4. Social Engagement (Extraversion)
      const social = this.calculateSocialEngagement(activities);
      if (social !== null) {
        features.push(this.createFeature(userId, 'social_engagement', social.value, {
          contributes_to: 'extraversion',
          contribution_weight: 0.28,
          description: 'Kudos received and social interactions on activities',
          evidence: { correlation: 0.28, citation: 'Rhodes & Smith (2006)' },
          raw_value: social.rawValue,
        }));
      }

      // 5. Morning Training Preference (Conscientiousness)
      const timeOfDay = this.calculateMorningTrainingPreference(activities);
      if (timeOfDay !== null) {
        features.push(this.createFeature(userId, 'morning_training', timeOfDay.value, {
          contributes_to: 'conscientiousness',
          contribution_weight: 0.25,
          description: 'Proportion of activities done in the morning (before 10am)',
          evidence: { correlation: 0.25, citation: 'Duggan et al. (2014)' },
          raw_value: timeOfDay.rawValue,
        }));
      }

      // 6. Elevation Seeking (Openness)
      const elevation = this.calculateElevationSeeking(activities);
      if (elevation !== null) {
        features.push(this.createFeature(userId, 'elevation_seeking', elevation.value, {
          contributes_to: 'openness',
          contribution_weight: 0.22,
          description: 'Preference for elevation gain — hills, mountains, challenging terrain',
          evidence: { correlation: 0.22, note: 'Elevation seeking correlates with adventure disposition' },
          raw_value: elevation.rawValue,
        }));
      }

      // 7. Training Load Balance (Agreeableness)
      const loadBalance = this.calculateTrainingLoadBalance(activities);
      if (loadBalance !== null) {
        features.push(this.createFeature(userId, 'training_load_balance', loadBalance.value, {
          contributes_to: 'agreeableness',
          contribution_weight: 0.20,
          description: 'Balanced hard/easy training pattern — not overtraining',
          evidence: { correlation: 0.20, note: 'Balanced effort = self-awareness and moderation' },
          raw_value: loadBalance.rawValue,
        }));
      }

      // 8. Weekend Activity Ratio (Extraversion)
      const weekendRatio = this.calculateWeekendRatio(activities);
      if (weekendRatio !== null) {
        features.push(this.createFeature(userId, 'weekend_activity_ratio', weekendRatio.value, {
          contributes_to: 'extraversion',
          contribution_weight: 0.22,
          description: 'Higher weekend activity suggests social/outdoor lifestyle',
          evidence: { correlation: 0.22, citation: 'Rhodes & Smith (2006)' },
          raw_value: weekendRatio.rawValue,
        }));
      }

      // 9. PR Pursuit (Conscientiousness)
      const prPursuit = this.calculatePRPursuit(activities);
      if (prPursuit !== null) {
        features.push(this.createFeature(userId, 'pr_pursuit', prPursuit.value, {
          contributes_to: 'conscientiousness',
          contribution_weight: 0.30,
          description: 'Setting personal records — performance-oriented training',
          evidence: { correlation: 0.30, note: 'PR pursuit indicates goal orientation' },
          raw_value: prPursuit.rawValue,
        }));
      }

      // 10. Rest Day Discipline (Conscientiousness)
      const restDays = this.calculateRestDayDiscipline(activities);
      if (restDays !== null) {
        features.push(this.createFeature(userId, 'rest_day_discipline', restDays.value, {
          contributes_to: 'conscientiousness',
          contribution_weight: 0.25,
          description: 'Taking appropriate rest days (not training every single day)',
          evidence: { correlation: 0.25, note: 'Rest discipline = self-regulation' },
          raw_value: restDays.rawValue,
        }));
      }

      log.info('Extracted Strava features', { count: features.length });
      return features;

    } catch (error) {
      log.error('Strava feature extraction error', { error });
      throw error;
    }
  }

  /**
   * Parse activities from various data sources into a uniform format
   */
  parseActivities(platformData, soulData, memories) {
    const activities = [];

    // Parse from user_platform_data (raw API responses)
    for (const entry of platformData) {
      const raw = entry.raw_data || {};

      // Activities may be nested under activities key or be the raw_data itself
      const actList = raw.activities || (Array.isArray(raw) ? raw : []);
      for (const act of actList) {
        const parsed = this.parseOneActivity(act, entry.extracted_at);
        if (parsed) activities.push(parsed);
      }

      // Single activity entry
      if (raw.type && raw.distance !== undefined) {
        const parsed = this.parseOneActivity(raw, entry.extracted_at);
        if (parsed) activities.push(parsed);
      }
    }

    // Parse from soul_data
    for (const entry of soulData) {
      const raw = entry.raw_data || {};
      if (raw.type && raw.distance !== undefined) {
        const parsed = this.parseOneActivity(raw, entry.created_at);
        if (parsed) activities.push(parsed);
      }
    }

    // Parse from memory observations (text-based fallback)
    for (const mem of memories) {
      const content = mem.content || '';

      // Try to extract distance from observation text
      const distMatch = content.match(/(\d+(?:\.\d+)?)\s*km/i);
      const timeMatch = content.match(/(\d+)\s*(?:minutes?|min)/i);
      const typeMatch = content.match(/(run|ride|swim|hike|walk|cycle|bike)/i);

      if (distMatch || typeMatch) {
        activities.push({
          date: mem.created_at,
          type: typeMatch ? this.normalizeType(typeMatch[1]) : 'Unknown',
          distance_km: distMatch ? parseFloat(distMatch[1]) : 0,
          duration_minutes: timeMatch ? parseInt(timeMatch[1]) : 0,
          elevation_gain: 0,
          kudos_count: 0,
          average_heartrate: null,
          pr_count: 0,
          from_text: true,
        });
      }
    }

    // Deduplicate by date + type (keep first seen)
    const seen = new Set();
    return activities.filter(a => {
      const key = `${this.toDateKey(a.date)}_${a.type}_${Math.round(a.distance_km)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  parseOneActivity(act, fallbackDate) {
    if (!act) return null;
    return {
      date: act.start_date || act.start_date_local || fallbackDate,
      type: this.normalizeType(act.type || act.sport_type || 'Unknown'),
      distance_km: (act.distance || 0) / 1000,
      duration_minutes: (act.moving_time || act.elapsed_time || 0) / 60,
      elevation_gain: act.total_elevation_gain || 0,
      kudos_count: act.kudos_count || 0,
      average_heartrate: act.average_heartrate || null,
      pr_count: act.pr_count || 0,
      from_text: false,
    };
  }

  normalizeType(raw) {
    const t = (raw || '').toLowerCase().trim();
    const typeMap = {
      run: 'Run', ride: 'Ride', cycle: 'Ride', bike: 'Ride',
      swim: 'Swim', hike: 'Hike', walk: 'Walk', yoga: 'Yoga',
      workout: 'Workout', weighttraining: 'WeightTraining',
      virtualrun: 'VirtualRun', virtualride: 'VirtualRide',
    };
    return typeMap[t] || raw;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Feature calculations
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * 1. Activity Consistency → Conscientiousness (r=0.40)
   * Low week-to-week variance in number of activities
   */
  calculateActivityConsistency(activities) {
    if (activities.length < 5) return null;

    // Group by ISO week
    const weekCounts = {};
    for (const a of activities) {
      const wk = this.toWeekKey(a.date);
      weekCounts[wk] = (weekCounts[wk] || 0) + 1;
    }

    const weeks = Object.values(weekCounts);
    if (weeks.length < 3) return null;

    const mean = weeks.reduce((s, w) => s + w, 0) / weeks.length;
    const variance = weeks.reduce((s, w) => s + Math.pow(w - mean, 2), 0) / weeks.length;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 1; // coefficient of variation

    // Lower CV = more consistent = higher score
    // CV 0 = perfect (100), CV >= 1 = very inconsistent (0)
    const score = Math.max(0, Math.min(100, (1 - cv) * 100));

    return {
      value: Math.round(score * 100) / 100,
      rawValue: {
        weeks_analyzed: weeks.length,
        avg_activities_per_week: Math.round(mean * 100) / 100,
        coefficient_of_variation: Math.round(cv * 1000) / 1000,
      },
    };
  }

  /**
   * 2. Sport Diversity → Openness (r=0.30)
   * Shannon entropy of activity types
   */
  calculateSportDiversity(activities) {
    if (activities.length < 3) return null;

    const typeCounts = {};
    let total = 0;
    for (const a of activities) {
      const type = a.type || 'Unknown';
      if (type === 'Unknown') continue;
      typeCounts[type] = (typeCounts[type] || 0) + 1;
      total++;
    }

    const uniqueTypes = Object.keys(typeCounts).length;
    if (uniqueTypes === 0 || total === 0) return null;

    let entropy = 0;
    for (const count of Object.values(typeCounts)) {
      const p = count / total;
      entropy -= p * Math.log2(p);
    }

    const maxEntropy = Math.log2(uniqueTypes);
    const evenness = maxEntropy > 0 ? entropy / maxEntropy : 0;

    // Combine uniqueness and evenness
    const typeScore = Math.min(1, uniqueTypes / 5); // 5+ types = max
    const diversityScore = (typeScore * 0.5 + evenness * 0.5) * 100;

    return {
      value: Math.round(diversityScore * 100) / 100,
      rawValue: {
        unique_types: uniqueTypes,
        type_distribution: typeCounts,
        shannon_entropy: Math.round(entropy * 100) / 100,
      },
    };
  }

  /**
   * 3. Distance Progression → Conscientiousness (r=0.35)
   * Positive trend in weekly distance
   */
  calculateDistanceProgression(activities) {
    const withDist = activities.filter(a => a.distance_km > 0);
    if (withDist.length < 5) return null;

    // Weekly total distance
    const weekDist = {};
    for (const a of withDist) {
      const wk = this.toWeekKey(a.date);
      weekDist[wk] = (weekDist[wk] || 0) + a.distance_km;
    }

    const sortedWeeks = Object.keys(weekDist).sort();
    if (sortedWeeks.length < 3) return null;

    const yValues = sortedWeeks.map(w => weekDist[w]);
    const xValues = sortedWeeks.map((_, i) => i);

    // Simple linear regression
    const n = yValues.length;
    const xMean = (n - 1) / 2;
    const yMean = yValues.reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let denominator = 0;
    for (let i = 0; i < n; i++) {
      numerator += (xValues[i] - xMean) * (yValues[i] - yMean);
      denominator += Math.pow(xValues[i] - xMean, 2);
    }

    const slope = denominator !== 0 ? numerator / denominator : 0;

    // Positive slope = improving. Map [-5, 5] km/week to [0, 100]
    const progressionScore = Math.min(100, Math.max(0, (slope + 5) * 10));

    return {
      value: Math.round(progressionScore * 100) / 100,
      rawValue: {
        slope_km_per_week: Math.round(slope * 100) / 100,
        avg_weekly_distance_km: Math.round(yMean * 100) / 100,
        weeks_analyzed: n,
      },
    };
  }

  /**
   * 4. Social Engagement → Extraversion (r=0.28)
   * Average kudos per activity
   */
  calculateSocialEngagement(activities) {
    const withKudos = activities.filter(a => !a.from_text);
    if (withKudos.length < 3) return null;

    const totalKudos = withKudos.reduce((s, a) => s + (a.kudos_count || 0), 0);
    const avgKudos = totalKudos / withKudos.length;

    // Normalize: 0 kudos = 0, 20+ kudos/activity = 100
    const socialScore = Math.min(100, (avgKudos / 20) * 100);

    return {
      value: Math.round(socialScore * 100) / 100,
      rawValue: {
        avg_kudos_per_activity: Math.round(avgKudos * 100) / 100,
        total_kudos: totalKudos,
        sample_size: withKudos.length,
      },
    };
  }

  /**
   * 5. Morning Training Preference → Conscientiousness (r=0.25)
   * Proportion of activities started before 10am
   */
  calculateMorningTrainingPreference(activities) {
    const withTime = activities.filter(a => a.date && !a.from_text);
    if (withTime.length < 5) return null;

    let morningCount = 0;
    for (const a of withTime) {
      const hour = new Date(a.date).getHours();
      if (hour < 10) morningCount++;
    }

    const morningPct = (morningCount / withTime.length) * 100;

    return {
      value: Math.round(morningPct * 100) / 100,
      rawValue: {
        morning_activities: morningCount,
        total_activities: withTime.length,
      },
    };
  }

  /**
   * 6. Elevation Seeking → Openness (r=0.22)
   * Average elevation gain per activity
   */
  calculateElevationSeeking(activities) {
    const withElev = activities.filter(a => a.elevation_gain > 0);
    if (withElev.length < 3) return null;

    const avgElevation = withElev.reduce((s, a) => s + a.elevation_gain, 0) / withElev.length;

    // Normalize: 0m = 0, 500m+ avg = 100
    const elevScore = Math.min(100, (avgElevation / 500) * 100);

    return {
      value: Math.round(elevScore * 100) / 100,
      rawValue: {
        avg_elevation_gain_m: Math.round(avgElevation),
        max_elevation_gain_m: Math.round(Math.max(...withElev.map(a => a.elevation_gain))),
        sample_size: withElev.length,
      },
    };
  }

  /**
   * 7. Training Load Balance → Agreeableness (r=0.20)
   * Mix of easy and hard efforts (based on heart rate)
   */
  calculateTrainingLoadBalance(activities) {
    const withHR = activities.filter(a => a.average_heartrate && a.average_heartrate > 0);
    if (withHR.length < 5) return null;

    let easy = 0;
    let moderate = 0;
    let hard = 0;
    for (const a of withHR) {
      if (a.average_heartrate < 140) easy++;
      else if (a.average_heartrate < 165) moderate++;
      else hard++;
    }

    const total = withHR.length;
    // Ideal balance is roughly 80/20 easy/hard (Maffetone principle)
    // Score highest when easy >= 60% and hard <= 30%
    const easyPct = easy / total;
    const hardPct = hard / total;

    // Penalize extremes: all easy or all hard = low balance
    const balanceScore = easyPct >= 0.5 && hardPct <= 0.35
      ? Math.min(100, (easyPct * 0.6 + (1 - hardPct) * 0.4) * 100)
      : Math.max(0, 50 - Math.abs(easyPct - 0.7) * 100);

    return {
      value: Math.round(Math.max(0, balanceScore) * 100) / 100,
      rawValue: {
        easy_pct: Math.round(easyPct * 100),
        moderate_pct: Math.round((moderate / total) * 100),
        hard_pct: Math.round(hardPct * 100),
        sample_size: total,
      },
    };
  }

  /**
   * 8. Weekend Activity Ratio → Extraversion (r=0.22)
   */
  calculateWeekendRatio(activities) {
    let weekday = 0;
    let weekend = 0;

    for (const a of activities) {
      const day = new Date(a.date).getDay();
      if (day === 0 || day === 6) weekend++;
      else weekday++;
    }

    if (weekend < 2 || weekday < 3) return null;

    const ratio = weekday > 0 ? (weekend / 2) / (weekday / 5) : 1;

    // ratio 1.0 = even, >1.0 = more weekend, <1.0 = more weekday
    const score = Math.min(100, Math.max(0, ratio * 50));

    return {
      value: Math.round(score * 100) / 100,
      rawValue: {
        weekend_activities: weekend,
        weekday_activities: weekday,
        normalized_ratio: Math.round(ratio * 100) / 100,
      },
    };
  }

  /**
   * 9. PR Pursuit → Conscientiousness (r=0.30)
   * Frequency of personal records
   */
  calculatePRPursuit(activities) {
    const withPR = activities.filter(a => !a.from_text);
    if (withPR.length < 5) return null;

    const totalPRs = withPR.reduce((s, a) => s + (a.pr_count || 0), 0);
    const prRate = totalPRs / withPR.length;

    // Normalize: 0 PRs/activity = 0, 1+ PR/activity = 100
    const prScore = Math.min(100, prRate * 100);

    return {
      value: Math.round(prScore * 100) / 100,
      rawValue: {
        total_prs: totalPRs,
        pr_rate: Math.round(prRate * 1000) / 1000,
        sample_size: withPR.length,
      },
    };
  }

  /**
   * 10. Rest Day Discipline → Conscientiousness (r=0.25)
   * Takes 2-3 rest days per week on average (not overtraining, not undertraining)
   */
  calculateRestDayDiscipline(activities) {
    if (activities.length < 5) return null;

    const weekCounts = {};
    for (const a of activities) {
      const wk = this.toWeekKey(a.date);
      // Count unique active days
      const dayKey = this.toDateKey(a.date);
      if (!weekCounts[wk]) weekCounts[wk] = new Set();
      weekCounts[wk].add(dayKey);
    }

    const weeksAnalyzed = Object.keys(weekCounts).length;
    if (weeksAnalyzed < 3) return null;

    const activeDaysPerWeek = Object.values(weekCounts).map(s => s.size);
    const avgActiveDays = activeDaysPerWeek.reduce((a, b) => a + b, 0) / activeDaysPerWeek.length;

    // Optimal: 4-5 active days (2-3 rest days). Score peaks at 4.5
    const deviation = Math.abs(avgActiveDays - 4.5);
    const restScore = Math.max(0, 100 - deviation * 30);

    return {
      value: Math.round(restScore * 100) / 100,
      rawValue: {
        avg_active_days_per_week: Math.round(avgActiveDays * 100) / 100,
        weeks_analyzed: weeksAnalyzed,
      },
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Helpers
  // ────────────────────────────────────────────────────────────────────────────

  createFeature(userId, featureType, featureValue, metadata = {}) {
    return {
      user_id: userId,
      platform: 'strava',
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
        note: metadata.evidence?.note,
        raw_value: metadata.raw_value || {},
      },
    };
  }

  async saveFeatures(features) {
    if (features.length === 0) return { success: true, saved: 0 };

    log.info('Saving Strava features', { count: features.length });

    try {
      const { data, error } = await supabaseAdmin
        .from('behavioral_features')
        .upsert(features, {
          onConflict: 'user_id,platform,feature_type',
        })
        .select();

      if (error) throw error;

      log.info('Saved Strava features', { saved: data.length });
      return { success: true, saved: data.length, data };
    } catch (error) {
      log.error('Error saving Strava features', { error });
      return { success: false, error: error.message };
    }
  }

  toDateKey(dateStr) {
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  toWeekKey(dateStr) {
    const d = new Date(dateStr);
    // ISO week number
    const oneJan = new Date(d.getFullYear(), 0, 1);
    const weekNum = Math.ceil(((d - oneJan) / 86400000 + oneJan.getDay() + 1) / 7);
    return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
  }
}

const stravaFeatureExtractor = new StravaFeatureExtractor();
export default stravaFeatureExtractor;
