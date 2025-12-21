/**
 * Spotify OAuth Routes for Presentation Ritual Feature
 *
 * Provides music integration for preparation rituals including:
 * - OAuth connection with playback scopes
 * - Playlist retrieval for ritual selection (with genre-based energy detection)
 * - Playback control (play/pause)
 * - Music session logging
 */

import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { encryptToken, decryptToken, encryptState, decryptState } from '../services/encryption.js';
import { generatePKCEParams } from '../services/pkce.js';
import { authenticateUser } from '../middleware/auth.js';
import {
  oauthAuthorizationLimiter,
  oauthCallbackLimiter
} from '../middleware/oauthRateLimiter.js';
import temporalPatternDetector from '../services/temporalPatternDetector.js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const router = express.Router();

// Spotify API configuration for ritual feature
const SPOTIFY_CONFIG = {
  authUrl: 'https://accounts.spotify.com/authorize',
  tokenUrl: 'https://accounts.spotify.com/api/token',
  apiBaseUrl: 'https://api.spotify.com/v1',
  // Scopes needed for presentation ritual music
  scopes: [
    'user-read-playback-state',
    'user-modify-playback-state',
    'user-read-currently-playing',
    'playlist-read-private',
    'playlist-read-collaborative',
    'user-top-read',  // For accessing audio features and user preferences
    'streaming'
  ]
};

/**
 * GET /api/oauth/spotify/connect
 * Initiates OAuth flow for Spotify connection with playback scopes
 */
router.get('/connect', authenticateUser, oauthAuthorizationLimiter, async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
    }

    // Check for required environment variables
    if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
      return res.status(500).json({
        success: false,
        error: 'Spotify API credentials not configured. Please set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in environment variables.'
      });
    }

    const redirectUri = `${process.env.VITE_APP_URL || 'http://localhost:8086'}/oauth/callback`;
    const scope = SPOTIFY_CONFIG.scopes.join(' ');

    // Generate PKCE parameters (RFC 7636 - OAuth 2.1 mandatory)
    const pkce = generatePKCEParams();

    // Generate encrypted OAuth state (CSRF protection with timestamp expiration)
    const state = encryptState({
      platform: 'spotify',
      userId,
      codeVerifier: pkce.codeVerifier,
      returnUrl: req.query.returnUrl || '/ritual'
    });

    // Store state + code_verifier in Supabase (CSRF protection + PKCE)
    await supabaseAdmin
      .from('oauth_states')
      .insert({
        state,
        code_verifier: encryptToken(pkce.codeVerifier),
        data: { userId, platform: 'spotify', feature: 'ritual' },
        expires_at: new Date(Date.now() + 1800000) // 30 minutes
      });

    const authUrl = `${SPOTIFY_CONFIG.authUrl}?` +
      `client_id=${process.env.SPOTIFY_CLIENT_ID}&` +
      `response_type=code&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `scope=${encodeURIComponent(scope)}&` +
      `state=${state}&` +
      `code_challenge=${pkce.codeChallenge}&` +
      `code_challenge_method=${pkce.codeChallengeMethod}&` +
      `show_dialog=true`;

    console.log(`[Spotify Ritual] OAuth initiated for user ${userId}`);

    res.json({
      success: true,
      authUrl,
      message: 'Connect Spotify to enable music for your presentation rituals'
    });
  } catch (error) {
    console.error('[Spotify Ritual] Connection error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initialize Spotify connection',
      details: error.message
    });
  }
});

/**
 * GET /api/spotify/status
 * Get Spotify connection status for the current user
 */
router.get('/status', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
    }

    const { data: connection, error } = await supabaseAdmin
      .from('platform_connections')
      .select('id, connected_at, last_sync_at, status, token_expires_at')
      .eq('user_id', userId)
      .eq('platform', 'spotify')
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
      throw error;
    }

    const connected = !!connection && connection.status === 'connected';
    const tokenExpired = connection?.token_expires_at
      ? new Date(connection.token_expires_at) < new Date()
      : false;

    res.json({
      success: true,
      data: {
        connected,
        tokenExpired,
        lastSync: connection?.last_sync_at || null,
        connectedAt: connection?.connected_at || null
      }
    });
  } catch (error) {
    console.error('[Spotify Ritual] Status check error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check Spotify status',
      details: error.message
    });
  }
});

/**
 * GET /api/spotify/playlists
 * Get user's playlists for ritual selection
 */
router.get('/playlists', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
    }

    // Get user's Spotify access token
    const { data: connection, error: connError } = await supabaseAdmin
      .from('platform_connections')
      .select('access_token, token_expires_at, refresh_token')
      .eq('user_id', userId)
      .eq('platform', 'spotify')
      .single();

    if (connError || !connection) {
      return res.status(404).json({
        success: false,
        error: 'Spotify not connected. Please connect your Spotify account first.'
      });
    }

    // Check if token is expired and refresh if needed
    let accessToken = decryptToken(connection.access_token);

    if (connection.token_expires_at && new Date(connection.token_expires_at) < new Date()) {
      accessToken = await refreshSpotifyToken(userId, connection.refresh_token);
      if (!accessToken) {
        return res.status(401).json({
          success: false,
          error: 'Spotify token expired. Please reconnect.',
          needsReconnect: true
        });
      }
    }

    // Fetch playlists from Spotify
    const response = await fetch(`${SPOTIFY_CONFIG.apiBaseUrl}/me/playlists?limit=50`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      if (response.status === 401) {
        return res.status(401).json({
          success: false,
          error: 'Spotify authentication expired. Please reconnect.',
          needsReconnect: true
        });
      }
      throw new Error(`Spotify API error: ${response.status}`);
    }

    const data = await response.json();

    // Transform playlists to simpler format
    const playlists = data.items.map(playlist => ({
      id: playlist.id,
      name: playlist.name,
      imageUrl: playlist.images?.[0]?.url || null,
      trackCount: playlist.tracks?.total || 0,
      owner: playlist.owner?.display_name || 'Unknown',
      isPublic: playlist.public
    }));

    res.json({
      success: true,
      data: {
        playlists,
        total: data.total
      }
    });
  } catch (error) {
    console.error('[Spotify Ritual] Playlists fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch playlists',
      details: error.message
    });
  }
});

/**
 * GET /api/spotify/playlists/filtered
 * Get playlists filtered by energy level with audio features
 * Query params: energyLevel (calm|focused|energizing|power)
 */
router.get('/playlists/filtered', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id;
    const { energyLevel } = req.query;

    console.log('[Spotify Ritual] Filtered playlists request:', { userId, energyLevel });
    console.log('[Spotify Ritual] 🚨 CHECKPOINT 1: Immediately after first log');

    if (!userId) {
      console.log('[Spotify Ritual] No userId - unauthorized');
      return res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
    }

    console.log('[Spotify Ritual] 🔍 DEBUG: About to start pattern detection...');

    // 📅 CALENDAR EVENT ANALYSIS: Check upcoming events to suggest mood
    let upcomingEvent = null;
    let suggestedMood = null;
    try {
      console.log('[Spotify Ritual] 📅 Checking upcoming calendar events...');

      // Fetch upcoming events from calendar_events table
      const { data: events, error: eventsError } = await supabaseAdmin
        .from('calendar_events')
        .select('*')
        .eq('user_id', userId)
        .gte('start_time', new Date().toISOString())
        .order('start_time', { ascending: true })
        .limit(3);

      if (!eventsError && events && events.length > 0) {
        const nextEvent = events[0];
        const eventStart = new Date(nextEvent.start_time);
        const minutesUntilEvent = (eventStart - new Date()) / (1000 * 60);

        console.log(`[Spotify Ritual]   → Upcoming event: "${nextEvent.title}" in ${Math.round(minutesUntilEvent)} minutes`);

        // Analyze event type to suggest mood
        if (minutesUntilEvent >= 10 && minutesUntilEvent <= 240) { // 10 min - 4 hours before event
          upcomingEvent = {
            title: nextEvent.title,
            type: nextEvent.event_type || 'general',
            minutesUntil: Math.round(minutesUntilEvent),
            isImportant: nextEvent.is_important || false
          };

          // Map event types to suggested moods
          const eventMoodMap = {
            'meeting': 'focused',
            'presentation': 'calm',
            'interview': 'calm',
            'workout': 'power',
            'exercise': 'power',
            'gym': 'power',
            'dinner': 'calm',
            'lunch': 'focused',
            'breakfast': 'calm',
            'party': 'energizing',
            'celebration': 'energizing',
            'study': 'focused',
            'exam': 'calm',
            'travel': 'energizing',
            'flight': 'calm'
          };

          // Try to match event type or title keywords
          const titleLower = nextEvent.title.toLowerCase();
          for (const [keyword, mood] of Object.entries(eventMoodMap)) {
            if (nextEvent.event_type?.includes(keyword) || titleLower.includes(keyword)) {
              suggestedMood = mood;
              console.log(`[Spotify Ritual]   → Suggested "${mood}" mood for ${nextEvent.event_type || 'event'}`);
              break;
            }
          }

          // If no specific match, suggest based on importance
          if (!suggestedMood && nextEvent.is_important) {
            suggestedMood = 'calm';
            console.log(`[Spotify Ritual]   → Suggested "calm" mood for important event`);
          }
        }
      }
    } catch (calendarError) {
      console.warn('[Spotify Ritual] ⚠️ Calendar analysis failed:', calendarError.message);
    }

    // 🧠 GNN PATTERN DETECTION: Check for learned music patterns
    let learnedPattern = null;
    try {
      console.log('[Spotify Ritual] 🧠 Checking for learned music patterns...');
      const patterns = await temporalPatternDetector.detectPatterns(userId, {
        minOccurrences: 2,
        minConfidence: 0.6,
        lookbackDays: 90
      });

      if (patterns.length > 0) {
        // If we have an upcoming event, find pattern for that event type
        if (upcomingEvent) {
          const eventPattern = patterns.find(p =>
            p.trigger.event_type === upcomingEvent.type &&
            Math.abs(p.time_offset_minutes - upcomingEvent.minutesUntil) <= 30
          );

          if (eventPattern) {
            learnedPattern = eventPattern;
            console.log(`[Spotify Ritual] ✅ Found event-specific pattern: "${learnedPattern.response.genre}" for ${upcomingEvent.type} (confidence: ${learnedPattern.confidence_score}%)`);
          }
        }

        // If no event-specific pattern, find pattern matching current energy level
        if (!learnedPattern) {
          learnedPattern = patterns.find(p => {
            const patternEnergy = p.response.avg_energy;
            if (energyLevel === 'calm' && patternEnergy < 0.3) return true;
            if (energyLevel === 'focused' && patternEnergy >= 0.3 && patternEnergy < 0.6) return true;
            if (energyLevel === 'energizing' && patternEnergy >= 0.6 && patternEnergy < 0.8) return true;
            if (energyLevel === 'power' && patternEnergy >= 0.8) return true;
            return false;
          });

          if (learnedPattern) {
            console.log(`[Spotify Ritual] ✅ Found mood pattern: "${learnedPattern.response.genre}" (confidence: ${learnedPattern.confidence_score}%)`);
          }
        }
      }
    } catch (patternError) {
      console.warn('[Spotify Ritual] ⚠️ Pattern detection failed:', patternError.message);
      // Continue with genre-based filtering
    }

    // Genre-based energy level mapping (replaces deprecated audio-features API)
    // IMPORTANT: Only use VERIFIED valid Spotify seed genres from https://gist.github.com/drumnation/91a789da6f17f2ee20db8f55382b6653
    const genreEnergyMap = {
      // Calm genres (0-25 energy score)
      calm: [
        'ambient', 'classical', 'jazz', 'acoustic', 'chill',
        'piano', 'blues', 'folk', 'soul', 'world-music'
      ],
      // Focused genres (25-50 energy score)
      focused: [
        'indie', 'alternative', 'folk', 'indie-pop', 'singer-songwriter',
        'acoustic', 'jazz', 'blues', 'classical', 'study'
      ],
      // Energizing genres (50-75 energy score)
      energizing: [
        'pop', 'rock', 'hip-hop', 'r-n-b', 'soul', 'funk', 'disco',
        'synth-pop', 'indie-pop', 'dance', 'reggae', 'party'
      ],
      // Power genres (75-100 energy score)
      power: [
        'edm', 'dance', 'electronic', 'house', 'techno', 'dubstep', 'drum-and-bass',
        'metal', 'punk', 'hardcore', 'hardstyle', 'trance'
      ]
    };

    // Function to calculate energy score from genres
    function calculateGenreEnergyScore(genres) {
      if (!genres || genres.length === 0) return 50; // Default to middle energy

      let totalScore = 0;
      let matchCount = 0;

      genres.forEach(genre => {
        const lowerGenre = genre.toLowerCase();

        // Check each energy level
        if (genreEnergyMap.calm.some(g => lowerGenre.includes(g))) {
          totalScore += 12.5; // Calm = 0-25 range, use middle
          matchCount++;
        }
        if (genreEnergyMap.focused.some(g => lowerGenre.includes(g))) {
          totalScore += 37.5; // Focused = 25-50 range, use middle
          matchCount++;
        }
        if (genreEnergyMap.energizing.some(g => lowerGenre.includes(g))) {
          totalScore += 62.5; // Energizing = 50-75 range, use middle
          matchCount++;
        }
        if (genreEnergyMap.power.some(g => lowerGenre.includes(g))) {
          totalScore += 87.5; // Power = 75-100 range, use middle
          matchCount++;
        }
      });

      return matchCount > 0 ? totalScore / matchCount : 50;
    }

    // Get access token
    console.log('[Spotify Ritual] Fetching Spotify connection from DB...');
    const { data: connection, error: connError } = await supabaseAdmin
      .from('platform_connections')
      .select('access_token, token_expires_at, refresh_token')
      .eq('user_id', userId)
      .eq('platform', 'spotify')
      .single();

    if (connError || !connection) {
      console.log('[Spotify Ritual] No Spotify connection found:', connError);
      return res.status(404).json({
        success: false,
        error: 'Spotify not connected'
      });
    }

    console.log('[Spotify Ritual] Decrypting access token...');
    let accessToken = decryptToken(connection.access_token);

    // Fetch user's playlists
    console.log('[Spotify Ritual] Fetching playlists from Spotify API...');
    const playlistsResponse = await fetch(`${SPOTIFY_CONFIG.apiBaseUrl}/me/playlists?limit=50`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!playlistsResponse.ok) {
      console.log('[Spotify Ritual] Playlist fetch failed:', playlistsResponse.status);
      throw new Error(`Spotify API error: ${playlistsResponse.status}`);
    }

    const playlistsData = await playlistsResponse.json();
    console.log('[Spotify Ritual] Fetched', playlistsData.items?.length || 0, 'playlists');
    const scoredPlaylists = [];

    // For each playlist, analyze first 10 tracks to determine audio profile
    for (const playlist of playlistsData.items.slice(0, 20)) { // Limit to 20 playlists to avoid rate limits
      try {
        console.log(`[Spotify Ritual] 🎵 Analyzing playlist: "${playlist.name}" (${playlist.id})`);

        // Get playlist tracks
        console.log(`[Spotify Ritual]   → Fetching tracks...`);
        const tracksResponse = await fetch(
          `${SPOTIFY_CONFIG.apiBaseUrl}/playlists/${playlist.id}/tracks?limit=10`,
          { headers: { 'Authorization': `Bearer ${accessToken}` } }
        );

        console.log(`[Spotify Ritual]   → Tracks response status: ${tracksResponse.status}`);
        if (!tracksResponse.ok) {
          console.log(`[Spotify Ritual]   ✗ Skipping - tracks fetch failed`);
          continue;
        }

        const tracksData = await tracksResponse.json();
        const tracks = tracksData.items
          .filter(item => item.track && item.track.id)
          .map(item => item.track);

        console.log(`[Spotify Ritual]   → Found ${tracks.length} valid tracks`);
        if (tracks.length === 0) {
          console.log(`[Spotify Ritual]   ✗ Skipping - no valid tracks`);
          continue;
        }

        // Get unique artist IDs from tracks
        const artistIds = [...new Set(tracks.flatMap(track => track.artists.map(a => a.id)))];
        console.log(`[Spotify Ritual]   → Fetching genres from ${artistIds.length} unique artists...`);

        // Fetch artist data in batches (max 50 per request)
        const artistGenres = [];
        for (let i = 0; i < artistIds.length; i += 50) {
          const batch = artistIds.slice(i, i + 50);
          const artistsResponse = await fetch(
            `${SPOTIFY_CONFIG.apiBaseUrl}/artists?ids=${batch.join(',')}`,
            { headers: { 'Authorization': `Bearer ${accessToken}` } }
          );

          if (artistsResponse.ok) {
            const artistsData = await artistsResponse.json();
            artistsData.artists.forEach(artist => {
              if (artist && artist.genres) {
                artistGenres.push(...artist.genres);
              }
            });
          }
        }

        console.log(`[Spotify Ritual]   → Collected ${artistGenres.length} genre tags`);
        const uniqueGenres = [...new Set(artistGenres)];
        console.log(`[Spotify Ritual]   → Unique genres: ${uniqueGenres.slice(0, 5).join(', ')}${uniqueGenres.length > 5 ? '...' : ''}`);

        if (uniqueGenres.length === 0) {
          console.log(`[Spotify Ritual]   ✗ Skipping - no genre data available`);
          continue;
        }

        // Calculate energy score from genres
        const energyScore = calculateGenreEnergyScore(uniqueGenres);
        console.log(`[Spotify Ritual]   → Genre-based energy score: ${energyScore.toFixed(1)}/100`);

        // Calculate match score based on energy level ranges
        let matchScore = 0;
        if (energyLevel) {
          console.log(`[Spotify Ritual]   → Scoring against "${energyLevel}" profile...`);

          // Energy level score ranges
          const energyRanges = {
            calm: { min: 0, max: 25 },
            focused: { min: 25, max: 50 },
            energizing: { min: 50, max: 75 },
            power: { min: 75, max: 100 }
          };

          const targetRange = energyRanges[energyLevel];
          if (targetRange) {
            // Perfect match if energy score is in range
            if (energyScore >= targetRange.min && energyScore <= targetRange.max) {
              matchScore = 1.0;
            } else {
              // Partial match based on distance from range
              const distance = energyScore < targetRange.min
                ? targetRange.min - energyScore
                : energyScore - targetRange.max;
              matchScore = Math.max(0, 1.0 - (distance / 50)); // Decay over 50 points
            }
          }

          console.log(`[Spotify Ritual]   → Match score: ${matchScore.toFixed(2)}`);
        }

        scoredPlaylists.push({
          id: playlist.id,
          name: playlist.name,
          imageUrl: playlist.images?.[0]?.url || null,
          trackCount: playlist.tracks?.total || 0,
          owner: playlist.owner?.display_name || 'Unknown',
          isPublic: playlist.public,
          energyScore: energyScore,
          genres: uniqueGenres.slice(0, 10), // Include top genres
          matchScore: matchScore
        });
        console.log(`[Spotify Ritual]   ✓ Successfully scored "${playlist.name}"`);
      } catch (error) {
        console.error(`[Spotify Ritual]   ✗ Error analyzing playlist "${playlist.name}":`, error.message);
        console.error(`[Spotify Ritual]   Stack:`, error.stack);
        continue;
      }
    }

    // Sort by match score if energy level specified, otherwise by track count
    console.log('[Spotify Ritual] Scored', scoredPlaylists.length, 'user playlists');
    if (energyLevel) {
      scoredPlaylists.sort((a, b) => b.matchScore - a.matchScore);
      console.log('[Spotify Ritual] Sorted by match score for energy level:', energyLevel);
    } else {
      scoredPlaylists.sort((a, b) => b.trackCount - a.trackCount);
      console.log('[Spotify Ritual] Sorted by track count');
    }

    // 🎵 SPOTIFY RECOMMENDATIONS: Get personalized track recommendations
    const recommendations = [];
    console.log(`[Spotify Ritual] 🔍 RECOMMENDATIONS DEBUG: energyLevel = "${energyLevel}" (type: ${typeof energyLevel})`);

    if (energyLevel) {
      try {
        console.log(`[Spotify Ritual] 🎯 Generating personalized recommendations for "${energyLevel}" mood...`);
        console.log(`[Spotify Ritual]   ℹ️ NOTE: Spotify deprecated /v1/recommendations API in Nov 2024`);
        console.log(`[Spotify Ritual]   → Using alternative: filtering user's listening history by audio features`);

        // Map energy levels to Spotify audio feature values
        const audioFeatureTargets = {
          calm: { energy: 0.2, valence: 0.4, danceability: 0.3, acousticness: 0.7, instrumentalness: 0.5 },
          focused: { energy: 0.4, valence: 0.5, danceability: 0.4, acousticness: 0.5, instrumentalness: 0.3 },
          energizing: { energy: 0.7, valence: 0.7, danceability: 0.7, acousticness: 0.2, instrumentalness: 0.1 },
          power: { energy: 0.9, valence: 0.8, danceability: 0.8, acousticness: 0.1, instrumentalness: 0.05 }
        };

        const targets = audioFeatureTargets[energyLevel];

        if (targets) {
          // Fetch user's top tracks from multiple time ranges for diversity
          const timeRanges = ['short_term', 'medium_term', 'long_term'];
          let allTopTracks = [];

          for (const timeRange of timeRanges) {
            try {
              const topTracksResponse = await fetch(
                `${SPOTIFY_CONFIG.apiBaseUrl}/me/top/tracks?limit=50&time_range=${timeRange}`,
                { headers: { 'Authorization': `Bearer ${accessToken}` } }
              );

              if (topTracksResponse.ok) {
                const data = await topTracksResponse.json();
                allTopTracks.push(...(data.items || []));
                console.log(`[Spotify Ritual]   ✓ Got ${data.items?.length || 0} tracks from ${timeRange}`);
              }
            } catch (err) {
              console.warn(`[Spotify Ritual]   ⚠️ Could not fetch ${timeRange} tracks:`, err.message);
            }
          }

          // Remove duplicates by track ID
          const uniqueTracks = Array.from(new Map(allTopTracks.map(t => [t.id, t])).values());
          console.log(`[Spotify Ritual]   ✓ Got ${uniqueTracks.length} unique tracks total`);

          if (uniqueTracks.length > 0) {
            // Get audio features for all tracks (in batches of 100)
            const trackIds = uniqueTracks.map(t => t.id);
            const batchSize = 100;
            let audioFeatures = [];

            for (let i = 0; i < trackIds.length; i += batchSize) {
              try {
                const batch = trackIds.slice(i, i + batchSize);
                const featuresResponse = await fetch(
                  `${SPOTIFY_CONFIG.apiBaseUrl}/audio-features?ids=${batch.join(',')}`,
                  { headers: { 'Authorization': `Bearer ${accessToken}` } }
                );

                if (featuresResponse.ok) {
                  const data = await featuresResponse.json();
                  audioFeatures.push(...(data.audio_features || []).filter(f => f !== null));
                }
              } catch (err) {
                console.warn(`[Spotify Ritual]   ⚠️ Could not fetch audio features batch:`, err.message);
              }
            }

            console.log(`[Spotify Ritual]   ✓ Got audio features for ${audioFeatures.length} tracks`);

            // Score each track based on how well it matches the target energy profile
            const scoredTracks = uniqueTracks
              .map(track => {
                const features = audioFeatures.find(f => f && f.id === track.id);
                if (!features) return null;

                // Calculate similarity score (lower is better match)
                const energyDiff = Math.abs((features.energy || 0.5) - targets.energy);
                const valenceDiff = Math.abs((features.valence || 0.5) - targets.valence);
                const danceabilityDiff = Math.abs((features.danceability || 0.5) - targets.danceability);
                const acousticnessDiff = Math.abs((features.acousticness || 0.5) - targets.acousticness);

                const score = energyDiff + valenceDiff + danceabilityDiff + acousticnessDiff;

                return { track, features, score };
              })
              .filter(item => item !== null)
              .sort((a, b) => a.score - b.score)
              .slice(0, 20); // Top 20 best matches

            console.log(`[Spotify Ritual]   ✅ Generated ${scoredTracks.length} personalized recommendations`);

            scoredTracks.forEach(({ track }) => {
              recommendations.push({
                type: 'track',
                id: track.id,
                name: track.name,
                artist: track.artists?.[0]?.name || 'Unknown',
                imageUrl: track.album?.images?.[0]?.url || null,
                previewUrl: track.preview_url,
                spotifyUrl: track.external_urls?.spotify,
                duration: track.duration_ms,
                matchReason: `From your listening history - perfect for ${energyLevel} mood`
              });
            });
          } else {
            console.log(`[Spotify Ritual]   ⚠️ No listening history found - cannot generate recommendations`);
          }
        }
      } catch (recError) {
        console.warn('[Spotify Ritual] ⚠️ Failed to generate recommendations:', recError.message);
        // Continue without recommendations
      }
    } else {
      console.log(`[Spotify Ritual] ⚠️ DEBUG: Skipping recommendations - energyLevel is falsy or undefined`);
    }

    console.log('[Spotify Ritual] Returning', scoredPlaylists.length, 'playlists +', recommendations.length, 'recommendations');
    res.json({
      success: true,
      data: {
        playlists: scoredPlaylists,
        recommendations: recommendations,
        energyLevel: energyLevel || 'all',
        total: scoredPlaylists.length + recommendations.length,
        upcomingEvent: upcomingEvent,
        suggestedMood: suggestedMood,
        learnedPattern: learnedPattern ? {
          genre: learnedPattern.response.genre,
          confidence: learnedPattern.confidence_score,
          description: learnedPattern.description,
          isEventSpecific: learnedPattern.trigger?.event_type ? true : false
        } : null
      }
    });
  } catch (error) {
    console.error('[Spotify Ritual] Filtered playlists error:', error);
    console.error('[Spotify Ritual] Error stack:', error.stack);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch filtered playlists',
      details: error.message
    });
  }
});

/**
 * POST /api/spotify/track-selection
 * Track user music selection to learn preferences for event types
 * Body: { selectionType: 'playlist'|'track', selectionId, selectionName, energyLevel, eventContext }
 */
router.post('/track-selection', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id;
    const { selectionType, selectionId, selectionName, energyLevel, eventContext } = req.body;

    console.log('[Spotify Learning] Track selection:', {
      userId,
      selectionType,
      selectionId,
      energyLevel,
      eventContext
    });

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
    }

    // Fetch upcoming event if exists
    const { data: events } = await supabaseAdmin
      .from('calendar_events')
      .select('*')
      .eq('user_id', userId)
      .gte('start_time', new Date().toISOString())
      .order('start_time', { ascending: true })
      .limit(1);

    let upcomingEvent = null;
    if (events && events.length > 0) {
      const nextEvent = events[0];
      const minutesUntil = (new Date(nextEvent.start_time) - new Date()) / (1000 * 60);

      if (minutesUntil >= 10 && minutesUntil <= 240) {
        upcomingEvent = {
          event_id: nextEvent.id,
          event_type: nextEvent.event_type || 'general',
          event_title: nextEvent.title,
          minutes_until: Math.round(minutesUntil),
          is_important: nextEvent.is_important || false
        };
      }
    }

    // Store selection in soul_data for pattern learning
    const selectionData = {
      user_id: userId,
      platform: 'spotify',
      data_type: 'ritual_selection',
      raw_data: {
        selection_type: selectionType,
        selection_id: selectionId,
        selection_name: selectionName,
        energy_level: energyLevel,
        upcoming_event: upcomingEvent,
        event_context: eventContext,
        selected_at: new Date().toISOString()
      },
      created_at: new Date().toISOString()
    };

    const { error: insertError } = await supabaseAdmin
      .from('soul_data')
      .insert(selectionData);

    if (insertError) {
      console.error('[Spotify Learning] Error storing selection:', insertError);
      return res.status(500).json({
        success: false,
        error: 'Failed to track selection'
      });
    }

    console.log('[Spotify Learning] ✅ Selection tracked successfully');

    // If there's an upcoming event, this selection will be used to learn patterns
    if (upcomingEvent) {
      console.log(`[Spotify Learning] 🎓 Learning: User selected "${selectionName}" (${energyLevel}) ${upcomingEvent.minutes_until}min before ${upcomingEvent.event_type} event`);
    }

    res.json({
      success: true,
      message: 'Selection tracked successfully',
      learning: upcomingEvent ? {
        message: `Learning your music preference for ${upcomingEvent.event_type} events`,
        eventType: upcomingEvent.event_type,
        minutesUntil: upcomingEvent.minutes_until
      } : null
    });
  } catch (error) {
    console.error('[Spotify Learning] Track selection error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to track selection',
      details: error.message
    });
  }
});

/**
 * GET /api/spotify/playback
 * Get current playback state
 */
router.get('/playback', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
    }

    const accessToken = await getValidAccessToken(userId);
    if (!accessToken) {
      return res.status(401).json({
        success: false,
        error: 'Spotify not connected or token expired',
        needsReconnect: true
      });
    }

    const response = await fetch(`${SPOTIFY_CONFIG.apiBaseUrl}/me/player`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    // 204 means no active device
    if (response.status === 204) {
      return res.json({
        success: true,
        data: {
          isPlaying: false,
          noActiveDevice: true,
          track: null,
          context: null
        }
      });
    }

    if (!response.ok) {
      if (response.status === 401) {
        return res.status(401).json({
          success: false,
          error: 'Spotify authentication expired',
          needsReconnect: true
        });
      }
      throw new Error(`Spotify API error: ${response.status}`);
    }

    const data = await response.json();

    res.json({
      success: true,
      data: {
        isPlaying: data.is_playing,
        noActiveDevice: false,
        track: data.item ? {
          id: data.item.id,
          name: data.item.name,
          artist: data.item.artists?.map(a => a.name).join(', '),
          album: data.item.album?.name,
          imageUrl: data.item.album?.images?.[0]?.url,
          durationMs: data.item.duration_ms,
          progressMs: data.progress_ms
        } : null,
        context: data.context ? {
          type: data.context.type,
          uri: data.context.uri
        } : null,
        device: data.device ? {
          id: data.device.id,
          name: data.device.name,
          type: data.device.type,
          volume: data.device.volume_percent
        } : null
      }
    });
  } catch (error) {
    console.error('[Spotify Ritual] Playback state error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get playback state',
      details: error.message
    });
  }
});

/**
 * POST /api/spotify/play
 * Start playing a playlist or track
 */
router.post('/play', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id;
    const { playlistId, trackUri, deviceId } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
    }

    if (!playlistId && !trackUri) {
      return res.status(400).json({
        success: false,
        error: 'Either playlistId or trackUri is required'
      });
    }

    const accessToken = await getValidAccessToken(userId);
    if (!accessToken) {
      return res.status(401).json({
        success: false,
        error: 'Spotify not connected or token expired',
        needsReconnect: true
      });
    }

    // Build request body
    const requestBody = {};
    if (playlistId) {
      requestBody.context_uri = `spotify:playlist:${playlistId}`;
    } else if (trackUri) {
      requestBody.uris = [trackUri];
    }

    // Build URL with optional device_id
    let url = `${SPOTIFY_CONFIG.apiBaseUrl}/me/player/play`;
    if (deviceId) {
      url += `?device_id=${deviceId}`;
    }

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      if (response.status === 401) {
        return res.status(401).json({
          success: false,
          error: 'Spotify authentication expired',
          needsReconnect: true
        });
      }
      if (response.status === 404) {
        return res.status(404).json({
          success: false,
          error: 'No active Spotify device found. Please open Spotify on a device first.'
        });
      }
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `Spotify API error: ${response.status}`);
    }

    console.log(`[Spotify Ritual] Started playback for user ${userId}`);

    res.json({
      success: true,
      message: 'Playback started'
    });
  } catch (error) {
    console.error('[Spotify Ritual] Play error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start playback',
      details: error.message
    });
  }
});

/**
 * POST /api/spotify/pause
 * Pause playback
 */
router.post('/pause', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
    }

    const accessToken = await getValidAccessToken(userId);
    if (!accessToken) {
      return res.status(401).json({
        success: false,
        error: 'Spotify not connected or token expired',
        needsReconnect: true
      });
    }

    const response = await fetch(`${SPOTIFY_CONFIG.apiBaseUrl}/me/player/pause`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok && response.status !== 204) {
      if (response.status === 401) {
        return res.status(401).json({
          success: false,
          error: 'Spotify authentication expired',
          needsReconnect: true
        });
      }
      if (response.status === 404) {
        return res.status(404).json({
          success: false,
          error: 'No active Spotify device found'
        });
      }
      throw new Error(`Spotify API error: ${response.status}`);
    }

    console.log(`[Spotify Ritual] Paused playback for user ${userId}`);

    res.json({
      success: true,
      message: 'Playback paused'
    });
  } catch (error) {
    console.error('[Spotify Ritual] Pause error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to pause playback',
      details: error.message
    });
  }
});

/**
 * POST /api/spotify/music-session
 * Log a music session for a ritual
 */
router.post('/music-session', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id;
    const {
      ritualId,
      spotifyPlaylistId,
      spotifyPlaylistName,
      tracksPlayed,
      durationMinutes,
      energyLevel,
      effectivenessRating
    } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
    }

    // Validate energy level
    const validEnergyLevels = ['calm', 'focused', 'energizing', 'power'];
    if (energyLevel && !validEnergyLevels.includes(energyLevel)) {
      return res.status(400).json({
        success: false,
        error: `Invalid energy level. Must be one of: ${validEnergyLevels.join(', ')}`
      });
    }

    // Validate effectiveness rating
    if (effectivenessRating && (effectivenessRating < 1 || effectivenessRating > 5)) {
      return res.status(400).json({
        success: false,
        error: 'Effectiveness rating must be between 1 and 5'
      });
    }

    // Insert music session
    const { data: session, error } = await supabaseAdmin
      .from('music_sessions')
      .insert({
        user_id: userId,
        ritual_id: ritualId || null,
        spotify_playlist_id: spotifyPlaylistId,
        spotify_playlist_name: spotifyPlaylistName,
        tracks_played: tracksPlayed || [],
        duration_minutes: durationMinutes || 0,
        energy_level: energyLevel || 'focused',
        effectiveness_rating: effectivenessRating || null
      })
      .select()
      .single();

    if (error) {
      // If table doesn't exist, provide helpful error
      if (error.code === '42P01') {
        return res.status(500).json({
          success: false,
          error: 'Music sessions table not found. Please run database migrations.',
          details: error.message
        });
      }
      throw error;
    }

    console.log(`[Spotify Ritual] Music session logged for user ${userId}`);

    res.json({
      success: true,
      data: session,
      message: 'Music session logged successfully'
    });
  } catch (error) {
    console.error('[Spotify Ritual] Music session logging error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to log music session',
      details: error.message
    });
  }
});

/**
 * POST /api/spotify/disconnect
 * Disconnect Spotify integration
 */
router.post('/disconnect', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
    }

    const { error } = await supabaseAdmin
      .from('platform_connections')
      .delete()
      .eq('user_id', userId)
      .eq('platform', 'spotify');

    if (error) {
      throw error;
    }

    console.log(`[Spotify Ritual] Disconnected for user ${userId}`);

    res.json({
      success: true,
      message: 'Spotify disconnected successfully'
    });
  } catch (error) {
    console.error('[Spotify Ritual] Disconnect error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to disconnect Spotify',
      details: error.message
    });
  }
});

// ====================================================================
// Helper Functions
// ====================================================================

/**
 * Get valid access token for a user, refreshing if necessary
 */
async function getValidAccessToken(userId) {
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

    // Check if token needs refresh
    if (connection.token_expires_at && new Date(connection.token_expires_at) < new Date()) {
      if (connection.refresh_token) {
        return await refreshSpotifyToken(userId, connection.refresh_token);
      }
      return null;
    }

    return decryptToken(connection.access_token);
  } catch (error) {
    console.error('[Spotify Ritual] Error getting access token:', error);
    return null;
  }
}

/**
 * Refresh Spotify access token
 */
async function refreshSpotifyToken(userId, encryptedRefreshToken) {
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
      console.error('[Spotify Ritual] Token refresh failed:', response.status);
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
        // Update refresh token if a new one was provided
        ...(tokens.refresh_token && {
          refresh_token: encryptToken(tokens.refresh_token)
        }),
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('platform', 'spotify');

    console.log(`[Spotify Ritual] Token refreshed for user ${userId}`);
    return newAccessToken;
  } catch (error) {
    console.error('[Spotify Ritual] Token refresh error:', error);
    return null;
  }
}

export default router;
