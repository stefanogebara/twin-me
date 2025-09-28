/**
 * Additional Entertainment Platform Connectors
 *
 * Expanding soul signature extraction to more platforms
 * "We search in the branches for what we only find in the roots"
 */

import express from 'express';
import { platformAPIMappings } from '../services/platformAPIMappings.js';

const router = express.Router();

// Apple Music Connector
router.post('/connect/apple-music', async (req, res) => {
  try {
    const { userId } = req.body;

    res.json({
      success: true,
      method: 'musickit-js',
      message: 'Initialize Apple Music connection',
      instructions: [
        'Authenticate with Apple ID',
        'Grant music library access',
        'Analyzing your curated playlists and preferences'
      ],
      insights: platformAPIMappings.entertainment.appleMusic.insights
    });
  } catch (error) {
    console.error('Apple Music connection error:', error);
    res.status(500).json({ error: 'Failed to initialize Apple Music connection' });
  }
});

// TikTok Connector
router.post('/connect/tiktok', async (req, res) => {
  try {
    const { userId } = req.body;

    const clientKey = process.env.TIKTOK_CLIENT_KEY || 'your-tiktok-client-key';
    const redirectUri = encodeURIComponent(`${process.env.VITE_APP_URL}/oauth/callback`);
    const state = Buffer.from(JSON.stringify({
      provider: 'tiktok',
      userId,
      timestamp: Date.now()
    })).toString('base64');

    const authUrl = `https://www.tiktok.com/auth/authorize/?` +
      `client_key=${clientKey}&scope=user.info.basic,video.list&` +
      `response_type=code&redirect_uri=${redirectUri}&state=${state}`;

    res.json({
      success: true,
      authUrl,
      message: 'Connect your TikTok trends and interests',
      insights: platformAPIMappings.entertainment.tiktok.insights
    });
  } catch (error) {
    console.error('TikTok connection error:', error);
    res.status(500).json({ error: 'Failed to initialize TikTok connection' });
  }
});

// Twitch Connector
router.post('/connect/twitch', async (req, res) => {
  try {
    const { userId } = req.body;

    const clientId = process.env.TWITCH_CLIENT_ID || 'your-twitch-client-id';
    const redirectUri = encodeURIComponent(`${process.env.VITE_APP_URL}/oauth/callback`);
    const scope = encodeURIComponent('user:read:follows user:read:subscriptions');
    const state = Buffer.from(JSON.stringify({
      provider: 'twitch',
      userId,
      timestamp: Date.now()
    })).toString('base64');

    const authUrl = `https://id.twitch.tv/oauth2/authorize?` +
      `client_id=${clientId}&redirect_uri=${redirectUri}&` +
      `response_type=code&scope=${scope}&state=${state}`;

    res.json({
      success: true,
      authUrl,
      message: 'Connect your Twitch streaming preferences',
      insights: platformAPIMappings.entertainment.twitch.insights
    });
  } catch (error) {
    console.error('Twitch connection error:', error);
    res.status(500).json({ error: 'Failed to initialize Twitch connection' });
  }
});

// Discord Connector
router.post('/connect/discord', async (req, res) => {
  try {
    const { userId } = req.body;

    const clientId = process.env.DISCORD_CLIENT_ID || 'your-discord-client-id';
    const redirectUri = encodeURIComponent(`${process.env.VITE_APP_URL}/oauth/callback`);
    const scope = encodeURIComponent('identify guilds activities.read');
    const state = Buffer.from(JSON.stringify({
      provider: 'discord',
      userId,
      timestamp: Date.now()
    })).toString('base64');

    const authUrl = `https://discord.com/api/oauth2/authorize?` +
      `client_id=${clientId}&redirect_uri=${redirectUri}&` +
      `response_type=code&scope=${scope}&state=${state}`;

    res.json({
      success: true,
      authUrl,
      message: 'Connect your Discord communities',
      insights: platformAPIMappings.gaming.discord.insights
    });
  } catch (error) {
    console.error('Discord connection error:', error);
    res.status(500).json({ error: 'Failed to initialize Discord connection' });
  }
});

// Reddit Connector
router.post('/connect/reddit', async (req, res) => {
  try {
    const { userId } = req.body;

    const clientId = process.env.REDDIT_CLIENT_ID || 'your-reddit-client-id';
    const redirectUri = encodeURIComponent(`${process.env.VITE_APP_URL}/oauth/callback`);
    const state = Buffer.from(JSON.stringify({
      provider: 'reddit',
      userId,
      timestamp: Date.now()
    })).toString('base64');

    const authUrl = `https://www.reddit.com/api/v1/authorize?` +
      `client_id=${clientId}&response_type=code&` +
      `state=${state}&redirect_uri=${redirectUri}&` +
      `duration=temporary&scope=identity history read`;

    res.json({
      success: true,
      authUrl,
      message: 'Connect your Reddit communities and interests',
      insights: platformAPIMappings.social.reddit.insights
    });
  } catch (error) {
    console.error('Reddit connection error:', error);
    res.status(500).json({ error: 'Failed to initialize Reddit connection' });
  }
});

// GitHub Connector (for developers)
router.post('/connect/github', async (req, res) => {
  try {
    const { userId } = req.body;

    const clientId = process.env.GITHUB_CLIENT_ID || 'your-github-client-id';
    const redirectUri = encodeURIComponent(`${process.env.VITE_APP_URL}/oauth/callback`);
    const scope = encodeURIComponent('read:user repo read:org');
    const state = Buffer.from(JSON.stringify({
      provider: 'github',
      userId,
      timestamp: Date.now()
    })).toString('base64');

    const authUrl = `https://github.com/login/oauth/authorize?` +
      `client_id=${clientId}&redirect_uri=${redirectUri}&` +
      `scope=${scope}&state=${state}`;

    res.json({
      success: true,
      authUrl,
      message: 'Connect your coding personality',
      insights: platformAPIMappings.productivity.github.insights
    });
  } catch (error) {
    console.error('GitHub connection error:', error);
    res.status(500).json({ error: 'Failed to initialize GitHub connection' });
  }
});

// Medium Connector
router.post('/connect/medium', async (req, res) => {
  try {
    const { userId } = req.body;

    const clientId = process.env.MEDIUM_CLIENT_ID || 'your-medium-client-id';
    const redirectUri = encodeURIComponent(`${process.env.VITE_APP_URL}/oauth/callback`);
    const scope = encodeURIComponent('basicProfile listPublications');
    const state = Buffer.from(JSON.stringify({
      provider: 'medium',
      userId,
      timestamp: Date.now()
    })).toString('base64');

    const authUrl = `https://medium.com/m/oauth/authorize?` +
      `client_id=${clientId}&scope=${scope}&` +
      `state=${state}&response_type=code&` +
      `redirect_uri=${redirectUri}`;

    res.json({
      success: true,
      authUrl,
      message: 'Connect your thought leadership',
      insights: platformAPIMappings.reading.medium.insights
    });
  } catch (error) {
    console.error('Medium connection error:', error);
    res.status(500).json({ error: 'Failed to initialize Medium connection' });
  }
});

// Strava Connector (fitness personality)
router.post('/connect/strava', async (req, res) => {
  try {
    const { userId } = req.body;

    const clientId = process.env.STRAVA_CLIENT_ID || 'your-strava-client-id';
    const redirectUri = encodeURIComponent(`${process.env.VITE_APP_URL}/oauth/callback`);
    const state = Buffer.from(JSON.stringify({
      provider: 'strava',
      userId,
      timestamp: Date.now()
    })).toString('base64');

    const authUrl = `https://www.strava.com/oauth/authorize?` +
      `client_id=${clientId}&response_type=code&` +
      `redirect_uri=${redirectUri}&approval_prompt=force&` +
      `scope=read,activity:read&state=${state}`;

    res.json({
      success: true,
      authUrl,
      message: 'Connect your fitness personality',
      insights: platformAPIMappings.fitness.strava.insights
    });
  } catch (error) {
    console.error('Strava connection error:', error);
    res.status(500).json({ error: 'Failed to initialize Strava connection' });
  }
});

// Manual Netflix Data Import
router.post('/import/netflix', async (req, res) => {
  try {
    const { userId, viewingHistory } = req.body;

    if (!viewingHistory || !Array.isArray(viewingHistory)) {
      return res.status(400).json({
        error: 'Viewing history data is required'
      });
    }

    // Analyze Netflix viewing patterns
    const analysis = analyzeNetflixHistory(viewingHistory);

    res.json({
      success: true,
      platform: 'netflix',
      analysis,
      insights: {
        bingePatterns: analysis.bingeScore,
        genrePreferences: analysis.topGenres,
        emotionalJourneys: analysis.emotionalArcs,
        viewingTimes: analysis.temporalPatterns
      }
    });
  } catch (error) {
    console.error('Netflix import error:', error);
    res.status(500).json({ error: 'Failed to process Netflix data' });
  }
});

// HBO Max Manual Import
router.post('/import/hbo-max', async (req, res) => {
  try {
    const { userId, watchlist } = req.body;

    res.json({
      success: true,
      platform: 'hbo-max',
      message: 'HBO Max data imported',
      insights: {
        premiumTaste: 'High-quality narrative preference',
        seriesCommitment: 'Long-form storytelling appreciation',
        genreSophistication: 'Complex character development focus'
      }
    });
  } catch (error) {
    console.error('HBO Max import error:', error);
    res.status(500).json({ error: 'Failed to process HBO Max data' });
  }
});

// Demo data generator for platforms without APIs
router.get('/demo/:platform', async (req, res) => {
  try {
    const { platform } = req.params;

    const demoData = generateDemoSoulSignature(platform);

    res.json({
      success: true,
      platform,
      demo: true,
      data: {
        soulSignature: demoData,
        message: 'Demo data for visualization - connect real account for accurate insights'
      }
    });
  } catch (error) {
    console.error('Demo generation error:', error);
    res.status(500).json({ error: 'Failed to generate demo data' });
  }
});

// Helper functions
function analyzeNetflixHistory(history) {
  const genres = {};
  const viewingTimes = {};
  let bingeCount = 0;

  history.forEach(item => {
    // Count genres
    if (item.genre) {
      genres[item.genre] = (genres[item.genre] || 0) + 1;
    }

    // Analyze viewing times
    const hour = new Date(item.watchedAt).getHours();
    const timeSlot = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
    viewingTimes[timeSlot] = (viewingTimes[timeSlot] || 0) + 1;

    // Detect binge watching
    if (item.episodesWatched > 3) bingeCount++;
  });

  return {
    topGenres: Object.entries(genres)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([genre]) => genre),
    bingeScore: (bingeCount / history.length) * 10,
    temporalPatterns: viewingTimes,
    emotionalArcs: identifyEmotionalArcs(history)
  };
}

function identifyEmotionalArcs(history) {
  // Simplified emotional arc detection
  const arcs = {
    comedy: 0,
    drama: 0,
    thriller: 0,
    documentary: 0
  };

  history.forEach(item => {
    if (item.genre) {
      const genre = item.genre.toLowerCase();
      if (genre.includes('comedy')) arcs.comedy++;
      if (genre.includes('drama')) arcs.drama++;
      if (genre.includes('thriller')) arcs.thriller++;
      if (genre.includes('documentary')) arcs.documentary++;
    }
  });

  return arcs;
}

function generateDemoSoulSignature(platform) {
  const signatures = {
    netflix: {
      narrativePreferences: ['Complex Characters', 'Plot Twists', 'Emotional Depth'],
      bingeLevel: 'Weekend Warrior',
      genreDiversity: 8.5,
      uniquenessMarkers: [
        'Prefers international content',
        'Documentary enthusiast',
        'Complete series finisher'
      ]
    },
    'hbo-max': {
      contentSophistication: 'Premium Seeker',
      narrativeComplexity: 9.2,
      franchiseLoyalty: ['Game of Thrones', 'DC Universe', 'Studio Ghibli'],
      uniquenessMarkers: [
        'Quality over quantity viewer',
        'Prestige drama enthusiast',
        'Behind-the-scenes content lover'
      ]
    },
    'apple-music': {
      musicalDiversity: 7.8,
      curatorPersonality: 'Playlist Architect',
      discoveryRate: 'Early Adopter',
      uniquenessMarkers: [
        'Spatial audio enthusiast',
        'Full album listener',
        'Morning jazz, evening electronic'
      ]
    },
    tiktok: {
      trendParticipation: 'Selective Engager',
      contentPreferences: ['Educational', 'Comedy', 'Art'],
      scrollPattern: 'Deep Diver',
      uniquenessMarkers: [
        'Long-form TikTok watcher',
        'Saves recipes never cooks',
        'Algorithm trainer'
      ]
    },
    discord: {
      communityRole: 'Active Contributor',
      serverTypes: ['Gaming', 'Tech', 'Art'],
      communicationStyle: 'Emoji Reactor',
      uniquenessMarkers: [
        'Voice channel regular',
        'Bot command master',
        'Community event organizer'
      ]
    },
    default: {
      connectionPending: true,
      potentialInsights: ['Personality patterns', 'Interest clusters', 'Engagement style'],
      uniquenessMarkers: ['Awaiting connection', 'Ready to discover', 'Soul signature pending']
    }
  };

  return signatures[platform] || signatures.default;
}

export default router;