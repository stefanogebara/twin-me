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
 *
 * This is the thin orchestrator. Domain logic lives in:
 * - reflections/reflectionConstants.js   - System prompt, cache TTL
 * - reflections/spotifyDataFetcher.js    - Spotify data extraction
 * - reflections/calendarDataFetcher.js   - Calendar data extraction
 * - reflections/otherDataFetchers.js     - YouTube, Web data extraction
 * - reflections/reflectionPrompts.js     - Per-platform prompt building
 * - reflections/reflectionTemplates.js   - Template-based fallback reflections
 * - reflections/reflectionStore.js       - DB/cache ops + response formatting
 */

import { complete, TIER_ANALYSIS } from './llmGateway.js';
import userContextAggregator from './userContextAggregator.js';

// Constants
import { REFLECTION_BASE_SYSTEM } from './reflections/reflectionConstants.js';

// Data fetchers
import { getSpotifyData } from './reflections/spotifyDataFetcher.js';
import { getCalendarData } from './reflections/calendarDataFetcher.js';
import { getYouTubeData, getTwitchData, getWebBrowsingData, getDiscordData, getLinkedInData } from './reflections/otherDataFetchers.js';

// Prompt building
import { getPromptForPlatform } from './reflections/reflectionPrompts.js';

// Templates & fallbacks
import { generateTemplateReflection, getFallbackReflection } from './reflections/reflectionTemplates.js';
import { createLogger } from './logger.js';

const log = createLogger('PlatformReflection');

// Store & formatting
import {
  storeReflection,
  getCachedReflection,
  isExpired,
  getHistory,
  formatResponse
} from './reflections/reflectionStore.js';

class PlatformReflectionService {
  constructor() {
    this.cache = new Map();
  }

  /**
   * Get reflections for a specific platform
   * @param {string} userId - User ID
   * @param {string} platform - 'spotify' | 'whoop' | 'calendar' | 'youtube' | 'twitch' | 'web'
   * @returns {Promise<Object>} Reflection data
   */
  async getReflections(userId, platform) {
    log.info(`Getting ${platform} reflections for user ${userId}`);

    try {
      // 1. Check for valid cached reflection
      const cached = await getCachedReflection(userId, platform);
      if (cached && !isExpired(cached)) {
        log.info(`Using cached ${platform} reflection`);
        const fullContext = await userContextAggregator.aggregateUserContext(userId);
        const lifeContext = fullContext?.lifeContext || null;
        // Also fetch fresh platform data for visual display (pass context to avoid duplicate calls)
        const platformData = await this.getPlatformData(userId, platform, fullContext);
        const visualData = platformData.success ? platformData.data : null;
        return formatResponse(cached, await getHistory(userId, platform), lifeContext, visualData);
      }

      // 2. Get full context first (to avoid parallel token refreshes), then platform-specific data
      const fullContext = await userContextAggregator.aggregateUserContext(userId);
      const platformData = await this.getPlatformData(userId, platform, fullContext);

      if (!platformData.success) {
        return {
          success: false,
          error: platformData.error || `No ${platform} data available`
        };
      }

      // 3. Get life context and personality quiz for the prompt
      const lifeContext = fullContext?.lifeContext || null;
      const personalityQuiz = fullContext?.personalityQuiz || null;

      // 4. Generate new reflection using Claude (with life context and personality)
      const reflection = await this.generateReflection(
        platform,
        platformData.data,
        lifeContext,
        personalityQuiz,
        platformData.data // Pass raw data for storage
      );

      // 5. Store the reflection
      await storeReflection(userId, platform, reflection);

      // 6. Get history
      const history = await getHistory(userId, platform);

      return formatResponse(reflection, history, lifeContext, platformData.data);
    } catch (error) {
      log.error(`Error for ${platform}:`, error);
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
    log.info(`Force refreshing ${platform} reflection`);

    // Get both platform data and full context
    const [platformData, fullContext] = await Promise.all([
      this.getPlatformData(userId, platform),
      userContextAggregator.aggregateUserContext(userId)
    ]);

    if (!platformData.success) {
      return { success: false, error: platformData.error };
    }

    const lifeContext = fullContext?.lifeContext || null;
    const personalityQuiz = fullContext?.personalityQuiz || null;

    const reflection = await this.generateReflection(
      platform,
      platformData.data,
      lifeContext,
      personalityQuiz,
      platformData.data
    );
    await storeReflection(userId, platform, reflection);
    const history = await getHistory(userId, platform);

    return formatResponse(reflection, history, lifeContext, platformData.data);
  }

  /**
   * Get platform-specific data for reflection generation
   * @param {string} userId - User ID
   * @param {string} platform - Platform name
   * @param {Object} existingContext - Optional pre-fetched context to avoid duplicate calls
   */
  async getPlatformData(userId, platform, existingContext = null) {
    const context = existingContext || await userContextAggregator.aggregateUserContext(userId);

    if (!context.success) {
      return { success: false, error: 'Failed to get user context' };
    }

    switch (platform) {
      case 'spotify':
        return getSpotifyData(userId, context);
      case 'calendar':
        return getCalendarData(context);
      case 'youtube':
        return getYouTubeData(userId);
      case 'twitch':
        return getTwitchData(userId);
      case 'web':
        return getWebBrowsingData(userId);
      case 'discord':
        return getDiscordData(userId);
      case 'linkedin':
        return getLinkedInData(userId);
      default:
        return { success: false, error: 'Unknown platform' };
    }
  }

  /**
   * Generate a reflection using Claude
   */
  async generateReflection(platform, data, lifeContext = null, personalityQuiz = null, rawPlatformData = null) {
    const prompt = getPromptForPlatform(platform, data, lifeContext, personalityQuiz);

    try {
      const result = await complete({
        tier: TIER_ANALYSIS,
        system: REFLECTION_BASE_SYSTEM,
        messages: [{
          role: 'user',
          content: prompt
        }],
        maxTokens: 1024,
        serviceName: 'platformReflection'
      });

      let responseText = result.content.trim();

      // Strip markdown code blocks if present
      if (responseText.startsWith('```')) {
        responseText = responseText.replace(/^```(?:json)?[\s\n]*/i, '').replace(/[\s\n]*```$/i, '');
      }

      const parsed = JSON.parse(responseText);

      return {
        text: parsed.reflection,
        themes: parsed.themes || [],
        confidence: parsed.confidence || 'medium',
        evidence: parsed.evidence || [],
        patterns: parsed.patterns || [],
        // Store the context used to generate this reflection
        contextSnapshot: {
          lifeContext: lifeContext ? {
            currentStatus: lifeContext.currentStatus,
            activeEvents: lifeContext.activeEvents,
            promptSummary: lifeContext.promptSummary
          } : null,
          personalityQuiz: personalityQuiz ? {
            summary: personalityQuiz.summary,
            morningPerson: personalityQuiz.morningPerson,
            introversion: personalityQuiz.introversion,
            musicEmotionalStrategy: personalityQuiz.musicEmotionalStrategy,
            stressCoping: personalityQuiz.stressCoping,
            noveltySeeking: personalityQuiz.noveltySeeking
          } : null,
          rawDataUsed: rawPlatformData
        }
      };
    } catch (error) {
      log.error('Claude error:', error);
      // Try template-based reflection using actual data before falling back to generic text
      const templateReflection = generateTemplateReflection(platform, rawPlatformData);
      if (templateReflection) {
        log.info(`Using template-based reflection for ${platform}`);
        return templateReflection;
      }
      return getFallbackReflection(platform);
    }
  }
}

const platformReflectionService = new PlatformReflectionService();
export default platformReflectionService;
