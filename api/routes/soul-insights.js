/**
 * Soul Insights API Routes
 * Generates user-friendly insights from complex data
 * Runs graph processing invisibly in the background
 */

import express from 'express';
import { serverDb } from '../services/database.js';
import graphProcessor from '../services/graphProcessor.js';
import insightCache from '../services/insightCache.js';
import spotifyInsightGenerator from '../services/spotifyInsightGenerator.js';

const router = express.Router();

/**
 * GET /api/soul-insights/:userId
 * Generate and return user-friendly insights
 */
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    console.log(`[SoulInsights] Generating insights for user ${userId}`);

    // Check cache first
    const cachedInsights = insightCache.get(userId, 'soul-insights');
    if (cachedInsights) {
      console.log(`[SoulInsights] Returning cached insights for user ${userId}`);
      return res.json(cachedInsights);
    }

    // Get graph metrics (runs invisibly)
    const metrics = graphProcessor.getUserMetrics(userId);

    // Generate insights based on graph metrics
    const insights = [];

    if (metrics) {
      // Convert clustering coefficient to social insight
      if (metrics.clusteringCoefficient > 0.7) {
        insights.push({
          title: 'Deeply Connected',
          icon: '🌐',
          description: 'Your interests are highly interconnected, showing deep focus',
          source: 'cross-platform',
          confidence: Math.round(metrics.clusteringCoefficient * 100),
          actions: ['Leverage your deep expertise', 'Share your focused knowledge']
        });
      } else if (metrics.clusteringCoefficient < 0.3) {
        insights.push({
          title: 'Renaissance Mind',
          icon: '🎨',
          description: 'You explore diverse, unconnected interests',
          source: 'cross-platform',
          confidence: Math.round((1 - metrics.clusteringCoefficient) * 100),
          actions: ['Bridge different domains', 'Create unique combinations']
        });
      }

      // Convert diversity score to personality insight
      if (metrics.diversityScore > 0.7) {
        insights.push({
          title: 'Eclectic Explorer',
          icon: '🌈',
          description: 'Your interests span an impressive range of areas',
          source: 'cross-platform',
          confidence: Math.round(metrics.diversityScore * 100),
          actions: ['Synthesize diverse knowledge', 'Connect different communities']
        });
      }

      // Convert betweenness centrality to connector insight
      if (metrics.betweennessCentrality > 0.6) {
        insights.push({
          title: 'Natural Bridge',
          icon: '🌉',
          description: 'You naturally connect different areas of interest',
          source: 'cross-platform',
          confidence: Math.round(metrics.betweennessCentrality * 100),
          actions: ['Facilitate cross-domain collaboration', 'Host interdisciplinary events']
        });
      }

      // Platform balance insight
      if (metrics.platformBalance > 0.8) {
        insights.push({
          title: 'Balanced Digital Life',
          icon: '⚖️',
          description: 'You maintain healthy balance across platforms',
          source: 'cross-platform',
          confidence: Math.round(metrics.platformBalance * 100),
          actions: ['Share your balance strategies', 'Help others diversify']
        });
      }

      // Concept density insight (abstract thinker vs concrete)
      if (metrics.conceptDensity > 0.5) {
        insights.push({
          title: 'Abstract Thinker',
          icon: '💭',
          description: 'You gravitate toward concepts and ideas over specific items',
          source: 'cross-platform',
          confidence: Math.round(metrics.conceptDensity * 100),
          actions: ['Write about big ideas', 'Lead strategic discussions']
        });
      }
    }

    // Add default insights if no metrics available
    if (insights.length === 0) {
      insights.push({
        title: 'Getting Started',
        icon: '🌱',
        description: 'Connect more platforms to discover your soul signature',
        source: 'system',
        confidence: 100,
        actions: ['Connect Spotify for music insights', 'Add YouTube for learning patterns']
      });
    }

    // Sort insights by confidence
    insights.sort((a, b) => b.confidence - a.confidence);

    // Generate recommendations
    const recommendations = [
      {
        type: 'productivity',
        title: 'Optimize Your Night Schedule',
        description: 'Your best creative work happens after midnight. Consider adjusting your schedule.',
        action: 'See night productivity tips'
      },
      {
        type: 'social',
        title: 'Leverage Your Connector Skills',
        description: 'You naturally bring people together. Consider organizing community events.',
        action: 'Find networking opportunities'
      }
    ];

    // Prepare response
    const response = {
      success: true,
      userId,
      insights,
      summary: {
        totalInsights: insights.length,
        platforms: ['spotify', 'github', 'youtube', 'discord'],
        authenticityScore: 85,
        topInsight: insights[0] || null
      },
      recommendations
    };

    // Cache the response (5 minutes TTL)
    insightCache.set(userId, response, 'soul-insights', 5 * 60 * 1000);
    console.log(`[SoulInsights] Cached insights for user ${userId}`);

    // Return user-friendly response
    res.json(response);

  } catch (error) {
    console.error('[SoulInsights] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate insights'
    });
  }
});

/**
 * GET /api/soul-insights/:userId/compatibility/:targetUserId
 * Calculate compatibility between two users
 */
router.get('/:userId/compatibility/:targetUserId', async (req, res) => {
  try {
    const { userId, targetUserId } = req.params;

    // Mock compatibility calculation
    const compatibility = {
      score: 78,
      commonalities: ['Night Owl', 'Tech Enthusiast'],
      complementary: ['Different peak times - great for collaboration']
    };

    res.json({
      success: true,
      compatibility: {
        score: compatibility.score,
        description: 'Highly Compatible - Strong resonance',
        commonalities: compatibility.commonalities,
        complementary: compatibility.complementary,
        suggestions: [
          'You both share Night Owl - explore this together',
          'Your patterns suggest natural collaboration potential'
        ]
      }
    });

  } catch (error) {
    console.error('[SoulInsights] Compatibility error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate compatibility'
    });
  }
});

/**
 * POST /api/soul-insights/:userId/share
 * Control what insights to share
 */
router.post('/:userId/share', async (req, res) => {
  try {
    const { userId } = req.params;
    const { insightId, share } = req.body;

    // In production, this would update database
    console.log(`[SoulInsights] Updated sharing for insight ${insightId}: ${share}`);

    res.json({
      success: true,
      message: share ? 'Insight shared' : 'Insight made private'
    });

  } catch (error) {
    console.error('[SoulInsights] Share error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update sharing preferences'
    });
  }
});

/**
 * GET /api/soul-insights/:userId/spotify-personality
 * Get Spotify-derived personality insights (Big Five, archetype, etc.)
 */
router.get('/:userId/spotify-personality', async (req, res) => {
  try {
    const { userId } = req.params;
    console.log(`[SoulInsights] Getting Spotify personality for user ${userId}`);

    // Check cache first
    const cacheKey = `spotify-personality-${userId}`;
    const cachedData = insightCache.get(userId, cacheKey);
    if (cachedData) {
      console.log(`[SoulInsights] Returning cached Spotify personality for user ${userId}`);
      return res.json(cachedData);
    }

    // Get personality insights from Spotify data
    const personalityInsights = await spotifyInsightGenerator.getPersonalityInsights(userId);

    // Prepare response
    const response = {
      success: personalityInsights.success,
      userId,
      spotify: personalityInsights,
      generatedAt: new Date().toISOString()
    };

    // Cache for 10 minutes
    if (personalityInsights.success) {
      insightCache.set(userId, response, cacheKey, 10 * 60 * 1000);
    }

    res.json(response);

  } catch (error) {
    console.error('[SoulInsights] Spotify personality error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get Spotify personality insights'
    });
  }
});

/**
 * GET /api/soul-insights/:userId/spotify-mood
 * Get current mood based on recent Spotify listening
 */
router.get('/:userId/spotify-mood', async (req, res) => {
  try {
    const { userId } = req.params;
    console.log(`[SoulInsights] Getting Spotify mood for user ${userId}`);

    // Get current mood from Spotify data
    const moodInsights = await spotifyInsightGenerator.getCurrentMoodInsights(userId);

    if (!moodInsights) {
      return res.json({
        success: false,
        message: 'No recent Spotify data available'
      });
    }

    res.json({
      success: true,
      userId,
      mood: moodInsights.mood,
      audioFeatures: moodInsights.audioFeatures,
      timestamp: moodInsights.timestamp
    });

  } catch (error) {
    console.error('[SoulInsights] Spotify mood error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get Spotify mood'
    });
  }
});

/**
 * GET /api/soul-insights/:userId/personality-integrated
 * Get insights that combine Big Five personality assessment with behavioral platform data
 * This is the core endpoint for personality-driven learning
 */
router.get('/:userId/personality-integrated', async (req, res) => {
  try {
    const { userId } = req.params;
    console.log(`[SoulInsights] Getting personality-integrated insights for user ${userId}`);

    const insightGenerator = require('../services/insightGenerator.js');
    const { supabaseAdmin } = await import('../config/supabase.js');

    // 1. Get Big Five scores from assessment
    const { data: bigFiveScores, error: bigFiveError } = await supabaseAdmin
      .from('big_five_scores')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (bigFiveError && bigFiveError.code !== 'PGRST116') {
      console.error('[SoulInsights] Error fetching Big Five scores:', bigFiveError);
    }

    // 2. Get behavioral personality estimates
    const { data: behavioralScores, error: behavioralError } = await supabaseAdmin
      .from('personality_estimates')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (behavioralError && behavioralError.code !== 'PGRST116') {
      console.error('[SoulInsights] Error fetching behavioral scores:', behavioralError);
    }

    // 3. Get platform data for context
    const platformData = {};

    // Get Spotify data if connected
    const { data: spotifyConn } = await supabaseAdmin
      .from('platform_connections')
      .select('extracted_data')
      .eq('user_id', userId)
      .eq('platform', 'spotify')
      .single();

    if (spotifyConn?.extracted_data) {
      platformData.spotify = spotifyConn.extracted_data;
    }

    // Get Calendar data if connected
    const { data: calendarConn } = await supabaseAdmin
      .from('platform_connections')
      .select('extracted_data')
      .eq('user_id', userId)
      .eq('platform', 'google_calendar')
      .single();

    if (calendarConn?.extracted_data) {
      platformData.calendar = calendarConn.extracted_data;
    }

    // Get Whoop data if connected
    const { data: whoopConn } = await supabaseAdmin
      .from('platform_connections')
      .select('extracted_data')
      .eq('user_id', userId)
      .eq('platform', 'whoop')
      .single();

    if (whoopConn?.extracted_data) {
      platformData.whoop = whoopConn.extracted_data;
    }

    // 4. Generate integrated insights
    const insights = await insightGenerator.generatePersonalityIntegratedInsights(
      bigFiveScores,
      behavioralScores,
      platformData
    );

    // 5. Build response
    const response = {
      success: true,
      userId,
      personality: {
        questionnaire: bigFiveScores ? {
          source: 'ipip_neo_120',
          openness: bigFiveScores.openness_percentile,
          conscientiousness: bigFiveScores.conscientiousness_percentile,
          extraversion: bigFiveScores.extraversion_percentile,
          agreeableness: bigFiveScores.agreeableness_percentile,
          neuroticism: bigFiveScores.neuroticism_percentile,
          completedAt: bigFiveScores.updated_at
        } : null,
        behavioral: behavioralScores ? {
          source: 'platform_learning',
          openness: behavioralScores.openness,
          conscientiousness: behavioralScores.conscientiousness,
          extraversion: behavioralScores.extraversion,
          agreeableness: behavioralScores.agreeableness,
          neuroticism: behavioralScores.neuroticism,
          totalSignals: behavioralScores.total_behavioral_signals || 0,
          lastUpdated: behavioralScores.last_behavioral_update_at
        } : null
      },
      connectedPlatforms: Object.keys(platformData),
      insights,
      summary: {
        hasAssessment: !!bigFiveScores,
        hasBehavioralData: behavioralScores?.total_behavioral_signals > 0,
        platformCount: Object.keys(platformData).length,
        totalInsights: insights.length,
        topInsight: insights[0] || null
      },
      recommendations: generatePersonalityRecommendations(bigFiveScores, platformData)
    };

    res.json(response);

  } catch (error) {
    console.error('[SoulInsights] Personality integrated error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate personality-integrated insights'
    });
  }
});

/**
 * Generate recommendations based on personality and connected platforms
 */
function generatePersonalityRecommendations(bigFiveScores, platformData) {
  const recommendations = [];

  // No assessment
  if (!bigFiveScores) {
    recommendations.push({
      type: 'assessment',
      priority: 'high',
      title: 'Complete Your Personality Profile',
      description: 'Take the Big Five assessment to unlock personalized insights',
      action: '/big-five'
    });
  }

  // No Spotify
  if (!platformData.spotify) {
    recommendations.push({
      type: 'connection',
      priority: 'medium',
      title: 'Connect Spotify',
      description: 'Music preferences reveal emotional patterns and openness',
      action: '/get-started'
    });
  }

  // No Calendar
  if (!platformData.calendar) {
    recommendations.push({
      type: 'connection',
      priority: 'medium',
      title: 'Connect Google Calendar',
      description: 'Schedule patterns show conscientiousness and social tendencies',
      action: '/get-started'
    });
  }

  // No Whoop
  if (!platformData.whoop) {
    recommendations.push({
      type: 'connection',
      priority: 'low',
      title: 'Connect Whoop',
      description: 'Recovery data correlates with stress resilience',
      action: '/get-started'
    });
  }

  // Personality-specific recommendations
  if (bigFiveScores) {
    if (bigFiveScores.neuroticism_percentile > 70) {
      recommendations.push({
        type: 'wellness',
        priority: 'medium',
        title: 'Stress Management Resources',
        description: 'Your profile suggests you might benefit from stress resilience techniques',
        action: '/resources/stress-management'
      });
    }

    if (bigFiveScores.openness_percentile > 80 && !platformData.spotify) {
      recommendations.push({
        type: 'connection',
        priority: 'high',
        title: 'Connect Spotify to See Your Creative Side',
        description: 'High openness usually correlates with diverse music taste - let\'s verify!',
        action: '/get-started'
      });
    }
  }

  return recommendations;
}

export default router;