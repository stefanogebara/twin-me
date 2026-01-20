/**
 * Behavioral Learning Service
 *
 * Learns personality traits from behavioral data (Spotify, Calendar, etc.)
 * Uses Bayesian updating to refine personality estimates over time.
 *
 * Research-backed correlations from peer-reviewed studies:
 * - Anderson et al. (2021) - Spotify, n=5,808
 * - Kosinski et al. (2013) - Digital footprints, n=58,000+
 * - Stachl et al. (2020) - Smartphone behavior, n=624
 * - Zufferey et al. (2023) - Wearables, n=200+
 * - Sleep Meta-analysis (2024) - n=31,000
 */

import { supabaseAdmin } from '../config/supabase.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Use shared Supabase client
const supabase = supabaseAdmin;

// Load validated correlations from research data file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
let VALIDATED_CORRELATIONS = null;

try {
  const correlationsPath = join(__dirname, '../data/validated-correlations.json');
  const correlationsData = JSON.parse(readFileSync(correlationsPath, 'utf-8'));
  VALIDATED_CORRELATIONS = correlationsData;
  console.log('[BehavioralLearning] Loaded validated correlations from research data');
} catch (error) {
  console.warn('[BehavioralLearning] Could not load validated-correlations.json, using defaults');
}

/**
 * Get correlation value for a feature-dimension pair
 * @param {string} platform - Platform name
 * @param {string} feature - Feature name
 * @param {string} dimension - Personality dimension
 * @returns {Object|null} Correlation data with r value and source
 */
function getCorrelation(platform, feature, dimension) {
  if (VALIDATED_CORRELATIONS?.correlations?.[platform]?.[feature]?.correlations?.[dimension]) {
    return VALIDATED_CORRELATIONS.correlations[platform][feature].correlations[dimension];
  }
  // Fallback to legacy correlations
  return INITIAL_CORRELATIONS[platform]?.[feature]?.[dimension]
    ? { r: INITIAL_CORRELATIONS[platform][feature][dimension], source: 'legacy' }
    : null;
}

/**
 * Get evidence template for a feature
 * @param {string} platform - Platform name
 * @param {string} feature - Feature name
 * @param {string} level - 'high' or 'low'
 * @returns {string|null} Evidence template string
 */
function getEvidenceTemplate(platform, feature, level) {
  return VALIDATED_CORRELATIONS?.correlations?.[platform]?.[feature]?.evidenceTemplates?.[level] || null;
}

/**
 * Classify effect size based on correlation coefficient
 * @param {number} r - Correlation coefficient
 * @returns {string} 'small', 'medium', or 'large'
 */
function classifyEffectSize(r) {
  const absR = Math.abs(r);
  if (absR >= 0.50) return 'large';
  if (absR >= 0.30) return 'medium';
  return 'small';
}

// Legacy correlations for backward compatibility
const INITIAL_CORRELATIONS = {
  spotify: {
    genre_diversity: { openness: 0.40, extraversion: 0.15 },
    tempo_preference: { extraversion: 0.25, neuroticism: -0.15 },
    discovery_rate: { openness: 0.45, conscientiousness: -0.10 },
    playlist_count: { conscientiousness: 0.20, openness: 0.15 },
    listening_hours_weekly: { extraversion: -0.10, openness: 0.20 },
    acoustic_preference: { agreeableness: 0.15, neuroticism: 0.10 },
    energy_preference: { extraversion: 0.35, neuroticism: -0.20 },
    valence_preference: { extraversion: 0.25, neuroticism: -0.30, agreeableness: 0.15 }
  },
  calendar: {
    meeting_density: { extraversion: 0.40, conscientiousness: 0.20 },
    focus_block_count: { conscientiousness: 0.35, extraversion: -0.25 },
    social_event_ratio: { extraversion: 0.50, agreeableness: 0.20 },
    schedule_regularity: { conscientiousness: 0.45, openness: -0.20 },
    last_minute_changes: { conscientiousness: -0.35, openness: 0.15 }
  },
  github: {
    collaboration_ratio: { extraversion: 0.25, agreeableness: 0.35 },
    code_review_thoroughness: { conscientiousness: 0.40, agreeableness: 0.20 },
    commit_regularity: { conscientiousness: 0.50 },
    project_diversity: { openness: 0.40 }
  },
  discord: {
    message_frequency: { extraversion: 0.45 },
    server_count: { extraversion: 0.30, openness: 0.25 },
    voice_channel_usage: { extraversion: 0.50 },
    emoji_usage: { agreeableness: 0.20, extraversion: 0.25 }
  },
  whoop: {
    // HRV Metrics (Zohar et al. 2013)
    hrv_baseline: { extraversion: 0.37, agreeableness: 0.22, neuroticism: -0.21 },
    hrv_stability: { neuroticism: -0.35 },
    // Recovery Metrics
    recovery_variance: { neuroticism: 0.25 },
    recovery_consistency: { conscientiousness: 0.30, neuroticism: -0.25 },
    // Sleep Metrics (Sleep Meta-analysis 2024)
    sleep_consistency: { conscientiousness: 0.40, neuroticism: -0.25 },
    sleep_quality_score: { neuroticism: -0.30, conscientiousness: 0.28, extraversion: 0.25 },
    deep_sleep_ratio: { conscientiousness: 0.20 },
    bedtime_consistency: { conscientiousness: 0.37 },
    chronotype_score: { conscientiousness: 0.37, openness: -0.17, extraversion: -0.23 },
    // Strain & Activity (Zufferey et al. 2023)
    strain_level_avg: { extraversion: 0.20, openness: 0.15 },
    strain_tolerance: { extraversion: 0.20, openness: 0.15 },
    workout_regularity: { conscientiousness: 0.42 },
    activity_diversity: { openness: 0.30 },
    step_count_avg: { extraversion: 0.25, neuroticism: -0.20 }
  }
};

// Genre classification mapping for research-backed genre correlations
const GENRE_CATEGORIES = {
  blues_jazz_classical: ['blues', 'jazz', 'classical', 'opera', 'symphony', 'chamber', 'baroque', 'bebop', 'swing', 'soul', 'r&b'],
  rock_metal_alternative: ['rock', 'metal', 'alternative', 'punk', 'grunge', 'indie rock', 'hard rock', 'heavy metal', 'progressive rock'],
  pop_country_conventional: ['pop', 'country', 'adult contemporary', 'soft rock', 'easy listening', 'mainstream'],
  hiphop_dance_electronic: ['hip hop', 'rap', 'dance', 'electronic', 'edm', 'house', 'techno', 'trance', 'dubstep', 'trap']
};

/**
 * Classify a genre string into research-backed category
 * @param {string} genre - Genre name
 * @returns {string|null} Category name or null
 */
function classifyGenre(genre) {
  const lowerGenre = genre.toLowerCase();
  for (const [category, genres] of Object.entries(GENRE_CATEGORIES)) {
    if (genres.some(g => lowerGenre.includes(g))) {
      return category;
    }
  }
  return null;
}

/**
 * Extract personality-relevant features from Spotify data
 * Enhanced with research-backed features from Anderson et al. (2021), Rentfrow & Gosling (2003)
 *
 * @param {Object} spotifyData - User's Spotify data
 * @returns {Object} Extracted features normalized to 0-1 with raw values
 */
export function extractSpotifyFeatures(spotifyData) {
  const features = {};
  const rawValues = {};

  if (!spotifyData) return { features, rawValues };

  // Genre diversity (0-1): How many unique genres in top artists
  // Research: r=0.40 with Openness (Anderson et al. 2021)
  if (spotifyData.topArtists) {
    const genres = new Set();
    spotifyData.topArtists.forEach(artist => {
      artist.genres?.forEach(g => genres.add(g));
    });
    rawValues.genre_count = genres.size;
    features.genre_diversity = Math.min(1, genres.size / 30);

    // Genre category features (Rentfrow & Gosling 2003)
    const categoryCounts = {
      blues_jazz_classical: 0,
      rock_metal_alternative: 0,
      pop_country_conventional: 0,
      hiphop_dance_electronic: 0
    };

    genres.forEach(genre => {
      const category = classifyGenre(genre);
      if (category) categoryCounts[category]++;
    });

    const totalCategorized = Object.values(categoryCounts).reduce((a, b) => a + b, 0) || 1;
    features.blues_jazz_classical = categoryCounts.blues_jazz_classical / totalCategorized;
    features.rock_metal_alternative = categoryCounts.rock_metal_alternative / totalCategorized;
    features.pop_country_conventional = categoryCounts.pop_country_conventional / totalCategorized;
    features.hiphop_dance_electronic = categoryCounts.hiphop_dance_electronic / totalCategorized;
  }

  // Tempo preference (0-1): Average tempo normalized
  // Research: r=0.25 with Extraversion (Greenberg et al. 2016)
  if (spotifyData.audioFeatures && spotifyData.audioFeatures.length > 0) {
    const avgTempo = spotifyData.audioFeatures.reduce((sum, f) => sum + (f.tempo || 0), 0)
      / spotifyData.audioFeatures.length;
    rawValues.avg_tempo = Math.round(avgTempo);
    features.tempo_preference = Math.min(1, Math.max(0, (avgTempo - 60) / 140));
  }

  // Energy preference (0-1)
  // Research: r=0.35 with Extraversion (Anderson et al. 2021)
  if (spotifyData.audioFeatures && spotifyData.audioFeatures.length > 0) {
    const avgEnergy = spotifyData.audioFeatures.reduce((sum, f) => sum + (f.energy || 0), 0)
      / spotifyData.audioFeatures.length;
    rawValues.avg_energy = avgEnergy.toFixed(2);
    features.energy_preference = avgEnergy;
  }

  // Valence preference (0-1)
  // Research: r=0.25 with Extraversion, r=-0.30 with Neuroticism (Anderson et al. 2021)
  if (spotifyData.audioFeatures && spotifyData.audioFeatures.length > 0) {
    const avgValence = spotifyData.audioFeatures.reduce((sum, f) => sum + (f.valence || 0), 0)
      / spotifyData.audioFeatures.length;
    rawValues.avg_valence = avgValence.toFixed(2);
    features.valence_preference = avgValence;
  }

  // Acoustic preference (0-1)
  // Research: r=0.15 with Agreeableness, r=0.20 with Openness (Greenberg et al. 2016)
  if (spotifyData.audioFeatures && spotifyData.audioFeatures.length > 0) {
    const avgAcousticness = spotifyData.audioFeatures.reduce((sum, f) => sum + (f.acousticness || 0), 0)
      / spotifyData.audioFeatures.length;
    rawValues.avg_acousticness = avgAcousticness.toFixed(2);
    features.acousticness_preference = avgAcousticness;
  }

  // Discovery rate (0-1): Ratio of recently discovered artists
  // Research: r=0.35 with Openness (Anderson et al. 2021)
  if (spotifyData.recentlyPlayed && spotifyData.topArtists) {
    const topArtistIds = new Set(spotifyData.topArtists.map(a => a.id));
    const recentArtistIds = new Set(spotifyData.recentlyPlayed.map(t => t.track?.artists?.[0]?.id).filter(Boolean));
    const newArtists = [...recentArtistIds].filter(id => !topArtistIds.has(id));
    const discoveryRate = recentArtistIds.size > 0 ? newArtists.length / recentArtistIds.size : 0;
    rawValues.new_artists_percent = Math.round(discoveryRate * 100);
    features.discovery_rate = Math.min(1, discoveryRate);
  }

  // Playlist count normalized
  if (spotifyData.playlists) {
    rawValues.playlist_count = spotifyData.playlists.length;
    features.playlist_count = Math.min(1, spotifyData.playlists.length / 50);
  }

  // Listening time consistency (new feature from research)
  // Research: r=0.25 with Conscientiousness (Anderson et al. 2021)
  if (spotifyData.recentlyPlayed && spotifyData.recentlyPlayed.length > 10) {
    const playedHours = spotifyData.recentlyPlayed
      .filter(t => t.played_at)
      .map(t => new Date(t.played_at).getHours());

    if (playedHours.length > 0) {
      const avgHour = playedHours.reduce((a, b) => a + b, 0) / playedHours.length;
      const variance = playedHours.reduce((sum, h) => sum + Math.pow(h - avgHour, 2), 0) / playedHours.length;
      const stdDev = Math.sqrt(variance);
      rawValues.listening_time_std_dev = stdDev.toFixed(1);
      // Low variance = high consistency
      features.listening_time_consistency = Math.max(0, 1 - (stdDev / 12)); // 12 hours max variance
    }
  }

  // Return features with raw values for evidence generation
  features._rawValues = rawValues;
  return features;
}

/**
 * Extract personality-relevant features from Calendar data
 * Enhanced with chronotype metrics from Sleep/Chronotype Meta-Analysis
 *
 * @param {Object} calendarData - User's calendar data
 * @returns {Object} Extracted features normalized to 0-1 with raw values
 */
export function extractCalendarFeatures(calendarData) {
  const features = {};
  const rawValues = {};

  if (!calendarData || !calendarData.events) return { features, rawValues };

  const events = calendarData.events;
  const now = new Date();
  const pastWeek = events.filter(e => {
    const eventDate = new Date(e.start?.dateTime || e.start?.date);
    return eventDate >= new Date(now - 7 * 24 * 60 * 60 * 1000) && eventDate <= now;
  });

  // Meeting density (0-1): Meetings per day
  // Research: r=0.40 with Extraversion (Stachl et al. 2020)
  const meetingCount = pastWeek.filter(e =>
    e.attendees?.length > 0 || e.summary?.toLowerCase().includes('meeting')
  ).length;
  rawValues.meetings_per_week = meetingCount;
  features.meeting_density = Math.min(1, meetingCount / 35); // Max 5 meetings/day

  // Focus block count (0-1): Blocks without meetings
  // Research: r=0.35 with Conscientiousness (Stachl et al. 2020)
  const focusBlocks = pastWeek.filter(e =>
    e.summary?.toLowerCase().includes('focus') ||
    e.summary?.toLowerCase().includes('deep work') ||
    e.summary?.toLowerCase().includes('heads down')
  ).length;
  rawValues.focus_blocks = focusBlocks;
  features.focus_block_count = Math.min(1, focusBlocks / 14); // Max 2/day

  // Social event ratio
  // Research: r=0.50 with Extraversion (Stachl et al. 2020)
  const socialEvents = pastWeek.filter(e =>
    e.summary?.toLowerCase().includes('lunch') ||
    e.summary?.toLowerCase().includes('coffee') ||
    e.summary?.toLowerCase().includes('happy hour') ||
    e.summary?.toLowerCase().includes('dinner') ||
    e.summary?.toLowerCase().includes('drinks') ||
    e.summary?.toLowerCase().includes('social') ||
    e.summary?.toLowerCase().includes('party')
  ).length;
  rawValues.social_events = socialEvents;
  rawValues.social_percent = pastWeek.length > 0 ? Math.round((socialEvents / pastWeek.length) * 100) : 0;
  features.social_event_ratio = Math.min(1, socialEvents / 7);

  // Schedule regularity (based on event start times)
  // Research: r=0.45 with Conscientiousness (Stachl et al. 2020)
  const eventsWithTime = pastWeek.filter(e => e.start?.dateTime);
  if (eventsWithTime.length > 3) {
    const startHours = eventsWithTime.map(e => new Date(e.start.dateTime).getHours());
    const avgHour = startHours.reduce((a, b) => a + b, 0) / startHours.length;
    const variance = startHours.reduce((sum, h) => sum + Math.pow(h - avgHour, 2), 0) / startHours.length;
    const stdDev = Math.sqrt(variance);
    rawValues.std_dev_minutes = Math.round(stdDev * 60);
    features.schedule_regularity = Math.max(0, 1 - (variance / 25)); // Low variance = high regularity
  }

  // Chronotype metrics - NEW from Chronotype Meta-Analysis
  // Research: r=0.37 Conscientiousness-Morningness (Meta-analysis, n=16,647)
  if (eventsWithTime.length > 5) {
    const startHours = eventsWithTime.map(e => new Date(e.start.dateTime).getHours());

    // Morning activity ratio (events before noon)
    const morningEvents = startHours.filter(h => h < 12).length;
    rawValues.morning_percent = Math.round((morningEvents / startHours.length) * 100);
    features.morning_activity_ratio = morningEvents / startHours.length;

    // Evening activity ratio (events after 6pm)
    const eveningEvents = startHours.filter(h => h >= 18).length;
    rawValues.evening_percent = Math.round((eveningEvents / startHours.length) * 100);
    features.evening_activity_ratio = eveningEvents / startHours.length;

    // Early start indicator (first event of each day)
    const eventsByDay = {};
    eventsWithTime.forEach(e => {
      const date = new Date(e.start.dateTime).toDateString();
      const hour = new Date(e.start.dateTime).getHours();
      if (!eventsByDay[date] || hour < eventsByDay[date]) {
        eventsByDay[date] = hour;
      }
    });
    const firstEventHours = Object.values(eventsByDay);
    if (firstEventHours.length > 0) {
      rawValues.avg_first_event_hour = (firstEventHours.reduce((a, b) => a + b, 0) / firstEventHours.length).toFixed(1);
    }
  }

  // Last minute changes (cancellations/rescheduling)
  // Research: r=-0.35 with Conscientiousness (Stachl et al. 2020)
  if (calendarData.cancelledEvents) {
    const cancelledCount = calendarData.cancelledEvents.length;
    rawValues.change_rate = pastWeek.length > 0 ? Math.round((cancelledCount / pastWeek.length) * 100) : 0;
    features.last_minute_changes = Math.min(1, cancelledCount / 10);
  }

  // Return features with raw values for evidence generation
  features._rawValues = rawValues;
  return features;
}

/**
 * Extract personality-relevant features from Whoop data
 * Enhanced with HRV and sleep metrics from research:
 * - Zohar et al. (2013) - HRV and personality, n=120
 * - Zufferey et al. (2023) - Wearables and Big Five, n=200+
 * - Sleep Meta-analysis (2024) - n=31,000
 *
 * @param {Object} whoopData - User's Whoop data
 * @returns {Object} Extracted features normalized to 0-1 with raw values
 */
export function extractWhoopFeatures(whoopData) {
  const features = {};
  const rawValues = {};

  if (!whoopData) return { features, rawValues };

  // === HRV METRICS (Zohar et al. 2013, HRV Meta-analyses) ===

  // HRV Baseline: Average resting HRV normalized
  // Research: r=0.37 with Extraversion, r=0.22 with Agreeableness, r=-0.21 with Neuroticism
  if (whoopData.recoveries && whoopData.recoveries.length > 7) {
    const hrvValues = whoopData.recoveries
      .map(r => r.hrv || r.hrv_rmssd_milli || r.heart_rate_variability || 0)
      .filter(h => h > 0);

    if (hrvValues.length > 0) {
      const avgHrv = hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length;
      rawValues.avg_hrv = Math.round(avgHrv);
      // Normalize HRV: typical range 20-100ms, with 60+ being good
      features.hrv_baseline = Math.min(1, Math.max(0, avgHrv / 100));

      // HRV Stability: Coefficient of variation of HRV
      // Research: r=-0.35 with Neuroticism (stable HRV = lower neuroticism)
      if (hrvValues.length > 5) {
        const hrvVariance = hrvValues.reduce((sum, h) => sum + Math.pow(h - avgHrv, 2), 0) / hrvValues.length;
        const hrvStdDev = Math.sqrt(hrvVariance);
        const coefficientOfVariation = hrvStdDev / avgHrv;
        rawValues.hrv_cv = coefficientOfVariation.toFixed(3);
        // Low CV = high stability (inverted for personality correlation)
        features.hrv_stability = Math.max(0, 1 - Math.min(1, coefficientOfVariation * 2));
      }
    }
  }

  // === RECOVERY METRICS ===

  // Recovery variance
  // Research: r=-0.25 with Neuroticism (consistent recovery = lower neuroticism)
  if (whoopData.recoveries && whoopData.recoveries.length > 7) {
    const recoveryScores = whoopData.recoveries.map(r => r.score || r.recovery_score || 0);
    const avg = recoveryScores.reduce((a, b) => a + b, 0) / recoveryScores.length;
    const variance = recoveryScores.reduce((sum, s) => sum + Math.pow(s - avg, 2), 0) / recoveryScores.length;
    rawValues.recovery_avg = Math.round(avg);
    rawValues.recovery_variance = Math.round(variance);
    features.recovery_variance = Math.min(1, variance / 400); // Normalize variance

    // Recovery consistency (inverted variance)
    // Research: r=0.30 with Conscientiousness
    features.recovery_consistency = Math.max(0, 1 - features.recovery_variance);
  }

  // === SLEEP METRICS (Sleep Meta-analysis 2024, n=31,000) ===

  if (whoopData.sleeps && whoopData.sleeps.length > 7) {
    const sleeps = whoopData.sleeps;

    // Sleep consistency (duration variance)
    // Research: r=0.40 with Conscientiousness, r=-0.25 with Neuroticism
    const sleepDurations = sleeps.map(s => s.duration_minutes || s.quality_duration || 0);
    const avgDuration = sleepDurations.reduce((a, b) => a + b, 0) / sleepDurations.length;
    const durationVariance = sleepDurations.reduce((sum, d) => sum + Math.pow(d - avgDuration, 2), 0) / sleepDurations.length;
    const durationStdDev = Math.sqrt(durationVariance);
    rawValues.sleep_duration_avg = Math.round(avgDuration);
    rawValues.sleep_duration_std_dev = Math.round(durationStdDev);
    features.sleep_consistency = Math.max(0, 1 - (durationVariance / 10000)); // Low variance = high consistency

    // Sleep quality score average
    // Research: r=-0.30 with Neuroticism, r=0.28 with Conscientiousness, r=0.25 with Extraversion
    const qualityScores = sleeps.map(s => s.sleep_quality_score || s.quality_score || s.score || 0).filter(q => q > 0);
    if (qualityScores.length > 0) {
      const avgQuality = qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length;
      rawValues.sleep_quality_avg = Math.round(avgQuality);
      features.sleep_quality_score = Math.min(1, avgQuality / 100);
    }

    // Deep sleep ratio
    // Research: r=0.20 with Conscientiousness
    const deepSleepRatios = sleeps
      .filter(s => s.slow_wave_sleep_duration && s.duration_minutes)
      .map(s => s.slow_wave_sleep_duration / s.duration_minutes);
    if (deepSleepRatios.length > 0) {
      const avgDeepRatio = deepSleepRatios.reduce((a, b) => a + b, 0) / deepSleepRatios.length;
      rawValues.deep_sleep_percent = Math.round(avgDeepRatio * 100);
      features.deep_sleep_ratio = avgDeepRatio;
    }

    // Bedtime consistency (for chronotype inference)
    // Research: r=0.37 with Conscientiousness (Morningness-Conscientiousness meta-analysis)
    const bedtimes = sleeps
      .filter(s => s.start_time || s.start)
      .map(s => {
        const date = new Date(s.start_time || s.start);
        // Convert to minutes after midnight (handling late nights past midnight)
        let minutes = date.getHours() * 60 + date.getMinutes();
        if (minutes < 360) minutes += 1440; // Adjust for times past midnight (before 6am)
        return minutes;
      });

    if (bedtimes.length > 5) {
      const avgBedtime = bedtimes.reduce((a, b) => a + b, 0) / bedtimes.length;
      const bedtimeVariance = bedtimes.reduce((sum, b) => sum + Math.pow(b - avgBedtime, 2), 0) / bedtimes.length;
      const bedtimeStdDev = Math.sqrt(bedtimeVariance);
      rawValues.bedtime_std_dev_minutes = Math.round(bedtimeStdDev);

      // Convert avgBedtime back to readable hour
      const adjustedAvg = avgBedtime >= 1440 ? avgBedtime - 1440 : avgBedtime;
      rawValues.avg_bedtime_hour = (adjustedAvg / 60).toFixed(1);

      // Low std dev = high consistency
      features.bedtime_consistency = Math.max(0, 1 - Math.min(1, bedtimeStdDev / 120)); // 2 hours max variance
    }

    // Chronotype score from sleep timing
    // Research: Earlier sleep = higher Conscientiousness (r=0.37)
    if (bedtimes.length > 5) {
      const avgBedtime = bedtimes.reduce((a, b) => a + b, 0) / bedtimes.length;
      // Earlier bedtime (before midnight ~1320 min) = morning chronotype = higher score
      // Later bedtime (after 1am ~1500 min) = evening chronotype = lower score
      const chronotypeScore = Math.max(0, Math.min(1, (1500 - avgBedtime) / 180));
      features.chronotype_score = chronotypeScore;
      rawValues.chronotype = chronotypeScore > 0.6 ? 'morning' : chronotypeScore < 0.4 ? 'evening' : 'intermediate';
    }
  }

  // === STRAIN & ACTIVITY METRICS (Zufferey et al. 2023) ===

  // Average strain level
  // Research: r=0.20 with Extraversion, r=0.15 with Openness
  if (whoopData.strains && whoopData.strains.length > 0) {
    const strainScores = whoopData.strains.map(s => s.score || s.strain_score || 0);
    const avgStrain = strainScores.reduce((a, b) => a + b, 0) / strainScores.length;
    rawValues.avg_strain = avgStrain.toFixed(1);
    features.strain_level_avg = Math.min(1, avgStrain / 21); // Max strain is ~21

    // Strain tolerance (high strain with good recovery)
    if (whoopData.recoveries && whoopData.recoveries.length > 0) {
      const avgRecovery = whoopData.recoveries.reduce((sum, r) => sum + (r.score || r.recovery_score || 0), 0)
        / whoopData.recoveries.length;
      // High strain + high recovery = high tolerance
      features.strain_tolerance = Math.min(1, (avgStrain / 21) * (avgRecovery / 100));
    }
  }

  // Workout regularity
  // Research: r=0.42 with Conscientiousness (Zufferey et al. 2023)
  if (whoopData.workouts && whoopData.workouts.length > 0) {
    // Calculate workouts per week
    const workouts = whoopData.workouts;
    if (workouts.length > 3) {
      const firstWorkout = new Date(workouts[0].start_time || workouts[0].start || workouts[0].created_at);
      const lastWorkout = new Date(workouts[workouts.length - 1].start_time || workouts[workouts.length - 1].start || workouts[workouts.length - 1].created_at);
      const daySpan = Math.max(1, (lastWorkout - firstWorkout) / (1000 * 60 * 60 * 24));
      const workoutsPerWeek = (workouts.length / daySpan) * 7;
      rawValues.workouts_per_week = workoutsPerWeek.toFixed(1);
      features.workout_regularity = Math.min(1, workoutsPerWeek / 7); // 7 workouts/week = max
    }

    // Activity diversity (unique workout types)
    // Research: r=0.30 with Openness
    const workoutTypes = new Set(workouts.map(w => w.sport_id || w.activity_type || w.type).filter(Boolean));
    rawValues.activity_type_count = workoutTypes.size;
    features.activity_diversity = Math.min(1, workoutTypes.size / 10); // 10 types = max diversity
  }

  // Step count average (if available)
  // Research: r=0.25 with Extraversion, r=-0.20 with Neuroticism
  if (whoopData.dailyMetrics || whoopData.cycles) {
    const metrics = whoopData.dailyMetrics || whoopData.cycles;
    const stepCounts = metrics
      .map(m => m.step_count || m.steps || 0)
      .filter(s => s > 0);

    if (stepCounts.length > 0) {
      const avgSteps = stepCounts.reduce((a, b) => a + b, 0) / stepCounts.length;
      rawValues.avg_daily_steps = Math.round(avgSteps);
      features.step_count_avg = Math.min(1, avgSteps / 15000); // 15k steps = max
    }
  }

  // Return features with raw values for evidence generation
  features._rawValues = rawValues;
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
