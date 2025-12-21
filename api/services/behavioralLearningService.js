/**
 * Behavioral Learning Service
 *
 * Learns personality traits from behavioral data (Spotify, Calendar, etc.)
 * Uses Bayesian updating to refine personality estimates over time.
 */

import { supabaseAdmin } from '../config/supabase.js';

// Use shared Supabase client
const supabase = supabaseAdmin;

// Initial behavioral-trait correlations based on research
// These will be refined over time with actual user data
const INITIAL_CORRELATIONS = {
  spotify: {
    genre_diversity: {
      openness: 0.40, // High genre diversity correlates with openness
      extraversion: 0.15
    },
    tempo_preference: {
      extraversion: 0.25, // Higher tempo preference correlates with extraversion
      neuroticism: -0.15
    },
    discovery_rate: {
      openness: 0.45, // Discovering new music correlates with openness
      conscientiousness: -0.10
    },
    playlist_count: {
      conscientiousness: 0.20, // More playlists suggests organization
      openness: 0.15
    },
    listening_hours_weekly: {
      extraversion: -0.10, // More listening may indicate introversion
      openness: 0.20
    },
    acoustic_preference: {
      agreeableness: 0.15,
      neuroticism: 0.10
    },
    energy_preference: {
      extraversion: 0.35,
      neuroticism: -0.20
    },
    valence_preference: {
      extraversion: 0.25,
      neuroticism: -0.30,
      agreeableness: 0.15
    }
  },
  calendar: {
    meeting_density: {
      extraversion: 0.40, // More meetings correlates with extraversion
      conscientiousness: 0.20
    },
    focus_block_count: {
      conscientiousness: 0.35,
      extraversion: -0.25 // Focus blocks may indicate introversion
    },
    social_event_ratio: {
      extraversion: 0.50,
      agreeableness: 0.20
    },
    schedule_regularity: {
      conscientiousness: 0.45,
      openness: -0.20 // Regular schedule may indicate lower openness
    },
    last_minute_changes: {
      conscientiousness: -0.35,
      openness: 0.15
    }
  },
  github: {
    collaboration_ratio: {
      extraversion: 0.25,
      agreeableness: 0.35
    },
    code_review_thoroughness: {
      conscientiousness: 0.40,
      agreeableness: 0.20
    },
    commit_regularity: {
      conscientiousness: 0.50
    },
    project_diversity: {
      openness: 0.40
    }
  },
  discord: {
    message_frequency: {
      extraversion: 0.45
    },
    server_count: {
      extraversion: 0.30,
      openness: 0.25
    },
    voice_channel_usage: {
      extraversion: 0.50
    },
    emoji_usage: {
      agreeableness: 0.20,
      extraversion: 0.25
    }
  },
  whoop: {
    recovery_variance: {
      neuroticism: 0.35 // High variance may indicate emotional volatility
    },
    sleep_consistency: {
      conscientiousness: 0.40
    },
    strain_level_avg: {
      extraversion: 0.20,
      conscientiousness: 0.15
    }
  }
};

/**
 * Extract personality-relevant features from Spotify data
 * @param {Object} spotifyData - User's Spotify data
 * @returns {Object} Extracted features normalized to 0-1
 */
export function extractSpotifyFeatures(spotifyData) {
  const features = {};

  if (!spotifyData) return features;

  // Genre diversity (0-1): How many unique genres in top artists
  if (spotifyData.topArtists) {
    const genres = new Set();
    spotifyData.topArtists.forEach(artist => {
      artist.genres?.forEach(g => genres.add(g));
    });
    features.genre_diversity = Math.min(1, genres.size / 30);
  }

  // Tempo preference (0-1): Average tempo normalized
  if (spotifyData.audioFeatures) {
    const avgTempo = spotifyData.audioFeatures.reduce((sum, f) => sum + (f.tempo || 0), 0)
      / spotifyData.audioFeatures.length;
    features.tempo_preference = Math.min(1, Math.max(0, (avgTempo - 60) / 140));
  }

  // Energy preference (0-1)
  if (spotifyData.audioFeatures) {
    features.energy_preference = spotifyData.audioFeatures.reduce((sum, f) => sum + (f.energy || 0), 0)
      / spotifyData.audioFeatures.length;
  }

  // Valence preference (0-1)
  if (spotifyData.audioFeatures) {
    features.valence_preference = spotifyData.audioFeatures.reduce((sum, f) => sum + (f.valence || 0), 0)
      / spotifyData.audioFeatures.length;
  }

  // Acoustic preference (0-1)
  if (spotifyData.audioFeatures) {
    features.acoustic_preference = spotifyData.audioFeatures.reduce((sum, f) => sum + (f.acousticness || 0), 0)
      / spotifyData.audioFeatures.length;
  }

  // Discovery rate (0-1): Ratio of recently discovered artists
  if (spotifyData.recentlyPlayed && spotifyData.topArtists) {
    const topArtistIds = new Set(spotifyData.topArtists.map(a => a.id));
    const recentArtistIds = new Set(spotifyData.recentlyPlayed.map(t => t.track?.artists?.[0]?.id));
    const newArtists = [...recentArtistIds].filter(id => !topArtistIds.has(id));
    features.discovery_rate = Math.min(1, newArtists.length / recentArtistIds.size);
  }

  // Playlist count normalized
  if (spotifyData.playlists) {
    features.playlist_count = Math.min(1, spotifyData.playlists.length / 50);
  }

  return features;
}

/**
 * Extract personality-relevant features from Calendar data
 * @param {Object} calendarData - User's calendar data
 * @returns {Object} Extracted features normalized to 0-1
 */
export function extractCalendarFeatures(calendarData) {
  const features = {};

  if (!calendarData || !calendarData.events) return features;

  const events = calendarData.events;
  const now = new Date();
  const pastWeek = events.filter(e => {
    const eventDate = new Date(e.start?.dateTime || e.start?.date);
    return eventDate >= new Date(now - 7 * 24 * 60 * 60 * 1000) && eventDate <= now;
  });

  // Meeting density (0-1): Meetings per day
  const meetingCount = pastWeek.filter(e =>
    e.attendees?.length > 0 || e.summary?.toLowerCase().includes('meeting')
  ).length;
  features.meeting_density = Math.min(1, meetingCount / 35); // Max 5 meetings/day

  // Focus block count (0-1): Blocks without meetings
  const focusBlocks = pastWeek.filter(e =>
    e.summary?.toLowerCase().includes('focus') ||
    e.summary?.toLowerCase().includes('deep work')
  ).length;
  features.focus_block_count = Math.min(1, focusBlocks / 14); // Max 2/day

  // Social event ratio
  const socialEvents = pastWeek.filter(e =>
    e.summary?.toLowerCase().includes('lunch') ||
    e.summary?.toLowerCase().includes('coffee') ||
    e.summary?.toLowerCase().includes('happy hour') ||
    e.summary?.toLowerCase().includes('dinner')
  ).length;
  features.social_event_ratio = Math.min(1, socialEvents / 7);

  // Schedule regularity (based on event start times)
  if (pastWeek.length > 3) {
    const startHours = pastWeek
      .filter(e => e.start?.dateTime)
      .map(e => new Date(e.start.dateTime).getHours());

    if (startHours.length > 0) {
      const avgHour = startHours.reduce((a, b) => a + b, 0) / startHours.length;
      const variance = startHours.reduce((sum, h) => sum + Math.pow(h - avgHour, 2), 0) / startHours.length;
      features.schedule_regularity = Math.max(0, 1 - (variance / 25)); // Low variance = high regularity
    }
  }

  return features;
}

/**
 * Extract personality-relevant features from Whoop data
 * @param {Object} whoopData - User's Whoop data
 * @returns {Object} Extracted features normalized to 0-1
 */
export function extractWhoopFeatures(whoopData) {
  const features = {};

  if (!whoopData) return features;

  // Recovery variance
  if (whoopData.recoveries && whoopData.recoveries.length > 7) {
    const recoveryScores = whoopData.recoveries.map(r => r.score || r.recovery_score || 0);
    const avg = recoveryScores.reduce((a, b) => a + b, 0) / recoveryScores.length;
    const variance = recoveryScores.reduce((sum, s) => sum + Math.pow(s - avg, 2), 0) / recoveryScores.length;
    features.recovery_variance = Math.min(1, variance / 400); // Normalize variance
  }

  // Sleep consistency
  if (whoopData.sleeps && whoopData.sleeps.length > 7) {
    const sleepDurations = whoopData.sleeps.map(s => s.duration_minutes || s.quality_duration || 0);
    const avg = sleepDurations.reduce((a, b) => a + b, 0) / sleepDurations.length;
    const variance = sleepDurations.reduce((sum, d) => sum + Math.pow(d - avg, 2), 0) / sleepDurations.length;
    features.sleep_consistency = Math.max(0, 1 - (variance / 10000)); // Low variance = high consistency
  }

  // Average strain level
  if (whoopData.strains) {
    const strainScores = whoopData.strains.map(s => s.score || s.strain_score || 0);
    const avgStrain = strainScores.reduce((a, b) => a + b, 0) / strainScores.length;
    features.strain_level_avg = Math.min(1, avgStrain / 21); // Max strain is ~21
  }

  return features;
}

/**
 * Update personality estimate based on behavioral features
 * @param {string} userId - User ID
 * @param {string} platform - Platform name (spotify, calendar, etc.)
 * @param {Object} features - Extracted features
 * @returns {Object} Updated personality estimate
 */
export async function updateFromBehavior(userId, platform, features) {
  try {
    // Get current estimate
    const { data: currentEstimate, error: fetchError } = await supabase
      .from('personality_estimates')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (fetchError || !currentEstimate) {
      console.log(`[BehavioralLearning] No existing estimate for user ${userId}, creating new`);
      // Create initial estimate with defaults
      const { data: newEstimate, error: createError } = await supabase
        .from('personality_estimates')
        .insert({
          user_id: userId,
          openness: 50,
          conscientiousness: 50,
          extraversion: 50,
          agreeableness: 50,
          neuroticism: 50
        })
        .select()
        .single();

      if (createError) throw createError;
      return updateFromBehavior(userId, platform, features); // Retry with new estimate
    }

    // Get correlations for this platform
    const correlations = INITIAL_CORRELATIONS[platform] || {};

    // Apply Bayesian updates
    const updates = { ...currentEstimate };
    const dimensions = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism'];

    for (const [featureName, featureValue] of Object.entries(features)) {
      const featureCorrelations = correlations[featureName];
      if (!featureCorrelations) continue;

      for (const dim of dimensions) {
        const correlation = featureCorrelations[dim];
        if (correlation === undefined) continue;

        // Bayesian update weights
        const priorWeight = currentEstimate.questionnaire_score_weight || 1.0;
        const evidenceWeight = Math.abs(correlation) * 0.1; // Scale down behavioral evidence

        const priorScore = currentEstimate[dim];
        // Convert feature (0-1) to score (0-100), adjust by correlation sign
        const evidenceScore = correlation >= 0
          ? featureValue * 100
          : (1 - featureValue) * 100;

        // Weighted average (simplified Bayesian update)
        const newScore = (priorScore * priorWeight + evidenceScore * evidenceWeight)
          / (priorWeight + evidenceWeight);

        updates[dim] = Math.max(0, Math.min(100, newScore));
      }
    }

    // Update behavioral weight and signal count
    updates.behavioral_score_weight = (currentEstimate.behavioral_score_weight || 0) + 0.01;
    updates.total_behavioral_signals = (currentEstimate.total_behavioral_signals || 0) + Object.keys(features).length;
    updates.last_behavioral_update_at = new Date().toISOString();
    updates.updated_at = new Date().toISOString();

    // Calculate new archetype
    const { mapToArchetype } = await import('./personalityAssessmentService.js');
    const archetype = mapToArchetype({
      extraversion: updates.extraversion,
      openness: updates.openness,
      conscientiousness: updates.conscientiousness,
      agreeableness: updates.agreeableness,
      neuroticism: updates.neuroticism
    });
    updates.archetype_code = archetype.code;

    // Save updated estimate
    const { data: updatedEstimate, error: updateError } = await supabase
      .from('personality_estimates')
      .update(updates)
      .eq('user_id', userId)
      .select()
      .single();

    if (updateError) throw updateError;

    console.log(`[BehavioralLearning] Updated personality for user ${userId} from ${platform}`);
    console.log(`[BehavioralLearning] Features processed: ${Object.keys(features).join(', ')}`);

    return {
      ...updatedEstimate,
      archetype
    };

  } catch (error) {
    console.error('[BehavioralLearning] Error updating from behavior:', error);
    throw error;
  }
}

/**
 * Process all available platform data for a user
 * @param {string} userId - User ID
 * @param {Object} platformData - Object containing data from various platforms
 */
export async function processAllPlatformData(userId, platformData) {
  const results = [];

  if (platformData.spotify) {
    const features = extractSpotifyFeatures(platformData.spotify);
    if (Object.keys(features).length > 0) {
      const result = await updateFromBehavior(userId, 'spotify', features);
      results.push({ platform: 'spotify', features, result });
    }
  }

  if (platformData.calendar) {
    const features = extractCalendarFeatures(platformData.calendar);
    if (Object.keys(features).length > 0) {
      const result = await updateFromBehavior(userId, 'calendar', features);
      results.push({ platform: 'calendar', features, result });
    }
  }

  if (platformData.whoop) {
    const features = extractWhoopFeatures(platformData.whoop);
    if (Object.keys(features).length > 0) {
      const result = await updateFromBehavior(userId, 'whoop', features);
      results.push({ platform: 'whoop', features, result });
    }
  }

  return results;
}

/**
 * Store learned correlations back to database for future refinement
 */
export async function storeLearnedCorrelation(platform, featureName, dimension, coefficient, sampleSize) {
  try {
    const { error } = await supabase
      .from('behavioral_trait_correlations')
      .upsert({
        platform,
        feature_name: featureName,
        dimension,
        correlation_coefficient: coefficient,
        sample_size: sampleSize,
        confidence_level: Math.min(0.95, 0.5 + (sampleSize / 1000)),
        last_calculated_at: new Date().toISOString()
      }, {
        onConflict: 'platform,feature_name,dimension'
      });

    if (error) throw error;

    console.log(`[BehavioralLearning] Stored correlation: ${platform}.${featureName} -> ${dimension}: ${coefficient}`);

  } catch (error) {
    console.error('[BehavioralLearning] Error storing correlation:', error);
  }
}

/**
 * Seed initial correlations to database
 */
export async function seedInitialCorrelations() {
  console.log('[BehavioralLearning] Seeding initial correlations...');

  const records = [];

  for (const [platform, features] of Object.entries(INITIAL_CORRELATIONS)) {
    for (const [featureName, dimensions] of Object.entries(features)) {
      for (const [dimension, coefficient] of Object.entries(dimensions)) {
        records.push({
          platform,
          feature_name: featureName,
          dimension,
          correlation_coefficient: coefficient,
          sample_size: 1000, // Based on research
          confidence_level: 0.75,
          last_calculated_at: new Date().toISOString()
        });
      }
    }
  }

  const { error } = await supabase
    .from('behavioral_trait_correlations')
    .upsert(records, {
      onConflict: 'platform,feature_name,dimension'
    });

  if (error) {
    console.error('[BehavioralLearning] Error seeding correlations:', error);
    throw error;
  }

  console.log(`[BehavioralLearning] Seeded ${records.length} correlations`);
}

export default {
  extractSpotifyFeatures,
  extractCalendarFeatures,
  extractWhoopFeatures,
  updateFromBehavior,
  processAllPlatformData,
  storeLearnedCorrelation,
  seedInitialCorrelations,
  INITIAL_CORRELATIONS
};
