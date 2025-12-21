/**
 * Intelligent Music Service
 *
 * Provides smart music recommendations by combining:
 * - Whoop health data (recovery, sleep, strain)
 * - User context (upcoming events, time of day)
 * - Spotify search API for public playlists and tracks
 * - Personality profile for music preferences
 *
 * Unlike basic playlist filtering, this service:
 * 1. Searches public Spotify for matching tracks/playlists
 * 2. Uses health data to determine optimal energy levels
 * 3. Provides explanations for why music was recommended
 */

import { supabaseAdmin } from '../config/supabase.js';
import { encryptToken, decryptToken } from './encryption.js';
import { applyPreferencesToMusicParams, generatePreferenceExplanation } from './onboardingQuestionsService.js';

const SPOTIFY_CONFIG = {
  tokenUrl: 'https://accounts.spotify.com/api/token',
  apiBaseUrl: 'https://api.spotify.com/v1'
};

class IntelligentMusicService {
  constructor() {
    this.cache = new Map();
    this.CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes for recommendations
  }

  /**
   * Fetch user's personality preferences from onboarding questionnaire
   * These preferences help tune music recommendations to the user's style
   */
  async getUserPreferences(userId) {
    try {
      const { data: user, error } = await supabaseAdmin
        .from('users')
        .select('personality_quiz')
        .eq('id', userId)
        .single();

      if (error || !user?.personality_quiz?.preferences) {
        console.log(`🎵 [IntelligentMusic] No personality preferences found for user ${userId}`);
        return null;
      }

      console.log(`🎵 [IntelligentMusic] Loaded personality preferences for user ${userId}`);
      return user.personality_quiz.preferences;
    } catch (error) {
      console.error('🎵 [IntelligentMusic] Error fetching user preferences:', error);
      return null;
    }
  }

  /**
   * Fetch user's top tracks and artists from extracted platform data
   * This personalizes recommendations based on actual listening history
   *
   * Handles TWO data formats:
   * 1. 'top_track' (singular) - individual track records with raw_data.id
   * 2. 'top_tracks' (plural) - batch records with raw_data.items[] array
   */
  async getUserMusicProfile(userId) {
    try {
      console.log(`🎵 [IntelligentMusic] Fetching music profile for user ${userId}`);

      // Get top tracks from extracted data - try BOTH data_type formats
      console.log(`🎵 [IntelligentMusic] Querying user_platform_data for user_id=${userId}, platform=spotify`);

      const { data: topTracksSingular, error: tracksError1 } = await supabaseAdmin
        .from('user_platform_data')
        .select('raw_data')
        .eq('user_id', userId)
        .eq('platform', 'spotify')
        .eq('data_type', 'top_track')
        .order('extracted_at', { ascending: false })
        .limit(20);

      console.log(`🎵 [IntelligentMusic] top_track query: ${topTracksSingular?.length || 0} rows, error: ${tracksError1?.message || 'none'}`);

      // Also try plural form (batch records with items array)
      const { data: topTracksPlural, error: tracksError2 } = await supabaseAdmin
        .from('user_platform_data')
        .select('raw_data')
        .eq('user_id', userId)
        .eq('platform', 'spotify')
        .eq('data_type', 'top_tracks')
        .order('extracted_at', { ascending: false })
        .limit(5);

      console.log(`🎵 [IntelligentMusic] top_tracks query: ${topTracksPlural?.length || 0} rows, error: ${tracksError2?.message || 'none'}`);

      // Get top artists from extracted data
      const { data: topArtists, error: artistsError } = await supabaseAdmin
        .from('user_platform_data')
        .select('raw_data')
        .eq('user_id', userId)
        .eq('platform', 'spotify')
        .eq('data_type', 'top_artist')
        .order('extracted_at', { ascending: false })
        .limit(10);

      // Get recently played for variety
      const { data: recentlyPlayed, error: recentError } = await supabaseAdmin
        .from('user_platform_data')
        .select('raw_data')
        .eq('user_id', userId)
        .eq('platform', 'spotify')
        .eq('data_type', 'recently_played')
        .order('extracted_at', { ascending: false })
        .limit(10);

      const profile = {
        topTrackIds: [],
        topArtistIds: [],
        topTrackNames: [],
        topArtistNames: [],
        recentTrackIds: []
      };

      // Extract track IDs from SINGULAR format (each row = one track)
      // Data structure: { track_id, track_name, artist_name, ... }
      if (topTracksSingular && topTracksSingular.length > 0) {
        for (const track of topTracksSingular) {
          const data = track.raw_data;
          // Handle both formats: track_id (our format) or id (Spotify API format)
          const trackId = data?.track_id || data?.id;
          if (trackId) {
            profile.topTrackIds.push(trackId);
            const trackName = data.track_name || data.name || 'Unknown';
            const artistName = data.artist_name || data.artists?.[0]?.name || 'Unknown';
            profile.topTrackNames.push(`${trackName} by ${artistName}`);
          }
        }
      }

      // Extract track IDs from PLURAL format (each row has items[] array)
      if (topTracksPlural && topTracksPlural.length > 0) {
        for (const record of topTracksPlural) {
          const items = record.raw_data?.items || [];
          for (const track of items) {
            if (track?.id && !profile.topTrackIds.includes(track.id)) {
              profile.topTrackIds.push(track.id);
              profile.topTrackNames.push(`${track.name} by ${track.artists?.[0]?.name || 'Unknown'}`);
            }
          }
        }
      }

      // Extract artist IDs and names
      if (topArtists && topArtists.length > 0) {
        for (const artist of topArtists) {
          const data = artist.raw_data;
          if (data?.id) {
            profile.topArtistIds.push(data.id);
            profile.topArtistNames.push(data.name);
          }
        }
      }

      // Extract recent track IDs
      if (recentlyPlayed && recentlyPlayed.length > 0) {
        for (const item of recentlyPlayed) {
          const data = item.raw_data;
          if (data?.track?.id) {
            profile.recentTrackIds.push(data.track.id);
          }
        }
      }

      console.log(`🎵 [IntelligentMusic] Found ${profile.topTrackIds.length} top tracks, ${profile.topArtistIds.length} top artists`);
      if (profile.topTrackIds.length > 0) {
        console.log(`🎵 [IntelligentMusic] Track IDs (first 5): ${profile.topTrackIds.slice(0, 5).join(', ')}`);
      }
      if (profile.topTrackNames.length > 0) {
        console.log(`🎵 [IntelligentMusic] Top tracks: ${profile.topTrackNames.slice(0, 3).join(', ')}...`);
      }

      return profile;
    } catch (error) {
      console.error('🎵 [IntelligentMusic] Error fetching music profile:', error);
      return null;
    }
  }

  /**
   * Get intelligent music recommendations based on user context
   * @param {string} userId - User ID
   * @param {Object} context - User context from UserContextAggregator
   * @param {string} purpose - Purpose of music (pre-event, workout, focus, relax)
   * @returns {Promise<Object>} Recommendations with tracks, playlists, and explanations
   */
  async getRecommendations(userId, context, purpose = 'general') {
    console.log(`🎵 [IntelligentMusic] Getting recommendations for user ${userId}, purpose: ${purpose}`);

    try {
      // 1. Get Spotify access token
      const accessToken = await this.getValidAccessToken(userId);
      if (!accessToken) {
        return {
          success: false,
          error: 'Spotify not connected',
          needsConnection: true
        };
      }

      // 2. Get user's music profile AND personality preferences (in parallel)
      const [musicProfile, userPreferences] = await Promise.all([
        this.getUserMusicProfile(userId),
        this.getUserPreferences(userId)
      ]);
      console.log(`🎵 [IntelligentMusic] Music profile loaded:`, musicProfile ? 'yes' : 'no');
      console.log(`🎵 [IntelligentMusic] Personality preferences loaded:`, userPreferences ? 'yes' : 'no');

      // 3. Analyze context to determine optimal audio features
      let audioFeatureTargets = this.analyzeContextForAudioFeatures(context, purpose);
      console.log(`🎵 [IntelligentMusic] Base target features:`, audioFeatureTargets);

      // 3b. Apply personality preferences if available (from onboarding questionnaire)
      let preferenceAdjustments = null;
      if (userPreferences) {
        preferenceAdjustments = applyPreferencesToMusicParams(userPreferences, {
          purpose,
          calendar: context.calendar,
          whoop: context.whoop,
          mood: audioFeatureTargets.mood
        });

        // Apply the preference adjustments to our audio targets
        if (preferenceAdjustments.energy_modifier) {
          audioFeatureTargets.energy.target = Math.max(0.1, Math.min(0.9,
            audioFeatureTargets.energy.target + preferenceAdjustments.energy_modifier
          ));
        }
        if (preferenceAdjustments.valence_modifier) {
          audioFeatureTargets.valence.target = Math.max(0.1, Math.min(0.9,
            audioFeatureTargets.valence.target + preferenceAdjustments.valence_modifier
          ));
        }
        if (preferenceAdjustments.tempo_modifier) {
          audioFeatureTargets.tempo.target = Math.max(60, Math.min(180,
            audioFeatureTargets.tempo.target + preferenceAdjustments.tempo_modifier
          ));
        }
        if (preferenceAdjustments.instrumentalness_modifier) {
          audioFeatureTargets.instrumentalness.target = Math.max(0, Math.min(1,
            audioFeatureTargets.instrumentalness.target + preferenceAdjustments.instrumentalness_modifier
          ));
        }

        console.log(`🎵 [IntelligentMusic] Adjusted features based on preferences:`, audioFeatureTargets);
      }

      // 4. Generate search queries based on context
      const searchQueries = this.generateSearchQueries(context, purpose, audioFeatureTargets);

      // 5. Search for public playlists (contextual)
      const playlistResults = await this.searchPublicPlaylists(accessToken, searchQueries.playlist);

      // 6. Get personalized Spotify recommendations using user's TOP TRACKS as seeds
      let spotifyRecommendations = [];
      let seedSource = 'search';

      if (musicProfile && musicProfile.topTrackIds.length > 0) {
        // Use user's actual top tracks as seeds for PERSONALIZED recommendations
        console.log(`🎵 [IntelligentMusic] Using ${musicProfile.topTrackIds.length} top tracks as seeds for personalized recommendations`);
        spotifyRecommendations = await this.getSpotifyRecommendations(
          accessToken,
          musicProfile.topTrackIds.slice(0, 5), // Use top 5 tracks as seeds
          audioFeatureTargets
        );
        seedSource = 'user_top_tracks';
      } else if (musicProfile && musicProfile.recentTrackIds.length > 0) {
        // Fallback to recently played tracks
        console.log(`🎵 [IntelligentMusic] Using recently played tracks as seeds`);
        spotifyRecommendations = await this.getSpotifyRecommendations(
          accessToken,
          musicProfile.recentTrackIds.slice(0, 5),
          audioFeatureTargets
        );
        seedSource = 'recently_played';
      } else {
        // Fallback to generic search-based tracks
        console.log(`🎵 [IntelligentMusic] No user data, falling back to search-based recommendations`);
        const trackResults = await this.searchTracks(accessToken, searchQueries.track, audioFeatureTargets);
        spotifyRecommendations = await this.getSpotifyRecommendations(
          accessToken,
          trackResults.seedTracks || [],
          audioFeatureTargets
        );
        seedSource = 'generic_search';
      }

      // 7. Generate explanation for the recommendations (including preference-based explanation)
      let explanation = this.generateExplanation(context, audioFeatureTargets, purpose, musicProfile);

      // Add preference-based explanation if we have preferences
      if (userPreferences && preferenceAdjustments) {
        const preferenceExplanation = generatePreferenceExplanation(userPreferences, {
          purpose,
          calendar: context.calendar,
          whoop: context.whoop
        });
        if (preferenceExplanation) {
          explanation = `${explanation} ${preferenceExplanation}`;
        }
      }

      return {
        success: true,
        recommendations: {
          tracks: spotifyRecommendations,
          playlists: playlistResults,
          reasoning: explanation,
          audioFeatureTargets,
          personalized: seedSource !== 'generic_search' || !!userPreferences,
          seedSource,
          basedOn: {
            whoop: context.whoop ? {
              recovery: context.whoop.recovery,
              recoveryLabel: context.whoop.recoveryLabel,
              strain: context.whoop.strain,
              sleepHours: context.whoop.sleepHours
            } : null,
            event: context.calendar?.nextEvent || null,
            purpose,
            timeOfDay: this.getTimeOfDay(),
            userTopArtists: musicProfile?.topArtistNames?.slice(0, 5) || [],
            userTopTracks: musicProfile?.topTrackNames?.slice(0, 3) || [],
            personalityPreferences: userPreferences ? {
              morning_person: userPreferences.morning_person,
              novelty_seeking: userPreferences.novelty_seeking,
              music_emotional_strategy: userPreferences.music_emotional_strategy,
              stress_coping: userPreferences.stress_coping
            } : null
          }
        }
      };
    } catch (error) {
      console.error('❌ [IntelligentMusic] Error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Analyze user context to determine optimal audio features
   */
  analyzeContextForAudioFeatures(context, purpose) {
    // Default balanced features
    let features = {
      energy: { min: 0.4, max: 0.6, target: 0.5 },
      valence: { min: 0.4, max: 0.7, target: 0.55 },
      tempo: { min: 90, max: 130, target: 110 },
      instrumentalness: { min: 0, max: 1, target: 0.3 },
      mood: 'balanced'
    };

    // Adjust based on Whoop recovery
    if (context.whoop?.recovery !== undefined) {
      const recovery = context.whoop.recovery;

      if (recovery < 33) {
        // Low recovery - calming, restorative music
        features = {
          energy: { min: 0.1, max: 0.4, target: 0.25 },
          valence: { min: 0.3, max: 0.6, target: 0.45 },
          tempo: { min: 60, max: 100, target: 80 },
          instrumentalness: { min: 0.3, max: 1, target: 0.6 },
          mood: 'calm'
        };
        console.log(`🎵 [IntelligentMusic] Low recovery (${recovery}%) - recommending calm music`);
      } else if (recovery < 66) {
        // Medium recovery - balanced energy
        features = {
          energy: { min: 0.3, max: 0.6, target: 0.45 },
          valence: { min: 0.4, max: 0.7, target: 0.55 },
          tempo: { min: 80, max: 120, target: 100 },
          instrumentalness: { min: 0.1, max: 0.7, target: 0.4 },
          mood: 'focused'
        };
        console.log(`🎵 [IntelligentMusic] Medium recovery (${recovery}%) - recommending focused music`);
      } else {
        // High recovery - can handle higher energy
        features = {
          energy: { min: 0.5, max: 0.9, target: 0.7 },
          valence: { min: 0.5, max: 0.9, target: 0.7 },
          tempo: { min: 100, max: 150, target: 125 },
          instrumentalness: { min: 0, max: 0.5, target: 0.2 },
          mood: 'energizing'
        };
        console.log(`🎵 [IntelligentMusic] High recovery (${recovery}%) - recommending energizing music`);
      }
    }

    // Adjust based on current strain (if high strain today, lower the energy)
    if (context.whoop?.strain > 15) {
      features.energy.target = Math.max(0.2, features.energy.target - 0.15);
      features.energy.max = Math.max(0.4, features.energy.max - 0.1);
      console.log(`🎵 [IntelligentMusic] High strain (${context.whoop.strain}) - reducing energy level`);
    }

    // Get recovery level for purpose-aware adjustments
    const recovery = context.whoop?.recovery ?? 50;
    const isLowRecovery = recovery < 33;
    const isHighRecovery = recovery >= 67;

    // Adjust based on purpose (with recovery awareness)
    switch (purpose) {
      case 'pre-event':
        // Before events - build confidence, but respect recovery
        if (isLowRecovery) {
          // Low recovery: calm confidence, not high energy
          features.energy.target = Math.min(0.45, features.energy.target + 0.1);
          features.valence.target = Math.min(0.65, features.valence.target + 0.1);
          features.mood = 'focused';
          console.log(`🎵 [IntelligentMusic] Pre-event with LOW recovery - calm confidence`);
        } else if (isHighRecovery) {
          // High recovery: full confidence boost
          features.energy.target = Math.min(0.85, features.energy.target + 0.15);
          features.valence.target = Math.min(0.9, features.valence.target + 0.15);
          features.mood = 'energizing';
          console.log(`🎵 [IntelligentMusic] Pre-event with HIGH recovery - full confidence`);
        } else {
          // Medium recovery: balanced confidence
          features.energy.target = Math.min(0.65, features.energy.target + 0.1);
          features.valence.target = Math.min(0.75, features.valence.target + 0.1);
          features.mood = 'focused';
        }
        break;
      case 'focus':
        // For focus, prefer instrumental and moderate tempo (respects recovery)
        features.instrumentalness.target = 0.7;
        features.tempo.target = isLowRecovery ? 75 : 90;
        features.energy.target = isLowRecovery ? 0.3 : 0.4;
        features.mood = 'focused';
        break;
      case 'workout':
        // For workout - high energy but adjusted for recovery
        if (isLowRecovery) {
          // Low recovery: moderate workout intensity
          features.energy.target = 0.65;
          features.tempo.target = 115;
          features.valence.target = 0.65;
          features.mood = 'energizing';
          console.log(`🎵 [IntelligentMusic] Workout with LOW recovery - moderate intensity`);
        } else {
          // Normal/high recovery: full workout intensity
          features.energy.target = 0.85;
          features.tempo.target = 140;
          features.valence.target = 0.75;
          features.mood = 'power';
        }
        break;
      case 'relax':
        // For relaxation
        features.energy.target = 0.2;
        features.tempo.target = 70;
        features.instrumentalness.target = 0.6;
        features.mood = 'calm';
        break;
      case 'sleep':
        // For sleep preparation
        features.energy.target = 0.1;
        features.tempo.target = 60;
        features.instrumentalness.target = 0.8;
        features.valence.target = 0.3;
        features.mood = 'calm';
        break;
    }

    // Adjust based on upcoming event type
    if (context.calendar?.nextEvent) {
      const eventType = context.calendar.nextEvent.type?.toLowerCase() || '';
      const minutesUntil = context.calendar.nextEvent.minutesUntil;

      if (minutesUntil && minutesUntil < 60) {
        // Event soon - adjust for preparation
        if (eventType.includes('meeting') || eventType.includes('presentation')) {
          features.mood = 'focused';
          features.energy.target = Math.min(features.energy.target, 0.5);
        } else if (eventType.includes('workout') || eventType.includes('gym')) {
          features.mood = 'power';
          features.energy.target = 0.8;
        }
      }
    }

    // Time of day adjustments
    const hour = new Date().getHours();
    if (hour >= 22 || hour < 6) {
      // Late night / early morning - calm down
      features.energy.target = Math.min(features.energy.target, 0.4);
      features.tempo.target = Math.min(features.tempo.target, 100);
    } else if (hour >= 6 && hour < 10) {
      // Morning - gentle wake up
      features.energy.target = Math.min(features.energy.target, 0.6);
    }

    return features;
  }

  /**
   * Generate search queries based on context
   */
  generateSearchQueries(context, purpose, audioFeatures) {
    const queries = {
      playlist: [],
      track: []
    };

    // Base mood keywords
    const moodKeywords = {
      calm: ['chill', 'relaxing', 'peaceful', 'ambient', 'acoustic'],
      focused: ['focus', 'concentration', 'study', 'deep work', 'instrumental'],
      energizing: ['upbeat', 'energetic', 'motivation', 'happy', 'workout'],
      power: ['power', 'workout', 'high energy', 'pump up', 'gym'],
      balanced: ['mood', 'vibe', 'feel good', 'positive']
    };

    const keywords = moodKeywords[audioFeatures.mood] || moodKeywords.balanced;

    // Add playlist search queries
    queries.playlist = [
      ...keywords.slice(0, 2).map(k => `${k} playlist`),
      `${audioFeatures.mood} music`
    ];

    // Add genre-based queries based on tempo
    if (audioFeatures.tempo.target > 120) {
      queries.playlist.push('electronic dance');
      queries.track.push('electronic pop');
    } else if (audioFeatures.tempo.target < 90) {
      queries.playlist.push('lo-fi beats');
      queries.track.push('ambient acoustic');
    } else {
      queries.playlist.push('indie chill');
      queries.track.push('alternative pop');
    }

    // Add purpose-specific queries
    switch (purpose) {
      case 'pre-event':
        queries.playlist.push('confidence boost', 'pre-presentation');
        queries.track.push('motivation', 'confidence');
        break;
      case 'focus':
        queries.playlist.push('deep focus', 'coding music', 'study beats');
        queries.track.push('instrumental focus');
        break;
      case 'workout':
        queries.playlist.push('workout motivation', 'gym playlist', 'running');
        queries.track.push('workout hits');
        break;
      case 'relax':
        queries.playlist.push('relaxation', 'unwind', 'stress relief');
        queries.track.push('calm acoustic');
        break;
      case 'sleep':
        queries.playlist.push('sleep music', 'deep sleep', 'sleep sounds', 'bedtime');
        queries.track.push('ambient sleep', 'peaceful night', 'sleep meditation');
        break;
    }

    // Add recovery-based queries (labels are 'Red', 'Yellow', 'Green')
    if (context.whoop?.recoveryLabel) {
      const label = context.whoop.recoveryLabel.toLowerCase();
      if (label === 'red' || label === 'low') {
        // Low recovery - restorative music
        queries.playlist.push('recovery', 'restorative', 'healing');
        queries.track.push('gentle', 'soothing');
      } else if (label === 'yellow' || label === 'medium') {
        // Medium recovery - balanced music
        queries.playlist.push('steady focus', 'productive');
        queries.track.push('moderate energy');
      } else if (label === 'green' || label === 'high') {
        // High recovery - energizing music
        queries.playlist.push('high energy', 'peak performance', 'power');
        queries.track.push('uplifting', 'energetic');
      }
    }

    // Add event-type specific queries for upcoming calendar events
    if (context.calendar?.nextEvent) {
      const eventType = context.calendar.nextEvent.type?.toLowerCase() || '';
      const eventTitle = context.calendar.nextEvent.title?.toLowerCase() || '';
      const minutesUntil = context.calendar.nextEvent.minutesUntil;

      // Only add event-specific queries if event is within 2 hours
      if (minutesUntil && minutesUntil < 120) {
        if (eventType === 'presentation' || eventTitle.includes('presentation') || eventTitle.includes('demo')) {
          queries.playlist.push('presentation confidence', 'public speaking energy');
          queries.track.push('empowering', 'confidence boost');
        } else if (eventType === 'interview' || eventTitle.includes('interview')) {
          queries.playlist.push('interview prep', 'professional focus', 'calm confidence');
          queries.track.push('composed', 'professional');
        } else if (eventType === 'meeting' || eventTitle.includes('meeting') || eventTitle.includes('call')) {
          queries.playlist.push('focus meeting', 'productive');
          queries.track.push('clear mind');
        } else if (eventType === 'workout' || eventTitle.includes('workout') || eventTitle.includes('gym') || eventTitle.includes('exercise')) {
          queries.playlist.push('pre workout', 'pump up', 'gym motivation');
          queries.track.push('high energy', 'power');
        } else if (eventType === 'learning' || eventTitle.includes('class') || eventTitle.includes('lecture') || eventTitle.includes('study')) {
          queries.playlist.push('study focus', 'learning music', 'concentration');
          queries.track.push('focus instrumental');
        } else if (eventType === 'deadline' || eventTitle.includes('deadline') || eventTitle.includes('due')) {
          queries.playlist.push('deadline crunch', 'intense focus', 'productivity');
          queries.track.push('determined', 'driven');
        } else if (eventType === 'social' || eventTitle.includes('dinner') || eventTitle.includes('party') || eventTitle.includes('drinks')) {
          queries.playlist.push('social vibe', 'feel good', 'getting ready');
          queries.track.push('upbeat', 'fun');
        }
      }
    }

    return queries;
  }

  /**
   * Search for public playlists on Spotify
   */
  async searchPublicPlaylists(accessToken, queries) {
    const playlists = [];

    for (const query of queries.slice(0, 3)) { // Limit to 3 queries
      try {
        const response = await fetch(
          `${SPOTIFY_CONFIG.apiBaseUrl}/search?` +
          `q=${encodeURIComponent(query)}&type=playlist&limit=5`,
          {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          }
        );

        if (response.ok) {
          const data = await response.json();
          const items = data.playlists?.items || [];

          for (const playlist of items) {
            if (playlist && !playlists.find(p => p.id === playlist.id)) {
              playlists.push({
                id: playlist.id,
                name: playlist.name,
                description: playlist.description,
                imageUrl: playlist.images?.[0]?.url,
                trackCount: playlist.tracks?.total || 0,
                owner: playlist.owner?.display_name || 'Spotify',
                uri: playlist.uri,
                external_url: playlist.external_urls?.spotify
              });
            }
          }
        }
      } catch (error) {
        console.error(`🎵 [IntelligentMusic] Playlist search error for "${query}":`, error.message);
      }
    }

    return playlists.slice(0, 10); // Return top 10 unique playlists
  }

  /**
   * Search for tracks on Spotify
   */
  async searchTracks(accessToken, queries, audioFeatures) {
    const tracks = [];
    const seedTracks = [];

    for (const query of queries.slice(0, 2)) { // Limit to 2 queries
      try {
        const response = await fetch(
          `${SPOTIFY_CONFIG.apiBaseUrl}/search?` +
          `q=${encodeURIComponent(query)}&type=track&limit=10`,
          {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          }
        );

        if (response.ok) {
          const data = await response.json();
          const items = data.tracks?.items || [];

          for (const track of items) {
            if (track && !tracks.find(t => t.id === track.id)) {
              const trackObj = {
                id: track.id,
                name: track.name,
                artist: track.artists?.map(a => a.name).join(', ') || 'Unknown',
                album: track.album?.name,
                albumArt: track.album?.images?.[0]?.url,
                duration: track.duration_ms,
                uri: track.uri,
                preview_url: track.preview_url,
                external_url: track.external_urls?.spotify
              };
              tracks.push(trackObj);

              // Keep first 3 for seed tracks
              if (seedTracks.length < 3) {
                seedTracks.push(track.id);
              }
            }
          }
        }
      } catch (error) {
        console.error(`🎵 [IntelligentMusic] Track search error for "${query}":`, error.message);
      }
    }

    return { tracks: tracks.slice(0, 8), seedTracks };
  }

  /**
   * Get personalized music recommendations
   * Note: Spotify deprecated /v1/recommendations endpoint in November 2024
   * We now use the user's top tracks directly with full track details from /v1/tracks
   */
  async getSpotifyRecommendations(accessToken, seedTrackIds, audioFeatures) {
    console.log('🎵 [IntelligentMusic] Getting personalized tracks with:', {
      seedTrackIdsCount: seedTrackIds?.length || 0,
      hasAccessToken: !!accessToken
    });

    if (seedTrackIds.length === 0) {
      console.log('🎵 [IntelligentMusic] No seed tracks available');
      return [];
    }

    try {
      // Fetch full track details for user's top tracks
      // Take up to 10 tracks for recommendations
      const trackIdsToFetch = seedTrackIds.slice(0, 10);

      console.log(`🎵 [IntelligentMusic] Fetching ${trackIdsToFetch.length} tracks from user's top tracks`);

      const response = await fetch(
        `${SPOTIFY_CONFIG.apiBaseUrl}/tracks?ids=${trackIdsToFetch.join(',')}`,
        {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }
      );

      console.log(`🎵 [IntelligentMusic] Spotify tracks API response status: ${response.status}`);

      if (response.ok) {
        const data = await response.json();
        const tracks = data.tracks || [];
        console.log(`🎵 [IntelligentMusic] Got ${tracks.length} tracks from user's library`);

        return tracks.filter(track => track !== null).map(track => ({
          id: track.id,
          name: track.name,
          artist: track.artists?.map(a => a.name).join(', ') || 'Unknown',
          album: track.album?.name,
          albumArt: track.album?.images?.[0]?.url,
          duration: track.duration_ms,
          uri: track.uri,
          preview_url: track.preview_url,
          external_url: track.external_urls?.spotify,
          isPersonalized: true,
          source: 'user_top_tracks'
        }));
      } else {
        const errorBody = await response.text();
        console.error(`❌ [IntelligentMusic] Spotify tracks API failed: ${response.status} - ${errorBody}`);
      }
    } catch (error) {
      console.error('❌ [IntelligentMusic] Error fetching tracks:', error.message);
    }

    return [];
  }

  /**
   * Generate human-readable explanation for recommendations
   */
  generateExplanation(context, audioFeatures, purpose, musicProfile = null) {
    const parts = [];

    // Personalization explanation (NEW!)
    if (musicProfile && musicProfile.topArtistNames.length > 0) {
      const artistList = musicProfile.topArtistNames.slice(0, 3).join(', ');
      parts.push(`Based on your love for ${artistList} and similar artists, I've curated these tracks just for you.`);
    }

    // Whoop-based explanation
    if (context.whoop?.recovery !== undefined) {
      const recovery = context.whoop.recovery;
      if (recovery < 33) {
        parts.push(`Your recovery is at ${recovery}% today, so I'm suggesting calming, restorative music to help you recharge.`);
      } else if (recovery < 66) {
        parts.push(`With ${recovery}% recovery, you're in a balanced state - recommending focused, moderate-energy music.`);
      } else {
        parts.push(`Your ${recovery}% recovery means you're ready for higher energy - enjoy some upbeat tracks!`);
      }

      if (context.whoop.strain > 15) {
        parts.push(`Your strain is already high (${context.whoop.strain}/21), so I've dialed back the intensity slightly.`);
      }

      if (context.whoop.sleepHours && context.whoop.sleepHours < 6) {
        parts.push(`With only ${context.whoop.sleepHours.toFixed(1)} hours of sleep, I'm prioritizing gentler tracks.`);
      }
    }

    // Event-based explanation
    if (context.calendar?.nextEvent) {
      const event = context.calendar.nextEvent;
      if (event.minutesUntil && event.minutesUntil < 120) {
        parts.push(`You have "${event.title}" coming up in ${event.minutesUntil} minutes - these tracks should help you prepare.`);
      }
    }

    // Purpose-based explanation
    switch (purpose) {
      case 'pre-event':
        parts.push('These selections are optimized for building confidence before your event.');
        break;
      case 'focus':
        parts.push('Instrumental and minimal vocals to help you maintain deep focus.');
        break;
      case 'workout':
        parts.push('High BPM tracks to power through your workout.');
        break;
      case 'relax':
        parts.push('Peaceful sounds to help you unwind.');
        break;
    }

    // Time of day
    const timeOfDay = this.getTimeOfDay();
    if (timeOfDay === 'morning') {
      parts.push('Starting your morning with energizing but not overwhelming tracks.');
    } else if (timeOfDay === 'evening') {
      parts.push('Winding down the evening with more relaxed selections.');
    }

    return parts.join(' ') || 'Music selected based on your current context and preferences.';
  }

  /**
   * Get valid Spotify access token, refreshing if needed
   */
  async getValidAccessToken(userId) {
    try {
      const { data: connection, error } = await supabaseAdmin
        .from('platform_connections')
        .select('access_token, token_expires_at, refresh_token')
        .eq('user_id', userId)
        .eq('platform', 'spotify')
        .single();

      if (error || !connection) {
        return null;
      }

      let accessToken = decryptToken(connection.access_token);

      // Check if token is expired
      if (connection.token_expires_at && new Date(connection.token_expires_at) < new Date()) {
        console.log('🎵 [IntelligentMusic] Token expired, refreshing...');
        accessToken = await this.refreshToken(userId, connection.refresh_token);
      }

      return accessToken;
    } catch (error) {
      console.error('🎵 [IntelligentMusic] Token error:', error);
      return null;
    }
  }

  /**
   * Refresh Spotify access token
   */
  async refreshToken(userId, encryptedRefreshToken) {
    try {
      const refreshToken = decryptToken(encryptedRefreshToken);

      const response = await fetch(SPOTIFY_CONFIG.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(
            `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
          ).toString('base64')}`
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken
        })
      });

      if (!response.ok) {
        console.error('🎵 [IntelligentMusic] Token refresh failed:', response.status);
        return null;
      }

      const tokens = await response.json();
      const newAccessToken = tokens.access_token;
      const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

      // Update stored tokens
      await supabaseAdmin
        .from('platform_connections')
        .update({
          access_token: encryptToken(newAccessToken),
          token_expires_at: expiresAt.toISOString(),
          ...(tokens.refresh_token ? { refresh_token: encryptToken(tokens.refresh_token) } : {})
        })
        .eq('user_id', userId)
        .eq('platform', 'spotify');

      console.log('🎵 [IntelligentMusic] Token refreshed successfully');
      return newAccessToken;
    } catch (error) {
      console.error('🎵 [IntelligentMusic] Token refresh error:', error);
      return null;
    }
  }

  /**
   * Get time of day category
   */
  getTimeOfDay() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 21) return 'evening';
    return 'night';
  }

  /**
   * Get quick music suggestions without full recommendation pipeline
   * Useful for lighter-weight requests
   */
  async getQuickSuggestions(userId, mood = 'balanced') {
    console.log(`🎵 [IntelligentMusic] Quick suggestions for mood: ${mood}`);

    const accessToken = await this.getValidAccessToken(userId);
    if (!accessToken) {
      return { success: false, error: 'Spotify not connected' };
    }

    const moodQueries = {
      calm: 'chill acoustic',
      focused: 'focus instrumental',
      energizing: 'upbeat pop hits',
      power: 'workout motivation',
      balanced: 'feel good music'
    };

    const query = moodQueries[mood] || moodQueries.balanced;
    const playlists = await this.searchPublicPlaylists(accessToken, [query]);

    return {
      success: true,
      mood,
      playlists: playlists.slice(0, 5)
    };
  }
}

// Export singleton instance
const intelligentMusicService = new IntelligentMusicService();
export default intelligentMusicService;
