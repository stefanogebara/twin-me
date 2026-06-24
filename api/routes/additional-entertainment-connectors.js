/**
 * Additional Entertainment Platform Connectors
 *
 * Expanding soul signature extraction to more platforms
 * "We search in the branches for what we only find in the roots"
 */

// replan-2026-06-10 Track C portfolio cut: apple-music, tiktok, reddit, strava,
// and linkedin connect endpoints removed (OAuth/live-fetch stacks retired).
// LinkedIn remains available via the GDPR export upload path.

import express from 'express';
import { VALID_DEMO_PLATFORMS } from '../config/platformConfigs.js';
import { platformAPIMappings } from '../services/platformAPIMappings.js';
import { encryptState, encryptToken } from '../services/encryption.js';
import { authenticateUser } from '../middleware/auth.js';
import { supabaseAdmin } from '../config/supabase.js';
import { generatePKCEParams } from '../services/pkce.js';
import { createLogger } from '../services/logger.js';
import { getAppUrl } from '../utils/oauthUtils.js';
import { getGoogleWorkspaceScopes } from '../config/googleWorkspaceScopes.js';
import { GITHUB_ENTERTAINMENT_SCOPES, DISCORD_ENTERTAINMENT_SCOPES } from '../config/oauthScopes.js';

const log = createLogger('AdditionalConnectors');

const router = express.Router();

// Discord Connector
router.post('/connect/discord', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

    const clientId = process.env.DISCORD_CLIENT_ID;
    if (!clientId) {
      return res.status(503).json({ error: 'Discord integration not configured' });
    }
    const redirectUri = encodeURIComponent(`${getAppUrl(req)}/oauth/callback`);
    const scope = encodeURIComponent(DISCORD_ENTERTAINMENT_SCOPES.join(' '));
    const state = encryptState({
      platform: 'discord',
      userId,
      timestamp: Date.now()
    }, 'entertainment');

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
    log.error('Discord connection error', { error });
    res.status(500).json({ error: 'Failed to initialize Discord connection' });
  }
});

// GitHub Connector (for developers)
router.post('/connect/github', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

    const clientId = process.env.GITHUB_CLIENT_ID;
    if (!clientId) {
      return res.status(503).json({ error: 'GitHub integration not configured' });
    }
    const redirectUri = encodeURIComponent(`${getAppUrl(req)}/oauth/callback`);
    const scope = encodeURIComponent(GITHUB_ENTERTAINMENT_SCOPES.join(' '));
    const state = encryptState({
      platform: 'github',
      userId,
      timestamp: Date.now()
    }, 'entertainment');

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
    log.error('GitHub connection error', { error });
    res.status(500).json({ error: 'Failed to initialize GitHub connection' });
  }
});

// Instagram Connector
router.post('/connect/instagram', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

    const clientId = process.env.INSTAGRAM_CLIENT_ID;
    if (!clientId) {
      return res.status(503).json({ error: 'Instagram integration not configured' });
    }
    const redirectUri = encodeURIComponent(`${getAppUrl(req)}/oauth/callback`);
    const scope = encodeURIComponent('user_profile,user_media');
    const state = encryptState({
      platform: 'instagram',
      userId,
      timestamp: Date.now()
    }, 'entertainment');

    const authUrl = `https://api.instagram.com/oauth/authorize?` +
      `client_id=${clientId}&redirect_uri=${redirectUri}&` +
      `scope=${scope}&response_type=code&state=${state}`;

    res.json({
      success: true,
      authUrl,
      message: 'Connect your visual storytelling',
      insights: platformAPIMappings.social?.instagram?.insights || ['Visual preferences', 'Aesthetic style', 'Social engagement patterns']
    });
  } catch (error) {
    log.error('Instagram connection error', { error });
    res.status(500).json({ error: 'Failed to initialize Instagram connection' });
  }
});

// Twitter/X Connector
router.post('/connect/twitter', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

    const clientId = process.env.TWITTER_CLIENT_ID;
    if (!clientId) {
      return res.status(503).json({ error: 'Twitter integration not configured' });
    }
    const redirectUri = encodeURIComponent(`${getAppUrl(req)}/oauth/callback`);
    const scope = encodeURIComponent('tweet.read users.read follows.read');
    const state = encryptState({
      platform: 'twitter',
      userId,
      timestamp: Date.now()
    }, 'entertainment');

    // Twitter OAuth 2.0
    const authUrl = `https://twitter.com/i/oauth2/authorize?` +
      `response_type=code&client_id=${clientId}&` +
      `redirect_uri=${redirectUri}&scope=${scope}&` +
      `state=${state}&code_challenge=challenge&code_challenge_method=plain`;

    res.json({
      success: true,
      authUrl,
      message: 'Connect your thought patterns and interests',
      insights: platformAPIMappings.social?.twitter?.insights || ['Conversation topics', 'Network analysis', 'Engagement style']
    });
  } catch (error) {
    log.error('Twitter connection error', { error });
    res.status(500).json({ error: 'Failed to initialize Twitter connection' });
  }
});

// Medium Connector
router.post('/connect/medium', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

    const clientId = process.env.MEDIUM_CLIENT_ID;
    if (!clientId) {
      return res.status(503).json({ error: 'Medium integration not configured' });
    }
    const redirectUri = encodeURIComponent(`${getAppUrl(req)}/oauth/callback`);
    const scope = encodeURIComponent('basicProfile listPublications');
    const state = encryptState({
      platform: 'medium',
      userId,
      timestamp: Date.now()
    }, 'entertainment');

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
    log.error('Medium connection error', { error });
    res.status(500).json({ error: 'Failed to initialize Medium connection' });
  }
});

// Gmail Connector (email patterns)
router.post('/connect/google_gmail', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return res.status(503).json({ error: 'Gmail integration not configured' });
    }
    const redirectUri = `${getAppUrl(req)}/oauth/callback`;
    const scope = getGoogleWorkspaceScopes().join(' ');

    // Generate PKCE parameters
    const pkce = generatePKCEParams();

    const state = encryptState({
      platform: 'google_gmail',
      userId,
      codeVerifier: pkce.codeVerifier
    }, 'entertainment');

    // Store state + code_verifier in DB (CSRF + PKCE)
    const { error: stateInsertError } = await supabaseAdmin
      .from('oauth_states')
      .insert({
        state,
        code_verifier: encryptToken(pkce.codeVerifier),
        data: { userId, platform: 'google_gmail' },
        expires_at: new Date(Date.now() + 1800000)
      });

    if (stateInsertError) {
      log.error('Failed to store Gmail OAuth state', { error: stateInsertError });
      throw new Error('Failed to initialize Gmail connection');
    }

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${clientId}&response_type=code&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `scope=${encodeURIComponent(scope)}&` +
      `access_type=offline&prompt=consent&state=${state}&` +
      `code_challenge=${pkce.codeChallenge}&` +
      `code_challenge_method=${pkce.codeChallengeMethod}`;

    log.info('Gmail OAuth initiated', { userId });

    res.json({
      success: true,
      authUrl,
      message: 'Connect your email patterns',
    });
  } catch (error) {
    log.error('Gmail connection error', { error });
    res.status(500).json({ error: 'Failed to initialize Gmail connection' });
  }
});

// Manual Netflix Data Import
router.post('/import/netflix', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { viewingHistory } = req.body;

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
    log.error('Netflix import error', { error });
    res.status(500).json({ error: 'Failed to process Netflix data' });
  }
});

// HBO Max Manual Import
router.post('/import/hbo-max', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { watchlist } = req.body;

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
    log.error('HBO Max import error', { error });
    res.status(500).json({ error: 'Failed to process HBO Max data' });
  }
});

// Demo data generator for platforms without APIs
router.get('/demo/:platform', authenticateUser, async (req, res) => {
  try {
    const { platform } = req.params;
    if (!VALID_DEMO_PLATFORMS.includes(platform)) {
      return res.status(400).json({ success: false, error: 'Invalid platform' });
    }

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
    log.error('Demo generation error', { error });
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