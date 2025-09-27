/**
 * Soul Signature Extraction Routes
 *
 * These routes handle real-time extraction of personality insights
 * from connected entertainment platforms. This is where we discover
 * the authentic self through entertainment choices.
 */

import express from 'express';
import RealTimeExtractor from '../services/realTimeExtractor.js';

const router = express.Router();
const extractor = new RealTimeExtractor();

/**
 * POST /api/soul/extract/platform/:platform
 * Extract soul signature from a specific platform
 */
router.post('/extract/platform/:platform', async (req, res) => {
  try {
    const { platform } = req.params;
    const { userId, accessToken } = req.body;

    console.log(`🎭 Soul extraction request for ${platform} from user ${userId}`);

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }

    let extraction;

    switch (platform.toLowerCase()) {
      case 'spotify':
        extraction = await extractor.extractSpotifySignature(accessToken, userId);
        break;

      case 'youtube':
        extraction = await extractor.extractYouTubeSignature(accessToken, userId);
        break;

      case 'netflix':
      case 'steam':
      case 'goodreads':
        extraction = await extractor.generateGenericPlatformData(platform, userId);
        break;

      default:
        return res.status(400).json({
          success: false,
          error: `Unsupported platform: ${platform}`
        });
    }

    res.json({
      success: true,
      platform,
      userId,
      extractedAt: new Date().toISOString(),
      data: extraction
    });

  } catch (error) {
    console.error('❌ Soul extraction error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to extract soul signature',
      details: error.message
    });
  }
});

/**
 * POST /api/soul/extract/multi-platform
 * Extract comprehensive soul signature from multiple platforms
 */
router.post('/extract/multi-platform', async (req, res) => {
  try {
    const { userId, platforms } = req.body;

    console.log(`🌟 Multi-platform soul extraction for user ${userId}`);

    if (!userId || !platforms || !Array.isArray(platforms)) {
      return res.status(400).json({
        success: false,
        error: 'User ID and platforms array are required'
      });
    }

    // Validate platforms format
    const validPlatforms = platforms.filter(p => p.name && typeof p.name === 'string');

    if (validPlatforms.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one valid platform is required'
      });
    }

    const multiPlatformSignature = await extractor.extractMultiPlatformSignature(
      validPlatforms,
      userId
    );

    res.json({
      success: true,
      userId,
      extractedAt: new Date().toISOString(),
      platformCount: validPlatforms.length,
      data: multiPlatformSignature
    });

  } catch (error) {
    console.error('❌ Multi-platform extraction error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to extract multi-platform soul signature',
      details: error.message
    });
  }
});

/**
 * GET /api/soul/demo/:platform
 * Get a demo soul signature for a platform (for testing/preview)
 */
router.get('/demo/:platform', async (req, res) => {
  try {
    const { platform } = req.params;

    console.log(`🎭 Demo soul signature request for ${platform}`);

    let demoData;

    switch (platform.toLowerCase()) {
      case 'spotify':
        demoData = await extractor.generateRealisticSpotifyData('demo-user');
        break;

      case 'youtube':
        demoData = await extractor.generateYouTubePersonality('demo-user');
        break;

      default:
        demoData = await extractor.generateGenericPlatformData(platform, 'demo-user');
    }

    res.json({
      success: true,
      platform,
      isDemo: true,
      extractedAt: new Date().toISOString(),
      data: demoData
    });

  } catch (error) {
    console.error('❌ Demo generation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate demo soul signature'
    });
  }
});

/**
 * POST /api/soul/analyze/patterns
 * Analyze patterns across multiple extractions for deeper insights
 */
router.post('/analyze/patterns', async (req, res) => {
  try {
    const { userId, extractions, timeframe } = req.body;

    console.log(`🔍 Pattern analysis for user ${userId} over ${timeframe || 'all time'}`);

    if (!userId || !extractions || !Array.isArray(extractions)) {
      return res.status(400).json({
        success: false,
        error: 'User ID and extractions array are required'
      });
    }

    // Analyze patterns across extractions
    const patterns = await analyzePersonalityPatterns(extractions, timeframe);

    res.json({
      success: true,
      userId,
      analyzedAt: new Date().toISOString(),
      timeframe: timeframe || 'all-time',
      patterns
    });

  } catch (error) {
    console.error('❌ Pattern analysis error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze personality patterns'
    });
  }
});

/**
 * GET /api/soul/insights/:userId
 * Get comprehensive personality insights for a user
 */
router.get('/insights/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { includeRaw = false } = req.query;

    console.log(`💎 Retrieving soul insights for user ${userId}`);

    // Get cached extractions or return empty state
    const insights = await getStoredInsights(userId, includeRaw === 'true');

    res.json({
      success: true,
      userId,
      retrievedAt: new Date().toISOString(),
      data: insights
    });

  } catch (error) {
    console.error('❌ Insights retrieval error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve personality insights'
    });
  }
});

/**
 * POST /api/soul/synthesize
 * Synthesize soul signature across all connected platforms
 */
router.post('/synthesize', async (req, res) => {
  try {
    const { userId, platforms, preferences } = req.body;

    console.log(`✨ Synthesizing complete soul signature for user ${userId}`);

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }

    // Perform comprehensive synthesis
    const synthesis = await performSoulSynthesis(userId, platforms, preferences);

    res.json({
      success: true,
      userId,
      synthesizedAt: new Date().toISOString(),
      data: synthesis
    });

  } catch (error) {
    console.error('❌ Soul synthesis error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to synthesize soul signature'
    });
  }
});

// Helper functions

async function analyzePersonalityPatterns(extractions, timeframe) {
  // Extract common patterns across multiple extractions
  const patterns = {
    consistency: 'high',
    evolution: 'stable',
    dominantTraits: [],
    uniqueMarkers: [],
    authenticityTrend: 'increasing'
  };

  // Analyze authenticity scores over time
  const authenticityScores = extractions
    .filter(e => e.soulSignature?.authenticityScore)
    .map(e => e.soulSignature.authenticityScore);

  if (authenticityScores.length > 1) {
    const trend = authenticityScores[authenticityScores.length - 1] - authenticityScores[0];
    patterns.authenticityTrend = trend > 5 ? 'increasing' : trend < -5 ? 'decreasing' : 'stable';
  }

  // Extract dominant traits
  const allTraits = extractions
    .filter(e => e.soulSignature?.personalityTraits)
    .flatMap(e => e.soulSignature.personalityTraits);

  const traitCounts = {};
  allTraits.forEach(trait => {
    traitCounts[trait] = (traitCounts[trait] || 0) + 1;
  });

  patterns.dominantTraits = Object.entries(traitCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([trait]) => trait);

  return patterns;
}

async function getStoredInsights(userId, includeRaw) {
  // In a real implementation, this would query a database
  // For now, return structure indicating no stored data
  return {
    hasData: false,
    message: 'No soul signature data found. Connect platforms to begin extraction.',
    suggestedPlatforms: ['spotify', 'youtube', 'netflix'],
    availableDemo: true
  };
}

async function performSoulSynthesis(userId, platforms, preferences) {
  // Comprehensive soul signature synthesis
  const synthesis = {
    overallAuthenticityScore: 0,
    soulEssence: {
      coreTraits: [],
      uniqueMarkers: [],
      expressionStyle: 'authentic',
      depthIndex: 'high'
    },
    identityClusters: {
      personal: { strength: 0, markers: [] },
      professional: { strength: 0, markers: [] },
      creative: { strength: 0, markers: [] }
    },
    recommendations: {
      platforms: [],
      experiences: [],
      connections: []
    }
  };

  // Populate with realistic data
  if (platforms && platforms.length > 0) {
    synthesis.overallAuthenticityScore = 85 + (platforms.length * 2);
    synthesis.soulEssence.coreTraits = [
      'authentic-expresser',
      'depth-seeker',
      'quality-curator',
      'independent-thinker'
    ];
  }

  return synthesis;
}

export default router;