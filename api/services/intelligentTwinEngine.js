/**
 * Intelligent Twin Engine
 *
 * Uses Claude AI to analyze aggregated user context and generate:
 * - Current state assessments
 * - Personalized recommendations
 * - Health insights
 * - Preparation advice
 * - Cross-platform pattern recognition
 *
 * This is the "brain" of the digital twin - it combines data from all
 * platforms and uses LLM reasoning to provide intelligent guidance.
 */

import Anthropic from '@anthropic-ai/sdk';
import userContextAggregator from './userContextAggregator.js';
import intelligentMusicService from './intelligentMusicService.js';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

class IntelligentTwinEngine {
  constructor() {
    this.MODEL = 'claude-sonnet-4-5-20250929';
    this.cache = new Map();
    this.CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Generate comprehensive insights and recommendations for user
   * @param {string} userId - User ID
   * @param {Object} options - Options for generation
   * @returns {Promise<Object>} Insights and recommendations
   */
  async generateInsightsAndRecommendations(userId, options = {}) {
    console.log(`🧠 [IntelligentTwin] Generating insights for user ${userId}`);

    try {
      // 1. Get aggregated context from all platforms
      const context = await userContextAggregator.aggregateUserContext(userId, options);

      if (!context.success) {
        return {
          success: false,
          error: context.error || 'Failed to aggregate user context'
        };
      }

      // 2. Generate context summary for Claude
      const contextSummary = userContextAggregator.generateContextSummary(context);

      // 3. Get Claude's analysis
      const analysis = await this.analyzeWithClaude(contextSummary, options);

      // 4. Get music recommendations if needed
      let musicRecommendations = null;
      if (options.includeMusic !== false && context.spotify) {
        const purpose = this.determineMusicPurpose(context, analysis);
        musicRecommendations = await intelligentMusicService.getRecommendations(
          userId,
          context,
          purpose
        );
      }

      return {
        success: true,
        insights: {
          currentState: analysis.currentState,
          healthInsights: analysis.healthInsights,
          recommendations: analysis.recommendations,
          preparationAdvice: analysis.preparationAdvice,
          personalizedTip: analysis.personalizedTip,
          reasoning: analysis.reasoning
        },
        music: musicRecommendations?.success ? musicRecommendations.recommendations : null,
        context: {
          whoop: context.whoop ? {
            recovery: context.whoop.recovery,
            recoveryLabel: context.whoop.recoveryLabel,
            strain: context.whoop.strain,
            sleepHours: context.whoop.sleepHours,
            hrv: context.whoop.hrv
          } : null,
          calendar: context.calendar?.nextEvent || null,
          personality: context.personality ? {
            dominantTraits: this.getDominantTraits(context.personality)
          } : null,
          patterns: context.patterns?.slice(0, 3) || []
        },
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ [IntelligentTwin] Error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Analyze context using Claude AI
   */
  async analyzeWithClaude(contextSummary, options = {}) {
    console.log('🧠 [IntelligentTwin] Calling Claude for analysis...');

    const prompt = `You are an AI digital twin assistant analyzing a user's current state across multiple platforms to provide personalized insights and recommendations.

${contextSummary}

Based on this comprehensive context, provide your analysis in JSON format with these sections:

1. **currentState**: An assessment of how the user is likely feeling right now based on all available data. Consider:
   - Physical state (recovery, sleep, energy)
   - Mental state (stress indicators, upcoming obligations)
   - Overall readiness level

2. **healthInsights**: Array of 2-3 health observations based on Whoop data and patterns. Each should have:
   - observation: What you noticed
   - implication: What this means for them today
   - recommendation: Actionable suggestion

3. **recommendations**: Array of 2-4 specific recommendations for right now. Each should have:
   - type: Category (music, activity, preparation, rest, etc.)
   - suggestion: The specific recommendation
   - reasoning: Why this is recommended based on their data
   - priority: high/medium/low

4. **preparationAdvice**: If there's an upcoming event, specific advice for preparing. Include:
   - forEvent: Event name
   - startPrepTime: Minutes before event to start preparing
   - activities: Array of preparation activities
   - musicMood: Suggested music mood (calm/focused/energizing/power)

5. **personalizedTip**: One personalized tip that connects multiple data points (e.g., "Given your low recovery and upcoming presentation, consider a 10-minute power nap before starting your prep routine")

6. **reasoning**: A brief explanation of the key factors that influenced your recommendations

Important guidelines:
- Be specific and actionable, not generic
- Reference actual numbers from their data when relevant
- Consider cross-platform patterns (e.g., sleep affecting music choices)
- If recovery is low, don't recommend high-intensity activities
- Match music energy to their physical state, not just their preferences
- Account for time until any upcoming events

Respond ONLY with valid JSON, no markdown code blocks:`;

    try {
      const message = await anthropic.messages.create({
        model: this.MODEL,
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      let responseText = message.content[0].text.trim();
      console.log('🧠 [IntelligentTwin] Claude response received');

      // Strip markdown code blocks if present
      if (responseText.startsWith('```')) {
        responseText = responseText.replace(/^```(?:json)?[\s\n]*/i, '').replace(/[\s\n]*```$/i, '');
      }

      const analysis = JSON.parse(responseText);

      return {
        currentState: analysis.currentState || 'Unable to assess current state',
        healthInsights: analysis.healthInsights || [],
        recommendations: analysis.recommendations || [],
        preparationAdvice: analysis.preparationAdvice || null,
        personalizedTip: analysis.personalizedTip || null,
        reasoning: analysis.reasoning || ''
      };
    } catch (error) {
      console.error('🧠 [IntelligentTwin] Claude analysis error:', error);

      // Return fallback analysis
      return this.generateFallbackAnalysis(contextSummary);
    }
  }

  /**
   * Generate fallback analysis without Claude
   */
  generateFallbackAnalysis(contextSummary) {
    console.log('🧠 [IntelligentTwin] Using fallback analysis');

    const analysis = {
      currentState: 'Analysis temporarily unavailable. Based on available data, continue with your planned activities.',
      healthInsights: [],
      recommendations: [
        {
          type: 'general',
          suggestion: 'Stay hydrated and take regular breaks',
          reasoning: 'General wellness recommendation',
          priority: 'medium'
        }
      ],
      preparationAdvice: null,
      personalizedTip: 'Check your Whoop app for the most up-to-date health insights.',
      reasoning: 'Fallback recommendations provided due to analysis service unavailability.'
    };

    return analysis;
  }

  /**
   * Determine the best music purpose based on context and analysis
   */
  determineMusicPurpose(context, analysis) {
    // Check for upcoming event
    if (context.calendar?.nextEvent) {
      const minutesUntil = context.calendar.nextEvent.minutesUntil;
      if (minutesUntil && minutesUntil < 120) {
        return 'pre-event';
      }
    }

    // Check recovery level
    if (context.whoop?.recovery !== undefined) {
      if (context.whoop.recovery < 33) {
        return 'relax';
      } else if (context.whoop.recovery > 75) {
        return 'energizing';
      }
    }

    // Check time of day
    const hour = new Date().getHours();
    if (hour >= 22 || hour < 6) {
      return 'relax';
    } else if (hour >= 9 && hour < 17) {
      return 'focus';
    }

    return 'general';
  }

  /**
   * Get dominant personality traits
   */
  getDominantTraits(personality) {
    if (!personality) return [];

    const traits = [
      { name: 'Openness', score: personality.openness || 0 },
      { name: 'Conscientiousness', score: personality.conscientiousness || 0 },
      { name: 'Extraversion', score: personality.extraversion || 0 },
      { name: 'Agreeableness', score: personality.agreeableness || 0 },
      { name: 'Neuroticism', score: personality.neuroticism || 0 }
    ];

    return traits
      .filter(t => t.score > 60)
      .sort((a, b) => b.score - a.score)
      .slice(0, 2)
      .map(t => ({ name: t.name, level: t.score > 75 ? 'very high' : 'high' }));
  }

  /**
   * Get quick status assessment without full recommendation pipeline
   */
  async getQuickStatus(userId) {
    console.log(`🧠 [IntelligentTwin] Quick status for user ${userId}`);

    try {
      const context = await userContextAggregator.aggregateUserContext(userId, {
        skipPatterns: true
      });

      if (!context.success) {
        return { success: false, error: context.error };
      }

      // Simple status based on recovery
      let statusLabel = 'balanced';
      let statusEmoji = '😊';
      let primaryMetric = null;

      if (context.whoop?.recovery !== undefined) {
        const recovery = context.whoop.recovery;
        primaryMetric = { name: 'Recovery', value: recovery, unit: '%' };

        if (recovery < 33) {
          statusLabel = 'needs rest';
          statusEmoji = '😴';
        } else if (recovery < 66) {
          statusLabel = 'moderate energy';
          statusEmoji = '🙂';
        } else {
          statusLabel = 'peak performance';
          statusEmoji = '⚡';
        }
      }

      // Check for upcoming event
      let nextEvent = null;
      if (context.calendar?.nextEvent) {
        nextEvent = {
          title: context.calendar.nextEvent.title,
          minutesUntil: context.calendar.nextEvent.minutesUntil,
          type: context.calendar.nextEvent.type
        };
      }

      return {
        success: true,
        status: {
          label: statusLabel,
          emoji: statusEmoji,
          primaryMetric,
          nextEvent,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      console.error('🧠 [IntelligentTwin] Quick status error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get specific recommendation for a purpose
   */
  async getRecommendationFor(userId, purpose) {
    console.log(`🧠 [IntelligentTwin] Recommendation for ${purpose}`);

    const validPurposes = ['pre-event', 'focus', 'workout', 'relax', 'sleep'];
    if (!validPurposes.includes(purpose)) {
      return { success: false, error: `Invalid purpose. Use one of: ${validPurposes.join(', ')}` };
    }

    try {
      const context = await userContextAggregator.aggregateUserContext(userId);

      if (!context.success) {
        return { success: false, error: context.error };
      }

      // Get music recommendations for specific purpose
      const music = await intelligentMusicService.getRecommendations(userId, context, purpose);

      // Generate purpose-specific advice
      const advice = this.generatePurposeAdvice(context, purpose);

      return {
        success: true,
        purpose,
        advice,
        music: music.success ? music.recommendations : null,
        basedOn: {
          recovery: context.whoop?.recovery,
          strain: context.whoop?.strain,
          sleepHours: context.whoop?.sleepHours
        }
      };
    } catch (error) {
      console.error('🧠 [IntelligentTwin] Recommendation error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Generate advice specific to a purpose
   */
  generatePurposeAdvice(context, purpose) {
    const advice = {
      activities: [],
      duration: 0,
      cautions: []
    };

    const recovery = context.whoop?.recovery || 50;
    const strain = context.whoop?.strain || 5;

    switch (purpose) {
      case 'pre-event':
        advice.duration = recovery < 50 ? 20 : 15; // More prep time if tired
        advice.activities = [
          'Review key talking points',
          'Deep breathing exercises (4-7-8 technique)',
          'Light stretching',
          'Listen to confidence-boosting music'
        ];
        if (recovery < 33) {
          advice.cautions.push('Your recovery is low - keep your energy for the event itself');
        }
        break;

      case 'focus':
        advice.duration = 45; // Pomodoro-style
        advice.activities = [
          'Clear workspace of distractions',
          'Put phone on Do Not Disturb',
          'Start with instrumental focus music',
          'Set clear goal for the session'
        ];
        if (recovery < 50) {
          advice.cautions.push('Take more frequent breaks given your recovery level');
          advice.duration = 30;
        }
        break;

      case 'workout':
        advice.duration = recovery < 33 ? 20 : recovery < 66 ? 35 : 45;
        if (recovery < 33) {
          advice.activities = [
            'Light yoga or stretching',
            'Short walk',
            'Gentle mobility work'
          ];
          advice.cautions.push('Recovery is low - skip high-intensity today');
        } else if (recovery < 66) {
          advice.activities = [
            'Moderate cardio',
            'Strength training with lighter weights',
            'Swimming or cycling'
          ];
        } else {
          advice.activities = [
            'High-intensity interval training',
            'Heavy strength training',
            'Challenging cardio session'
          ];
        }
        if (strain > 15) {
          advice.cautions.push(`Already high strain (${strain}/21) - consider lighter activity`);
        }
        break;

      case 'relax':
        advice.duration = 20;
        advice.activities = [
          'Progressive muscle relaxation',
          'Guided meditation',
          'Read something enjoyable',
          'Light stretching'
        ];
        break;

      case 'sleep':
        advice.duration = 30;
        advice.activities = [
          'Dim lights and reduce screen time',
          'Cool down room temperature',
          'Sleep story or calming music',
          'Review what went well today'
        ];
        if (context.whoop?.sleepHours && context.whoop.sleepHours < 6) {
          advice.cautions.push('You\'ve been sleep-deprived - prioritize getting to bed early');
        }
        break;
    }

    return advice;
  }

  /**
   * Analyze patterns and provide long-term insights
   */
  async analyzePatterns(userId) {
    console.log(`🧠 [IntelligentTwin] Pattern analysis for user ${userId}`);

    try {
      const context = await userContextAggregator.aggregateUserContext(userId, {
        includePatterns: true
      });

      if (!context.patterns || context.patterns.length === 0) {
        return {
          success: true,
          message: 'Not enough data yet for pattern analysis. Keep using your connected platforms!',
          patterns: []
        };
      }

      return {
        success: true,
        patterns: context.patterns,
        summary: `Found ${context.patterns.length} behavioral patterns across your connected platforms.`
      };
    } catch (error) {
      console.error('🧠 [IntelligentTwin] Pattern analysis error:', error);
      return { success: false, error: error.message };
    }
  }
}

// Export singleton instance
const intelligentTwinEngine = new IntelligentTwinEngine();
export default intelligentTwinEngine;
