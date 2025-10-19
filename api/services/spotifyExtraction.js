/**
 * Spotify Data Extraction & Soul Signature Analysis
 *
 * Extracts musical preferences and calculates Big Five personality traits
 * based on listening habits, genre diversity, and social patterns.
 */

import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { decryptToken } from './encryption.js';
import PLATFORM_CONFIGS from '../config/platformConfigs.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Main extraction function - retrieves all Spotify data
 */
export async function extractSpotifyData(userId) {
  try {
    // Get platform connection with encrypted tokens
    const { data: connection, error: connectionError } = await supabase
      .from('platform_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('platform', 'spotify')
      .single();

    if (connectionError || !connection) {
      throw new Error('Spotify not connected for this user');
    }

    if (!connection.access_token) {
      throw new Error('No access token found for Spotify');
    }

    // Decrypt access token
    const accessToken = decryptToken(connection.access_token);
    const config = PLATFORM_CONFIGS.spotify;

    const headers = {
      'Authorization': `${config.tokenType} ${accessToken}`
    };

    console.log(`🎵 Extracting Spotify data for user ${userId}...`);

    // Extract multiple data types in parallel for performance
    const [
      profileResponse,
      recentTracksResponse,
      topTracksShortResponse,
      topTracksMediumResponse,
      topTracksLongResponse,
      topArtistsShortResponse,
      topArtistsMediumResponse,
      topArtistsLongResponse,
      savedTracksResponse
    ] = await Promise.all([
      axios.get(`${config.apiBaseUrl}${config.endpoints.userProfile}`, { headers }),
      axios.get(`${config.apiBaseUrl}${config.endpoints.recentTracks}?limit=50`, { headers }),
      axios.get(`${config.apiBaseUrl}${config.endpoints.topTracks}?time_range=short_term&limit=50`, { headers }),
      axios.get(`${config.apiBaseUrl}${config.endpoints.topTracks}?time_range=medium_term&limit=50`, { headers }),
      axios.get(`${config.apiBaseUrl}${config.endpoints.topTracks}?time_range=long_term&limit=50`, { headers }),
      axios.get(`${config.apiBaseUrl}${config.endpoints.topArtists}?time_range=short_term&limit=50`, { headers }),
      axios.get(`${config.apiBaseUrl}${config.endpoints.topArtists}?time_range=medium_term&limit=50`, { headers }),
      axios.get(`${config.apiBaseUrl}${config.endpoints.topArtists}?time_range=long_term&limit=50`, { headers }),
      axios.get(`${config.apiBaseUrl}${config.endpoints.savedTracks}?limit=50`, { headers })
    ]);

    // Transform to soul signature format
    const soulData = transformSpotifyToSoulSignature({
      profile: profileResponse.data,
      recentTracks: recentTracksResponse.data.items || [],
      topTracksShort: topTracksShortResponse.data.items || [],
      topTracksMedium: topTracksMediumResponse.data.items || [],
      topTracksLong: topTracksLongResponse.data.items || [],
      topArtistsShort: topArtistsShortResponse.data.items || [],
      topArtistsMedium: topArtistsMediumResponse.data.items || [],
      topArtistsLong: topArtistsLongResponse.data.items || [],
      savedTracks: savedTracksResponse.data.items || []
    });

    // Calculate total items extracted
    const totalItems =
      soulData.recentTracks.length +
      soulData.topTracks.length +
      soulData.topArtists.length +
      soulData.savedTracks.length;

    console.log(`✅ Extracted ${totalItems} Spotify items`);

    // Save extracted data to soul_data table
    const { error: insertError } = await supabase
      .from('soul_data')
      .insert({
        user_id: userId,
        platform: 'spotify',
        data_type: 'comprehensive_music_profile',
        raw_data: {
          profile: profileResponse.data,
          recentTracks: recentTracksResponse.data,
          topTracks: {
            short: topTracksShortResponse.data,
            medium: topTracksMediumResponse.data,
            long: topTracksLongResponse.data
          },
          topArtists: {
            short: topArtistsShortResponse.data,
            medium: topArtistsMediumResponse.data,
            long: topArtistsLongResponse.data
          },
          savedTracks: savedTracksResponse.data
        },
        extracted_patterns: soulData,
        extracted_at: new Date()
      });

    if (insertError) {
      console.error('Error saving Spotify data:', insertError);
    }

    // Update connection status
    await supabase
      .from('platform_connections')
      .update({
        last_synced_at: new Date(),
        last_sync_status: 'success'
      })
      .eq('user_id', userId)
      .eq('platform', 'spotify');

    return {
      success: true,
      itemsExtracted: totalItems,
      platform: 'spotify',
      insights: soulData.insights,
      profile: soulData.profile
    };

  } catch (error) {
    console.error('Spotify extraction error:', error);

    // Handle token expiration
    if (error.response?.status === 401) {
      await supabase
        .from('platform_connections')
        .update({
          last_sync_status: 'requires_reauth'
        })
        .eq('user_id', userId)
        .eq('platform', 'spotify');

      return {
        success: false,
        requiresReauth: true,
        error: 'Token expired - reconnection required'
      };
    }

    // Handle rate limiting
    if (error.response?.status === 429) {
      const retryAfter = error.response.headers['retry-after'];
      return {
        success: false,
        rateLimited: true,
        retryAfter: parseInt(retryAfter) || 60,
        error: 'Rate limit exceeded'
      };
    }

    // Update connection with error status
    await supabase
      .from('platform_connections')
      .update({
        last_sync_status: 'failed'
      })
      .eq('user_id', userId)
      .eq('platform', 'spotify');

    throw error;
  }
}

/**
 * Transform Spotify data to soul signature format with Big Five personality traits
 */
function transformSpotifyToSoulSignature(spotifyData) {
  const {
    profile,
    recentTracks,
    topTracksShort,
    topTracksMedium,
    topTracksLong,
    topArtistsShort,
    topArtistsMedium,
    topArtistsLong,
    savedTracks
  } = spotifyData;

  // Combine all artists for comprehensive analysis
  const allArtists = [...topArtistsShort, ...topArtistsMedium, ...topArtistsLong];
  const uniqueArtists = Array.from(new Set(allArtists.map(a => a.id)))
    .map(id => allArtists.find(a => a.id === id));

  // Extract genres from all artists
  const genres = uniqueArtists.flatMap(artist => artist.genres || []);
  const genreFrequency = genres.reduce((acc, genre) => {
    acc[genre] = (acc[genre] || 0) + 1;
    return acc;
  }, {});

  // Use medium-term for primary analysis (4-6 months)
  const primaryTracks = topTracksMedium;
  const primaryArtists = topArtistsMedium;

  return {
    profile: {
      spotifyId: profile.id,
      displayName: profile.display_name,
      email: profile.email,
      country: profile.country,
      product: profile.product,
      followers: profile.followers?.total || 0
    },

    recentTracks: recentTracks.map(item => ({
      trackName: item.track.name,
      artistName: item.track.artists[0].name,
      albumName: item.track.album.name,
      playedAt: item.played_at,
      duration: item.track.duration_ms
    })),

    topTracks: primaryTracks.map(track => ({
      id: track.id,
      name: track.name,
      artist: track.artists[0].name,
      album: track.album.name,
      popularity: track.popularity,
      duration: track.duration_ms,
      explicit: track.explicit
    })),

    topArtists: primaryArtists.map(artist => ({
      id: artist.id,
      name: artist.name,
      genres: artist.genres,
      popularity: artist.popularity,
      followers: artist.followers.total
    })),

    savedTracks: savedTracks.map(item => ({
      trackName: item.track.name,
      artistName: item.track.artists[0].name,
      albumName: item.track.album.name,
      addedAt: item.added_at,
      popularity: item.track.popularity
    })),

    insights: {
      totalGenres: Object.keys(genreFrequency).length,
      topGenres: Object.entries(genreFrequency)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([genre, count]) => ({ genre, count })),

      averagePopularity: Math.round(
        primaryTracks.reduce((sum, t) => sum + (t.popularity || 0), 0) / primaryTracks.length
      ),

      musicalDiversity: calculateMusicalDiversity(genreFrequency, genres.length),

      obscureArtistRatio: calculateObscureArtistRatio(primaryArtists),

      librarySize: savedTracks.length,

      listeningFrequency: calculateListeningFrequency(recentTracks),

      // Big Five Personality Traits (0-100 scale)
      traits: {
        openness: calculateOpenness(genreFrequency, primaryArtists),
        extraversion: calculateExtraversion(primaryTracks, primaryArtists),
        agreeableness: calculateAgreeableness(primaryTracks),
        conscientiousness: calculateConscientiousness(savedTracks, primaryTracks),
        neuroticism: calculateNeuroticism(genres, primaryTracks)
      },

      // Additional personality indicators
      musicalPersonality: determineMusicalPersonality({
        diversity: calculateMusicalDiversity(genreFrequency, genres.length),
        popularity: Math.round(primaryTracks.reduce((sum, t) => sum + (t.popularity || 0), 0) / primaryTracks.length),
        obscureRatio: calculateObscureArtistRatio(primaryArtists),
        genreCount: Object.keys(genreFrequency).length
      })
    }
  };
}

/**
 * Big Five Personality Trait: Openness to Experience
 * Based on genre diversity and appreciation for obscure/experimental music
 */
function calculateOpenness(genreFrequency, artists) {
  const genreDiversity = Object.keys(genreFrequency).length;
  const obscureArtistRatio = calculateObscureArtistRatio(artists);

  // Genre diversity contributes 60%, obscure artist ratio contributes 40%
  const diversityScore = Math.min((genreDiversity / 25) * 60, 60); // Max 25 genres = 60 points
  const obscurityScore = obscureArtistRatio * 40;

  return Math.round(diversityScore + obscurityScore);
}

/**
 * Big Five Personality Trait: Extraversion
 * Based on music popularity and social sharing indicators
 */
function calculateExtraversion(tracks, artists) {
  const averagePopularity = tracks.reduce((sum, t) => sum + (t.popularity || 0), 0) / tracks.length;

  // Popular artists with high follower counts
  const popularArtists = artists.filter(a => a.followers > 1000000).length;
  const popularityScore = (averagePopularity / 100) * 60; // Popularity contributes 60%
  const socialScore = Math.min((popularArtists / artists.length) * 40, 40); // Social contributes 40%

  return Math.round(popularityScore + socialScore);
}

/**
 * Big Five Personality Trait: Agreeableness
 * Based on preference for mainstream vs niche music
 */
function calculateAgreeableness(tracks) {
  const mainstreamTracks = tracks.filter(t => (t.popularity || 0) > 70).length;
  const mainstreamRatio = mainstreamTracks / tracks.length;

  // Higher mainstream ratio = higher agreeableness
  return Math.round(mainstreamRatio * 100);
}

/**
 * Big Five Personality Trait: Conscientiousness
 * Based on library organization and curation habits
 */
function calculateConscientiousness(savedTracks, topTracks) {
  const librarySize = savedTracks.length;

  // Large, well-curated library indicates conscientiousness
  const librarySizeScore = Math.min((librarySize / 100) * 50, 50); // Up to 50 points

  // Overlap between saved tracks and top tracks (indicates intentional curation)
  const savedTrackIds = new Set(savedTracks.map(t => t.trackName));
  const topTrackIds = new Set(topTracks.map(t => t.name));
  const overlap = [...savedTrackIds].filter(id => topTrackIds.has(id)).length;
  const curationScore = Math.min((overlap / topTracks.length) * 50, 50); // Up to 50 points

  return Math.round(librarySizeScore + curationScore);
}

/**
 * Big Five Personality Trait: Neuroticism
 * Based on prevalence of sad/melancholic music
 */
function calculateNeuroticism(genres, tracks) {
  const sadGenres = ['sad', 'melancholic', 'emo', 'blues', 'sadcore', 'bedroom pop'];
  const sadGenreCount = genres.filter(g =>
    sadGenres.some(sad => g.toLowerCase().includes(sad))
  ).length;

  const sadGenreRatio = sadGenreCount / genres.length;

  // Check track names for emotional keywords
  const emotionalKeywords = ['sad', 'alone', 'lonely', 'hurt', 'pain', 'cry'];
  const emotionalTracks = tracks.filter(t =>
    emotionalKeywords.some(keyword => t.name.toLowerCase().includes(keyword))
  ).length;

  const emotionalTrackRatio = emotionalTracks / tracks.length;

  // Combine both metrics (60% genre, 40% track names)
  return Math.round((sadGenreRatio * 60) + (emotionalTrackRatio * 40));
}

/**
 * Helper: Calculate musical diversity (0-1 scale)
 */
function calculateMusicalDiversity(genreFrequency, totalGenres) {
  const uniqueGenres = Object.keys(genreFrequency).length;

  // Shannon entropy for diversity
  let entropy = 0;
  for (const count of Object.values(genreFrequency)) {
    const probability = count / totalGenres;
    entropy -= probability * Math.log2(probability);
  }

  // Normalize entropy to 0-1 scale
  const maxEntropy = Math.log2(uniqueGenres);
  return maxEntropy > 0 ? entropy / maxEntropy : 0;
}

/**
 * Helper: Calculate ratio of obscure artists (popularity < 50)
 */
function calculateObscureArtistRatio(artists) {
  const obscureArtists = artists.filter(a => (a.popularity || 0) < 50).length;
  return obscureArtists / artists.length;
}

/**
 * Helper: Calculate listening frequency from recent tracks
 */
function calculateListeningFrequency(recentTracks) {
  if (recentTracks.length === 0) return 'unknown';

  const dates = recentTracks
    .map(t => new Date(t.played_at).getTime())
    .sort((a, b) => a - b);

  if (dates.length < 2) return 'insufficient data';

  const daysBetween = (dates[dates.length - 1] - dates[0]) / (1000 * 60 * 60 * 24);
  const tracksPerDay = recentTracks.length / daysBetween;

  if (tracksPerDay > 20) return 'heavy';
  if (tracksPerDay > 10) return 'regular';
  if (tracksPerDay > 5) return 'moderate';
  return 'light';
}

/**
 * Helper: Determine overall musical personality archetype
 */
function determineMusicalPersonality(metrics) {
  const { diversity, popularity, obscureRatio, genreCount } = metrics;

  if (diversity > 0.7 && genreCount > 15) return 'Eclectic Explorer';
  if (obscureRatio > 0.6) return 'Underground Connoisseur';
  if (popularity > 75) return 'Mainstream Enthusiast';
  if (genreCount < 5) return 'Genre Loyalist';
  if (diversity > 0.5 && obscureRatio > 0.3) return 'Curious Discoverer';
  return 'Balanced Listener';
}

export default {
  extractSpotifyData
};
