/**
 * Multimodal Feature Fusion Service — TRIBE v2 Phase C
 * =====================================================
 * Extracts structured features from each connected platform,
 * projects to a shared space, and concatenates into a fused
 * personality vector.
 *
 * Architecture:
 *   1. Query behavioral_features for each platform
 *   2. Build per-modality vectors (ordered, fixed-length, 0-1 normalized)
 *   3. Concatenate all modality vectors into a fused_vector
 *   4. Embed a text summary of the features -> 1536-dim "semantic fusion" vector
 *   5. Store everything in multimodal_profiles table
 *
 * Missing features default to 0.5 (neutral), not 0 (which implies absence).
 */

import { supabaseAdmin } from './database.js';
import { generateEmbedding } from './embeddingService.js';
import { createLogger } from './logger.js';

const log = createLogger('MultimodalFusion');
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const NEUTRAL_DEFAULT = 0.5;

// ─── Per-modality feature definitions (fixed order) ────────────────────────

const WHOOP_FEATURES = [
  'sleep_consistency', 'recovery_adherence', 'workout_intensity', 'workout_frequency',
  'hrv_stability', 'sleep_performance', 'sleep_efficiency', 'deep_sleep_ratio',
  'rem_sleep_ratio', 'strain_tolerance', 'activity_diversity', 'rhr_trend',
  'heart_rate_recovery', 'physical_activity_level', 'stress_response_pattern'
];

const CALENDAR_FEATURES = [
  'social_density', 'schedule_flexibility', 'calendar_conflicts', 'work_life_balance',
  'event_duration_consistency', 'time_management_score', 'event_diversity',
  'social_contact_frequency', 'weekend_activity_pattern'
];

const YOUTUBE_FEATURES = ['yt_content_diversity'];

const SPOTIFY_FEATURES = [
  'discovery_rate', 'genre_diversity', 'repeat_listening',
  'energy_preference', 'valence_preference', 'arousal_preference',
  'musical_sophistication'
];

const ALL_FEATURE_NAMES = {
  spotify: SPOTIFY_FEATURES,
  whoop: WHOOP_FEATURES,
  calendar: CALENDAR_FEATURES,
  youtube: YOUTUBE_FEATURES
};

// ─── Internal helpers ──────────────────────────────────────────────────────

/**
 * Clamp a value to [0, 1]. Values outside range are clamped, not rejected.
 */
function clamp01(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return NEUTRAL_DEFAULT;
  return Math.max(0, Math.min(1, value));
}

/**
 * Query behavioral_features for a single platform and build an ordered vector.
 * Returns an array of 0-1 values in the order defined by featureNames.
 */
async function fetchBehavioralVector(userId, platform, featureNames) {
  if (!supabaseAdmin) {
    log.warn('No database connection — returning neutral vector', { platform });
    return featureNames.map(() => NEUTRAL_DEFAULT);
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('behavioral_features')
      .select('feature_type, normalized_value')
      .eq('user_id', userId)
      .eq('platform', platform)
      .in('feature_type', featureNames);

    if (error) {
      log.error('Failed to fetch behavioral features', { platform, error: error.message });
      return featureNames.map(() => NEUTRAL_DEFAULT);
    }

    // Build a lookup map from the results
    const lookup = new Map();
    for (const row of (data || [])) {
      lookup.set(row.feature_type, row.normalized_value);
    }

    // Produce ordered vector, defaulting missing features to neutral
    return featureNames.map(name => {
      const raw = lookup.get(name);
      return raw != null ? clamp01(raw) : NEUTRAL_DEFAULT;
    });
  } catch (err) {
    log.error('Exception fetching behavioral features', { platform, error: err.message });
    return featureNames.map(() => NEUTRAL_DEFAULT);
  }
}

/**
 * Fetch Spotify features. Spotify stores features in behavioral_features
 * (via spotifyExtractor), same as other platforms.
 * Falls back to soul_data comprehensive_music_profile if behavioral_features
 * are empty.
 */
async function fetchSpotifyVector(userId) {
  // Primary path: behavioral_features (populated by spotifyExtractor)
  const vector = await fetchBehavioralVector(userId, 'spotify', SPOTIFY_FEATURES);

  // Check if we got any real data (not all neutral defaults)
  const hasRealData = vector.some(v => v !== NEUTRAL_DEFAULT);
  if (hasRealData) {
    return vector;
  }

  // Fallback: extract from soul_data comprehensive_music_profile
  if (!supabaseAdmin) {
    return vector;
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('soul_data')
      .select('raw_data')
      .eq('user_id', userId)
      .eq('platform', 'spotify')
      .eq('data_type', 'comprehensive_music_profile')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data?.raw_data) {
      log.debug('No Spotify soul_data fallback available', { userId });
      return vector;
    }

    const raw = data.raw_data;
    const metrics = raw.behavioral_metrics || raw.music_profile || {};

    return SPOTIFY_FEATURES.map(name => {
      const val = metrics[name];
      if (val != null && typeof val === 'number') {
        // soul_data values may be 0-100 or 0-1 — normalize if > 1
        return clamp01(val > 1 ? val / 100 : val);
      }
      return NEUTRAL_DEFAULT;
    });
  } catch (err) {
    log.error('Exception in Spotify soul_data fallback', { error: err.message });
    return vector;
  }
}

/**
 * Determine which modalities have real data (not all-neutral).
 */
function detectPresentModalities(vectors) {
  const present = [];
  for (const [platform, vec] of Object.entries(vectors)) {
    if (vec.length > 0 && vec.some(v => v !== NEUTRAL_DEFAULT)) {
      present.push(platform);
    }
  }
  return present;
}

/**
 * Build a human-readable text summary of the fused features for semantic embedding.
 */
function buildTextSummary(vectors) {
  const parts = [];

  // Spotify
  if (vectors.spotify.some(v => v !== NEUTRAL_DEFAULT)) {
    const s = vectors.spotify;
    parts.push(
      `Music: energy=${s[3].toFixed(2)} valence=${s[4].toFixed(2)} ` +
      `arousal=${s[5].toFixed(2)} discovery=${s[0].toFixed(2)} ` +
      `diversity=${s[1].toFixed(2)} sophistication=${s[6].toFixed(2)}`
    );
  }

  // Whoop
  if (vectors.whoop.some(v => v !== NEUTRAL_DEFAULT)) {
    const w = vectors.whoop;
    const hrvLabel = w[4] > 0.6 ? 'stable' : w[4] < 0.4 ? 'variable' : 'moderate';
    const recoveryLabel = w[1] > 0.6 ? 'high' : w[1] < 0.4 ? 'low' : 'moderate';
    const sleepLabel = w[5] > 0.6 ? 'good' : w[5] < 0.4 ? 'poor' : 'average';
    parts.push(
      `Health: HRV ${hrvLabel}, recovery ${recoveryLabel}, ` +
      `sleep ${sleepLabel}, strain tolerance=${w[9].toFixed(2)}`
    );
  }

  // Calendar
  if (vectors.calendar.some(v => v !== NEUTRAL_DEFAULT)) {
    const c = vectors.calendar;
    const socialLabel = c[0] > 0.6 ? 'high' : c[0] < 0.4 ? 'low' : 'moderate';
    const flexLabel = c[1] > 0.6 ? 'flexible' : c[1] < 0.4 ? 'rigid' : 'balanced';
    parts.push(
      `Schedule: social density ${socialLabel}, ${flexLabel}, ` +
      `work-life balance=${c[3].toFixed(2)}`
    );
  }

  // YouTube
  if (vectors.youtube.some(v => v !== NEUTRAL_DEFAULT)) {
    const y = vectors.youtube;
    const diversityLabel = y[0] > 0.6 ? 'diverse' : y[0] < 0.4 ? 'focused' : 'moderate';
    parts.push(`Video: ${diversityLabel} content`);
  }

  return parts.length > 0
    ? parts.join('. ') + '.'
    : 'No platform data available yet.';
}

// ─── Exported functions ────────────────────────────────────────────────────

/**
 * Get the cached multimodal profile for a user. Returns cached version if
 * generated within the last 12 hours, otherwise triggers a rebuild.
 *
 * @param {string} userId
 * @returns {Promise<object>} Profile with per-modality vectors and fused vector
 */
export async function getMultimodalProfile(userId) {
  if (!supabaseAdmin) {
    log.warn('No database connection');
    return { modality_count: 0, modalities_present: [] };
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('multimodal_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = row not found — that is OK, we just rebuild
      log.error('Failed to fetch cached profile', { error: error.message });
    }

    // Check cache freshness
    if (data?.generated_at) {
      const age = Date.now() - new Date(data.generated_at).getTime();
      if (age < CACHE_TTL_MS) {
        log.debug('Returning cached multimodal profile', {
          userId,
          ageHours: (age / (60 * 60 * 1000)).toFixed(1),
          modalityCount: data.modality_count
        });
        return {
          spotify_features: data.spotify_features || [],
          whoop_features: data.whoop_features || [],
          calendar_features: data.calendar_features || [],
          youtube_features: data.youtube_features || [],
          fused_vector: data.fused_vector || [],
          modalities_present: data.modalities_present || [],
          modality_count: data.modality_count || 0,
          feature_names: data.feature_names || ALL_FEATURE_NAMES,
          generated_at: data.generated_at
        };
      }
    }

    // Cache miss or stale — rebuild
    log.info('Cache miss, rebuilding multimodal profile', { userId });
    return await rebuildMultimodalProfile(userId);
  } catch (err) {
    log.error('Exception in getMultimodalProfile', { error: err.message });
    // Attempt rebuild as fallback
    return await rebuildMultimodalProfile(userId);
  }
}

/**
 * Full rebuild pipeline: fetch features from all platforms, fuse, embed, store.
 *
 * @param {string} userId
 * @returns {Promise<object>} The newly built profile
 */
export async function rebuildMultimodalProfile(userId) {
  log.info('Rebuilding multimodal profile', { userId });
  const startTime = Date.now();

  // Step 1: Fetch all modality vectors in parallel
  const [spotifyVec, whoopVec, calendarVec, youtubeVec] = await Promise.all([
    fetchSpotifyVector(userId),
    fetchBehavioralVector(userId, 'whoop', WHOOP_FEATURES),
    fetchBehavioralVector(userId, 'calendar', CALENDAR_FEATURES),
    fetchBehavioralVector(userId, 'youtube', YOUTUBE_FEATURES)
  ]);

  const vectors = {
    spotify: spotifyVec,
    whoop: whoopVec,
    calendar: calendarVec,
    youtube: youtubeVec
  };

  // Step 2: Concatenate into fused vector
  const fusedVector = [
    ...spotifyVec,
    ...whoopVec,
    ...calendarVec,
    ...youtubeVec
  ];

  // Step 3: Determine which modalities contributed real data
  const modalitiesPresent = detectPresentModalities(vectors);

  // Step 4: Generate text summary and embed it
  const textSummary = buildTextSummary(vectors);
  let semanticVector = null;
  try {
    semanticVector = await generateEmbedding(textSummary);
  } catch (err) {
    log.warn('Failed to generate semantic fusion embedding', { error: err.message });
    // Non-fatal — we still have the concatenated vector
  }

  // Step 5: Upsert into multimodal_profiles
  const profile = {
    user_id: userId,
    spotify_features: spotifyVec,
    whoop_features: whoopVec,
    calendar_features: calendarVec,
    youtube_features: youtubeVec,
    fused_vector: fusedVector,
    modality_count: modalitiesPresent.length,
    modalities_present: modalitiesPresent,
    feature_names: ALL_FEATURE_NAMES,
    generated_at: new Date().toISOString()
  };

  if (supabaseAdmin) {
    try {
      const { error } = await supabaseAdmin
        .from('multimodal_profiles')
        .upsert(profile, { onConflict: 'user_id' });

      if (error) {
        log.error('Failed to upsert multimodal profile', { error: error.message });
      }
    } catch (err) {
      log.error('Exception upserting multimodal profile', { error: err.message });
    }
  }

  const elapsed = Date.now() - startTime;
  log.info('Multimodal profile rebuilt', {
    userId,
    modalityCount: modalitiesPresent.length,
    modalitiesPresent,
    fusedVectorLength: fusedVector.length,
    hasSemanticVector: semanticVector != null,
    elapsedMs: elapsed
  });

  return {
    spotify_features: spotifyVec,
    whoop_features: whoopVec,
    calendar_features: calendarVec,
    youtube_features: youtubeVec,
    fused_vector: fusedVector,
    modalities_present: modalitiesPresent,
    modality_count: modalitiesPresent.length,
    feature_names: ALL_FEATURE_NAMES,
    generated_at: profile.generated_at,
    semantic_vector_available: semanticVector != null
  };
}

/**
 * Get features for a single modality (for debugging / display).
 *
 * @param {string} userId
 * @param {string} platform - One of: spotify, whoop, calendar, youtube
 * @returns {Promise<object>} { platform, features: number[], feature_names: string[], has_data: boolean }
 */
export async function getModalityFeatures(userId, platform) {
  const featureMap = {
    spotify: { names: SPOTIFY_FEATURES, fetcher: () => fetchSpotifyVector(userId) },
    whoop: { names: WHOOP_FEATURES, fetcher: () => fetchBehavioralVector(userId, 'whoop', WHOOP_FEATURES) },
    calendar: { names: CALENDAR_FEATURES, fetcher: () => fetchBehavioralVector(userId, 'calendar', CALENDAR_FEATURES) },
    youtube: { names: YOUTUBE_FEATURES, fetcher: () => fetchBehavioralVector(userId, 'youtube', YOUTUBE_FEATURES) }
  };

  const entry = featureMap[platform];
  if (!entry) {
    log.warn('Unknown platform requested', { platform });
    return {
      platform,
      features: [],
      feature_names: [],
      has_data: false,
      error: `Unknown platform: ${platform}. Valid: ${Object.keys(featureMap).join(', ')}`
    };
  }

  try {
    const features = await entry.fetcher();
    const hasData = features.some(v => v !== NEUTRAL_DEFAULT);

    return {
      platform,
      features,
      feature_names: entry.names,
      has_data: hasData
    };
  } catch (err) {
    log.error('Failed to fetch modality features', { platform, error: err.message });
    return {
      platform,
      features: entry.names.map(() => NEUTRAL_DEFAULT),
      feature_names: entry.names,
      has_data: false,
      error: err.message
    };
  }
}
