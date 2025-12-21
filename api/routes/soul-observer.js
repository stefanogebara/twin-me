/**
 * Soul Observer Mode API Routes
 * Endpoints for comprehensive browser activity tracking and AI-powered behavioral analysis
 * Research-backed: Keystroke dynamics (72% F1), Mouse patterns (Big Five correlation)
 */

import express from 'express';
import { supabaseAdmin } from '../services/database.js';
import patternDetectionEngine from '../services/patternDetectionEngine.js';
import behavioralEmbeddingService from '../services/behavioralEmbeddingService.js';
import Anthropic from '@anthropic-ai/sdk';

// Initialize Anthropic client for LLM interpretation
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const router = express.Router();

// Use shared Supabase admin client with proper configuration
const supabase = supabaseAdmin;

/**
 * Validate UUID format
 * Prevents database errors when invalid IDs (like Chrome extension IDs) are passed
 */
function isValidUUID(str) {
  if (!str || typeof str !== 'string') return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

// Debug logging to verify supabaseAdmin is properly loaded
console.log('[Soul Observer] supabaseAdmin client status:', {
  exists: !!supabase,
  type: typeof supabase,
  hasFrom: supabase && typeof supabase.from === 'function'
});

/**
 * POST /api/soul-observer/activity
 * Receive batched activity events from browser extension (every 30 seconds)
 */
router.post('/activity', async (req, res) => {
  try {
    const { activities, insights, timestamp, source } = req.body;
    const userId = req.body.userId || req.user?.id;

    if (!userId) {
      console.log('[Soul Observer] ❌ No userId found in request');
      console.log('[Soul Observer] Body userId:', req.body.userId);
      console.log('[Soul Observer] req.user:', req.user);
      console.log('[Soul Observer] Authorization header:', req.headers.authorization ? 'Present' : 'Missing');
      return res.status(401).json({
        success: false,
        error: 'User authentication required',
        details: 'Please provide userId in request body or valid authentication token'
      });
    }

    if (!activities || !Array.isArray(activities) || activities.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Activities array is required and must not be empty'
      });
    }

    console.log(`[Soul Observer] Received ${activities.length} activities from user: ${userId}`);

    // Extract session ID from first activity (all activities in a batch share session_id)
    const sessionId = activities[0]?.sessionId;
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Session ID is required in activities'
      });
    }

    // Parse and normalize activities
    const parsedActivities = activities.map(activity => ({
      user_id: userId,
      session_id: sessionId,
      event_type: activity.type,
      event_data: activity.data,
      url: activity.url,
      domain: extractDomain(activity.url),
      page_title: activity.pageTitle,
      timestamp: activity.timestamp || new Date().toISOString(),
      duration_ms: activity.duration,
      user_agent: activity.userAgent,
      viewport_size: activity.viewportSize
    }));

    // Insert events into database (batch insert)
    const { data: insertedEvents, error: insertError } = await supabase
      .from('soul_observer_events')
      .insert(parsedActivities)
      .select();

    if (insertError) {
      console.error('[Soul Observer] Error inserting events:', insertError);
      return res.status(500).json({
        success: false,
        error: 'Failed to store activity events',
        details: insertError.message
      });
    }

    console.log(`[Soul Observer] Successfully stored ${insertedEvents.length} events`);

    // Store AI-generated insights if provided
    if (insights && Array.isArray(insights) && insights.length > 0) {
      const parsedInsights = insights.map(insight => ({
        user_id: userId,
        session_id: sessionId,
        insight_category: insight.category,
        insight_text: insight.insight,
        insight_data: insight.data || {},
        confidence: insight.confidence || 0.7,
        evidence_count: insight.evidenceCount || activities.length
      }));

      const { data: insertedInsights, error: insightError } = await supabase
        .from('soul_observer_insights')
        .insert(parsedInsights)
        .select();

      if (insightError) {
        console.warn('[Soul Observer] Error inserting insights:', insightError);
      } else {
        console.log(`[Soul Observer] Stored ${insertedInsights.length} insights`);
      }
    }

    // Check if session exists, create or update
    const { data: existingSession } = await supabase
      .from('soul_observer_sessions')
      .select('id, total_events')
      .eq('session_id', sessionId)
      .single();

    if (existingSession) {
      // Update session with new event count
      await supabase
        .from('soul_observer_sessions')
        .update({
          total_events: existingSession.total_events + activities.length,
          updated_at: new Date().toISOString()
        })
        .eq('session_id', sessionId);
    } else {
      // Create new session
      await supabase
        .from('soul_observer_sessions')
        .insert({
          user_id: userId,
          session_id: sessionId,
          started_at: activities[0].timestamp || new Date().toISOString(),
          total_events: activities.length,
          processed: false,
          ai_analyzed: false
        });
    }

    res.json({
      success: true,
      message: `Stored ${insertedEvents.length} activity events`,
      sessionId,
      eventCount: insertedEvents.length,
      insightCount: insights?.length || 0
    });

  } catch (error) {
    console.error('[Soul Observer] Error in /activity:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process activity data',
      message: error.message
    });
  }
});

/**
 * POST /api/soul-observer/session
 * Receive complete session data when user closes browser or session ends
 */
router.post('/session', async (req, res) => {
  try {
    const { sessionData, endTime } = req.body;
    const userId = req.body.userId || req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
    }

    if (!sessionData || !sessionData.sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Session data with sessionId is required'
      });
    }

    console.log(`[Soul Observer] Received session end for user: ${userId}, session: ${sessionData.sessionId}`);

    const sessionId = sessionData.sessionId;

    // Calculate session metrics from aggregated patterns
    const sessionMetrics = {
      typing_speed_wpm: calculateTypingSpeed(sessionData.patterns?.typing),
      typing_correction_rate: calculateCorrectionRate(sessionData.patterns?.typing),
      mouse_movement_pattern: classifyMousePattern(sessionData.patterns?.mouse),
      mouse_avg_speed: sessionData.patterns?.mouse?.avgSpeed || null,
      scroll_pattern: classifyScrollPattern(sessionData.patterns?.scroll),
      scroll_avg_speed: sessionData.patterns?.scroll?.avgSpeed || null,
      focus_avg_duration: sessionData.patterns?.focus?.avgDuration || null,
      multitasking_score: calculateMultitaskingScore(sessionData.patterns)
    };

    // Update session with final data
    const { data: updatedSession, error: updateError } = await supabase
      .from('soul_observer_sessions')
      .update({
        ended_at: endTime || new Date().toISOString(),
        duration_seconds: Math.floor((new Date(endTime) - new Date(sessionData.startTime)) / 1000),
        event_counts: sessionData.activities?.eventCounts || {},
        domains_visited: sessionData.activities?.domains || [],
        pages_visited: sessionData.activities?.pages || 0,
        ...sessionMetrics,
        ai_insights: sessionData.insights || [],
        processed: true,
        ai_analyzed: false  // Will be analyzed by background job
      })
      .eq('session_id', sessionId)
      .select()
      .single();

    if (updateError) {
      console.error('[Soul Observer] Error updating session:', updateError);
      return res.status(500).json({
        success: false,
        error: 'Failed to update session',
        details: updateError.message
      });
    }

    console.log(`[Soul Observer] Session ${sessionId} marked as complete`);

    // Trigger AI analysis asynchronously (don't wait for response)
    triggerAIAnalysis(userId, sessionId).catch(err => {
      console.error('[Soul Observer] Background AI analysis failed:', err);
    });

    res.json({
      success: true,
      message: 'Session data processed successfully',
      sessionId,
      duration: updatedSession.duration_seconds,
      eventsProcessed: updatedSession.total_events
    });

  } catch (error) {
    console.error('[Soul Observer] Error in /session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process session data',
      message: error.message
    });
  }
});

/**
 * GET /api/soul-observer/insights/:userId
 * Get behavioral insights for a user
 */
router.get('/insights/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Validate UUID format to prevent database errors
    if (!isValidUUID(userId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID format',
        details: 'User ID must be a valid UUID'
      });
    }

    const limit = parseInt(req.query.limit) || 20;
    const category = req.query.category;

    let query = supabase
      .from('soul_observer_insights')
      .select('*')
      .eq('user_id', userId)
      .order('generated_at', { ascending: false })
      .limit(limit);

    if (category) {
      query = query.eq('insight_category', category);
    }

    const { data: insights, error } = await query;

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      insights,
      count: insights.length
    });

  } catch (error) {
    console.error('[Soul Observer] Error in /insights/:userId:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/soul-observer/patterns/:userId
 * Get detected behavioral patterns for a user
 */
router.get('/patterns/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Validate UUID format to prevent database errors
    if (!isValidUUID(userId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID format',
        details: 'User ID must be a valid UUID'
      });
    }

    const patternType = req.query.type;

    let query = supabase
      .from('behavioral_patterns')
      .select('*')
      .eq('user_id', userId)
      .order('confidence_score', { ascending: false });

    if (patternType) {
      query = query.eq('pattern_type', patternType);
    }

    const { data: patterns, error } = await query;

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      patterns,
      count: patterns.length
    });

  } catch (error) {
    console.error('[Soul Observer] Error in /patterns/:userId:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/soul-observer/behavioral-summary/:userId
 * Get comprehensive behavioral summary using database function
 */
router.get('/behavioral-summary/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Validate UUID format to prevent database errors
    if (!isValidUUID(userId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID format',
        details: 'User ID must be a valid UUID'
      });
    }

    const daysBack = parseInt(req.query.days) || 7;

    const { data, error } = await supabase
      .rpc('get_behavioral_summary', {
        target_user_id: userId,
        days_back: daysBack
      });

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      summary: data,
      timeRange: {
        days: daysBack,
        from: new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString(),
        to: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('[Soul Observer] Error in /behavioral-summary/:userId:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/soul-observer/sessions/:userId
 * Get browsing sessions for a user
 */
router.get('/sessions/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Validate UUID format to prevent database errors
    if (!isValidUUID(userId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID format',
        details: 'User ID must be a valid UUID'
      });
    }

    const limit = parseInt(req.query.limit) || 10;
    const analyzed = req.query.analyzed === 'true';

    let query = supabase
      .from('soul_observer_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .limit(limit);

    if (analyzed) {
      query = query.eq('ai_analyzed', true);
    }

    const { data: sessions, error } = await query;

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      sessions,
      count: sessions.length
    });

  } catch (error) {
    console.error('[Soul Observer] Error in /sessions/:userId:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extract domain from URL
 */
function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (e) {
    return url;
  }
}

/**
 * Calculate typing speed from typing pattern data
 */
function calculateTypingSpeed(typingData) {
  if (!typingData || !typingData.totalChars || !typingData.totalTime) {
    return null;
  }
  // WPM = (chars / 5) / (time in minutes)
  const minutes = typingData.totalTime / 60000; // Convert ms to minutes
  const wpm = (typingData.totalChars / 5) / minutes;
  return Math.round(wpm);
}

/**
 * Calculate correction rate from typing pattern data
 */
function calculateCorrectionRate(typingData) {
  if (!typingData || !typingData.totalChars) {
    return null;
  }
  const correctionRate = (typingData.corrections || 0) / typingData.totalChars;
  return Math.round(correctionRate * 1000) / 1000; // Round to 3 decimals
}

/**
 * Classify mouse movement pattern
 */
function classifyMousePattern(mouseData) {
  if (!mouseData) return 'unknown';

  const avgSpeed = mouseData.avgSpeed || 0;
  const variance = mouseData.variance || 0;

  if (variance < 50 && avgSpeed > 200) return 'smooth';
  if (variance > 150) return 'erratic';
  if (avgSpeed < 100) return 'purposeful';
  return 'exploratory';
}

/**
 * Classify scroll pattern
 */
function classifyScrollPattern(scrollData) {
  if (!scrollData) return 'unknown';

  const avgSpeed = scrollData.avgSpeed || 0;
  const backscrollRate = scrollData.backscrollRate || 0;

  if (avgSpeed < 100 && backscrollRate > 0.2) return 'reading';
  if (avgSpeed > 300 && backscrollRate < 0.1) return 'skimming';
  return 'hunting';
}

/**
 * Calculate multitasking score
 */
function calculateMultitaskingScore(patterns) {
  if (!patterns || !patterns.tabSwitches) return null;

  const tabSwitches = patterns.tabSwitches.count || 0;
  const sessionDuration = patterns.sessionDuration || 1;

  // Switches per minute, normalized to 0-1 scale (10+ switches/min = 1.0)
  const switchesPerMin = (tabSwitches / (sessionDuration / 60000));
  return Math.min(switchesPerMin / 10, 1.0);
}

/**
 * Trigger AI analysis for a session (background job)
 */
async function triggerAIAnalysis(userId, sessionId) {
  try {
    console.log(`[Soul Observer] Starting pattern detection for session ${sessionId}`);

    // Step 1: Detect behavioral patterns using research-backed algorithms
    const { patterns, personalityInsights, eventCount } = await patternDetectionEngine.analyzeSession(sessionId);

    console.log(`[Soul Observer] Detected ${patterns.length} behavioral patterns from ${eventCount} events`);

    // Step 2: Store detected patterns in database
    if (patterns.length > 0) {
      await patternDetectionEngine.storePatterns(userId, sessionId, patterns);
    }

    // Step 3: Update session with personality insights
    if (personalityInsights) {
      await supabase
        .from('soul_observer_sessions')
        .update({
          personality_indicators: personalityInsights.bigFive,
          ai_analyzed: true
        })
        .eq('session_id', sessionId);

      console.log('[Soul Observer] Personality insights:', JSON.stringify(personalityInsights.bigFive, null, 2));
    }

    // Step 4: Generate insights for each pattern
    const insights = patterns.map(pattern => ({
      user_id: userId,
      session_id: sessionId,
      insight_category: pattern.type,
      insight_text: pattern.description,
      insight_data: { metrics: pattern.metrics, personalityCorrelations: pattern.personalityCorrelations },
      confidence: pattern.confidence,
      evidence_count: eventCount
    }));

    if (insights.length > 0) {
      await supabase
        .from('soul_observer_insights')
        .insert(insights);

      console.log(`[Soul Observer] Stored ${insights.length} insights`);
    }

    // Step 5: Generate behavioral embedding for semantic similarity search
    try {
      const embeddingResult = await behavioralEmbeddingService.embedSession(userId, sessionId);
      console.log(`[Soul Observer] Generated embedding: ${embeddingResult.dimensions}D vector`);
    } catch (embeddingError) {
      console.error('[Soul Observer] Embedding generation failed:', embeddingError);
      // Continue even if embedding fails
    }

    console.log(`[Soul Observer] AI analysis complete for session ${sessionId}`);

  } catch (error) {
    console.error('[Soul Observer] AI analysis error:', error);
    // Don't throw - background job should not fail the main request
  }
}

/**
 * POST /api/soul-observer/netflix
 * Receive Netflix viewing data from browser extension
 */
router.post('/netflix', async (req, res) => {
  try {
    const { userId, data } = req.body;

    if (!userId || !data) {
      return res.status(400).json({
        success: false,
        error: 'Missing userId or data',
      });
    }

    console.log(`[Soul Observer] Received Netflix data for user ${userId}:`, data.length, 'items');

    // Store in database
    const records = data.map(item => ({
      user_id: userId,
      platform: 'netflix',
      data_type: 'viewing_activity',
      source_url: 'https://www.netflix.com',
      raw_data: item,
      extracted_at: item.collectedAt || new Date().toISOString(),
      processed: false,
    }));

    const { error: dbError } = await supabase
      .from('user_platform_data')
      .upsert(records, {
        onConflict: 'user_id,platform,data_type,source_url',
      });

    if (dbError) {
      console.error('[Soul Observer] Database error:', dbError);
      throw dbError;
    }

    res.json({
      success: true,
      itemsReceived: data.length,
      message: 'Netflix data stored successfully',
    });
  } catch (error) {
    console.error('[Soul Observer] Error storing Netflix data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to store Netflix data',
    });
  }
});

/**
 * POST /api/soul-observer/interpret
 * Interpret browsing activity using Claude LLM
 */
router.post('/interpret', async (req, res) => {
  try {
    const { userId, activities, requestInterpretation } = req.body;

    if (!userId || !activities || activities.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing userId or activities',
      });
    }

    console.log(`[Soul Observer] Interpreting ${activities.length} activities for user ${userId}`);

    // Store activities in database
    const records = activities.map(activity => ({
      user_id: userId,
      platform: 'browser_extension',
      data_type: activity.type || 'browsing_activity',
      source_url: activity.url,
      raw_data: activity,
      extracted_at: activity.timestamp,
      processed: false,
    }));

    const { error: dbError } = await supabase
      .from('user_platform_data')
      .insert(records);

    if (dbError && dbError.code !== '23505') { // Ignore duplicate key errors
      console.error('[Soul Observer] Database error:', dbError);
    }

    let interpretation = null;
    let insights = null;

    // Request LLM interpretation if enabled
    if (requestInterpretation && activities.length >= 5) {
      interpretation = await interpretActivitiesWithClaude(activities);
      insights = extractInsights(interpretation);

      // Store interpretation in database
      if (interpretation) {
        const sessionId = `interpret_${Date.now()}`;
        await supabase
          .from('soul_observer_insights')
          .insert({
            user_id: userId,
            session_id: sessionId,
            insight_category: 'llm_interpretation',
            insight_text: interpretation,
            insight_data: { insights, activityCount: activities.length },
            confidence: 0.8,
            evidence_count: activities.length,
          });
      }
    }

    res.json({
      success: true,
      activityCount: activities.length,
      stored: true,
      interpretation,
      insights,
    });
  } catch (error) {
    console.error('[Soul Observer] Error interpreting activities:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to interpret activities',
    });
  }
});

/**
 * Interpret browsing activities using Claude
 */
async function interpretActivitiesWithClaude(activities) {
  try {
    // Prepare activity summary for Claude
    const activitySummary = activities.map(a => ({
      type: a.type,
      category: a.category,
      title: a.title,
      url: a.url,
      timeSpent: a.timeSpent,
      scrollDepth: a.scrollDepth,
      interactions: a.interactions,
      engaged: a.engaged,
    }));

    const prompt = `You are analyzing browsing activity to understand authentic user interests and personality traits for their "Soul Signature" - a digital twin that captures what makes them uniquely themselves.

BROWSING ACTIVITY DATA (${activities.length} activities):
${JSON.stringify(activitySummary, null, 2)}

Please analyze this browsing activity and provide:

1. **Primary Interests**: What are the user's main areas of interest based on this activity?

2. **Engagement Patterns**: How does the user engage with content? (deep reading, quick scanning, video consumption, etc.)

3. **Personality Indicators**: What personality traits does this activity suggest? (curious, focused, social, analytical, creative, etc.)

4. **Hidden Passions**: Any unexpected or unique interests that stand out?

5. **Authentic Self**: What does this reveal about the user's authentic curiosity and genuine interests (not just mainstream content)?

6. **Soul Signature Contribution**: How does this browsing session contribute to understanding their unique "soul signature"?

Provide a thoughtful, insightful analysis that goes beyond surface-level observations. Focus on what makes this person uniquely themselves.`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1500,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const interpretationText = message.content[0].text;
    console.log('[Soul Observer] Claude interpretation generated');

    return interpretationText;
  } catch (error) {
    console.error('[Soul Observer] Error calling Claude API:', error);
    return null;
  }
}

/**
 * Extract structured insights from interpretation
 */
function extractInsights(interpretation) {
  if (!interpretation) return null;

  // Simple extraction - could be enhanced with more structured parsing
  const insights = {
    interests: [],
    engagementStyle: null,
    personalityTraits: [],
    uniqueQualities: [],
  };

  // Extract interests (lines after "Primary Interests:")
  const interestsMatch = interpretation.match(/Primary Interests[:\s]+([\s\S]*?)(?=\n\n|\d\.)/i);
  if (interestsMatch) {
    insights.interests = interestsMatch[1]
      .split('\n')
      .filter(line => line.trim().startsWith('-'))
      .map(line => line.replace(/^-\s*/, '').trim());
  }

  // Extract personality traits (lines after "Personality Indicators:")
  const traitsMatch = interpretation.match(/Personality Indicators[:\s]+([\s\S]*?)(?=\n\n|\d\.)/i);
  if (traitsMatch) {
    insights.personalityTraits = traitsMatch[1]
      .split('\n')
      .filter(line => line.trim().startsWith('-'))
      .map(line => line.replace(/^-\s*/, '').trim());
  }

  return insights;
}

export default router;
