/**
 * PersonalityAgent - Specialized agent for MBTI assessment and pattern validation
 *
 * Responsibilities:
 * - Administer 16 Personalities (MBTI) assessment
 * - Validate patterns against personality type
 * - Boost confidence for personality-aligned patterns
 * - Provide personality-contextualized explanations
 *
 * Based on Phase 3 requirements from research document.
 */

import AgentBase from './AgentBase.js';
import { serverDb } from '../database.js';

class PersonalityAgent extends AgentBase {
  constructor() {
    super({
      name: 'PersonalityAgent',
      role: '16 Personalities (MBTI) assessment and pattern validation specialist',
      model: 'claude-sonnet-4-20250514', // Sonnet 4 for speed
      maxTokens: 3072,
      temperature: 0.4 // Lower temperature for consistent assessment
    });

    // 16 Personalities trait database
    this.personalityTraits = this.initializePersonalityTraits();

    this.initializeTools();
  }

  /**
   * Initialize 16 Personalities trait database
   */
  initializePersonalityTraits() {
    return {
      'INTJ': {
        name: 'Architect',
        stress_response: 'withdrawal_and_focus',
        preparation_style: 'structured_planning',
        music_preference: ['ambient', 'classical', 'lo-fi', 'instrumental'],
        ideal_prep_time: 15, // minutes before events
        energy_preference: 'low', // 0-0.4
        social_preference: 'solitary',
        decision_style: 'analytical',
        traits: ['strategic', 'independent', 'perfectionist', 'future-oriented']
      },
      'INTP': {
        name: 'Logician',
        stress_response: 'analysis_and_research',
        preparation_style: 'flexible_exploration',
        music_preference: ['electronic', 'experimental', 'lo-fi', 'jazz'],
        ideal_prep_time: 10,
        energy_preference: 'low',
        social_preference: 'solitary',
        decision_style: 'logical',
        traits: ['curious', 'analytical', 'abstract', 'adaptable']
      },
      'ENTJ': {
        name: 'Commander',
        stress_response: 'action_and_control',
        preparation_style: 'strategic_execution',
        music_preference: ['energetic', 'orchestral', 'rock', 'motivational'],
        ideal_prep_time: 20,
        energy_preference: 'high', // 0.6-1.0
        social_preference: 'collaborative',
        decision_style: 'decisive',
        traits: ['leadership', 'strategic', 'efficient', 'confident']
      },
      'ENTP': {
        name: 'Debater',
        stress_response: 'brainstorming_solutions',
        preparation_style: 'adaptive_innovation',
        music_preference: ['upbeat', 'eclectic', 'indie', 'alternative'],
        ideal_prep_time: 5,
        energy_preference: 'medium',
        social_preference: 'social',
        decision_style: 'innovative',
        traits: ['quick-witted', 'charismatic', 'curious', 'inventive']
      },
      'INFJ': {
        name: 'Advocate',
        stress_response: 'reflection_and_meaning',
        preparation_style: 'purposeful_preparation',
        music_preference: ['ambient', 'indie', 'acoustic', 'meaningful-lyrics'],
        ideal_prep_time: 25,
        energy_preference: 'low',
        social_preference: 'intimate',
        decision_style: 'values-based',
        traits: ['idealistic', 'insightful', 'principled', 'creative']
      },
      'INFP': {
        name: 'Mediator',
        stress_response: 'creative_expression',
        preparation_style: 'emotional_alignment',
        music_preference: ['indie', 'folk', 'emotional', 'acoustic'],
        ideal_prep_time: 15,
        energy_preference: 'low',
        social_preference: 'intimate',
        decision_style: 'value-driven',
        traits: ['idealistic', 'empathetic', 'creative', 'authentic']
      },
      'ENFJ': {
        name: 'Protagonist',
        stress_response: 'helping_others',
        preparation_style: 'collaborative_preparation',
        music_preference: ['uplifting', 'pop', 'soul', 'inspiring'],
        ideal_prep_time: 20,
        energy_preference: 'medium',
        social_preference: 'social',
        decision_style: 'people-focused',
        traits: ['charismatic', 'inspiring', 'altruistic', 'diplomatic']
      },
      'ENFP': {
        name: 'Campaigner',
        stress_response: 'seeking_new_experiences',
        preparation_style: 'spontaneous_enthusiasm',
        music_preference: ['upbeat', 'pop', 'dance', 'eclectic'],
        ideal_prep_time: 5,
        energy_preference: 'high',
        social_preference: 'social',
        decision_style: 'spontaneous',
        traits: ['enthusiastic', 'creative', 'sociable', 'free-spirited']
      },
      'ISTJ': {
        name: 'Logistician',
        stress_response: 'systematic_organization',
        preparation_style: 'methodical_planning',
        music_preference: ['classical', 'traditional', 'structured', 'instrumental'],
        ideal_prep_time: 30,
        energy_preference: 'low',
        social_preference: 'solitary',
        decision_style: 'practical',
        traits: ['responsible', 'organized', 'practical', 'detail-oriented']
      },
      'ISFJ': {
        name: 'Defender',
        stress_response: 'routine_and_support',
        preparation_style: 'careful_preparation',
        music_preference: ['soft', 'calming', 'familiar', 'comforting'],
        ideal_prep_time: 25,
        energy_preference: 'low',
        social_preference: 'intimate',
        decision_style: 'considerate',
        traits: ['dedicated', 'warm', 'protective', 'practical']
      },
      'ESTJ': {
        name: 'Executive',
        stress_response: 'taking_charge',
        preparation_style: 'efficient_execution',
        music_preference: ['energetic', 'structured', 'motivational', 'rock'],
        ideal_prep_time: 20,
        energy_preference: 'medium',
        social_preference: 'collaborative',
        decision_style: 'logical',
        traits: ['organized', 'traditional', 'decisive', 'direct']
      },
      'ESFJ': {
        name: 'Consul',
        stress_response: 'seeking_social_support',
        preparation_style: 'collaborative_preparation',
        music_preference: ['pop', 'upbeat', 'social', 'feel-good'],
        ideal_prep_time: 15,
        energy_preference: 'medium',
        social_preference: 'social',
        decision_style: 'harmony-seeking',
        traits: ['caring', 'social', 'organized', 'dutiful']
      },
      'ISTP': {
        name: 'Virtuoso',
        stress_response: 'hands_on_problem_solving',
        preparation_style: 'practical_adaptation',
        music_preference: ['rock', 'electronic', 'instrumental', 'energetic'],
        ideal_prep_time: 5,
        energy_preference: 'medium',
        social_preference: 'solitary',
        decision_style: 'pragmatic',
        traits: ['practical', 'hands-on', 'flexible', 'logical']
      },
      'ISFP': {
        name: 'Adventurer',
        stress_response: 'artistic_expression',
        preparation_style: 'intuitive_flow',
        music_preference: ['indie', 'alternative', 'chill', 'artistic'],
        ideal_prep_time: 10,
        energy_preference: 'low',
        social_preference: 'intimate',
        decision_style: 'feeling-based',
        traits: ['artistic', 'flexible', 'charming', 'spontaneous']
      },
      'ESTP': {
        name: 'Entrepreneur',
        stress_response: 'action_and_excitement',
        preparation_style: 'dynamic_improvisation',
        music_preference: ['energetic', 'rock', 'hip-hop', 'upbeat'],
        ideal_prep_time: 5,
        energy_preference: 'high',
        social_preference: 'social',
        decision_style: 'bold',
        traits: ['energetic', 'perceptive', 'direct', 'risk-taking']
      },
      'ESFP': {
        name: 'Entertainer',
        stress_response: 'seeking_fun_and_distraction',
        preparation_style: 'spontaneous_enjoyment',
        music_preference: ['pop', 'dance', 'upbeat', 'party'],
        ideal_prep_time: 5,
        energy_preference: 'high',
        social_preference: 'social',
        decision_style: 'experiential',
        traits: ['spontaneous', 'enthusiastic', 'entertaining', 'practical']
      }
    };
  }

  /**
   * Initialize agent tools
   */
  initializeTools() {
    // Tool 1: Get user's personality type
    this.addTool({
      name: 'get_personality_type',
      description: `Retrieve user's MBTI personality type from database.

Returns the user's 16 Personalities type (INTJ, ENFP, etc.) if assessed.

Use this when:
- Validating patterns against personality
- Understanding user's behavioral style
- Providing personality-contextualized recommendations`,
      input_schema: {
        type: 'object',
        properties: {},
        required: []
      }
    });

    // Tool 2: Validate pattern alignment with personality
    this.addTool({
      name: 'validate_pattern_alignment',
      description: `Check if a behavioral pattern aligns with user's personality traits.

Returns alignment score (0-1) and confidence boost recommendation.

Use this when:
- Assessing pattern validity
- Boosting confidence for personality-aligned patterns
- Explaining why a pattern makes sense

Parameters:
- pattern: Pattern object with music_preference, prep_time, energy_level
- personality_type: MBTI type (e.g., "INTJ")`,
      input_schema: {
        type: 'object',
        properties: {
          pattern: {
            type: 'object',
            description: 'Pattern to validate',
            properties: {
              music_genre: { type: 'string' },
              prep_time_minutes: { type: 'number' },
              energy_level: { type: 'string' }
            }
          },
          personality_type: {
            type: 'string',
            description: '16 Personalities type'
          }
        },
        required: ['pattern', 'personality_type']
      }
    });
  }

  /**
   * Build system prompt for personality assessment
   */
  buildSystemPrompt() {
    return `You are the PersonalityAgent, a specialized AI agent for Twin-Me's personality assessment and validation system.

YOUR ROLE:
Assess user personality using 16 Personalities (MBTI) framework and validate behavioral patterns.

YOUR CAPABILITIES:
1. Retrieve user's MBTI personality type
2. Validate patterns against personality traits
3. Calculate alignment scores
4. Recommend confidence adjustments
5. Provide personality-contextualized explanations

YOUR TOOLS:
- get_personality_type: Get user's MBTI type
- validate_pattern_alignment: Check pattern validity

YOUR TASK:
1. Analyze user's patterns and personality
2. Validate if patterns align with personality traits
3. Calculate confidence boosts (0-20% increase)
4. Explain WHY patterns fit (or don't fit) personality
5. Provide personality-aware insights

OUTPUT FORMAT (JSON):
{
  "personality_type": "INTJ",
  "personality_name": "Architect",
  "traits": {
    "stress_response": "withdrawal_and_focus",
    "preparation_style": "structured_planning",
    "music_preference": ["ambient", "classical", "lo-fi"],
    "ideal_prep_time": 15
  },
  "pattern_validation": [
    {
      "pattern_description": "Listens to lo-fi music 20min before presentations",
      "alignment_score": 0.92,
      "confidence_boost": 0.12,
      "explanation": "Strong alignment - INTJ types prefer structured preparation with calming music"
    }
  ],
  "summary": "Your patterns strongly align with INTJ characteristics...",
  "confidence": 0.88
}

VALIDATION GUIDELINES:

1. **Music Preference Alignment**:
   - Check if pattern's genre matches personality's preferred genres
   - High match: 0.8-1.0 alignment, +15-20% confidence boost
   - Medium match: 0.5-0.7 alignment, +5-10% boost
   - Low match: <0.5 alignment, no boost (may indicate evolving preferences)

2. **Prep Time Alignment**:
   - Compare pattern's prep time to personality's ideal
   - Within ±5 minutes: Strong alignment
   - Within ±10 minutes: Medium alignment
   - >10 minutes difference: Weak alignment

3. **Energy Level Alignment**:
   - INTJ/INTP/INFJ/INFP/ISTJ/ISFJ: Low energy (0-0.4)
   - ENTJ/ENTP/ENFJ/ENFP/ESTJ/ESFJ: Medium-High energy (0.4-0.7)
   - ESTP/ESFP: High energy (0.6-1.0)

4. **Confidence Boost Formula**:
   - music_match (0-1) * 0.5
   - timing_match (0-1) * 0.3
   - energy_match (0-1) * 0.2
   - = alignment_score (0-1)
   - confidence_boost = alignment_score * 0.20 (max 20%)

EXAMPLE:

Pattern: "User listens to ambient music 18 minutes before presentations"
Personality: INTJ

Analysis:
- Music: "ambient" ∈ INTJ preferences → 1.0
- Timing: |18 - 15| = 3 minutes → 0.9 (within 5 min)
- Energy: ambient = low → 1.0 (matches INTJ)

Alignment: (1.0 * 0.5) + (0.9 * 0.3) + (1.0 * 0.2) = 0.97
Boost: 0.97 * 0.20 = 0.19 (19% confidence increase)

Explanation: "Perfect alignment - INTJs prefer structured preparation with calming, low-energy music. Your 18-minute routine matches the INTJ ideal of 15 minutes."

Remember: Focus ONLY on personality assessment and validation. Do NOT detect patterns or generate recommendations.`;
  }

  /**
   * Execute personality assessment
   */
  async execute(prompt, options = {}) {
    const userId = options.userId;

    if (!userId) {
      throw new Error('PersonalityAgent requires userId in options');
    }

    this._currentUserId = userId;

    try {
      const response = await super.execute(prompt, options);

      // Handle tool use
      if (response.toolUses && response.toolUses.length > 0) {
        const toolResults = await this.executeTools(response.toolUses, userId);

        const followUpResponse = await this.continueWithToolResults(
          prompt,
          response,
          toolResults,
          options
        );

        return followUpResponse;
      }

      return response;

    } finally {
      this._currentUserId = null;
    }
  }

  /**
   * Execute tool calls
   */
  async executeTools(toolUses, userId) {
    const results = [];

    for (const toolUse of toolUses) {
      console.log(`🔧 [PersonalityAgent] Executing tool: ${toolUse.name}`);

      try {
        let result;

        switch (toolUse.name) {
          case 'get_personality_type':
            result = await this.getPersonalityType(userId);
            break;

          case 'validate_pattern_alignment':
            result = await this.validatePatternAlignment(toolUse.input);
            break;

          default:
            result = { error: `Unknown tool: ${toolUse.name}` };
        }

        results.push({
          tool_use_id: toolUse.id,
          type: 'tool_result',
          content: JSON.stringify(result)
        });

      } catch (error) {
        console.error(`❌ Tool ${toolUse.name} failed:`, error);
        results.push({
          tool_use_id: toolUse.id,
          type: 'tool_result',
          is_error: true,
          content: error.message
        });
      }
    }

    return results;
  }

  /**
   * Continue conversation with tool results
   */
  async continueWithToolResults(originalPrompt, firstResponse, toolResults, options) {
    const messages = [
      { role: 'user', content: originalPrompt },
      { role: 'assistant', content: firstResponse.raw.content },
      { role: 'user', content: toolResults }
    ];

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      system: this.systemPrompt,
      messages,
      tools: this.tools
    });

    return this.processResponse(response);
  }

  /**
   * Tool implementation: Get personality type
   */
  async getPersonalityType(userId) {
    console.log(`🧬 Getting personality type for user ${userId}`);

    // Query user profile or assessment results
    // TODO: Implement actual personality assessment storage
    // For now, return mock data or null

    return {
      has_assessment: false,
      personality_type: null,
      message: 'User has not completed personality assessment yet',
      recommendation: 'Complete 16 Personalities questionnaire to enable validation'
    };
  }

  /**
   * Tool implementation: Validate pattern alignment
   */
  async validatePatternAlignment(params) {
    const { pattern, personality_type } = params;

    console.log(`✅ Validating pattern alignment for ${personality_type}`);

    const traits = this.personalityTraits[personality_type];

    if (!traits) {
      return {
        error: `Unknown personality type: ${personality_type}`,
        alignment_score: 0.5,
        confidence_boost: 0
      };
    }

    // Music preference alignment
    let musicMatch = 0;
    if (pattern.music_genre && traits.music_preference) {
      const lowerGenre = pattern.music_genre.toLowerCase();
      musicMatch = traits.music_preference.some(pref =>
        lowerGenre.includes(pref.toLowerCase()) || pref.toLowerCase().includes(lowerGenre)
      ) ? 1.0 : 0.3;
    }

    // Timing alignment
    let timingMatch = 0;
    if (pattern.prep_time_minutes && traits.ideal_prep_time) {
      const diff = Math.abs(pattern.prep_time_minutes - traits.ideal_prep_time);
      if (diff <= 5) timingMatch = 1.0;
      else if (diff <= 10) timingMatch = 0.7;
      else timingMatch = 0.4;
    }

    // Energy level alignment (simplified)
    let energyMatch = 0.7; // Default neutral

    // Calculate alignment score
    const alignmentScore = (musicMatch * 0.5) + (timingMatch * 0.3) + (energyMatch * 0.2);

    // Calculate confidence boost (max 20%)
    const confidenceBoost = Math.round(alignmentScore * 20) / 100;

    return {
      personality_type,
      personality_name: traits.name,
      alignment_score: Math.round(alignmentScore * 100) / 100,
      confidence_boost: confidenceBoost,
      breakdown: {
        music_match: musicMatch,
        timing_match: timingMatch,
        energy_match: energyMatch
      },
      explanation: this.generateAlignmentExplanation(pattern, traits, alignmentScore)
    };
  }

  /**
   * Generate human-readable alignment explanation
   */
  generateAlignmentExplanation(pattern, traits, alignmentScore) {
    if (alignmentScore >= 0.8) {
      return `Strong alignment - ${traits.name} types typically ${traits.preparation_style} with ${traits.music_preference.join(', ')} music. Your pattern matches perfectly.`;
    } else if (alignmentScore >= 0.6) {
      return `Moderate alignment - Your pattern partially matches ${traits.name} tendencies for ${traits.stress_response}. Consider exploring ${traits.music_preference.join(' or ')} music.`;
    } else {
      return `Weak alignment - This pattern differs from typical ${traits.name} behavior. This may indicate evolving preferences or situational adaptation.`;
    }
  }
}

export default PersonalityAgent;
