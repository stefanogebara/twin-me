/**
 * TwinFormationService
 *
 * Forms a complete digital twin by combining:
 * - Aggregated personality scores (Big Five)
 * - MBTI archetype mapping
 * - AI-generated soul signature narrative
 * - Platform-specific reflections
 *
 * The digital twin represents the user's authentic self as revealed
 * through their behavioral data across connected platforms.
 */

import { supabaseAdmin } from './database.js';
import personalityAggregator from './personalityAggregator.js';
import { mapToArchetype, generatePersonalityInsights, ARCHETYPES } from './personalityAssessmentService.js';
import { generateChatResponse } from './anthropicService.js';

class TwinFormationService {
  constructor() {
    this.MIN_FEATURES_FOR_FORMATION = 3; // Minimum features needed to form a twin
  }

  /**
   * Form or update a user's digital twin
   */
  async formTwin(userId) {
    try {
      // Step 1: Get aggregated personality profile
      const profileResult = await personalityAggregator.getPersonalityProfile(userId);

      if (!profileResult.success) {
        return {
          success: false,
          error: 'Insufficient data to form twin',
          details: profileResult.error
        };
      }

      const { profile } = profileResult;

      // Check if we have enough data
      if (profile.featureCount < this.MIN_FEATURES_FOR_FORMATION) {
        return {
          success: false,
          error: 'Not enough behavioral data yet',
          required: this.MIN_FEATURES_FOR_FORMATION,
          current: profile.featureCount
        };
      }

      // Step 2: Map to MBTI archetype
      const archetype = this.generateArchetype(profile.scores);

      // Step 3: Generate AI narrative (soul signature)
      const narrative = await this.generateNarrative(userId, profile, archetype);

      // Step 4: Generate platform-specific reflections
      const reflections = await this.generateReflections(userId, profile);

      // Step 5: Compile complete twin data
      const twinData = {
        userId,
        archetype,
        narrative,
        reflections,
        scores: profile.scores,
        confidence: profile.confidence,
        platformCoverage: profile.platformCoverage,
        dominantTraits: profile.dominantTraits,
        profileStrength: profile.profileStrength,
        formedAt: new Date().toISOString()
      };

      // Step 6: Save to database
      const saveResult = await this.saveTwin(userId, twinData);

      if (!saveResult.success) {
        return {
          success: false,
          error: 'Failed to save twin',
          details: saveResult.error
        };
      }

      return {
        success: true,
        twin: twinData,
        message: `Twin formed successfully as ${archetype.name} (${archetype.fullCode})`
      };

    } catch (error) {
      console.error('[TwinFormationService] Error forming twin:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate MBTI archetype from personality scores
   */
  generateArchetype(scores) {
    // Convert Big Five scores to format expected by mapToArchetype
    const scoreValues = {};
    for (const [dimension, data] of Object.entries(scores)) {
      scoreValues[dimension] = data.score;
    }

    // Use existing archetype mapping
    const archetype = mapToArchetype(scoreValues);

    // Add additional archetype metadata
    const archetypeInfo = ARCHETYPES[archetype.code];

    return {
      ...archetype,
      description: this.getArchetypeDescription(archetype.code),
      motto: this.getArchetypeMotto(archetype.code)
    };
  }

  /**
   * Generate AI narrative (soul signature) using Claude
   */
  async generateNarrative(userId, profile, archetype) {
    try {
      // Prepare context from profile data
      const platformSummaries = this.buildPlatformSummaries(profile);
      const traitSummary = this.buildTraitSummary(profile);

      const systemPrompt = `You are a soul signature narrator for Twin AI Learn. Your role is to craft a warm,
insightful narrative that captures a person's authentic self based on their behavioral data.

Write in second person ("You...") and make the narrative feel personal and validating.
Focus on patterns that reveal genuine aspects of their personality.
Be specific but not clinical - this should feel like a friend who truly sees them.
Length: 2-3 paragraphs, around 150-200 words total.`;

      const userPrompt = `Create a soul signature narrative for someone with these characteristics:

**Personality Type**: ${archetype.name} (${archetype.fullCode})
${archetype.description}

**Key Traits**:
${traitSummary}

**Behavioral Patterns**:
${platformSummaries}

**Dominant Characteristics**:
${profile.dominantTraits.map(t => `- ${t.label}: ${t.pole === 'high' ? 'Strong' : 'Low'} (${t.score}%)`).join('\n')}

Write a narrative that weaves together these patterns into a cohesive portrait of who they are.
Focus on what makes them unique and authentic.`;

      const response = await generateChatResponse({
        systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        maxTokens: 500,
        temperature: 0.8
      });

      return {
        content: response.content,
        generatedAt: new Date().toISOString(),
        model: response.model,
        tokenUsage: response.usage
      };

    } catch (error) {
      console.error('[TwinFormationService] Error generating narrative:', error);

      // Return fallback narrative
      return {
        content: this.getFallbackNarrative(archetype),
        generatedAt: new Date().toISOString(),
        model: 'fallback',
        error: error.message
      };
    }
  }

  /**
   * Generate platform-specific reflections
   */
  async generateReflections(userId, profile) {
    const reflections = [];
    const { platforms } = profile.platformCoverage;

    for (const [platform, data] of Object.entries(platforms)) {
      if (!data.connected || data.featureCount === 0) continue;

      // Get features for this platform
      const platformFeatures = await this.getPlatformFeatures(userId, platform);

      if (platformFeatures.length > 0) {
        const reflection = await this.generatePlatformReflection(platform, platformFeatures);
        reflections.push({
          platform,
          ...reflection
        });
      }
    }

    return reflections;
  }

  /**
   * Generate a reflection for a specific platform
   */
  async generatePlatformReflection(platform, features) {
    try {
      const platformContext = this.getPlatformContext(platform);
      const featureSummary = features.map(f =>
        `- ${f.feature_type}: ${f.feature_value}% (${f.evidence?.description || ''})`
      ).join('\n');

      const systemPrompt = `You are generating a brief, insightful reflection based on ${platformContext.name} data.
Write a 2-3 sentence observation that connects this data to personality.
Be warm and specific. Use second person ("Your...").`;

      const userPrompt = `Based on this ${platformContext.name} data, write a brief reflection:

${featureSummary}

What does this reveal about their personality or habits?`;

      const response = await generateChatResponse({
        systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        maxTokens: 150,
        temperature: 0.7
      });

      return {
        title: platformContext.reflectionTitle,
        content: response.content,
        featureCount: features.length,
        generatedAt: new Date().toISOString()
      };

    } catch (error) {
      console.error(`[TwinFormationService] Error generating ${platform} reflection:`, error);
      return {
        title: this.getPlatformContext(platform).reflectionTitle,
        content: this.getFallbackReflection(platform),
        featureCount: features.length,
        error: error.message
      };
    }
  }

  /**
   * Save twin data to database
   */
  async saveTwin(userId, twinData) {
    try {
      // Save to soul_signatures table (using actual schema columns)
      const soulSignature = {
        user_id: userId,
        archetype_name: twinData.archetype.name,
        archetype_subtitle: twinData.archetype.subtitle || twinData.archetype.group || 'Discovering your authentic self',
        narrative: twinData.narrative.content,
        defining_traits: twinData.dominantTraits.map(t => ({
          trait: t.label,
          score: Math.round(t.score),
          evidence: `${t.dimension}: ${t.pole === 'high' ? 'High' : 'Low'} ${t.label}`
        })),
        color_scheme: twinData.archetype.colorScheme || null,
        icon_type: twinData.archetype.iconType || 'default',
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabaseAdmin
        .from('soul_signatures')
        .upsert(soulSignature, { onConflict: 'user_id' })
        .select();

      if (error) throw error;

      // Save reflections
      if (twinData.reflections.length > 0) {
        const reflectionRecords = twinData.reflections.map(r => ({
          user_id: userId,
          platform: r.platform,
          title: r.title,
          content: r.content,
          feature_count: r.featureCount,
          generated_at: r.generatedAt
        }));

        await supabaseAdmin
          .from('reflection_history')
          .upsert(reflectionRecords, { onConflict: 'user_id,platform' });
      }

      // Also update personality_scores table
      await personalityAggregator.savePersonalityScores(
        userId,
        twinData.scores,
        twinData.confidence
      );

      return { success: true, data };

    } catch (error) {
      console.error('[TwinFormationService] Error saving twin:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get complete twin profile for a user
   */
  async getTwin(userId) {
    try {
      const { data: signature, error } = await supabaseAdmin
        .from('soul_signatures')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error || !signature) {
        return { success: false, error: 'Twin not found' };
      }

      // Get reflections
      const { data: reflections } = await supabaseAdmin
        .from('reflection_history')
        .select('*')
        .eq('user_id', userId)
        .order('generated_at', { ascending: false });

      return {
        success: true,
        twin: {
          ...signature,
          reflections: reflections || []
        }
      };

    } catch (error) {
      console.error('[TwinFormationService] Error getting twin:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Helper: Get platform features from database
   */
  async getPlatformFeatures(userId, platform) {
    const { data } = await supabaseAdmin
      .from('behavioral_features')
      .select('*')
      .eq('user_id', userId)
      .eq('platform', platform)
      .order('extracted_at', { ascending: false });

    return data || [];
  }

  /**
   * Helper: Build platform summaries for narrative
   */
  buildPlatformSummaries(profile) {
    const summaries = [];
    const { platforms } = profile.platformCoverage;

    if (platforms.spotify?.connected) {
      const spotifyTraits = this.getTraitsFromPlatform(profile.scores, 'spotify');
      if (spotifyTraits.length > 0) {
        summaries.push(`**Music (Spotify)**: ${spotifyTraits.join(', ')}`);
      }
    }

    if (platforms.whoop?.connected) {
      const whoopTraits = this.getTraitsFromPlatform(profile.scores, 'whoop');
      if (whoopTraits.length > 0) {
        summaries.push(`**Health (Whoop)**: ${whoopTraits.join(', ')}`);
      }
    }

    if (platforms.calendar?.connected) {
      const calendarTraits = this.getTraitsFromPlatform(profile.scores, 'calendar');
      if (calendarTraits.length > 0) {
        summaries.push(`**Schedule (Calendar)**: ${calendarTraits.join(', ')}`);
      }
    }

    return summaries.join('\n') || 'Limited behavioral data available.';
  }

  /**
   * Helper: Get traits from a specific platform
   */
  getTraitsFromPlatform(scores, platform) {
    const traits = [];

    for (const [dimension, data] of Object.entries(scores)) {
      const platformContributors = data.contributors?.filter(c => c.platform === platform) || [];

      for (const contributor of platformContributors) {
        if (contributor.value >= 70) {
          traits.push(`High ${contributor.feature.replace(/_/g, ' ')}`);
        } else if (contributor.value <= 30) {
          traits.push(`Low ${contributor.feature.replace(/_/g, ' ')}`);
        }
      }
    }

    return traits.slice(0, 3); // Limit to top 3
  }

  /**
   * Helper: Build trait summary
   */
  buildTraitSummary(profile) {
    const lines = [];

    for (const [dimension, data] of Object.entries(profile.scores)) {
      const level = data.score >= 70 ? 'High' : data.score <= 30 ? 'Low' : 'Moderate';
      const dimensionLabel = dimension.charAt(0).toUpperCase() + dimension.slice(1);
      lines.push(`- ${dimensionLabel}: ${level} (${Math.round(data.score)}%)`);
    }

    return lines.join('\n');
  }

  /**
   * Helper: Get platform context for reflections
   */
  getPlatformContext(platform) {
    const contexts = {
      spotify: {
        name: 'Spotify',
        reflectionTitle: 'Your Music Soul'
      },
      whoop: {
        name: 'Whoop',
        reflectionTitle: 'Your Body Stories'
      },
      calendar: {
        name: 'Calendar',
        reflectionTitle: 'Your Time Patterns'
      }
    };

    return contexts[platform] || { name: platform, reflectionTitle: `${platform} Insights` };
  }

  /**
   * Helper: Get archetype description
   */
  getArchetypeDescription(code) {
    const descriptions = {
      INTJ: 'Strategic, independent thinkers who see the big picture and drive toward their vision.',
      INTP: 'Analytical innovators who seek to understand the underlying principles of everything.',
      ENTJ: 'Decisive leaders who organize people and resources to achieve ambitious goals.',
      ENTP: 'Quick-witted visionaries who thrive on intellectual challenges and debates.',
      INFJ: 'Insightful idealists driven by their vision to make a meaningful difference.',
      INFP: 'Thoughtful dreamers guided by their values and quest for authenticity.',
      ENFJ: 'Charismatic leaders who inspire others and foster harmony in groups.',
      ENFP: 'Enthusiastic explorers who see possibilities everywhere and connect deeply with others.',
      ISTJ: 'Reliable organizers who value tradition, loyalty, and thorough attention to detail.',
      ISFJ: 'Dedicated protectors who care deeply about others and create stable environments.',
      ESTJ: 'Efficient administrators who bring order and structure to their environments.',
      ESFJ: 'Caring connectors who prioritize harmony and meeting others\' needs.',
      ISTP: 'Practical problem-solvers who excel at understanding how things work.',
      ISFP: 'Gentle artists who live in the moment and express themselves through action.',
      ESTP: 'Energetic thrill-seekers who are pragmatic and action-oriented.',
      ESFP: 'Spontaneous entertainers who bring joy and energy to every situation.'
    };

    return descriptions[code] || 'A unique combination of personality traits.';
  }

  /**
   * Helper: Get archetype motto
   */
  getArchetypeMotto(code) {
    const mottos = {
      INTJ: '"Everything can be improved."',
      INTP: '"Let me understand the logic."',
      ENTJ: '"I lead because I can."',
      ENTP: '"What if we tried something new?"',
      INFJ: '"I see beyond the surface."',
      INFP: '"I follow my heart."',
      ENFJ: '"Together we can do great things."',
      ENFP: '"There\'s always another way."',
      ISTJ: '"Reliability is everything."',
      ISFJ: '"Let me help you."',
      ESTJ: '"Let\'s get this done right."',
      ESFJ: '"Everyone matters."',
      ISTP: '"I\'ll figure it out."',
      ISFP: '"I express who I am."',
      ESTP: '"Just do it."',
      ESFP: '"Life is a celebration."'
    };

    return mottos[code] || '';
  }

  /**
   * Helper: Fallback narrative when AI fails
   */
  getFallbackNarrative(archetype) {
    return `You are ${archetype.name}, belonging to the ${archetype.group} group. ` +
           `${archetype.description} ` +
           `Your unique combination of traits influences how you engage with music, ` +
           `manage your health, and structure your time. As more data becomes available, ` +
           `your soul signature will continue to evolve and reveal deeper patterns.`;
  }

  /**
   * Helper: Fallback reflection when AI fails
   */
  getFallbackReflection(platform) {
    const fallbacks = {
      spotify: 'Your music choices reveal aspects of your emotional world and social preferences.',
      whoop: 'Your health patterns show how you balance activity, recovery, and self-care.',
      calendar: 'Your schedule reflects your priorities and how you structure your life.'
    };

    return fallbacks[platform] || 'This data contributes to understanding your authentic self.';
  }
}

// Export singleton instance
const twinFormationService = new TwinFormationService();
export default twinFormationService;
