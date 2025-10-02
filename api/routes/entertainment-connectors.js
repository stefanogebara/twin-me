import express from 'express';
import multer from 'multer';
import { SoulSignatureService } from '../services/soulSignature.js';
import mcpClient from '../services/mcp-client.js';
import fs from 'fs/promises';
import path from 'path';

const router = express.Router();
const soulService = new SoulSignatureService();

// Configure multer for Netflix CSV uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = 'uploads/netflix';
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `netflix-${uniqueSuffix}.csv`);
  }
});

const csvUpload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit for CSV files
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  }
});

/**
 * Entertainment Connectors for Soul Signature Extraction
 *
 * These connectors capture the unique essence of a person through their
 * entertainment choices - the movies they watch, music they listen to,
 * books they read. This is where we find the soul, not just the resume.
 */

// Spotify Connector - Musical Soul
router.post('/connect/spotify', async (req, res) => {
  try {
    const { userId } = req.body;

    // Spotify OAuth Configuration
    const clientId = process.env.SPOTIFY_CLIENT_ID || 'your-spotify-client-id';
    const redirectUri = encodeURIComponent(`${process.env.VITE_APP_URL || 'http://localhost:8086'}/oauth/callback`);
    const scope = encodeURIComponent(
      'user-read-private user-read-email ' +
      'user-top-read user-read-recently-played ' +
      'playlist-read-private playlist-read-collaborative ' +
      'user-library-read user-follow-read'
    );
    const state = Buffer.from(JSON.stringify({
      provider: 'spotify',
      userId,
      timestamp: Date.now()
    })).toString('base64');

    const authUrl = `https://accounts.spotify.com/authorize?` +
      `client_id=${clientId}&response_type=code&` +
      `redirect_uri=${redirectUri}&scope=${scope}&state=${state}`;

    res.json({
      success: true,
      authUrl,
      message: 'Connect your musical soul'
    });
  } catch (error) {
    console.error('Spotify connection error:', error);
    res.status(500).json({ error: 'Failed to initialize Spotify connection' });
  }
});

// Netflix Connector - Narrative Preferences
router.post('/connect/netflix', async (req, res) => {
  try {
    const { userId } = req.body;

    // Netflix doesn't have public API, so we'll use CSV upload
    res.json({
      success: true,
      method: 'csv-upload',
      message: 'Upload your Netflix viewing history CSV file',
      uploadEndpoint: '/api/entertainment/upload/netflix-csv',
      instructions: [
        'Go to Netflix.com > Account > Viewing Activity',
        'Click "Download all" at the bottom of the page',
        'Upload the downloaded CSV file using the endpoint below',
        'Your viewing patterns will be analyzed for narrative preferences'
      ]
    });
  } catch (error) {
    console.error('Netflix connection error:', error);
    res.status(500).json({ error: 'Failed to initialize Netflix connection' });
  }
});

// Netflix CSV Upload - Manual Data Import
router.post('/upload/netflix-csv', csvUpload.single('csvFile'), async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'CSV file is required'
      });
    }

    console.log(`📄 Processing Netflix CSV for user ${userId}`);

    // Read and parse CSV file
    const csvContent = await fs.readFile(req.file.path, 'utf8');
    const lines = csvContent.split('\n');
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));

    // Parse CSV data
    const viewingHistory = [];
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;

      const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
      const entry = {};
      headers.forEach((header, index) => {
        entry[header] = values[index];
      });

      if (entry['Title']) {
        viewingHistory.push({
          title: entry['Title'],
          date: entry['Date'] || entry['Viewing Date'],
          duration: entry['Duration'] || entry['Time Watched'],
          device: entry['Device Type'],
          profileName: entry['Profile Name'] || entry['Profile']
        });
      }
    }

    console.log(`📊 Parsed ${viewingHistory.length} viewing entries`);

    // Analyze viewing patterns
    const genres = extractNetflixGenres(viewingHistory);
    const bingePatterns = analyzeBingePatterns(viewingHistory);
    const contentTypes = categorizeNetflixContent(viewingHistory);
    const temporalPatterns = analyzeViewingTimes(viewingHistory);

    // Extract narrative soul signature
    const narrativeSoul = {
      genrePreferences: genres,
      bingeHabits: bingePatterns,
      contentMix: contentTypes,
      viewingSchedule: temporalPatterns,
      totalViewed: viewingHistory.length,
      uniqueTitles: [...new Set(viewingHistory.map(v => v.title))].length,
      narrativePersonality: determineNarrativePersonality(genres, bingePatterns, contentTypes)
    };

    // Clean up uploaded file
    await fs.unlink(req.file.path);

    res.json({
      success: true,
      extractionMethod: 'csv-upload',
      soulSignature: {
        netflix: narrativeSoul,
        summary: {
          dominantGenres: genres.slice(0, 3),
          viewingStyle: bingePatterns.style,
          contentPreference: contentTypes.primary,
          viewingFrequency: calculateViewingFrequency(viewingHistory)
        }
      },
      metadata: {
        dataPoints: viewingHistory.length,
        extractedAt: new Date().toISOString(),
        method: 'csv-upload',
        csvFileName: req.file.originalname
      }
    });

  } catch (error) {
    console.error('Netflix CSV processing error:', error);

    // Clean up file on error
    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkError) {
        console.error('Error deleting file:', unlinkError);
      }
    }

    res.status(500).json({
      success: false,
      error: 'Failed to process Netflix CSV',
      details: error.message
    });
  }
});

// YouTube Connector - Learning & Entertainment Mix
router.post('/connect/youtube', async (req, res) => {
  try {
    const { userId } = req.body;

    // YouTube/Google OAuth
    const clientId = process.env.GOOGLE_CLIENT_ID || '851806289280-k0v833noqjk02r43m45cjr7prnhg24gr.apps.googleusercontent.com';
    const redirectUri = encodeURIComponent(`${process.env.VITE_APP_URL || 'http://localhost:8086'}/oauth/callback`);
    const scope = encodeURIComponent(
      'https://www.googleapis.com/auth/youtube.readonly ' +
      'https://www.googleapis.com/auth/youtube.force-ssl'
    );
    const state = Buffer.from(JSON.stringify({
      provider: 'youtube',
      userId,
      timestamp: Date.now()
    })).toString('base64');

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${clientId}&redirect_uri=${redirectUri}&` +
      `scope=${scope}&response_type=code&access_type=offline&` +
      `prompt=consent&state=${state}`;

    res.json({
      success: true,
      authUrl,
      message: 'Connect your YouTube preferences'
    });
  } catch (error) {
    console.error('YouTube connection error:', error);
    res.status(500).json({ error: 'Failed to initialize YouTube connection' });
  }
});

// Steam/Gaming Connector - Interactive Preferences
router.post('/connect/steam', async (req, res) => {
  try {
    const { userId, steamId } = req.body;

    // Steam Web API approach
    res.json({
      success: true,
      method: 'steamId',
      message: 'Enter your Steam ID or profile URL',
      instruction: 'We\'ll analyze your gaming preferences and playstyles'
    });
  } catch (error) {
    console.error('Steam connection error:', error);
    res.status(500).json({ error: 'Failed to initialize Steam connection' });
  }
});

/**
 * OAuth Callback Handler
 * Handles OAuth callbacks from all entertainment platforms
 */
router.post('/oauth/callback', async (req, res) => {
  try {
    const { code, state, error: oauthError } = req.body;

    if (oauthError) {
      return res.status(400).json({
        success: false,
        error: `OAuth error: ${oauthError}`
      });
    }

    if (!code || !state) {
      return res.status(400).json({
        success: false,
        error: 'Missing authorization code or state'
      });
    }

    // Decode state to get provider and userId
    const stateData = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
    const { provider, userId } = stateData;

    let accessToken, refreshToken, expiresIn;

    // Exchange authorization code for access token based on provider
    switch (provider) {
      case 'spotify':
        const spotifyTokenResponse = await fetch('https://accounts.spotify.com/api/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${Buffer.from(
              `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
            ).toString('base64')}`
          },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: `${process.env.VITE_APP_URL || 'http://localhost:8086'}/oauth/callback`
          })
        });

        if (!spotifyTokenResponse.ok) {
          throw new Error('Failed to exchange Spotify authorization code');
        }

        const spotifyTokens = await spotifyTokenResponse.json();
        accessToken = spotifyTokens.access_token;
        refreshToken = spotifyTokens.refresh_token;
        expiresIn = spotifyTokens.expires_in;
        break;

      case 'youtube':
        const youtubeTokenResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: process.env.GOOGLE_CLIENT_ID,
            client_secret: process.env.GOOGLE_CLIENT_SECRET,
            redirect_uri: `${process.env.VITE_APP_URL || 'http://localhost:8086'}/oauth/callback`,
            grant_type: 'authorization_code'
          })
        });

        if (!youtubeTokenResponse.ok) {
          throw new Error('Failed to exchange YouTube authorization code');
        }

        const youtubeTokens = await youtubeTokenResponse.json();
        accessToken = youtubeTokens.access_token;
        refreshToken = youtubeTokens.refresh_token;
        expiresIn = youtubeTokens.expires_in;
        break;

      default:
        return res.status(400).json({
          success: false,
          error: `Unsupported provider: ${provider}`
        });
    }

    // TODO: Store tokens in database with encryption
    // For now, return them to the client
    res.json({
      success: true,
      provider,
      userId,
      accessToken,
      refreshToken,
      expiresIn,
      message: `Successfully connected to ${provider}`
    });

  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to complete OAuth flow'
    });
  }
});

// Extract Spotify Musical Soul
router.post('/extract/spotify', async (req, res) => {
  try {
    const { userId, accessToken } = req.body;

    if (!userId || !accessToken) {
      return res.status(400).json({
        success: false,
        error: 'userId and accessToken are required'
      });
    }

    // Load MCP configuration
    await mcpClient.loadConfig();

    let rawData;
    let extractionMethod = 'direct-api';

    // Try to use MCP if available
    if (mcpClient.usesMCP('spotify')) {
      console.log('📊 Using MCP for Spotify data extraction');
      try {
        rawData = await mcpClient.extractData('spotify', accessToken, userId);
        extractionMethod = 'mcp';
      } catch (mcpError) {
        console.error('MCP extraction failed, falling back to direct API:', mcpError);
        extractionMethod = 'direct-api-fallback';
      }
    }

    // Fallback to direct Spotify API if MCP not available or failed
    if (!rawData || extractionMethod !== 'mcp') {
      console.log('📊 Using direct Spotify API for data extraction');

      // Get user's top artists
      const topArtistsRes = await fetch('https://api.spotify.com/v1/me/top/artists?limit=50&time_range=long_term', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      const topArtists = await topArtistsRes.json();

      // Get user's top tracks
      const topTracksRes = await fetch('https://api.spotify.com/v1/me/top/tracks?limit=50&time_range=long_term', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      const topTracks = await topTracksRes.json();

      // Get user's playlists
      const playlistsRes = await fetch('https://api.spotify.com/v1/me/playlists?limit=50', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      const playlists = await playlistsRes.json();

      // Get recently played
      const recentRes = await fetch('https://api.spotify.com/v1/me/player/recently-played?limit=50', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      const recentlyPlayed = await recentRes.json();

      // Get saved albums
      const savedAlbumsRes = await fetch('https://api.spotify.com/v1/me/albums?limit=50', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      const savedAlbums = await savedAlbumsRes.json();

      // Get followed artists
      const followedArtistsRes = await fetch('https://api.spotify.com/v1/me/following?type=artist&limit=50', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      const followedArtists = await followedArtistsRes.json();

      rawData = {
        platform: 'spotify',
        userId,
        dataType: 'direct_api_extraction',
        extracted: {
          topArtists: topArtists.items || [],
          topTracks: topTracks.items || [],
          recentlyPlayed: recentlyPlayed.items || [],
          playlists: playlists.items || [],
          savedAlbums: savedAlbums.items || [],
          followedArtists: followedArtists.artists?.items || [],
          topGenres: extractTopGenres(topArtists.items || [])
        },
        metadata: {
          extractedAt: new Date().toISOString(),
          method: 'direct-api',
          dataPoints: (topArtists.items?.length || 0) + (topTracks.items?.length || 0)
        }
      };
    }

    // Extract musical soul signature using raw data
    const musicalSoul = await soulService.analyzeSpotifyPersonality({
      topArtists: rawData.extracted.topArtists,
      topTracks: rawData.extracted.topTracks,
      playlists: rawData.extracted.playlists,
      recentlyPlayed: rawData.extracted.recentlyPlayed,
      topGenres: rawData.extracted.topGenres || extractTopGenres(rawData.extracted.topArtists),
      listeningHistory: rawData.extracted.recentlyPlayed
    });

    // Additional analysis
    const emotionalProfile = analyzeEmotionalProfile(rawData.extracted.topTracks);
    const discoveryPattern = analyzeDiscoveryPattern(
      rawData.extracted.topArtists,
      rawData.extracted.recentlyPlayed
    );
    const socialListening = analyzeSocialPatterns(rawData.extracted.playlists);

    res.json({
      success: true,
      extractionMethod,
      soulSignature: {
        musical: musicalSoul,
        emotional: emotionalProfile,
        discovery: discoveryPattern,
        social: socialListening,
        summary: {
          dominantMood: musicalSoul.musicMoods?.[0] || 'balanced',
          musicalDiversity: musicalSoul.diversityScore || 0,
          emotionalRange: musicalSoul.emotionalRange || 'moderate',
          listeningPersonality: categorizeListeningPersonality(musicalSoul)
        }
      },
      metadata: {
        dataPoints: rawData.metadata.dataPoints,
        extractedAt: rawData.metadata.extractedAt,
        method: extractionMethod
      }
    });
  } catch (error) {
    console.error('Spotify extraction error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to extract Spotify data',
      details: error.message
    });
  }
});

// Extract YouTube Viewing Patterns
router.post('/extract/youtube', async (req, res) => {
  try {
    const { userId, accessToken } = req.body;

    if (!userId || !accessToken) {
      return res.status(400).json({
        success: false,
        error: 'userId and accessToken are required'
      });
    }

    // Load MCP configuration
    await mcpClient.loadConfig();

    let rawData;
    let extractionMethod = 'direct-api';

    // Try to use MCP if available
    if (mcpClient.usesMCP('youtube')) {
      console.log('📊 Using MCP for YouTube data extraction');
      try {
        rawData = await mcpClient.extractData('youtube', accessToken, userId);
        extractionMethod = 'mcp';
      } catch (mcpError) {
        console.error('MCP extraction failed, falling back to direct API:', mcpError);
        extractionMethod = 'direct-api-fallback';
      }
    }

    // Fallback to direct YouTube API if MCP not available or failed
    if (!rawData || extractionMethod !== 'mcp') {
      console.log('📊 Using direct YouTube API for data extraction');

      // Get liked videos
      const likedRes = await fetch(
        'https://www.googleapis.com/youtube/v3/videos?part=snippet&myRating=like&maxResults=50',
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      );
      const likedVideos = await likedRes.json();

      // Get subscriptions
      const subsRes = await fetch(
        'https://www.googleapis.com/youtube/v3/subscriptions?part=snippet&mine=true&maxResults=50',
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      );
      const subscriptions = await subsRes.json();

      // Get watch history (if available)
      const historyRes = await fetch(
        'https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=HL&maxResults=50',
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      );
      const watchHistory = await historyRes.json();

      rawData = {
        platform: 'youtube',
        userId,
        dataType: 'direct_api_extraction',
        extracted: {
          watchHistory: watchHistory.items || [],
          subscriptions: subscriptions.items || [],
          likedVideos: likedVideos.items || [],
          playlists: [],
          viewingPatterns: {}
        },
        metadata: {
          extractedAt: new Date().toISOString(),
          method: 'direct-api',
          dataPoints: (likedVideos.items?.length || 0) + (subscriptions.items?.length || 0)
        }
      };
    }

    // Analyze content preferences
    const contentAnalysis = {
      categories: categorizeContent(rawData.extracted.likedVideos),
      learningVsEntertainment: calculateLearningRatio(rawData.extracted.likedVideos),
      channelTypes: analyzeChannelTypes(rawData.extracted.subscriptions),
      topicsOfInterest: extractTopics(rawData.extracted.likedVideos, rawData.extracted.subscriptions),
      engagementPatterns: analyzeEngagement(rawData.extracted.watchHistory)
    };

    res.json({
      success: true,
      extractionMethod,
      soulSignature: {
        youtube: contentAnalysis,
        curiosityProfile: {
          breadth: contentAnalysis.categories.length,
          depth: calculateTopicDepth(contentAnalysis.topicsOfInterest),
          learningStyle: determineLearningStyle(contentAnalysis)
        }
      },
      metadata: {
        dataPoints: rawData.metadata.dataPoints,
        extractedAt: rawData.metadata.extractedAt,
        method: extractionMethod
      }
    });
  } catch (error) {
    console.error('YouTube extraction error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to extract YouTube data',
      details: error.message
    });
  }
});

// Aggregate Entertainment Soul Signature
router.post('/aggregate-entertainment', async (req, res) => {
  try {
    const { userId, connectedPlatforms } = req.body;

    const aggregatedSoul = {
      emotionalLandscape: {},
      narrativePreferences: {},
      culturalTastes: {},
      discoveryPatterns: {},
      socialEngagement: {},
      temporalPatterns: {},
      uniquenessScore: 0
    };

    // Combine all entertainment data
    if (connectedPlatforms.spotify) {
      aggregatedSoul.emotionalLandscape.musical = connectedPlatforms.spotify.emotional;
    }
    if (connectedPlatforms.netflix) {
      aggregatedSoul.narrativePreferences = connectedPlatforms.netflix.genres;
    }
    if (connectedPlatforms.youtube) {
      aggregatedSoul.discoveryPatterns = connectedPlatforms.youtube.curiosity;
    }

    // Calculate uniqueness score
    aggregatedSoul.uniquenessScore = calculateUniqueness(aggregatedSoul);

    // Generate personality insights
    const personalityInsights = generatePersonalityInsights(aggregatedSoul);

    res.json({
      success: true,
      entertainmentSoul: aggregatedSoul,
      insights: personalityInsights,
      signature: {
        primary: identifyPrimarySignature(aggregatedSoul),
        secondary: identifySecondaryTraits(aggregatedSoul),
        hidden: findHiddenPatterns(aggregatedSoul)
      }
    });
  } catch (error) {
    console.error('Entertainment aggregation error:', error);
    res.status(500).json({ error: 'Failed to aggregate entertainment data' });
  }
});

// Helper functions
function extractTopGenres(artists) {
  const genreCount = {};
  artists.forEach(artist => {
    artist.genres?.forEach(genre => {
      genreCount[genre] = (genreCount[genre] || 0) + 1;
    });
  });

  return Object.entries(genreCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([genre]) => genre);
}

function analyzeEmotionalProfile(tracks) {
  // Analyze track features for emotional patterns
  const emotions = {
    energy: 0,
    valence: 0,
    introspection: 0,
    intensity: 0
  };

  tracks.forEach(track => {
    // Would need audio features API for real analysis
    // This is simplified
    if (track.name.toLowerCase().includes('love')) emotions.valence++;
    if (track.name.toLowerCase().includes('sad')) emotions.introspection++;
  });

  return emotions;
}

function analyzeDiscoveryPattern(artists, recent) {
  const uniqueArtists = new Set(artists.map(a => a.id));
  const recentArtists = new Set(recent.map(r => r.track.artists[0].id));

  const overlap = [...uniqueArtists].filter(id => recentArtists.has(id)).length;
  const discoveryRate = 1 - (overlap / uniqueArtists.size);

  return {
    explorationLevel: discoveryRate > 0.5 ? 'high' : 'moderate',
    loyaltyToFavorites: overlap / recentArtists.size,
    discoveryRate
  };
}

function analyzeSocialPatterns(playlists) {
  const collaborative = playlists.filter(p => p.collaborative).length;
  const publicPlaylists = playlists.filter(p => p.public).length;

  return {
    sharingTendency: publicPlaylists / playlists.length,
    collaborativeSpirit: collaborative / playlists.length,
    curationType: playlists.length > 20 ? 'curator' : 'casual'
  };
}

function categorizeListeningPersonality(musicalSoul) {
  if (musicalSoul.diversityScore > 8) return 'Eclectic Explorer';
  if (musicalSoul.musicMoods.includes('energetic')) return 'Energy Seeker';
  if (musicalSoul.musicMoods.includes('contemplative')) return 'Deep Listener';
  if (musicalSoul.socialListening) return 'Social Connector';
  return 'Balanced Listener';
}

function categorizeContent(videos) {
  const categories = new Set();
  videos.forEach(video => {
    if (video.snippet.categoryId) {
      categories.add(video.snippet.categoryId);
    }
  });
  return Array.from(categories);
}

function calculateLearningRatio(videos) {
  const educational = videos.filter(v =>
    v.snippet.title.toLowerCase().includes('tutorial') ||
    v.snippet.title.toLowerCase().includes('how to') ||
    v.snippet.title.toLowerCase().includes('explained')
  ).length;

  return educational / videos.length;
}

function analyzeChannelTypes(subscriptions) {
  const types = {
    educational: 0,
    entertainment: 0,
    news: 0,
    gaming: 0,
    lifestyle: 0
  };

  subscriptions.forEach(sub => {
    const title = sub.snippet.title.toLowerCase();
    if (title.includes('academy') || title.includes('university')) types.educational++;
    else if (title.includes('gaming') || title.includes('games')) types.gaming++;
    else if (title.includes('news')) types.news++;
    else types.entertainment++;
  });

  return types;
}

function extractTopics(videos, subscriptions) {
  // Extract main topics from titles and descriptions
  const topics = {};

  [...videos, ...subscriptions].forEach(item => {
    const text = `${item.snippet.title} ${item.snippet.description}`.toLowerCase();
    // Simple keyword extraction - in production use NLP
    const keywords = text.match(/\b\w{4,}\b/g) || [];
    keywords.forEach(keyword => {
      topics[keyword] = (topics[keyword] || 0) + 1;
    });
  });

  return Object.entries(topics)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([topic]) => topic);
}

function analyzeEngagement(watchHistory) {
  if (!watchHistory || !watchHistory.length) return { pattern: 'unknown' };

  // Analyze viewing times and patterns
  const times = watchHistory.map(item => new Date(item.snippet.publishedAt));
  const hours = times.map(t => t.getHours());

  const avgHour = hours.reduce((a, b) => a + b, 0) / hours.length;

  return {
    pattern: avgHour < 12 ? 'morning' : avgHour < 18 ? 'afternoon' : 'evening',
    consistency: calculateConsistency(times)
  };
}

function calculateTopicDepth(topics) {
  // Measure how focused vs broad the interests are
  return topics.length < 10 ? 'deep' : topics.length < 20 ? 'balanced' : 'broad';
}

function determineLearningStyle(analysis) {
  if (analysis.learningVsEntertainment > 0.6) return 'active-learner';
  if (analysis.channelTypes.educational > analysis.channelTypes.entertainment) return 'knowledge-seeker';
  return 'balanced-consumer';
}

function calculateConsistency(times) {
  // Calculate variance in viewing times
  return 0.5; // Simplified
}

function calculateUniqueness(soul) {
  // Calculate how unique this combination of preferences is
  let uniqueness = 0;

  if (soul.emotionalLandscape.musical?.diversityScore > 7) uniqueness += 2;
  if (soul.narrativePreferences?.diversity > 5) uniqueness += 2;
  if (soul.discoveryPatterns?.explorationLevel === 'high') uniqueness += 3;

  return Math.min(10, uniqueness);
}

function generatePersonalityInsights(soul) {
  const insights = [];

  if (soul.emotionalLandscape.musical?.musicMoods?.includes('contemplative')) {
    insights.push('You seek depth and meaning in your entertainment choices');
  }
  if (soul.discoveryPatterns?.explorationLevel === 'high') {
    insights.push('You have a curious mind that loves discovering new perspectives');
  }
  if (soul.socialEngagement?.sharingTendency > 0.5) {
    insights.push('You enjoy sharing your discoveries and connecting through culture');
  }

  return insights;
}

function identifyPrimarySignature(soul) {
  // Identify the most dominant aspect of their entertainment personality
  return 'Cultural Explorer'; // Simplified
}

function identifySecondaryTraits(soul) {
  return ['Emotional Depth', 'Curious Mind', 'Social Curator'];
}

function findHiddenPatterns(soul) {
  // Find non-obvious patterns in their entertainment choices
  return {
    crossCultural: 'High interest in diverse perspectives',
    temporal: 'Preference changes with mood and time of day',
    social: 'Uses entertainment as connection tool'
  };
}

// Netflix-specific helper functions
function extractNetflixGenres(viewingHistory) {
  // This would ideally use an external API to get genre data
  // For now, use simple keyword matching from titles
  const genreKeywords = {
    'Drama': ['drama', 'story', 'life'],
    'Comedy': ['comedy', 'funny', 'laugh'],
    'Action': ['action', 'fight', 'war', 'mission'],
    'Thriller': ['thriller', 'mystery', 'crime', 'detective'],
    'Documentary': ['documentary', 'true', 'real', 'history'],
    'Sci-Fi': ['space', 'future', 'alien', 'sci-fi'],
    'Romance': ['love', 'romance', 'wedding', 'date'],
    'Horror': ['horror', 'scary', 'ghost', 'fear']
  };

  const genreCount = {};
  viewingHistory.forEach(entry => {
    const titleLower = entry.title.toLowerCase();
    Object.keys(genreKeywords).forEach(genre => {
      if (genreKeywords[genre].some(keyword => titleLower.includes(keyword))) {
        genreCount[genre] = (genreCount[genre] || 0) + 1;
      }
    });
  });

  return Object.entries(genreCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([genre, count]) => ({ genre, count }));
}

function analyzeBingePatterns(viewingHistory) {
  const sameDayViews = {};
  viewingHistory.forEach(entry => {
    const date = entry.date?.split(' ')[0]; // Get just the date part
    if (date) {
      sameDayViews[date] = (sameDayViews[date] || 0) + 1;
    }
  });

  const avgViewsPerDay = Object.values(sameDayViews).reduce((a, b) => a + b, 0) / Object.keys(sameDayViews).length;
  const maxViewsInDay = Math.max(...Object.values(sameDayViews));

  return {
    style: maxViewsInDay > 3 ? 'binge-watcher' : avgViewsPerDay > 1 ? 'regular-viewer' : 'casual-viewer',
    avgEpisodesPerDay: avgViewsPerDay.toFixed(1),
    maxEpisodesInDay: maxViewsInDay,
    activeDays: Object.keys(sameDayViews).length
  };
}

function categorizeNetflixContent(viewingHistory) {
  const movieKeywords = ['movie', 'film'];
  const seriesKeywords = ['season', 'episode', 'series', 's:', 'e:'];

  let movies = 0;
  let series = 0;
  let other = 0;

  viewingHistory.forEach(entry => {
    const titleLower = entry.title.toLowerCase();
    if (seriesKeywords.some(kw => titleLower.includes(kw))) {
      series++;
    } else if (movieKeywords.some(kw => titleLower.includes(kw))) {
      movies++;
    } else {
      other++;
    }
  });

  const total = viewingHistory.length;
  return {
    primary: movies > series ? 'movies' : 'series',
    distribution: {
      movies: ((movies / total) * 100).toFixed(1) + '%',
      series: ((series / total) * 100).toFixed(1) + '%',
      other: ((other / total) * 100).toFixed(1) + '%'
    }
  };
}

function analyzeViewingTimes(viewingHistory) {
  const hourCounts = {};
  const dayOfWeekCounts = {};

  viewingHistory.forEach(entry => {
    if (entry.date) {
      try {
        const date = new Date(entry.date);
        const hour = date.getHours();
        const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' });

        hourCounts[hour] = (hourCounts[hour] || 0) + 1;
        dayOfWeekCounts[dayOfWeek] = (dayOfWeekCounts[dayOfWeek] || 0) + 1;
      } catch (e) {
        // Skip invalid dates
      }
    }
  });

  const peakHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];
  const peakDay = Object.entries(dayOfWeekCounts).sort((a, b) => b[1] - a[1])[0];

  return {
    preferredTimeOfDay: peakHour ? (parseInt(peakHour[0]) < 12 ? 'morning' : parseInt(peakHour[0]) < 18 ? 'afternoon' : 'evening') : 'unknown',
    mostActiveDay: peakDay ? peakDay[0] : 'unknown',
    viewingDistribution: dayOfWeekCounts
  };
}

function determineNarrativePersonality(genres, bingePatterns, contentTypes) {
  if (bingePatterns.style === 'binge-watcher' && contentTypes.primary === 'series') {
    return 'Story Immersive';
  }
  if (genres[0]?.genre === 'Documentary') {
    return 'Knowledge Seeker';
  }
  if (contentTypes.primary === 'movies' && genres.some(g => g.genre === 'Thriller' || g.genre === 'Action')) {
    return 'Thrill Seeker';
  }
  if (genres.some(g => g.genre === 'Romance' || g.genre === 'Drama')) {
    return 'Emotional Explorer';
  }
  return 'Balanced Viewer';
}

function calculateViewingFrequency(viewingHistory) {
  if (viewingHistory.length === 0) return 'none';

  const dates = viewingHistory
    .map(v => v.date)
    .filter(d => d)
    .map(d => new Date(d).getTime())
    .filter(t => !isNaN(t))
    .sort((a, b) => a - b);

  if (dates.length < 2) return 'unknown';

  const daysBetween = (dates[dates.length - 1] - dates[0]) / (1000 * 60 * 60 * 24);
  const avgViewsPerDay = viewingHistory.length / daysBetween;

  if (avgViewsPerDay > 3) return 'heavy';
  if (avgViewsPerDay > 1) return 'regular';
  if (avgViewsPerDay > 0.3) return 'moderate';
  return 'light';
}

export default router;