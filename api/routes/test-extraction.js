/**
 * Test Extraction Routes
 *
 * These endpoints simulate real platform extraction for testing
 * without requiring OAuth credentials. Useful for:
 * - Development testing
 * - Demo purposes
 * - CI/CD pipeline testing
 */

import express from 'express';
import { createClient } from '@supabase/supabase-js';
import insightCache from '../services/insightCache.js';
import { authenticateUser } from '../middleware/auth.js';
import { applyPrivacyFilter } from '../middleware/privacyFilter.js';

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * POST /api/test-extraction/spotify/:userId
 * Generate and store realistic Spotify test data
 */
router.post('/spotify/:userId', async (req, res) => {
  const { userId } = req.params;
  console.log(`🧪 [TEST MODE] Generating Spotify test data for user: ${userId}`);

  try {
    // Create extraction job
    const { data: job, error: jobError } = await supabase
      .from('extraction_jobs')
      .insert({
        user_id: userId,
        platform: 'spotify',
        status: 'in_progress',
        started_at: new Date().toISOString()
      })
      .select()
      .single();

    if (jobError) throw jobError;

    // Generate realistic Spotify data (similar to real extraction)
    const testData = {
      topArtists: [
        { name: 'Tycho', plays: 842, genre: 'Ambient Electronic', popularity: 75 },
        { name: 'Boards of Canada', plays: 731, genre: 'IDM', popularity: 72 },
        { name: 'Aphex Twin', plays: 624, genre: 'Electronic', popularity: 80 },
        { name: 'Tame Impala', plays: 589, genre: 'Psychedelic Rock', popularity: 85 },
        { name: 'ODESZA', plays: 512, genre: 'Electronic', popularity: 78 }
      ],
      topTracks: [
        { name: 'A Walk', artist: 'Tycho', plays: 127, duration_ms: 267000 },
        { name: 'Roygbiv', artist: 'Boards of Canada', plays: 104, duration_ms: 143000 },
        { name: 'Windowlicker', artist: 'Aphex Twin', plays: 98, duration_ms: 376000 },
        { name: 'The Less I Know The Better', artist: 'Tame Impala', plays: 87, duration_ms: 216000 },
        { name: 'A Moment Apart', artist: 'ODESZA', plays: 76, duration_ms: 245000 }
      ],
      topGenres: [
        { genre: 'Ambient', percentage: 32, count: 450 },
        { genre: 'Electronic', percentage: 28, count: 390 },
        { genre: 'Lo-fi', percentage: 18, count: 250 },
        { genre: 'Indie', percentage: 12, count: 170 },
        { genre: 'Jazz', percentage: 10, count: 140 }
      ],
      listeningPatterns: {
        peakHours: { start: 22, end: 2, label: '10pm - 2am' },
        weekdayVsWeekend: { weekday: 35, weekend: 65 },
        averageSessionLength: 47,
        skipRate: 12,
        totalMinutesListened: 12450
      },
      audioFeatures: {
        averageEnergy: 0.65,
        averageValence: 0.58,
        averageDanceability: 0.54,
        averageAcousticness: 0.32,
        averageInstrumentalness: 0.45
      },
      recentlyPlayed: [
        { track: 'A Walk', artist: 'Tycho', played_at: new Date(Date.now() - 3600000).toISOString() },
        { track: 'Roygbiv', artist: 'Boards of Canada', played_at: new Date(Date.now() - 7200000).toISOString() }
      ]
    };

    // Store data in soul_data table (using actual schema: raw_data instead of content/metadata)
    const dataPoints = [
      // Top Artists
      ...testData.topArtists.map(artist => ({
        user_id: userId,
        platform: 'spotify',
        data_type: 'top_artist',
        raw_data: {
          name: artist.name,
          plays: artist.plays,
          genre: artist.genre,
          popularity: artist.popularity
        },
        extraction_timestamp: new Date().toISOString()
      })),
      // Top Tracks
      ...testData.topTracks.map(track => ({
        user_id: userId,
        platform: 'spotify',
        data_type: 'top_track',
        raw_data: {
          name: track.name,
          artist: track.artist,
          plays: track.plays,
          duration_ms: track.duration_ms
        },
        extraction_timestamp: new Date().toISOString()
      })),
      // Genres
      ...testData.topGenres.map(genre => ({
        user_id: userId,
        platform: 'spotify',
        data_type: 'genre',
        raw_data: {
          genre: genre.genre,
          percentage: genre.percentage,
          count: genre.count
        },
        extraction_timestamp: new Date().toISOString()
      })),
      // Listening patterns (single aggregate record)
      {
        user_id: userId,
        platform: 'spotify',
        data_type: 'listening_patterns',
        raw_data: testData.listeningPatterns,
        extraction_timestamp: new Date().toISOString()
      },
      // Audio features (aggregate)
      {
        user_id: userId,
        platform: 'spotify',
        data_type: 'audio_features',
        raw_data: testData.audioFeatures,
        extraction_timestamp: new Date().toISOString()
      },
      // Recently played tracks
      ...testData.recentlyPlayed.map(item => ({
        user_id: userId,
        platform: 'spotify',
        data_type: 'recently_played',
        raw_data: {
          track: item.track,
          artist: item.artist,
          played_at: item.played_at
        },
        extraction_timestamp: new Date().toISOString()
      }))
    ];

    const { data: insertedData, error: dataError } = await supabase
      .from('soul_data')
      .insert(dataPoints)
      .select();

    if (dataError) throw dataError;

    // Update extraction job as completed
    await supabase
      .from('extraction_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        items_extracted: dataPoints.length
      })
      .eq('id', job.id);

    // Update platform_connections last_sync
    await supabase
      .from('platform_connections')
      .update({
        last_sync: new Date().toISOString(),
        last_sync_status: 'success',
        total_synced: dataPoints.length
      })
      .eq('user_id', userId)
      .eq('platform', 'spotify');

    console.log(`✅ [TEST MODE] Stored ${dataPoints.length} Spotify data points for user ${userId}`);

    res.json({
      success: true,
      message: 'Test Spotify data generated and stored successfully',
      userId,
      platform: 'spotify',
      jobId: job.id,
      itemsExtracted: dataPoints.length,
      dataPoints: insertedData,
      summary: {
        topArtists: testData.topArtists.length,
        topTracks: testData.topTracks.length,
        genres: testData.topGenres.length,
        totalListeningMinutes: testData.listeningPatterns.totalMinutesListened
      }
    });

  } catch (error) {
    console.error('❌ [TEST MODE] Error generating test data:', error);

    res.status(500).json({
      success: false,
      error: error.message,
      details: 'Failed to generate test Spotify data'
    });
  }
});

/**
 * GET /api/test-extraction/soul-data/:userId
 * Retrieve all extracted soul data for a user
 */
router.get('/soul-data/:userId', async (req, res) => {
  const { userId } = req.params;
  const { platform, dataType } = req.query;

  try {
    let query = supabase
      .from('soul_data')
      .select('*')
      .eq('user_id', userId)
      .order('extracted_at', { ascending: false });

    if (platform) {
      query = query.eq('platform', platform);
    }

    if (dataType) {
      query = query.eq('data_type', dataType);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Group data by platform and type
    const grouped = data.reduce((acc, item) => {
      if (!acc[item.platform]) {
        acc[item.platform] = {};
      }
      if (!acc[item.platform][item.data_type]) {
        acc[item.platform][item.data_type] = [];
      }
      acc[item.platform][item.data_type].push(item);
      return acc;
    }, {});

    res.json({
      success: true,
      userId,
      totalDataPoints: data.length,
      platforms: Object.keys(grouped),
      data: grouped,
      rawData: data
    });

  } catch (error) {
    console.error('❌ Error retrieving soul data:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/test-extraction/data-counts/:userId
 * Get count of extracted data points per platform
 */
router.get('/data-counts/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const { data, error } = await supabase
      .from('soul_data')
      .select('platform')
      .eq('user_id', userId);

    if (error) throw error;

    // Count data points per platform
    const counts = data.reduce((acc, item) => {
      acc[item.platform] = (acc[item.platform] || 0) + 1;
      return acc;
    }, {});

    res.json({
      success: true,
      userId,
      totalDataPoints: data.length,
      platformCounts: counts
    });

  } catch (error) {
    console.error('❌ Error retrieving data counts:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/test-extraction/spotify-insights/:userId
 * Get formatted Spotify insights for visualization
 *
 * Privacy: Filtered based on user's Musical Identity + Entertainment Choices privacy levels
 */
router.get('/spotify-insights/:userId',
  authenticateUser,
  applyPrivacyFilter('spotify'),
  async (req, res) => {
    const { userId } = req.params;

    // Security: Ensure user can only access their own data
    if (req.user.id !== userId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only access your own soul signature data'
      });
    }

    // Check cache first
    const cachedInsights = insightCache.get(userId, 'spotify-insights');
  if (cachedInsights) {
    console.log(`[SpotifyInsights] Returning cached data for user ${userId}`);
    return res.json(cachedInsights);
  }

  try {
    const { data, error } = await supabase
      .from('soul_data')
      .select('*')
      .eq('user_id', userId)
      .eq('platform', 'spotify')
      .order('extraction_timestamp', { ascending: false });

    if (error) throw error;

    // Group and format data by type
    const insights = {
      topArtists: [],
      topTracks: [],
      genres: [],
      listeningPatterns: null,
      audioFeatures: null,
      recentlyPlayed: [],
      totalDataPoints: data.length
    };

    data.forEach(item => {
      switch (item.data_type) {
        case 'top_artist':
          insights.topArtists.push({
            name: item.raw_data.name,
            plays: item.raw_data.plays,
            genre: item.raw_data.genre,
            popularity: item.raw_data.popularity
          });
          break;
        case 'top_track':
          insights.topTracks.push({
            name: item.raw_data.name,
            artist: item.raw_data.artist,
            plays: item.raw_data.plays,
            duration_ms: item.raw_data.duration_ms
          });
          break;
        case 'genre':
          insights.genres.push({
            genre: item.raw_data.genre,
            percentage: item.raw_data.percentage,
            count: item.raw_data.count
          });
          break;
        case 'listening_patterns':
          insights.listeningPatterns = item.raw_data;
          break;
        case 'audio_features':
          insights.audioFeatures = item.raw_data;
          break;
        case 'recently_played':
          insights.recentlyPlayed.push({
            track: item.raw_data.track,
            artist: item.raw_data.artist,
            played_at: item.raw_data.played_at
          });
          break;
      }
    });

    // Check if we have any actual data
    if (data.length === 0) {
      console.log(`[SpotifyInsights] No data available for user ${userId} - returning 404`);
      return res.status(404).json({
        success: false,
        error: 'NO_DATA',
        message: 'No Spotify data found. Please connect Spotify and run data extraction to see your music insights.'
      });
    }

    // Sort arrays by relevance
    insights.topArtists.sort((a, b) => b.plays - a.plays);
    insights.topTracks.sort((a, b) => b.plays - a.plays);
    insights.genres.sort((a, b) => b.percentage - a.percentage);
    insights.recentlyPlayed.sort((a, b) => new Date(b.played_at) - new Date(a.played_at));

    const response = {
      success: true,
      userId,
      insights,
      hasData: true
    };

    // Cache the insights (10 minutes TTL)
    insightCache.set(userId, response, 'spotify-insights', 10 * 60 * 1000);
    console.log(`[SpotifyInsights] Cached insights for user ${userId} with ${data.length} data points`);

    res.json(response);

  } catch (error) {
    console.error('❌ Error retrieving Spotify insights:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/test-extraction/netflix-insights/:userId
 * Get formatted Netflix insights for visualization
 *
 * Privacy: Filtered based on user's Entertainment Choices + Hobbies & Interests privacy levels
 */
router.get('/netflix-insights/:userId',
  authenticateUser,
  applyPrivacyFilter('netflix'),
  async (req, res) => {
    const { userId } = req.params;
    console.log(`🎬 [TEST MODE] Generating Netflix insights for user: ${userId}`);

    // Security: Ensure user can only access their own data
    if (req.user.id !== userId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only access your own soul signature data'
      });
    }

    // Check cache first
    const cachedInsights = insightCache.get(userId, 'netflix-insights');
  if (cachedInsights) {
    console.log(`[NetflixInsights] Returning cached data for user ${userId}`);
    return res.json(cachedInsights);
  }

  try {
    // DISABLED: Mock data removed - return 404 to show empty state
    // Netflix API integration not yet implemented
    console.log(`[NetflixInsights] No real data available for user ${userId} - returning 404`);
    return res.status(404).json({
      success: false,
      error: 'NO_DATA',
      message: 'Netflix data extraction not yet implemented. Connect Netflix to see your viewing insights.'
    });

  } catch (error) {
    console.error('❌ Error generating Netflix insights:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to generate Netflix insights'
    });
  }
});

/**
 * GET /api/test-extraction/youtube-insights/:userId
 * Get formatted YouTube insights for visualization
 *
 * Privacy: Filtered based on user's Hobbies & Interests + Studies & Education privacy levels
 */
router.get('/youtube-insights/:userId',
  authenticateUser,
  applyPrivacyFilter('youtube'),
  async (req, res) => {
    const { userId } = req.params;
    console.log(`📺 [TEST MODE] Generating YouTube insights for user: ${userId}`);

    // Security: Ensure user can only access their own data
    if (req.user.id !== userId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only access your own soul signature data'
      });
    }

    // Check cache first
    const cachedInsights = insightCache.get(userId, 'youtube-insights');
  if (cachedInsights) {
    console.log(`[YouTubeInsights] Returning cached data for user ${userId}`);
    return res.json(cachedInsights);
  }

  try {
    // DISABLED: Mock data removed - return 404 to show empty state
    // YouTube API integration not yet implemented
    console.log(`[YouTubeInsights] No real data available for user ${userId} - returning 404`);
    return res.status(404).json({
      success: false,
      error: 'NO_DATA',
      message: 'YouTube data extraction not yet implemented. Connect YouTube to see your learning insights.'
    });

  } catch (error) {
    console.error('❌ Error generating YouTube insights:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to generate YouTube insights'
    });
  }
});

/**
 * DELETE /api/test-extraction/soul-data/:userId
 * Clear all soul data for a user (useful for testing)
 */
router.delete('/soul-data/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const { error } = await supabase
      .from('soul_data')
      .delete()
      .eq('user_id', userId);

    if (error) throw error;

    res.json({
      success: true,
      message: `Cleared all soul data for user ${userId}`
    });

  } catch (error) {
    console.error('❌ Error clearing soul data:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
