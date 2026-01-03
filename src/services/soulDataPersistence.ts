/**
 * Soul Data Persistence Service
 *
 * Handles reading and writing of behavioral features, personality scores,
 * and reflection history to Supabase for digital twin formation.
 */

import { supabase } from '@/lib/supabase';

// Types for behavioral features
export interface BehavioralFeature {
  id?: string;
  user_id: string;
  platform: 'spotify' | 'whoop' | 'google_calendar';
  feature_type: string;
  feature_value: number;
  normalized_value?: number;
  confidence_score?: number;
  sample_size?: number;
  contributes_to?: 'openness' | 'conscientiousness' | 'extraversion' | 'agreeableness' | 'neuroticism';
  contribution_weight?: number;
  evidence?: Record<string, unknown>;
  extracted_at?: string;
}

// Types for reflection history
export interface Reflection {
  id?: string;
  user_id: string;
  platform: 'spotify' | 'whoop' | 'google_calendar';
  reflection_text: string;
  confidence: 'high' | 'medium' | 'low';
  patterns_detected?: string[];
  created_at?: string;
}

// Types for personality scores
export interface PersonalityScores {
  user_id: string;
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
  openness_confidence?: number;
  conscientiousness_confidence?: number;
  extraversion_confidence?: number;
  agreeableness_confidence?: number;
  neuroticism_confidence?: number;
  source_type: 'behavioral' | 'questionnaire' | 'hybrid';
  analyzed_platforms?: string[];
  sample_size?: number;
}

/**
 * Soul Data Persistence Helpers
 */
export const soulDataHelpers = {
  // =====================================================
  // BEHAVIORAL FEATURES
  // =====================================================

  /**
   * Save or update behavioral features for a user
   */
  async saveBehavioralFeatures(features: BehavioralFeature[]): Promise<void> {
    if (!features || features.length === 0) return;

    const { error } = await supabase
      .from('behavioral_features')
      .upsert(
        features.map(f => ({
          user_id: f.user_id,
          platform: f.platform,
          feature_type: f.feature_type,
          feature_value: f.feature_value,
          normalized_value: f.normalized_value ?? f.feature_value / 100,
          confidence_score: f.confidence_score ?? 70,
          sample_size: f.sample_size ?? 1,
          contributes_to: f.contributes_to,
          contribution_weight: f.contribution_weight ?? 0.5,
          evidence: f.evidence ?? {},
          extracted_at: new Date().toISOString(),
        })),
        { onConflict: 'user_id,platform,feature_type' }
      );

    if (error) {
      console.error('[SoulData] Failed to save behavioral features:', error);
      throw error;
    }
  },

  /**
   * Get behavioral features for a user by platform
   */
  async getBehavioralFeatures(userId: string, platform?: string): Promise<BehavioralFeature[]> {
    let query = supabase
      .from('behavioral_features')
      .select('*')
      .eq('user_id', userId);

    if (platform) {
      query = query.eq('platform', platform);
    }

    const { data, error } = await query.order('extracted_at', { ascending: false });

    if (error) {
      console.error('[SoulData] Failed to get behavioral features:', error);
      return [];
    }

    return data || [];
  },

  // =====================================================
  // REFLECTION HISTORY
  // =====================================================

  /**
   * Save a twin reflection
   */
  async saveReflection(reflection: Reflection): Promise<void> {
    const { error } = await supabase
      .from('reflection_history')
      .insert({
        user_id: reflection.user_id,
        platform: reflection.platform,
        reflection_text: reflection.reflection_text,
        confidence: reflection.confidence,
        patterns_detected: reflection.patterns_detected ?? [],
        created_at: new Date().toISOString(),
      });

    if (error) {
      console.error('[SoulData] Failed to save reflection:', error);
      throw error;
    }
  },

  /**
   * Get reflection history for a user
   */
  async getReflections(userId: string, platform?: string, limit = 10): Promise<Reflection[]> {
    let query = supabase
      .from('reflection_history')
      .select('*')
      .eq('user_id', userId);

    if (platform) {
      query = query.eq('platform', platform);
    }

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[SoulData] Failed to get reflections:', error);
      return [];
    }

    return data || [];
  },

  // =====================================================
  // PERSONALITY SCORES
  // =====================================================

  /**
   * Save or update personality scores
   */
  async savePersonalityScores(scores: PersonalityScores): Promise<void> {
    const { error } = await supabase
      .from('personality_scores')
      .upsert({
        user_id: scores.user_id,
        openness: scores.openness,
        conscientiousness: scores.conscientiousness,
        extraversion: scores.extraversion,
        agreeableness: scores.agreeableness,
        neuroticism: scores.neuroticism,
        openness_confidence: scores.openness_confidence ?? 50,
        conscientiousness_confidence: scores.conscientiousness_confidence ?? 50,
        extraversion_confidence: scores.extraversion_confidence ?? 50,
        agreeableness_confidence: scores.agreeableness_confidence ?? 50,
        neuroticism_confidence: scores.neuroticism_confidence ?? 50,
        source_type: scores.source_type,
        analyzed_platforms: scores.analyzed_platforms ?? [],
        sample_size: scores.sample_size ?? 0,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (error) {
      console.error('[SoulData] Failed to save personality scores:', error);
      throw error;
    }
  },

  /**
   * Get personality scores for a user
   */
  async getPersonalityScores(userId: string): Promise<PersonalityScores | null> {
    const { data, error } = await supabase
      .from('personality_scores')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[SoulData] Failed to get personality scores:', error);
      return null;
    }

    return data;
  },

  // =====================================================
  // PLATFORM DATA EXTRACTION
  // =====================================================

  /**
   * Extract and save Spotify behavioral features
   */
  async extractSpotifyFeatures(userId: string, spotifyData: {
    topArtists?: string[];
    recentTracks?: Array<{ name: string; artist: string }>;
    topGenres?: string[];
    listeningPatterns?: { peakHour: string; weekdayVsWeekend: number };
    skipRate?: number;
    discoveryRate?: number;
    mood?: { energy: number; valence: number };
  }): Promise<void> {
    const features: BehavioralFeature[] = [];

    // Genre diversity -> Openness
    if (spotifyData.topGenres) {
      features.push({
        user_id: userId,
        platform: 'spotify',
        feature_type: 'genre_diversity',
        feature_value: spotifyData.topGenres.length,
        normalized_value: Math.min(spotifyData.topGenres.length / 20, 1),
        contributes_to: 'openness',
        contribution_weight: 0.7,
        evidence: { genres: spotifyData.topGenres },
      });
    }

    // Discovery rate -> Openness
    if (spotifyData.discoveryRate !== undefined) {
      features.push({
        user_id: userId,
        platform: 'spotify',
        feature_type: 'discovery_rate',
        feature_value: spotifyData.discoveryRate,
        normalized_value: spotifyData.discoveryRate / 100,
        contributes_to: 'openness',
        contribution_weight: 0.8,
        evidence: { rate: spotifyData.discoveryRate },
      });
    }

    // Skip rate -> Conscientiousness (low skip = high conscientiousness)
    if (spotifyData.skipRate !== undefined) {
      features.push({
        user_id: userId,
        platform: 'spotify',
        feature_type: 'skip_rate',
        feature_value: spotifyData.skipRate,
        normalized_value: 1 - (spotifyData.skipRate / 100),
        contributes_to: 'conscientiousness',
        contribution_weight: 0.5,
        evidence: { rate: spotifyData.skipRate },
      });
    }

    // Energy level -> Extraversion
    if (spotifyData.mood?.energy !== undefined) {
      features.push({
        user_id: userId,
        platform: 'spotify',
        feature_type: 'energy_preference',
        feature_value: spotifyData.mood.energy,
        normalized_value: spotifyData.mood.energy / 100,
        contributes_to: 'extraversion',
        contribution_weight: 0.6,
        evidence: { energy: spotifyData.mood.energy, valence: spotifyData.mood.valence },
      });
    }

    await this.saveBehavioralFeatures(features);
  },

  /**
   * Extract and save Whoop behavioral features
   */
  async extractWhoopFeatures(userId: string, whoopData: {
    recoveryScore?: number;
    avgSleepHours?: number;
    avgStrain?: number;
    hrv?: number;
    consistencyScore?: number;
  }): Promise<void> {
    const features: BehavioralFeature[] = [];

    // Recovery consistency -> Conscientiousness
    if (whoopData.recoveryScore !== undefined) {
      features.push({
        user_id: userId,
        platform: 'whoop',
        feature_type: 'recovery_score',
        feature_value: whoopData.recoveryScore,
        normalized_value: whoopData.recoveryScore / 100,
        contributes_to: 'conscientiousness',
        contribution_weight: 0.7,
        evidence: { recovery: whoopData.recoveryScore },
      });
    }

    // Sleep consistency -> Conscientiousness
    if (whoopData.avgSleepHours !== undefined) {
      features.push({
        user_id: userId,
        platform: 'whoop',
        feature_type: 'avg_sleep_hours',
        feature_value: whoopData.avgSleepHours,
        normalized_value: Math.min(whoopData.avgSleepHours / 9, 1),
        contributes_to: 'conscientiousness',
        contribution_weight: 0.6,
        evidence: { hours: whoopData.avgSleepHours },
      });
    }

    // Strain level -> Extraversion (high strain = more active lifestyle)
    if (whoopData.avgStrain !== undefined) {
      features.push({
        user_id: userId,
        platform: 'whoop',
        feature_type: 'avg_strain',
        feature_value: whoopData.avgStrain,
        normalized_value: Math.min(whoopData.avgStrain / 21, 1),
        contributes_to: 'extraversion',
        contribution_weight: 0.5,
        evidence: { strain: whoopData.avgStrain },
      });
    }

    // HRV -> Neuroticism (low HRV correlates with stress)
    if (whoopData.hrv !== undefined) {
      features.push({
        user_id: userId,
        platform: 'whoop',
        feature_type: 'hrv',
        feature_value: whoopData.hrv,
        normalized_value: Math.min(whoopData.hrv / 100, 1),
        contributes_to: 'neuroticism',
        contribution_weight: 0.4,
        evidence: { hrv: whoopData.hrv },
      });
    }

    await this.saveBehavioralFeatures(features);
  },

  /**
   * Extract and save Calendar behavioral features
   */
  async extractCalendarFeatures(userId: string, calendarData: {
    avgMeetingsPerDay?: number;
    busiestDay?: string;
    focusTimePercentage?: number;
    peakMeetingHours?: string;
    meetingTypes?: Record<string, number>;
  }): Promise<void> {
    const features: BehavioralFeature[] = [];

    // Meetings per day -> Extraversion
    if (calendarData.avgMeetingsPerDay !== undefined) {
      features.push({
        user_id: userId,
        platform: 'google_calendar',
        feature_type: 'avg_meetings_per_day',
        feature_value: calendarData.avgMeetingsPerDay,
        normalized_value: Math.min(calendarData.avgMeetingsPerDay / 10, 1),
        contributes_to: 'extraversion',
        contribution_weight: 0.7,
        evidence: { meetings: calendarData.avgMeetingsPerDay },
      });
    }

    // Focus time -> Conscientiousness
    if (calendarData.focusTimePercentage !== undefined) {
      features.push({
        user_id: userId,
        platform: 'google_calendar',
        feature_type: 'focus_time_percentage',
        feature_value: calendarData.focusTimePercentage,
        normalized_value: calendarData.focusTimePercentage / 100,
        contributes_to: 'conscientiousness',
        contribution_weight: 0.8,
        evidence: { percentage: calendarData.focusTimePercentage },
      });
    }

    await this.saveBehavioralFeatures(features);
  },

  // =====================================================
  // AGGREGATE PERSONALITY CALCULATION
  // =====================================================

  /**
   * Calculate personality scores from behavioral features
   */
  async calculatePersonalityFromFeatures(userId: string): Promise<PersonalityScores | null> {
    const features = await this.getBehavioralFeatures(userId);

    if (!features || features.length === 0) {
      return null;
    }

    // Group features by personality dimension
    const dimensionScores: Record<string, { total: number; weight: number; count: number }> = {
      openness: { total: 0, weight: 0, count: 0 },
      conscientiousness: { total: 0, weight: 0, count: 0 },
      extraversion: { total: 0, weight: 0, count: 0 },
      agreeableness: { total: 0, weight: 0, count: 0 },
      neuroticism: { total: 0, weight: 0, count: 0 },
    };

    const platforms = new Set<string>();

    for (const feature of features) {
      if (feature.contributes_to && dimensionScores[feature.contributes_to]) {
        const weight = feature.contribution_weight ?? 0.5;
        const normalizedValue = feature.normalized_value ?? feature.feature_value / 100;

        dimensionScores[feature.contributes_to].total += normalizedValue * weight;
        dimensionScores[feature.contributes_to].weight += weight;
        dimensionScores[feature.contributes_to].count += 1;
        platforms.add(feature.platform);
      }
    }

    // Calculate final scores (0-100)
    const calculateScore = (dim: string): number => {
      const data = dimensionScores[dim];
      if (data.weight === 0) return 50; // Default to middle
      return Math.round((data.total / data.weight) * 100);
    };

    const calculateConfidence = (dim: string): number => {
      const data = dimensionScores[dim];
      // Confidence based on number of features and weight
      return Math.min(Math.round(data.count * 20 + data.weight * 30), 100);
    };

    const scores: PersonalityScores = {
      user_id: userId,
      openness: calculateScore('openness'),
      conscientiousness: calculateScore('conscientiousness'),
      extraversion: calculateScore('extraversion'),
      agreeableness: calculateScore('agreeableness'),
      neuroticism: calculateScore('neuroticism'),
      openness_confidence: calculateConfidence('openness'),
      conscientiousness_confidence: calculateConfidence('conscientiousness'),
      extraversion_confidence: calculateConfidence('extraversion'),
      agreeableness_confidence: calculateConfidence('agreeableness'),
      neuroticism_confidence: calculateConfidence('neuroticism'),
      source_type: 'behavioral',
      analyzed_platforms: Array.from(platforms),
      sample_size: features.length,
    };

    // Save the calculated scores
    await this.savePersonalityScores(scores);

    return scores;
  },
};

export default soulDataHelpers;
