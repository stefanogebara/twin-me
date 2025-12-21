/**
 * Music Agent - AI-Powered Music Automation
 *
 * Learns user's music preferences from Spotify listening history and automates:
 * - Playlist generation based on mood/activity
 * - Music discovery tailored to taste
 * - Context-aware recommendations
 *
 * Architecture:
 * - Learner: Analyzes listening history and extracts preferences
 * - Memory: Three-tier memory system (short/medium/long-term)
 * - Tasks: Executes user requests (create playlist, discover music, etc.)
 */

import SpotifyWebApi from 'spotify-web-api-node';
import { createClient } from '@supabase/supabase-js';
import { decryptToken } from './encryption.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

class MusicAgent {
  constructor(userId, accessToken = null, refreshToken = null) {
    this.userId = userId;
    this.spotifyApi = new SpotifyWebApi({
      clientId: process.env.SPOTIFY_CLIENT_ID,
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
      redirectUri: `${process.env.VITE_APP_URL || 'http://localhost:8086'}/oauth/callback`
    });

    if (accessToken) {
      this.spotifyApi.setAccessToken(accessToken);
    }
    if (refreshToken) {
      this.spotifyApi.setRefreshToken(refreshToken);
    }
  }

  /**
   * Initialize agent by loading credentials from database
   */
  static async initialize(userId) {
    try {
      // Get Spotify credentials from database
      const { data: connection, error } = await supabase
        .from('platform_connections')
        .select('access_token, refresh_token, token_expires_at, status')
        .eq('user_id', userId)
        .eq('platform', 'spotify')
        .single();

      if (error || !connection) {
        throw new Error('Spotify not connected. Please connect your Spotify account first.');
      }

      if (connection.status !== 'connected') {
        throw new Error(`Spotify connection status: ${connection.status}. Please reconnect.`);
      }

      // Note: We don't check token_expires_at here because:
      // 1. The automatic token refresh service keeps tokens fresh
      // 2. If token is actually invalid, Spotify API will return an error
      // 3. This prevents false-positive "token expired" errors

      // Decrypt tokens
      const accessToken = decryptToken(connection.access_token);
      const refreshToken = connection.refresh_token ? decryptToken(connection.refresh_token) : null;

      const agent = new MusicAgent(userId, accessToken, refreshToken);
      return agent;
    } catch (error) {
      console.error('Failed to initialize Music Agent:', error);
      throw error;
    }
  }

  // ============================================
  // DATA COLLECTION
  // ============================================

  /**
   * Collect user's listening history from Spotify
   * Returns: { topTracks, recentTracks, audioFeatures }
   */
  async collectListeningHistory() {
    try {
      console.log(`🎵 [Music Agent] Collecting listening history for user ${this.userId}`);

      // Fetch top tracks (long-term preferences)
      const topTracksShort = await this.spotifyApi.getMyTopTracks({
        limit: 50,
        time_range: 'short_term' // Last 4 weeks
      });

      const topTracksMedium = await this.spotifyApi.getMyTopTracks({
        limit: 50,
        time_range: 'medium_term' // Last 6 months
      });

      const topTracksLong = await this.spotifyApi.getMyTopTracks({
        limit: 50,
        time_range: 'long_term' // All time
      });

      // Fetch recently played tracks (current patterns)
      const recentTracks = await this.spotifyApi.getMyRecentlyPlayedTracks({
        limit: 50
      });

      // Combine all tracks
      const allTracks = [
        ...topTracksShort.body.items,
        ...topTracksMedium.body.items,
        ...topTracksLong.body.items,
        ...recentTracks.body.items.map(item => item.track)
      ];

      // Deduplicate by track ID
      const uniqueTracks = Array.from(
        new Map(allTracks.map(track => [track.id, track])).values()
      );

      console.log(`📊 Collected ${uniqueTracks.length} unique tracks`);

      // Fetch audio features for all tracks (batch request)
      const trackIds = uniqueTracks.map(track => track.id);
      const audioFeatures = await this.fetchAudioFeaturesBatch(trackIds);

      // Store tracks in database
      await this.storeTracksInDatabase(uniqueTracks, audioFeatures);

      return {
        topTracks: {
          short_term: topTracksShort.body.items,
          medium_term: topTracksMedium.body.items,
          long_term: topTracksLong.body.items
        },
        recentTracks: recentTracks.body.items,
        audioFeatures,
        totalTracks: uniqueTracks.length
      };

    } catch (error) {
      console.error('Error collecting listening history:', error);
      throw new Error(`Failed to collect listening history: ${error.message}`);
    }
  }

  /**
   * Fetch audio features for tracks in batches (max 100 per request)
   */
  async fetchAudioFeaturesBatch(trackIds) {
    const batchSize = 100;
    const batches = [];

    for (let i = 0; i < trackIds.length; i += batchSize) {
      batches.push(trackIds.slice(i, i + batchSize));
    }

    const allFeatures = [];

    for (const batch of batches) {
      const response = await this.spotifyApi.getAudioFeaturesForTracks(batch);
      allFeatures.push(...response.body.audio_features.filter(f => f !== null));
    }

    return allFeatures;
  }

  /**
   * Store tracks and audio features in database
   */
  async storeTracksInDatabase(tracks, audioFeatures) {
    const audioFeaturesMap = new Map(
      audioFeatures.map(feature => [feature.id, feature])
    );

    const tracksToInsert = tracks.map(track => {
      const features = audioFeaturesMap.get(track.id) || {};

      return {
        user_id: this.userId,
        spotify_track_id: track.id,
        track_name: track.name,
        artist_name: track.artists[0]?.name || 'Unknown',
        album_name: track.album?.name,
        duration_ms: track.duration_ms,
        release_date: track.album?.release_date,

        // Audio features
        acousticness: features.acousticness,
        danceability: features.danceability,
        energy: features.energy,
        instrumentalness: features.instrumentalness,
        liveness: features.liveness,
        loudness: features.loudness,
        speechiness: features.speechiness,
        tempo: features.tempo,
        time_signature: features.time_signature,
        valence: features.valence,

        play_count: 1,
        last_played_at: new Date().toISOString()
      };
    });

    // Upsert tracks (insert or update if exists)
    const { error } = await supabase
      .from('agent_music_tracks')
      .upsert(tracksToInsert, {
        onConflict: 'user_id,spotify_track_id',
        ignoreDuplicates: false
      });

    if (error) {
      console.error('Error storing tracks:', error);
      throw error;
    }

    console.log(`💾 Stored ${tracksToInsert.length} tracks in database`);
  }

  // ============================================
  // PREFERENCE LEARNING
  // ============================================

  /**
   * Learn user preferences from stored tracks
   * Analyzes audio features, genres, artists, and listening patterns
   */
  async learnPreferences() {
    try {
      console.log(`🧠 [Music Agent] Learning preferences for user ${this.userId}`);

      // Get all user's tracks from database
      const { data: tracks, error } = await supabase
        .from('agent_music_tracks')
        .select('*')
        .eq('user_id', this.userId);

      if (error) throw error;

      if (!tracks || tracks.length === 0) {
        console.log('⚠️  No tracks found. Run data collection first.');
        return null;
      }

      console.log(`📊 Analyzing ${tracks.length} tracks...`);

      // Calculate average audio features (user's preference profile)
      const preferences = this.calculateAudioFeaturePreferences(tracks);

      // Extract genre preferences
      const genrePreferences = await this.extractGenrePreferences();

      // Extract artist preferences
      const artistPreferences = await this.extractArtistPreferences();

      // Detect listening patterns (time of day, etc.)
      const listeningPatterns = this.detectListeningPatterns(tracks);

      // Classify tracks by mood
      const moodPreferences = this.classifyMoodPreferences(tracks);

      // Store preferences in database
      await this.storePreferences({
        ...preferences,
        genre_preferences: genrePreferences,
        artist_preferences: artistPreferences,
        listening_patterns: listeningPatterns,
        mood_preferences: moodPreferences,
        total_tracks_analyzed: tracks.length,
        confidence_score: this.calculateConfidenceScore(tracks.length),
        last_learning_at: new Date().toISOString()
      });

      console.log(`✅ Preferences learned and stored`);

      return {
        audioFeatures: preferences,
        genres: genrePreferences,
        artists: artistPreferences,
        patterns: listeningPatterns,
        moods: moodPreferences,
        confidence: this.calculateConfidenceScore(tracks.length)
      };

    } catch (error) {
      console.error('Error learning preferences:', error);
      throw error;
    }
  }

  /**
   * Calculate average audio feature preferences
   */
  calculateAudioFeaturePreferences(tracks) {
    const validTracks = tracks.filter(t =>
      t.valence !== null &&
      t.energy !== null &&
      t.danceability !== null
    );

    if (validTracks.length === 0) {
      return {};
    }

    const sum = validTracks.reduce((acc, track) => ({
      valence: acc.valence + (track.valence || 0),
      energy: acc.energy + (track.energy || 0),
      danceability: acc.danceability + (track.danceability || 0),
      tempo: acc.tempo + (track.tempo || 0),
      acousticness: acc.acousticness + (track.acousticness || 0),
      instrumentalness: acc.instrumentalness + (track.instrumentalness || 0),
      speechiness: acc.speechiness + (track.speechiness || 0)
    }), {
      valence: 0,
      energy: 0,
      danceability: 0,
      tempo: 0,
      acousticness: 0,
      instrumentalness: 0,
      speechiness: 0
    });

    const count = validTracks.length;

    return {
      preferred_valence: (sum.valence / count).toFixed(2),
      preferred_energy: (sum.energy / count).toFixed(2),
      preferred_danceability: (sum.danceability / count).toFixed(2),
      preferred_tempo: Math.round(sum.tempo / count),
      preferred_acousticness: (sum.acousticness / count).toFixed(2),
      preferred_instrumentalness: (sum.instrumentalness / count).toFixed(2),
      preferred_speechiness: (sum.speechiness / count).toFixed(2)
    };
  }

  /**
   * Extract genre preferences from top artists
   */
  async extractGenrePreferences() {
    try {
      const topArtists = await this.spotifyApi.getMyTopArtists({ limit: 50 });

      const genreCounts = {};
      topArtists.body.items.forEach(artist => {
        artist.genres.forEach(genre => {
          genreCounts[genre] = (genreCounts[genre] || 0) + 1;
        });
      });

      // Convert to array and sort by frequency
      const genrePreferences = Object.entries(genreCounts)
        .map(([genre, count]) => ({
          genre,
          weight: (count / topArtists.body.items.length).toFixed(2)
        }))
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 20); // Top 20 genres

      return genrePreferences;
    } catch (error) {
      console.error('Error extracting genre preferences:', error);
      return [];
    }
  }

  /**
   * Extract artist preferences
   */
  async extractArtistPreferences() {
    try {
      const topArtists = await this.spotifyApi.getMyTopArtists({
        limit: 50,
        time_range: 'medium_term'
      });

      const artistPreferences = topArtists.body.items.map((artist, index) => ({
        artist_id: artist.id,
        name: artist.name,
        weight: ((50 - index) / 50).toFixed(2), // Higher weight for top artists
        genres: artist.genres,
        popularity: artist.popularity
      }));

      return artistPreferences;
    } catch (error) {
      console.error('Error extracting artist preferences:', error);
      return [];
    }
  }

  /**
   * Detect listening patterns (placeholder for future ML)
   */
  detectListeningPatterns(tracks) {
    // TODO: Implement time-based pattern detection
    // For now, return empty pattern
    return {
      morning: "unknown",
      afternoon: "unknown",
      evening: "unknown",
      weekend: "unknown"
    };
  }

  /**
   * Classify tracks by mood based on audio features
   */
  classifyMoodPreferences(tracks) {
    const moods = {
      happy: tracks.filter(t => t.valence > 0.6 && t.energy > 0.5).length,
      sad: tracks.filter(t => t.valence < 0.4 && t.energy < 0.5).length,
      energetic: tracks.filter(t => t.energy > 0.7).length,
      calm: tracks.filter(t => t.energy < 0.4).length,
      focus: tracks.filter(t => t.instrumentalness > 0.5 || t.speechiness < 0.1).length,
      party: tracks.filter(t => t.danceability > 0.7 && t.energy > 0.6).length
    };

    return Object.entries(moods)
      .map(([mood, count]) => ({ mood, tracks: count }))
      .filter(m => m.tracks > 0)
      .sort((a, b) => b.tracks - a.tracks);
  }

  /**
   * Calculate confidence score based on data quantity
   */
  calculateConfidenceScore(trackCount) {
    // Confidence increases with more data, caps at 1.00
    // 10 tracks = 0.20, 50 tracks = 0.60, 100+ tracks = 1.00
    const confidence = Math.min(1.0, trackCount / 100);
    return confidence.toFixed(2);
  }

  /**
   * Store learned preferences in database
   */
  async storePreferences(preferences) {
    const { error } = await supabase
      .from('agent_music_preferences')
      .upsert({
        user_id: this.userId,
        ...preferences,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      });

    if (error) {
      console.error('Error storing preferences:', error);
      throw error;
    }
  }

  // ============================================
  // PLAYLIST GENERATION
  // ============================================

  /**
   * Generate playlist based on mood/activity
   */
  async generatePlaylist({ mood, activity, duration = 60, includeFamiliar = true, includeNew = true }) {
    try {
      console.log(`🎼 [Music Agent] Generating ${mood || activity} playlist for user ${this.userId}`);

      // Get user preferences
      const { data: prefs } = await supabase
        .from('agent_music_preferences')
        .select('*')
        .eq('user_id', this.userId)
        .single();

      if (!prefs) {
        throw new Error('No preferences found. Run learning first.');
      }

      // Define target audio features based on mood/activity
      const targets = this.getMoodActivityTargets(mood, activity, prefs);

      // Get candidate tracks from database
      const { data: tracks } = await supabase
        .from('agent_music_tracks')
        .select('*')
        .eq('user_id', this.userId);

      if (!tracks || tracks.length === 0) {
        throw new Error('No tracks found in database');
      }

      // Score and rank tracks by similarity to target
      const scoredTracks = this.scoreTracksBySimilarity(tracks, targets);

      // Calculate how many tracks we need
      const avgTrackDuration = 3.5; // minutes
      const targetTrackCount = Math.round(duration / avgTrackDuration);

      // Build playlist with diversity
      const playlistTracks = this.buildDiversePlaylist(
        scoredTracks,
        targetTrackCount,
        { includeFamiliar, includeNew }
      );

      // Create playlist object
      const playlist = {
        user_id: this.userId,
        name: this.generatePlaylistName(mood, activity),
        description: this.generatePlaylistDescription(mood, activity, targets),
        playlist_type: mood ? 'mood' : 'activity',
        generation_prompt: `${mood || activity} playlist`,
        target_mood: mood,
        target_activity: activity,
        target_duration_minutes: duration,
        tracks: playlistTracks.map((track, index) => ({
          spotify_track_id: track.spotify_track_id,
          track_name: track.track_name,
          artist_name: track.artist_name,
          position: index + 1,
          similarity_score: track.score,
          reason: track.reason
        })),
        ...targets,
        diversity_score: this.calculateDiversityScore(playlistTracks),
        relevance_score: this.calculateRelevanceScore(playlistTracks),
        novelty_score: this.calculateNoveltyScore(playlistTracks)
      };

      // Store playlist in database
      const { data: savedPlaylist, error } = await supabase
        .from('agent_music_playlists')
        .insert(playlist)
        .select()
        .single();

      if (error) throw error;

      console.log(`✅ Playlist generated: ${playlist.name}`);

      return savedPlaylist;

    } catch (error) {
      console.error('Error generating playlist:', error);
      throw error;
    }
  }

  /**
   * Get target audio features for mood/activity
   */
  getMoodActivityTargets(mood, activity, userPrefs) {
    const moodTargets = {
      happy: { valence: 0.8, energy: 0.7, danceability: 0.6 },
      sad: { valence: 0.3, energy: 0.3, danceability: 0.4 },
      energetic: { valence: 0.7, energy: 0.9, danceability: 0.7 },
      calm: { valence: 0.5, energy: 0.2, danceability: 0.3 },
      focus: { valence: 0.5, energy: 0.4, danceability: 0.3 },
      party: { valence: 0.8, energy: 0.9, danceability: 0.9 }
    };

    const activityTargets = {
      workout: { valence: 0.7, energy: 0.9, danceability: 0.7, tempo: 140 },
      studying: { valence: 0.5, energy: 0.3, danceability: 0.2, tempo: 90 },
      coding: { valence: 0.6, energy: 0.5, danceability: 0.4, tempo: 110 },
      running: { valence: 0.7, energy: 0.9, danceability: 0.6, tempo: 160 },
      sleeping: { valence: 0.4, energy: 0.1, danceability: 0.1, tempo: 60 }
    };

    const baseTarget = mood ? moodTargets[mood] : activityTargets[activity];

    // Blend with user preferences (70% target, 30% user preference)
    return {
      target_valence: (baseTarget.valence * 0.7 + parseFloat(userPrefs.preferred_valence || 0.5) * 0.3).toFixed(2),
      target_energy: (baseTarget.energy * 0.7 + parseFloat(userPrefs.preferred_energy || 0.5) * 0.3).toFixed(2),
      target_danceability: (baseTarget.danceability * 0.7 + parseFloat(userPrefs.preferred_danceability || 0.5) * 0.3).toFixed(2),
      target_tempo: baseTarget.tempo || parseInt(userPrefs.preferred_tempo) || 120
    };
  }

  /**
   * Score tracks by similarity to target features
   */
  scoreTracksBySimilarity(tracks, targets) {
    return tracks.map(track => {
      // Calculate Euclidean distance in feature space
      const valenceDiff = Math.abs(track.valence - targets.target_valence);
      const energyDiff = Math.abs(track.energy - targets.target_energy);
      const danceabilityDiff = Math.abs(track.danceability - targets.target_danceability);
      const tempoDiff = Math.abs(track.tempo - targets.target_tempo) / 200; // Normalize tempo

      const distance = Math.sqrt(
        valenceDiff ** 2 +
        energyDiff ** 2 +
        danceabilityDiff ** 2 +
        tempoDiff ** 2
      );

      // Convert distance to similarity score (0-1, higher is better)
      const score = Math.max(0, 1 - distance);

      return {
        ...track,
        score: score.toFixed(3),
        reason: this.generateTrackReason(track, targets)
      };
    }).sort((a, b) => b.score - a.score);
  }

  /**
   * Build diverse playlist from scored tracks
   */
  buildDiversePlaylist(scoredTracks, targetCount, options) {
    const playlist = [];
    const usedArtists = new Set();
    const maxSameArtist = Math.max(2, Math.floor(targetCount / 10));

    for (const track of scoredTracks) {
      if (playlist.length >= targetCount) break;

      // Enforce artist diversity
      const artistCount = usedArtists.has(track.artist_name)
        ? Array.from(usedArtists).filter(a => a === track.artist_name).length
        : 0;

      if (artistCount >= maxSameArtist) continue;

      playlist.push(track);
      usedArtists.add(track.artist_name);
    }

    return playlist;
  }

  /**
   * Generate human-readable reason for track inclusion
   */
  generateTrackReason(track, targets) {
    const reasons = [];

    if (Math.abs(track.valence - targets.target_valence) < 0.1) {
      reasons.push('perfect mood match');
    }
    if (Math.abs(track.energy - targets.target_energy) < 0.1) {
      reasons.push('ideal energy level');
    }
    if (track.play_count > 5) {
      reasons.push('you love this');
    }

    return reasons.length > 0 ? reasons[0] : 'matches your taste';
  }

  /**
   * Generate playlist name
   */
  generatePlaylistName(mood, activity) {
    const timestamp = new Date().toLocaleDateString();
    if (mood) return `${mood.charAt(0).toUpperCase() + mood.slice(1)} Vibes - ${timestamp}`;
    if (activity) return `${activity.charAt(0).toUpperCase() + activity.slice(1)} Mix - ${timestamp}`;
    return `Custom Mix - ${timestamp}`;
  }

  /**
   * Generate playlist description
   */
  generatePlaylistDescription(mood, activity, targets) {
    return `AI-generated playlist tailored to your ${mood || activity} mood. ` +
           `Valence: ${targets.target_valence}, Energy: ${targets.target_energy}`;
  }

  /**
   * Calculate playlist diversity score
   */
  calculateDiversityScore(tracks) {
    const uniqueArtists = new Set(tracks.map(t => t.artist_name)).size;
    const score = uniqueArtists / tracks.length;
    return score.toFixed(2);
  }

  /**
   * Calculate playlist relevance score
   */
  calculateRelevanceScore(tracks) {
    const avgScore = tracks.reduce((sum, t) => sum + parseFloat(t.score), 0) / tracks.length;
    return avgScore.toFixed(2);
  }

  /**
   * Calculate playlist novelty score
   */
  calculateNoveltyScore(tracks) {
    const newTracks = tracks.filter(t => t.play_count < 3).length;
    const score = newTracks / tracks.length;
    return score.toFixed(2);
  }

  // ============================================
  // TASK EXECUTION
  // ============================================

  /**
   * Execute a task (reactive, scheduled, or on-demand)
   */
  async executeTask(taskId) {
    try {
      // Get task from database
      const { data: task, error } = await supabase
        .from('agent_tasks')
        .select('*')
        .eq('id', taskId)
        .single();

      if (error || !task) {
        throw new Error('Task not found');
      }

      // Update task status
      await supabase
        .from('agent_tasks')
        .update({
          status: 'in_progress',
          started_at: new Date().toISOString()
        })
        .eq('id', taskId);

      const startTime = Date.now();
      let result;

      // Execute based on task name
      switch (task.task_name) {
        case 'collect_data':
          result = await this.collectListeningHistory();
          break;
        case 'learn_preferences':
          result = await this.learnPreferences();
          break;
        case 'generate_playlist':
          result = await this.generatePlaylist(task.task_parameters);
          break;
        default:
          throw new Error(`Unknown task: ${task.task_name}`);
      }

      const executionTime = Date.now() - startTime;

      // Update task with result
      await supabase
        .from('agent_tasks')
        .update({
          status: 'completed',
          result,
          execution_time_ms: executionTime,
          completed_at: new Date().toISOString()
        })
        .eq('id', taskId);

      return { success: true, result, executionTime };

    } catch (error) {
      // Update task with error
      await supabase
        .from('agent_tasks')
        .update({
          status: 'failed',
          error_message: error.message,
          completed_at: new Date().toISOString()
        })
        .eq('id', taskId);

      throw error;
    }
  }
}

export default MusicAgent;
