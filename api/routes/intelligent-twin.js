/**
 * Intelligent Twin API Routes
 *
 * Exposes the intelligent digital twin functionality:
 * - GET /api/twin/context - Aggregated user context from all platforms
 * - GET /api/twin/recommendations - Intelligent recommendations
 * - GET /api/twin/insights - AI-generated insights
 * - GET /api/twin/status - Quick status assessment
 * - GET /api/twin/music/:purpose - Purpose-specific music recommendations
 */

import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { authenticateUser } from '../middleware/auth.js';
import intelligentTwinEngine from '../services/intelligentTwinEngine.js';
import userContextAggregator from '../services/userContextAggregator.js';
import intelligentMusicService from '../services/intelligentMusicService.js';
import spotifyInsightGenerator from '../services/spotifyInsightGenerator.js';

// Initialize Supabase for feedback persistence
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const router = express.Router();

/**
 * GET /api/twin/context
 * Get aggregated user context from all connected platforms
 */
router.get('/context', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
    }

    console.log(`🧠 [Twin API] Getting context for user ${userId}`);

    const context = await userContextAggregator.aggregateUserContext(userId);

    if (!context.success) {
      return res.status(500).json({
        success: false,
        error: context.error || 'Failed to aggregate user context'
      });
    }

    // Generate human-readable summary
    const summary = userContextAggregator.generateContextSummary(context);

    res.json({
      success: true,
      context: {
        whoop: context.whoop ? {
          // Handle both object format {score, label} and flat format
          recovery: typeof context.whoop.recovery === 'object'
            ? context.whoop.recovery
            : { score: context.whoop.recovery, label: context.whoop.recoveryLabel },
          recoveryLabel: context.whoop.recovery?.label || context.whoop.recoveryLabel,
          strain: typeof context.whoop.strain === 'object'
            ? context.whoop.strain?.score
            : context.whoop.strain,
          strainLabel: context.whoop.strain?.label || context.whoop.strainLabel,
          hrv: context.whoop.hrv?.current ?? context.whoop.hrv,
          hrvTrend: context.whoop.hrv?.trend || context.whoop.hrvTrend,
          sleepHours: context.whoop.sleep?.hours ?? context.whoop.sleepHours,
          sleepQuality: context.whoop.sleep?.quality || context.whoop.sleepQuality,
          // Include full sleep data for detailed views
          sleep: context.whoop.sleep,
          // Include recommendations if available
          recommendations: context.whoop.recommendations,
          // Token status
          needsReauth: context.whoop.needsReauth || false
        } : null,
        calendar: context.calendar?.nextEvent || null,
        upcomingEvents: context.calendar?.upcomingEvents || [],
        spotify: context.spotify ? {
          recentMood: context.spotify.recentMood,
          averageEnergy: context.spotify.averageEnergy,
          recentTracksCount: context.spotify.recentTracks?.length || 0
        } : null,
        personality: context.personality ? {
          openness: context.personality.openness,
          conscientiousness: context.personality.conscientiousness,
          extraversion: context.personality.extraversion,
          agreeableness: context.personality.agreeableness,
          neuroticism: context.personality.neuroticism
        } : null,
        patterns: context.patterns?.slice(0, 5) || []
      },
      summary,
      connectedPlatforms: {
        whoop: !!context.whoop,
        spotify: !!context.spotify,
        calendar: !!context.calendar
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Twin API] Context error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user context',
      message: error.message
    });
  }
});

/**
 * GET /api/twin/recommendations
 * Get intelligent recommendations based on current context
 */
router.get('/recommendations', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id;
    const { includeMusic = 'true' } = req.query;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
    }

    console.log(`🧠 [Twin API] Getting recommendations for user ${userId}`);

    const insights = await intelligentTwinEngine.generateInsightsAndRecommendations(userId, {
      includeMusic: includeMusic === 'true'
    });

    if (!insights.success) {
      return res.status(500).json({
        success: false,
        error: insights.error || 'Failed to generate recommendations'
      });
    }

    res.json({
      success: true,
      ...insights
    });
  } catch (error) {
    console.error('[Twin API] Recommendations error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get recommendations',
      message: error.message
    });
  }
});

/**
 * GET /api/twin/insights
 * Get AI-generated insights about patterns and behaviors
 */
router.get('/insights', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
    }

    console.log(`🧠 [Twin API] Getting insights for user ${userId}`);

    const insights = await intelligentTwinEngine.generateInsightsAndRecommendations(userId, {
      includeMusic: false
    });

    if (!insights.success) {
      return res.status(500).json({
        success: false,
        error: insights.error || 'Failed to generate insights'
      });
    }

    res.json({
      success: true,
      insights: insights.insights,
      context: insights.context,
      generatedAt: insights.generatedAt
    });
  } catch (error) {
    console.error('[Twin API] Insights error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get insights',
      message: error.message
    });
  }
});

/**
 * GET /api/twin/status
 * Get quick status assessment (lightweight endpoint)
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

    console.log(`🧠 [Twin API] Getting quick status for user ${userId}`);

    const status = await intelligentTwinEngine.getQuickStatus(userId);

    res.json(status);
  } catch (error) {
    console.error('[Twin API] Status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get status',
      message: error.message
    });
  }
});

/**
 * GET /api/twin/music/:purpose
 * Get music recommendations for a specific purpose
 * Purposes: pre-event, focus, workout, relax, sleep, general
 */
router.get('/music/:purpose', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id;
    const { purpose } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
    }

    const validPurposes = ['pre-event', 'focus', 'workout', 'relax', 'sleep', 'general'];
    if (!validPurposes.includes(purpose)) {
      return res.status(400).json({
        success: false,
        error: `Invalid purpose. Use one of: ${validPurposes.join(', ')}`
      });
    }

    console.log(`🧠 [Twin API] Getting music for purpose: ${purpose}`);

    // Get user context
    const context = await userContextAggregator.aggregateUserContext(userId);

    // Get music recommendations
    const music = await intelligentMusicService.getRecommendations(userId, context, purpose);

    if (!music.success) {
      return res.status(500).json({
        success: false,
        error: music.error || 'Failed to get music recommendations',
        needsConnection: music.needsConnection
      });
    }

    res.json({
      success: true,
      purpose,
      recommendations: music.recommendations
    });
  } catch (error) {
    console.error('[Twin API] Music error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get music recommendations',
      message: error.message
    });
  }
});

/**
 * GET /api/twin/advice/:purpose
 * Get purpose-specific advice with optional music
 * Purposes: pre-event, focus, workout, relax, sleep
 */
router.get('/advice/:purpose', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id;
    const { purpose } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
    }

    console.log(`🧠 [Twin API] Getting advice for purpose: ${purpose}`);

    const recommendation = await intelligentTwinEngine.getRecommendationFor(userId, purpose);

    res.json(recommendation);
  } catch (error) {
    console.error('[Twin API] Advice error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get advice',
      message: error.message
    });
  }
});

/**
 * GET /api/twin/patterns
 * Get learned patterns and long-term insights
 */
router.get('/patterns', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
    }

    console.log(`🧠 [Twin API] Getting patterns for user ${userId}`);

    const patterns = await intelligentTwinEngine.analyzePatterns(userId);

    res.json(patterns);
  } catch (error) {
    console.error('[Twin API] Patterns error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get patterns',
      message: error.message
    });
  }
});

/**
 * POST /api/twin/feedback
 * Submit feedback on recommendations (for learning)
 *
 * Body: {
 *   recommendationId: string (required),
 *   recommendationType: string (required) - 'music' | 'activity' | 'insight' | 'tip' | 'pattern',
 *   thumbsVote: 'up' | 'down' (optional),
 *   starRating: 1-5 (optional),
 *   comment: string (optional),
 *   contextSnapshot: object (optional) - current context when feedback given
 * }
 */
router.post('/feedback', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id;
    const {
      recommendationId,
      recommendationType = 'insight',
      thumbsVote,
      starRating,
      comment,
      contextSnapshot
    } = req.body;

    // 📥 Log incoming feedback with full details
    console.log(`\n📥 [Feedback] Received feedback submission:`);
    console.log(`   - User: ${userId || 'NOT AUTHENTICATED'}`);
    console.log(`   - Recommendation ID: ${recommendationId}`);
    console.log(`   - Type: ${recommendationType}`);
    console.log(`   - Vote: ${thumbsVote || 'none'}`);
    console.log(`   - Stars: ${starRating || 'none'}`);
    if (comment) console.log(`   - Comment: "${comment.substring(0, 50)}${comment.length > 50 ? '...' : ''}"`);

    if (!userId) {
      console.log(`❌ [Feedback] Rejected: User authentication required`);
      return res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
    }

    if (!recommendationId) {
      console.log(`❌ [Feedback] Rejected: Missing recommendationId`);
      return res.status(400).json({
        success: false,
        error: 'recommendationId is required'
      });
    }

    // Validate thumbsVote if provided
    if (thumbsVote && !['up', 'down'].includes(thumbsVote)) {
      console.log(`❌ [Feedback] Rejected: Invalid thumbsVote "${thumbsVote}"`);
      return res.status(400).json({
        success: false,
        error: 'thumbsVote must be "up" or "down"'
      });
    }

    // Validate starRating if provided
    if (starRating !== undefined && (starRating < 1 || starRating > 5)) {
      console.log(`❌ [Feedback] Rejected: Invalid starRating "${starRating}"`);
      return res.status(400).json({
        success: false,
        error: 'starRating must be between 1 and 5'
      });
    }

    // Validate recommendationType
    const validTypes = ['music', 'activity', 'insight', 'tip', 'pattern'];
    if (!validTypes.includes(recommendationType)) {
      console.log(`❌ [Feedback] Rejected: Invalid recommendationType "${recommendationType}"`);
      return res.status(400).json({
        success: false,
        error: `recommendationType must be one of: ${validTypes.join(', ')}`
      });
    }

    // 💾 Log database operation
    console.log(`💾 [Feedback] Persisting to recommendation_feedback table...`);

    // Persist feedback to database (upsert to handle duplicates)
    const { data, error } = await supabase
      .from('recommendation_feedback')
      .upsert({
        user_id: userId,
        recommendation_id: recommendationId,
        recommendation_type: recommendationType,
        thumbs_vote: thumbsVote || null,
        star_rating: starRating || null,
        comment: comment || null,
        context_snapshot: contextSnapshot || {},
        created_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,recommendation_id',
        ignoreDuplicates: false
      })
      .select();

    if (error) {
      console.error(`❌ [Feedback] Database error:`, error);
      return res.status(500).json({
        success: false,
        error: 'Failed to save feedback',
        message: error.message
      });
    }

    // ✅ Log success with details
    console.log(`✅ [Feedback] Saved successfully:`);
    console.log(`   - Record ID: ${data?.[0]?.id}`);
    console.log(`   - User: ${userId}`);
    console.log(`   - Awaiting processing by PatternLearningService`);
    console.log(`   - Will be processed in next cron run (every 6 hours)\n`);

    res.json({
      success: true,
      message: 'Feedback received! Your input helps personalize your experience.',
      feedbackId: data?.[0]?.id
    });
  } catch (error) {
    console.error(`❌ [Feedback] Unexpected error:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to submit feedback',
      message: error.message
    });
  }
});

/**
 * GET /api/intelligent-twin/today-insights
 * Get personalized daily insights based on Whoop, Calendar, and Spotify data
 * Returns 3-5 digestible, actionable insights for the day
 */
router.get('/today-insights', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
    }

    console.log(`🧠 [Twin API] Getting today's insights for user ${userId}`);

    // Get aggregated context from all platforms
    const context = await userContextAggregator.aggregateUserContext(userId);

    const insights = [];
    const sources = {
      whoop: !!context.whoop,
      calendar: !!context.calendar,
      spotify: !!context.spotify
    };

    // 1. Health/Recovery Insight (from Whoop)
    if (context.whoop && context.whoop.connected !== false) {
      const recovery = context.whoop.recovery?.score;
      const strain = context.whoop.strain?.score || 0;
      const strainLabel = context.whoop.strain?.label || '';
      const sleepHours = context.whoop.sleep?.totalHours || context.whoop.sleepHours || 0;

      let healthTitle, healthSummary, healthDetail, healthPriority, healthIcon;

      // If we have recovery data, use it
      if (recovery !== null && recovery !== undefined) {
        if (recovery >= 70) {
          healthTitle = 'Great Recovery Day';
          healthSummary = `Your recovery is at ${Math.round(recovery)}% - you're ready for high intensity`;
          healthDetail = `Based on your Whoop data, your body is well-recovered. ${sleepHours > 7 ? `You got ${sleepHours.toFixed(1)} hours of quality sleep.` : ''} This is an excellent day for challenging activities or important meetings.`;
          healthPriority = 'high';
          healthIcon = 'activity';
        } else if (recovery >= 50) {
          healthTitle = 'Moderate Recovery';
          healthSummary = `Recovery at ${Math.round(recovery)}% - balance activity with rest`;
          healthDetail = `Your body is partially recovered. Consider moderate intensity activities. ${sleepHours < 7 ? 'Getting more sleep tonight could boost tomorrow\'s recovery.' : ''}`;
          healthPriority = 'medium';
          healthIcon = 'heart';
        } else {
          healthTitle = 'Recovery Day Recommended';
          healthSummary = `Low recovery at ${Math.round(recovery)}% - prioritize rest today`;
          healthDetail = `Your body needs recovery time. Consider lighter activities, meditation, or rest. ${strain > 15 ? 'Yesterday\'s high strain may be contributing.' : ''}`;
          healthPriority = 'high';
          healthIcon = 'moon';
        }
      }
      // Otherwise, use strain data
      else if (strain > 0) {
        if (strain >= 18) {
          healthTitle = 'Very High Strain Day';
          healthSummary = `Current strain: ${strain.toFixed(1)} (${strainLabel}) - intense activity detected`;
          healthDetail = `Your body is working hard today with strain at ${Math.round((strain/21)*100)}% of max. Consider recovery activities and proper nutrition.`;
          healthPriority = 'high';
          healthIcon = 'zap';
        } else if (strain >= 14) {
          healthTitle = 'High Strain Detected';
          healthSummary = `Strain at ${strain.toFixed(1)} - you're pushing your limits`;
          healthDetail = `You've accumulated significant strain (${strainLabel}). Great for building fitness, but ensure adequate recovery tonight.`;
          healthPriority = 'medium';
          healthIcon = 'activity';
        } else if (strain >= 8) {
          healthTitle = 'Moderate Activity Level';
          healthSummary = `Strain: ${strain.toFixed(1)} - balanced effort today`;
          healthDetail = `Your strain level is moderate - a good balance between activity and recovery potential.`;
          healthPriority = 'low';
          healthIcon = 'heart';
        } else {
          healthTitle = 'Light Activity Day';
          healthSummary = `Low strain (${strain.toFixed(1)}) - recovery-focused day`;
          healthDetail = `Your body is in recovery mode with minimal strain accumulated. Good for rest days.`;
          healthPriority = 'low';
          healthIcon = 'sun';
        }
      } else {
        // No recovery or strain data
        healthTitle = 'Whoop Connected';
        healthSummary = 'Waiting for today\'s data to sync';
        healthDetail = 'Your Whoop is connected but no recent health data available yet.';
        healthPriority = 'low';
        healthIcon = 'heart';
      }

      insights.push({
        id: `health-${Date.now()}`,
        type: 'health',
        title: healthTitle,
        summary: healthSummary,
        detail: healthDetail,
        platforms: ['whoop'],
        priority: healthPriority,
        icon: healthIcon,
        action: { label: 'View Health Details', route: '/soul-signature' }
      });
    }

    // 2. Schedule Insight (from Calendar)
    if (context.calendar) {
      const events = context.calendar.upcomingEvents || [];
      const todayEvents = events.filter(e => {
        const eventDate = new Date(e.startTime);
        const today = new Date();
        return eventDate.toDateString() === today.toDateString();
      });

      if (todayEvents.length > 0) {
        const nextEvent = todayEvents[0];
        const eventTime = new Date(nextEvent.startTime);
        const now = new Date();
        const minutesUntil = Math.round((eventTime - now) / (1000 * 60));

        let scheduleTitle, scheduleSummary, scheduleDetail;

        if (minutesUntil <= 60 && minutesUntil > 0) {
          scheduleTitle = 'Upcoming Meeting Soon';
          scheduleSummary = `"${nextEvent.title}" starts in ${minutesUntil} minutes`;
          scheduleDetail = `You have ${todayEvents.length} event${todayEvents.length > 1 ? 's' : ''} today. Consider starting your preparation ritual now for optimal focus.`;
        } else if (minutesUntil > 60) {
          const hours = Math.floor(minutesUntil / 60);
          scheduleTitle = `${todayEvents.length} Event${todayEvents.length > 1 ? 's' : ''} Today`;
          scheduleSummary = `First event "${nextEvent.title}" in ${hours}+ hours`;
          scheduleDetail = `Your day includes: ${todayEvents.slice(0, 3).map(e => e.title).join(', ')}${todayEvents.length > 3 ? ` and ${todayEvents.length - 3} more` : ''}.`;
        } else {
          scheduleTitle = 'Meeting In Progress';
          scheduleSummary = `"${nextEvent.title}" is happening now`;
          scheduleDetail = `You have ${todayEvents.length - 1} more event${todayEvents.length > 2 ? 's' : ''} after this one.`;
        }

        insights.push({
          id: `schedule-${Date.now()}`,
          type: 'schedule',
          title: scheduleTitle,
          summary: scheduleSummary,
          detail: scheduleDetail,
          platforms: ['google_calendar'],
          priority: minutesUntil <= 60 && minutesUntil > 0 ? 'high' : 'medium',
          icon: 'calendar',
          action: { label: 'Start Prep Ritual', route: '/ritual/start' }
        });
      } else {
        insights.push({
          id: `schedule-free-${Date.now()}`,
          type: 'schedule',
          title: 'Open Calendar Today',
          summary: 'No meetings scheduled - great day for deep work',
          detail: 'Your calendar is clear. This is an excellent opportunity for focused work, creative projects, or personal time.',
          platforms: ['google_calendar'],
          priority: 'low',
          icon: 'sun'
        });
      }
    }

    // 3. Music/Mood Insight (from Spotify - Enhanced with spotifyInsightGenerator)
    if (context.spotify) {
      // Try to get enhanced mood data from spotifyInsightGenerator
      let moodInsight = null;
      try {
        moodInsight = await spotifyInsightGenerator.getCurrentMoodInsights(userId);
      } catch (err) {
        console.log('[Twin API] Could not get enhanced Spotify mood:', err.message);
      }

      let musicTitle, musicSummary, musicDetail, moodEmoji;
      const averageEnergy = moodInsight?.audioFeatures?.energy || context.spotify.averageEnergy || 50;
      const averageValence = moodInsight?.audioFeatures?.valence || 50;

      if (moodInsight?.mood) {
        // Use enhanced mood data
        const mood = moodInsight.mood;
        moodEmoji = mood.emoji || '';
        musicTitle = `Current Mood: ${mood.label} ${moodEmoji}`;
        musicSummary = `Based on your recent listening, you're in a ${mood.description} mood`;
        musicDetail = `Your recent tracks show ${Math.round(averageEnergy)}% energy and ${Math.round(averageValence)}% positivity. ${
          averageEnergy > 70 ? 'Great energy for tackling challenging tasks!' :
          averageEnergy > 40 ? 'Balanced state perfect for focused work.' :
          'Calm mode - good for creative thinking or winding down.'
        }`;
      } else {
        // Fallback to basic energy-based analysis
        if (averageEnergy > 70) {
          musicTitle = 'High Energy Listening';
          musicSummary = `Your recent music is energetic (${Math.round(averageEnergy)}% energy)`;
          musicDetail = 'Your Spotify history shows you\'ve been listening to upbeat tracks. This suggests you\'re in an active, motivated state. Keep the momentum going!';
        } else if (averageEnergy > 40) {
          musicTitle = 'Balanced Music Mood';
          musicSummary = 'Your listening suggests a focused, steady state';
          musicDetail = 'Your recent tracks show balanced energy levels - perfect for productive work. Consider a focus playlist to maintain this state.';
        } else {
          musicTitle = 'Relaxed Listening Mode';
          musicSummary = `Calm music detected (${Math.round(averageEnergy)}% energy) - winding down?`;
          musicDetail = 'Your recent listening leans toward calmer tracks. This might indicate you need rest, or you\'re in a reflective mood.';
        }
      }

      insights.push({
        id: `music-${Date.now()}`,
        type: 'music',
        title: musicTitle,
        summary: musicSummary,
        detail: musicDetail,
        platforms: ['spotify'],
        priority: 'medium',
        icon: 'music',
        moodData: moodInsight?.mood || null,
        audioFeatures: moodInsight?.audioFeatures || null,
        action: { label: 'Get Music Recommendations', route: '/ritual/start' }
      });
    }

    // 4. Cross-Platform Pattern Insight (if multiple sources)
    const connectedCount = Object.values(sources).filter(Boolean).length;
    if (connectedCount >= 2) {
      let patternInsight = null;

      // Recovery + Calendar correlation
      if (context.whoop && context.whoop.connected !== false && context.calendar) {
        const recovery = context.whoop.recovery?.score || 0;
        const todayEvents = (context.calendar.upcomingEvents || []).filter(e => {
          const eventDate = new Date(e.startTime);
          return eventDate.toDateString() === new Date().toDateString();
        });

        if (recovery < 50 && todayEvents.length > 3) {
          patternInsight = {
            id: `pattern-busy-tired-${Date.now()}`,
            type: 'pattern',
            title: 'Busy Day, Low Energy',
            summary: 'Heavy schedule detected with low recovery - pace yourself',
            detail: `You have ${todayEvents.length} events today but only ${Math.round(recovery)}% recovery. Consider spacing out demanding tasks and taking breaks between meetings.`,
            platforms: ['whoop', 'google_calendar'],
            priority: 'high',
            icon: 'zap'
          };
        } else if (recovery > 70 && todayEvents.length === 0) {
          patternInsight = {
            id: `pattern-rested-free-${Date.now()}`,
            type: 'pattern',
            title: 'Peak Performance Day',
            summary: 'High recovery + open calendar = perfect for challenging work',
            detail: 'Your body is well-recovered and your schedule is clear. This is an ideal day for tackling difficult projects or important creative work.',
            platforms: ['whoop', 'google_calendar'],
            priority: 'medium',
            icon: 'trending'
          };
        }
      }

      // Music + Recovery correlation
      if (!patternInsight && context.whoop && context.whoop.connected !== false && context.spotify) {
        const recovery = context.whoop.recovery?.score || 0;
        const energy = context.spotify.averageEnergy || 50;

        if (recovery < 50 && energy > 70) {
          patternInsight = {
            id: `pattern-music-mismatch-${Date.now()}`,
            type: 'pattern',
            title: 'Energy Mismatch Detected',
            summary: 'High-energy music with low recovery - consider calming down',
            detail: 'Your music is energetic but your body needs rest. Consider switching to more relaxed tracks to support recovery.',
            platforms: ['whoop', 'spotify'],
            priority: 'medium',
            icon: 'heart'
          };
        }
      }

      if (patternInsight) {
        insights.push(patternInsight);
      }
    }

    // Sort by priority
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    insights.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    res.json({
      success: true,
      insights: insights.slice(0, 5), // Max 5 insights
      dataTimestamp: new Date().toISOString(),
      sources
    });
  } catch (error) {
    console.error('[Twin API] Today insights error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get today\'s insights',
      message: error.message
    });
  }
});

export default router;
