import express from 'express';
import { SoulSignatureService } from '../services/soulSignature.js';

const router = express.Router();
const soulService = new SoulSignatureService();

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

    // Netflix doesn't have public API, so we'll use a different approach
    // Could integrate with browser extension or manual input
    res.json({
      success: true,
      method: 'manual',
      message: 'Please install our browser extension to sync Netflix viewing history',
      extensionUrl: '/netflix-extension',
      instructions: [
        'Install the Twin AI Netflix Sync extension',
        'Log into your Netflix account',
        'Click "Sync Viewing History" in the extension',
        'Your viewing patterns will be analyzed for narrative preferences'
      ]
    });
  } catch (error) {
    console.error('Netflix connection error:', error);
    res.status(500).json({ error: 'Failed to initialize Netflix connection' });
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

// Goodreads/Books Connector - Intellectual Interests
router.post('/connect/goodreads', async (req, res) => {
  try {
    const { userId } = req.body;

    // Goodreads OAuth
    const authUrl = 'https://www.goodreads.com/oauth/authorize';

    res.json({
      success: true,
      authUrl,
      message: 'Connect your reading preferences',
      note: 'Your book choices reveal deep intellectual patterns'
    });
  } catch (error) {
    console.error('Goodreads connection error:', error);
    res.status(500).json({ error: 'Failed to initialize Goodreads connection' });
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

// Extract Spotify Musical Soul
router.post('/extract/spotify', async (req, res) => {
  try {
    const { userId, accessToken } = req.body;

    // Get user's top artists
    const topArtistsRes = await fetch('https://api.spotify.com/v1/me/top/artists?limit=50', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    const topArtists = await topArtistsRes.json();

    // Get user's top tracks
    const topTracksRes = await fetch('https://api.spotify.com/v1/me/top/tracks?limit=50', {
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

    // Extract musical soul signature
    const musicalSoul = await soulService.analyzeSpotifyPersonality({
      topArtists: topArtists.items,
      topTracks: topTracks.items,
      playlists: playlists.items,
      recentlyPlayed: recentlyPlayed.items,
      topGenres: extractTopGenres(topArtists.items),
      listeningHistory: recentlyPlayed.items
    });

    // Additional analysis
    const emotionalProfile = analyzeEmotionalProfile(topTracks.items);
    const discoveryPattern = analyzeDiscoveryPattern(topArtists.items, recentlyPlayed.items);
    const socialListening = analyzeSocialPatterns(playlists.items);

    res.json({
      success: true,
      soulSignature: {
        musical: musicalSoul,
        emotional: emotionalProfile,
        discovery: discoveryPattern,
        social: socialListening,
        summary: {
          dominantMood: musicalSoul.musicMoods[0],
          musicalDiversity: musicalSoul.diversityScore,
          emotionalRange: musicalSoul.emotionalRange,
          listeningPersonality: categorizeListeningPersonality(musicalSoul)
        }
      }
    });
  } catch (error) {
    console.error('Spotify extraction error:', error);
    res.status(500).json({ error: 'Failed to extract Spotify data' });
  }
});

// Extract YouTube Viewing Patterns
router.post('/extract/youtube', async (req, res) => {
  try {
    const { userId, accessToken } = req.body;

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

    // Analyze content preferences
    const contentAnalysis = {
      categories: categorizeContent(likedVideos.items),
      learningVsEntertainment: calculateLearningRatio(likedVideos.items),
      channelTypes: analyzeChannelTypes(subscriptions.items),
      topicsOfInterest: extractTopics(likedVideos.items, subscriptions.items),
      engagementPatterns: analyzeEngagement(watchHistory.items)
    };

    res.json({
      success: true,
      soulSignature: {
        youtube: contentAnalysis,
        curiosityProfile: {
          breadth: contentAnalysis.categories.length,
          depth: calculateTopicDepth(contentAnalysis.topicsOfInterest),
          learningStyle: determineLearningStyle(contentAnalysis)
        }
      }
    });
  } catch (error) {
    console.error('YouTube extraction error:', error);
    res.status(500).json({ error: 'Failed to extract YouTube data' });
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
  const public = playlists.filter(p => p.public).length;

  return {
    sharingTendency: public / playlists.length,
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

export default router;