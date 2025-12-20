/**
 * Platform Reflection Service
 *
 * Generates conversational, introspective reflections from the digital twin
 * about each platform's data. Instead of showing stats ("847 tracks analyzed"),
 * the twin shares observations about patterns it has noticed.
 *
 * Core Philosophy:
 * - NO numbers, percentages, or statistics
 * - Speak directly to the user ("You", "Your")
 * - Observe patterns, don't list data
 * - Sound like a thoughtful friend, not a fitness app
 */

import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '../config/supabase.js';
import userContextAggregator from './userContextAggregator.js';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = 'claude-sonnet-4-5-20250929';
const CACHE_TTL_HOURS = 6;

class PlatformReflectionService {
  constructor() {
    this.cache = new Map();
  }

  /**
   * Get reflections for a specific platform
   * @param {string} userId - User ID
   * @param {string} platform - 'spotify' | 'whoop' | 'calendar'
   * @returns {Promise<Object>} Reflection data
   */
  async getReflections(userId, platform) {
    console.log(`🪞 [Reflection] Getting ${platform} reflections for user ${userId}`);

    try {
      // 1. Check for valid cached reflection
      const cached = await this.getCachedReflection(userId, platform);
      if (cached && !this.isExpired(cached)) {
        console.log(`🪞 [Reflection] Using cached ${platform} reflection`);
        const fullContext = await userContextAggregator.aggregateUserContext(userId);
        const lifeContext = fullContext?.lifeContext || null;
        return this.formatResponse(cached, await this.getHistory(userId, platform), lifeContext);
      }

      // 2. Get platform-specific data AND life context for cross-platform awareness
      const [platformData, fullContext] = await Promise.all([
        this.getPlatformData(userId, platform),
        userContextAggregator.aggregateUserContext(userId)
      ]);

      if (!platformData.success) {
        return {
          success: false,
          error: platformData.error || `No ${platform} data available`
        };
      }

      // 3. Get life context for the prompt
      const lifeContext = fullContext?.lifeContext || null;

      // 4. Generate new reflection using Claude (with life context)
      const reflection = await this.generateReflection(
        platform,
        platformData.data,
        lifeContext,
        platformData.data // Pass raw data for storage
      );

      // 5. Store the reflection
      await this.storeReflection(userId, platform, reflection);

      // 6. Get history
      const history = await this.getHistory(userId, platform);

      return this.formatResponse(reflection, history, lifeContext);
    } catch (error) {
      console.error(`❌ [Reflection] Error for ${platform}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Force refresh a reflection (ignore cache)
   */
  async refreshReflection(userId, platform) {
    console.log(`🪞 [Reflection] Force refreshing ${platform} reflection`);

    // Get both platform data and life context
    const [platformData, fullContext] = await Promise.all([
      this.getPlatformData(userId, platform),
      userContextAggregator.aggregateUserContext(userId)
    ]);

    if (!platformData.success) {
      return { success: false, error: platformData.error };
    }

    const lifeContext = fullContext?.lifeContext || null;

    const reflection = await this.generateReflection(
      platform,
      platformData.data,
      lifeContext,
      platformData.data
    );
    await this.storeReflection(userId, platform, reflection);
    const history = await this.getHistory(userId, platform);

    return this.formatResponse(reflection, history, lifeContext);
  }

  /**
   * Get platform-specific data for reflection generation
   */
  async getPlatformData(userId, platform) {
    const context = await userContextAggregator.aggregateUserContext(userId);

    if (!context.success) {
      return { success: false, error: 'Failed to get user context' };
    }

    switch (platform) {
      case 'spotify':
        return this.getSpotifyData(userId, context);
      case 'whoop':
        return this.getWhoopData(context);
      case 'calendar':
        return this.getCalendarData(context);
      default:
        return { success: false, error: 'Unknown platform' };
    }
  }

  /**
   * Get Spotify data for reflection
   */
  async getSpotifyData(userId, context) {
    try {
      // Get top tracks from user_platform_data
      const { data: topTracks } = await supabaseAdmin
        .from('user_platform_data')
        .select('raw_data')
        .eq('user_id', userId)
        .eq('platform', 'spotify')
        .eq('data_type', 'top_track')
        .order('extracted_at', { ascending: false })
        .limit(20);

      // Get recent plays
      const { data: recentPlays } = await supabaseAdmin
        .from('user_platform_data')
        .select('raw_data')
        .eq('user_id', userId)
        .eq('platform', 'spotify')
        .eq('data_type', 'recently_played')
        .order('extracted_at', { ascending: false })
        .limit(20);

      // Get audio features if available
      const { data: audioFeatures } = await supabaseAdmin
        .from('user_platform_data')
        .select('raw_data')
        .eq('user_id', userId)
        .eq('platform', 'spotify')
        .eq('data_type', 'audio_features')
        .order('extracted_at', { ascending: false })
        .limit(1);

      const topArtists = [...new Set(
        (topTracks || [])
          .map(t => t.raw_data?.artist_name || t.raw_data?.artists?.[0]?.name)
          .filter(Boolean)
      )].slice(0, 10);

      const topTrackNames = (topTracks || [])
        .map(t => `${t.raw_data?.track_name || t.raw_data?.name} by ${t.raw_data?.artist_name || t.raw_data?.artists?.[0]?.name}`)
        .filter(Boolean)
        .slice(0, 10);

      const recentTrackNames = (recentPlays || [])
        .map(t => t.raw_data?.track?.name || t.raw_data?.name)
        .filter(Boolean)
        .slice(0, 10);

      // Calculate average audio features
      const features = audioFeatures?.[0]?.raw_data || {};

      return {
        success: true,
        data: {
          topArtists,
          topTrackNames,
          recentTrackNames,
          averageEnergy: features.energy || context.spotify?.averageEnergy,
          averageValence: features.valence,
          listeningContext: context.spotify?.recentMood
        }
      };
    } catch (error) {
      console.error('❌ [Reflection] Spotify data error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get Whoop data for reflection
   */
  getWhoopData(context) {
    if (!context.whoop) {
      return { success: false, error: 'Whoop not connected' };
    }

    return {
      success: true,
      data: {
        recoveryLevel: context.whoop.recoveryLabel, // 'high', 'moderate', 'low'
        recoveryTrending: context.whoop.recovery > 66 ? 'up' : context.whoop.recovery < 33 ? 'down' : 'stable',
        sleepQuality: context.whoop.sleepHours > 7 ? 'good' : context.whoop.sleepHours < 6 ? 'poor' : 'moderate',
        strainLevel: context.whoop.strain > 15 ? 'high' : context.whoop.strain < 8 ? 'low' : 'moderate',
        hrvTrend: context.whoop.hrvTrend || 'stable',
        sleepHoursCategory: context.whoop.sleepHours > 8 ? 'long' : context.whoop.sleepHours < 6 ? 'short' : 'normal'
      }
    };
  }

  /**
   * Get Calendar data for reflection
   */
  getCalendarData(context) {
    if (!context.calendar) {
      return { success: false, error: 'Calendar not connected' };
    }

    const events = context.calendar.upcomingEvents || [];
    const nextEvent = context.calendar.nextEvent;

    // Analyze patterns without counting
    const hasManyMeetings = events.length > 5;
    const hasUpcomingSoon = nextEvent && nextEvent.minutesUntil < 60;
    const meetingTypes = [...new Set(events.map(e => e.type).filter(Boolean))];

    return {
      success: true,
      data: {
        dayDensity: hasManyMeetings ? 'busy' : events.length > 2 ? 'moderate' : 'light',
        upcomingEventTitle: nextEvent?.title,
        upcomingEventSoon: hasUpcomingSoon,
        eventTypes: meetingTypes,
        hasOpenTime: events.length < 3,
        dayOfWeek: new Date().toLocaleDateString('en-US', { weekday: 'long' })
      }
    };
  }

  /**
   * Generate a reflection using Claude
   */
  async generateReflection(platform, data, lifeContext = null, rawPlatformData = null) {
    const prompt = this.getPromptForPlatform(platform, data, lifeContext);

    try {
      const message = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      let responseText = message.content[0].text.trim();

      // Strip markdown code blocks if present
      if (responseText.startsWith('```')) {
        responseText = responseText.replace(/^```(?:json)?[\s\n]*/i, '').replace(/[\s\n]*```$/i, '');
      }

      const result = JSON.parse(responseText);

      return {
        text: result.reflection,
        themes: result.themes || [],
        confidence: result.confidence || 'medium',
        evidence: result.evidence || [],
        patterns: result.patterns || [],
        // Store the context used to generate this reflection
        contextSnapshot: {
          lifeContext: lifeContext ? {
            currentStatus: lifeContext.currentStatus,
            activeEvents: lifeContext.activeEvents,
            promptSummary: lifeContext.promptSummary
          } : null,
          rawDataUsed: rawPlatformData
        }
      };
    } catch (error) {
      console.error('❌ [Reflection] Claude error:', error);
      return this.getFallbackReflection(platform);
    }
  }

  /**
   * Get platform-specific prompt
   */
  getPromptForPlatform(platform, data, lifeContext = null) {
    // Build life context prompt section
    let lifeContextSection = '';
    if (lifeContext && lifeContext.promptSummary && lifeContext.currentStatus !== 'normal') {
      lifeContextSection = `
IMPORTANT LIFE CONTEXT:
${lifeContext.promptSummary}

This life context should inform your observation - consider how it affects their patterns.
`;
    }

    const baseInstructions = `You are someone's digital twin who has deeply observed their patterns.
You speak DIRECTLY to them in second person ("You", "Your").

CRITICAL RULES:
- NEVER use numbers, percentages, or counts ("You listened to 847 tracks" is WRONG)
- NEVER list items ("Your top artists are X, Y, Z" is WRONG)
- NEVER sound clinical or like an app notification
- DO notice emotional/behavioral patterns
- DO connect patterns to life context
- DO sound like a thoughtful friend who knows them well
${lifeContextSection}
Respond in JSON format with:
{
  "reflection": "Your 2-4 sentence conversational observation",
  "themes": ["theme1", "theme2"], // Abstract themes like "processing", "seeking-energy"
  "confidence": "high" | "medium" | "low",
  "evidence": [
    {
      "observation": "A specific claim from your reflection",
      "dataPoints": [
        "Specific data that supports this claim",
        "Another supporting data point"
      ],
      "confidence": "high" | "medium" | "low"
    }
  ],
  "patterns": [
    {
      "text": "Another pattern observation (1-2 sentences)",
      "occurrences": "often" | "sometimes" | "noticed"
    }
  ]
}

IMPORTANT: The "evidence" array should show HOW you reached your conclusions. Each observation in the reflection should have supporting evidence.`;

    switch (platform) {
      case 'spotify':
        return `${baseInstructions}

You are observing their MUSIC patterns.

What you know about them (USE THIS TO INFORM YOUR OBSERVATION, don't list it):
- Artists they gravitate toward: ${data.topArtists?.join(', ') || 'various'}
- Recent listening includes: ${data.recentTrackNames?.slice(0, 5).join(', ') || 'various tracks'}
- Their music tends toward: ${data.averageEnergy > 0.6 ? 'higher energy' : data.averageEnergy < 0.4 ? 'calmer sounds' : 'balanced energy'}
- Emotional tone: ${data.averageValence > 0.6 ? 'more upbeat' : data.averageValence < 0.4 ? 'more melancholic' : 'varied'}

Write an observation about what their music choices reveal about them. Focus on:
- When/why they might reach for certain sounds
- What their patterns say about how they process emotions
- Connections between music and their inner life

Example good reflection: "I notice you reach for melancholic indie when you're processing something - not when you're sad, but when you're thinking deeply. Sunday evenings especially seem to be your reflection time."`;

      case 'whoop':
        return `${baseInstructions}

You are observing their BODY's patterns through health data.

What you know about them (USE THIS TO INFORM YOUR OBSERVATION, don't state it):
- Recovery trending: ${data.recoveryTrending}
- Current recovery level: ${data.recoveryLevel}
- Sleep lately: ${data.sleepQuality}
- Physical strain: ${data.strainLevel}
- HRV trend: ${data.hrvTrend}

Write an observation about what their body is telling them. Focus on:
- The stories their physiology tells that their calendar doesn't
- Patterns between their body state and life events
- Wisdom their body shows about what they need

Example good reflection: "Your body tells stories your calendar doesn't. The meetings that drain you leave traces in your HRV. But I've noticed something interesting - after creative work, your recovery actually improves. You're not just resting to recover; you're doing the right kind of work."`;

      case 'calendar':
        return `${baseInstructions}

You are observing their relationship with TIME through calendar patterns.

What you know about them (USE THIS TO INFORM YOUR OBSERVATION, don't state it):
- Today's density: ${data.dayDensity}
- Day of week: ${data.dayOfWeek}
- Types of events: ${data.eventTypes?.join(', ') || 'various'}
- Has protected open time: ${data.hasOpenTime ? 'yes' : 'limited'}
${data.upcomingEventTitle ? `- Coming up soon: "${data.upcomingEventTitle}"` : ''}

Write an observation about how they structure their time. Focus on:
- What their calendar reveals about their values
- Patterns in how they protect (or don't protect) certain times
- The rhythm of their weeks

Example good reflection: "The way you protect Tuesday mornings tells me something - that's when you do your best thinking, isn't it? I notice you rarely let meetings creep into that space, even when your afternoons are packed."`;

      default:
        return baseInstructions;
    }
  }

  /**
   * Fallback reflection if Claude fails
   */
  getFallbackReflection(platform) {
    const fallbacks = {
      spotify: {
        text: "Your music tells a story I'm still learning to read. The patterns are there - the way certain sounds find you at certain times. Let me observe a bit more.",
        themes: ['discovery'],
        confidence: 'low',
        patterns: []
      },
      whoop: {
        text: "Your body has wisdom that takes time to understand. I'm watching the rhythms, noticing the connections between how you feel and how you move through your days.",
        themes: ['learning'],
        confidence: 'low',
        patterns: []
      },
      calendar: {
        text: "Time reveals priorities. I'm learning the rhythm of your weeks - which hours you protect, which ones you give away, and what that says about what matters to you.",
        themes: ['observation'],
        confidence: 'low',
        patterns: []
      }
    };

    return fallbacks[platform] || fallbacks.spotify;
  }

  /**
   * Store reflection in database
   */
  async storeReflection(userId, platform, reflection) {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + CACHE_TTL_HOURS);

    try {
      await supabaseAdmin
        .from('reflection_history')
        .insert({
          user_id: userId,
          platform,
          reflection_text: reflection.text,
          themes: reflection.themes,
          confidence: reflection.confidence,
          reflection_type: 'observation',
          expires_at: expiresAt.toISOString(),
          data_snapshot: {
            patterns: reflection.patterns,
            evidence: reflection.evidence || [],
            contextSnapshot: reflection.contextSnapshot || null
          }
        });
    } catch (error) {
      console.error('❌ [Reflection] Failed to store reflection:', error);
    }
  }

  /**
   * Get cached reflection
   */
  async getCachedReflection(userId, platform) {
    try {
      const { data } = await supabaseAdmin
        .from('reflection_history')
        .select('*')
        .eq('user_id', userId)
        .eq('platform', platform)
        .is('dismissed_at', null)
        .order('generated_at', { ascending: false })
        .limit(1)
        .single();

      return data;
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if reflection is expired
   */
  isExpired(reflection) {
    if (!reflection.expires_at) return true;
    return new Date(reflection.expires_at) < new Date();
  }

  /**
   * Get reflection history for a platform
   */
  async getHistory(userId, platform, limit = 5) {
    try {
      const { data } = await supabaseAdmin
        .from('reflection_history')
        .select('id, reflection_text, generated_at, themes')
        .eq('user_id', userId)
        .eq('platform', platform)
        .is('dismissed_at', null)
        .order('generated_at', { ascending: false })
        .range(1, limit); // Skip the first (current) one

      return data || [];
    } catch (error) {
      return [];
    }
  }

  /**
   * Format the response
   */
  formatResponse(reflection, history, lifeContext = null) {
    // Handle both stored and freshly generated reflections
    const reflectionData = reflection.reflection_text
      ? {
          id: reflection.id,
          text: reflection.reflection_text,
          generatedAt: reflection.generated_at,
          expiresAt: reflection.expires_at,
          confidence: reflection.confidence,
          themes: reflection.themes || []
        }
      : {
          id: null,
          text: reflection.text,
          generatedAt: new Date().toISOString(),
          expiresAt: null,
          confidence: reflection.confidence,
          themes: reflection.themes || []
        };

    const patterns = reflection.data_snapshot?.patterns || reflection.patterns || [];
    const evidence = reflection.data_snapshot?.evidence || reflection.evidence || [];
    const contextSnapshot = reflection.data_snapshot?.contextSnapshot || reflection.contextSnapshot || null;

    // Build cross-platform context info for the frontend
    const crossPlatformContext = {
      lifeContext: lifeContext ? {
        currentStatus: lifeContext.currentStatus,
        isOnVacation: lifeContext.isOnVacation,
        promptSummary: lifeContext.promptSummary,
        activeEvents: lifeContext.activeEvents || []
      } : contextSnapshot?.lifeContext || null
    };

    return {
      success: true,
      reflection: reflectionData,
      evidence: evidence.map((e, i) => ({
        id: `evidence-${i}`,
        observation: e.observation || e.claim,
        dataPoints: e.dataPoints || [],
        confidence: e.confidence || 'medium'
      })),
      patterns: patterns.map((p, i) => ({
        id: `pattern-${i}`,
        text: typeof p === 'string' ? p : p.text,
        occurrences: typeof p === 'object' ? p.occurrences : 'noticed'
      })),
      crossPlatformContext,
      history: history.map(h => ({
        id: h.id,
        text: h.reflection_text,
        generatedAt: h.generated_at
      }))
    };
  }
}

const platformReflectionService = new PlatformReflectionService();
export default platformReflectionService;
