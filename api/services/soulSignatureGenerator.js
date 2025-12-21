/**
 * Soul Signature Generator Service
 *
 * Uses Claude AI to generate unique personality archetypes and narratives
 * based on Big Five personality scores and behavioral features.
 *
 * Creates personalized "Soul Signatures" like:
 * - "The Curious Introvert" - Someone high in Openness but low in Extraversion
 * - "The Disciplined Explorer" - High Conscientiousness + High Openness
 * - "The Social Harmonizer" - High Extraversion + High Agreeableness
 *
 * Each signature includes:
 * - Unique archetype name
 * - Subtitle describing key traits
 * - Personal narrative (2-3 paragraphs)
 * - Defining traits with evidence
 * - Color scheme for visualization
 */

import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from './database.js';
import personalityAnalyzerService from './personalityAnalyzerService.js';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

class SoulSignatureGenerator {
  constructor() {
    this.MODEL = 'claude-sonnet-4-5-20250929';
  }

  /**
   * Generate complete soul signature for a user
   */
  async generateSoulSignature(userId, options = {}) {
    console.log(`✨ [Soul Signature] Generating soul signature for user ${userId}`);

    try {
      // 1. Get or calculate personality scores
      let { data: personalityScores, error: scoresError } = await supabaseAdmin
        .from('personality_scores')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (scoresError && scoresError.code === 'PGRST116') {
        // No scores exist, run personality analysis first
        console.log('📊 [Soul Signature] No personality scores found, running analysis...');
        const analysisResult = await personalityAnalyzerService.analyzePersonality(userId);

        if (!analysisResult.success) {
          return {
            success: false,
            error: analysisResult.error
          };
        }

        personalityScores = analysisResult.personalityScores;
      } else if (scoresError) {
        throw scoresError;
      }

      // 2. Get behavioral features for context
      const { data: features, error: featuresError } = await supabaseAdmin
        .from('behavioral_features')
        .select('*')
        .eq('user_id', userId);

      if (featuresError) throw featuresError;

      // 3. Get unique patterns if they exist
      const { data: patterns } = await supabaseAdmin
        .from('unique_patterns')
        .select('*')
        .eq('user_id', userId)
        .eq('is_defining', true)
        .limit(5);

      // 4. Generate archetype with Claude
      const archetype = await this.generateArchetypeWithClaude(
        personalityScores,
        features || [],
        patterns || []
      );

      // 5. Generate color scheme based on personality
      const colorScheme = this.generateColorScheme(personalityScores);

      // 6. Prepare soul signature object
      const soulSignature = {
        user_id: userId,
        archetype_name: archetype.name,
        archetype_subtitle: archetype.subtitle,
        narrative: archetype.narrative,
        defining_traits: archetype.definingTraits,
        personality_score_id: personalityScores.id,
        color_scheme: colorScheme,
        icon_type: this.selectIconType(personalityScores),
        is_public: false,
        reveal_level: 50
      };

      // 7. Save to database
      const { data: saved, error: saveError } = await supabaseAdmin
        .from('soul_signatures')
        .upsert(soulSignature, {
          onConflict: 'user_id'
        })
        .select()
        .single();

      if (saveError) throw saveError;

      console.log(`✅ [Soul Signature] Generated: "${saved.archetype_name}"`);

      return {
        success: true,
        soulSignature: saved,
        personalityScores
      };

    } catch (error) {
      console.error('❌ [Soul Signature] Error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate archetype using Claude AI
   */
  async generateArchetypeWithClaude(personalityScores, features, patterns) {
    console.log(`🤖 [Soul Signature] Generating archetype with Claude AI...`);

    const featureSummary = features.slice(0, 10).map(f => ({
      platform: f.platform,
      feature: f.feature_type,
      value: f.feature_value
    }));

    const patternSummary = patterns.map(p => ({
      name: p.pattern_name,
      description: p.description,
      uniqueness: p.uniqueness_score
    }));

    const prompt = `You are a creative writer and personality expert creating a unique "Soul Signature" for someone based on their personality profile and behavioral patterns.

PERSONALITY SCORES (Big Five, 0-100 scale):
- Openness: ${personalityScores.openness}% (${this.getLevel(personalityScores.openness)})
- Conscientiousness: ${personalityScores.conscientiousness}% (${this.getLevel(personalityScores.conscientiousness)})
- Extraversion: ${personalityScores.extraversion}% (${this.getLevel(personalityScores.extraversion)})
- Agreeableness: ${personalityScores.agreeableness}% (${this.getLevel(personalityScores.agreeableness)})
- Neuroticism: ${personalityScores.neuroticism}% (${this.getLevel(personalityScores.neuroticism)})

BEHAVIORAL FEATURES:
${JSON.stringify(featureSummary, null, 2)}

${patterns.length > 0 ? `UNIQUE PATTERNS (what makes this person distinctive):
${JSON.stringify(patternSummary, null, 2)}` : ''}

YOUR TASK:
Create a unique, memorable Soul Signature archetype that captures this person's authentic personality.

Requirements:
1. ARCHETYPE NAME: A 2-4 word poetic title (e.g., "The Curious Wanderer", "The Quiet Architect", "The Joyful Strategist")
   - Must be UNIQUE and MEMORABLE
   - Should NOT be generic (no "The Creative Type" or "The Leader")
   - Should combine contrasting or complementary traits when possible

2. SUBTITLE: A brief phrase expanding on the archetype (e.g., "Who finds wonder in patterns and peace in discovery")

3. NARRATIVE: 2-3 paragraphs written in second person ("You are...") that:
   - Feels deeply personal and validating
   - Describes how they experience the world
   - Highlights their unique combination of traits
   - Mentions specific behavioral patterns if available
   - Celebrates their authentic self without judgment

4. DEFINING TRAITS: 3-5 key traits with evidence from their data

Respond ONLY with JSON in this exact format (no markdown):
{
  "name": "The [Archetype Name]",
  "subtitle": "[Poetic subtitle]",
  "narrative": "[2-3 paragraphs of personal narrative]",
  "definingTraits": [
    {
      "trait": "[Trait name]",
      "score": [0-100],
      "evidence": "[How this shows in their behavior]"
    }
  ]
}`;

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
      console.log(`📝 [Soul Signature] Claude generated archetype`);

      // Strip markdown code blocks if present
      if (responseText.startsWith('```')) {
        responseText = responseText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
      }

      const archetype = JSON.parse(responseText);

      return {
        name: archetype.name,
        subtitle: archetype.subtitle,
        narrative: archetype.narrative,
        definingTraits: archetype.definingTraits
      };

    } catch (error) {
      console.error('⚠️ [Soul Signature] Claude generation failed:', error);

      // Fallback archetype generation
      return this.generateFallbackArchetype(personalityScores);
    }
  }

  /**
   * Generate fallback archetype without AI
   */
  generateFallbackArchetype(scores) {
    // Find dominant traits
    const traits = [
      { name: 'openness', score: scores.openness, label: 'Creative' },
      { name: 'conscientiousness', score: scores.conscientiousness, label: 'Disciplined' },
      { name: 'extraversion', score: scores.extraversion, label: 'Social' },
      { name: 'agreeableness', score: scores.agreeableness, label: 'Empathetic' },
      { name: 'neuroticism', score: scores.neuroticism, label: 'Sensitive' }
    ];

    // Sort by score to find dominant traits
    const sorted = traits.sort((a, b) => b.score - a.score);
    const primary = sorted[0];
    const secondary = sorted[1];

    // Introvert/Extravert modifier
    const socialStyle = scores.extraversion > 50 ? 'Outgoing' : 'Reflective';

    return {
      name: `The ${socialStyle} ${primary.label}`,
      subtitle: `With ${secondary.label.toLowerCase()} tendencies`,
      narrative: `You are someone who leads with ${primary.label.toLowerCase()} energy. Your ${primary.name} shapes how you interact with the world, while your ${secondary.label.toLowerCase()} nature adds depth to your character. This unique combination makes you authentically you.`,
      definingTraits: [
        {
          trait: primary.label,
          score: primary.score,
          evidence: `Your ${primary.name} score of ${primary.score}% indicates this is a core part of who you are.`
        },
        {
          trait: secondary.label,
          score: secondary.score,
          evidence: `Your ${secondary.name} score of ${secondary.score}% shows this as a secondary defining characteristic.`
        }
      ]
    };
  }

  /**
   * Generate color scheme based on personality
   */
  generateColorScheme(scores) {
    // Map personality dimensions to color hues
    // Openness → Purple/Violet (creative)
    // Conscientiousness → Blue (structured)
    // Extraversion → Yellow/Orange (energetic)
    // Agreeableness → Green (harmonious)
    // Neuroticism → Teal (depth)

    const hues = {
      openness: { h: 270, s: 70, l: 60 },        // Purple
      conscientiousness: { h: 210, s: 80, l: 50 }, // Blue
      extraversion: { h: 40, s: 90, l: 55 },      // Orange
      agreeableness: { h: 150, s: 60, l: 45 },    // Green
      neuroticism: { h: 180, s: 50, l: 40 }       // Teal
    };

    // Find top 2 traits for color blend
    const traits = Object.entries({
      openness: scores.openness,
      conscientiousness: scores.conscientiousness,
      extraversion: scores.extraversion,
      agreeableness: scores.agreeableness,
      neuroticism: scores.neuroticism
    }).sort((a, b) => b[1] - a[1]);

    const primary = hues[traits[0][0]];
    const secondary = hues[traits[1][0]];

    return {
      primary: `hsl(${primary.h}, ${primary.s}%, ${primary.l}%)`,
      secondary: `hsl(${secondary.h}, ${secondary.s}%, ${secondary.l}%)`,
      accent: `hsl(${(primary.h + secondary.h) / 2}, 70%, 50%)`,
      background: `hsl(${primary.h}, 15%, 95%)`,
      text: `hsl(${primary.h}, 30%, 20%)`
    };
  }

  /**
   * Select icon type based on dominant personality traits
   */
  selectIconType(scores) {
    const dominant = Object.entries({
      openness: scores.openness,
      conscientiousness: scores.conscientiousness,
      extraversion: scores.extraversion,
      agreeableness: scores.agreeableness,
      neuroticism: scores.neuroticism
    }).sort((a, b) => b[1] - a[1])[0][0];

    const icons = {
      openness: 'compass',         // Explorer/Creative
      conscientiousness: 'target', // Organized/Goal-oriented
      extraversion: 'sun',         // Energetic/Social
      agreeableness: 'heart',      // Caring/Harmonious
      neuroticism: 'wave'          // Deep/Sensitive
    };

    return icons[dominant] || 'star';
  }

  /**
   * Get level label for a score
   */
  getLevel(score) {
    if (score >= 75) return 'very high';
    if (score >= 60) return 'high';
    if (score >= 40) return 'moderate';
    if (score >= 25) return 'low';
    return 'very low';
  }

  /**
   * Regenerate soul signature with fresh AI generation
   */
  async regenerateSoulSignature(userId) {
    console.log(`🔄 [Soul Signature] Regenerating for user ${userId}`);

    // Delete existing signature
    await supabaseAdmin
      .from('soul_signatures')
      .delete()
      .eq('user_id', userId);

    // Generate new one
    return this.generateSoulSignature(userId, { forceRefresh: true });
  }
}

// Export singleton instance
const soulSignatureGenerator = new SoulSignatureGenerator();
export default soulSignatureGenerator;
