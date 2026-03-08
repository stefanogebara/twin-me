/**
 * personalityPromptBuilder.js
 *
 * Translates OCEAN Big Five scores + stylometric fingerprint into natural language
 * behavioral instructions for the twin's system prompt. Pure function, zero LLM cost.
 */

const HIGH = 0.65;
const LOW = 0.35;

/**
 * Build OCEAN-based behavioral instruction strings.
 * Only emits instructions for traits with notably high or low scores.
 *
 * @param {Object} profile - Personality profile
 * @returns {string[]} Array of instruction strings
 */
function buildOceanInstructions(profile) {
  const instructions = [];

  const { openness, conscientiousness, extraversion, agreeableness, neuroticism } = profile;

  if (openness > HIGH) {
    instructions.push(
      "Be creative and exploratory in your responses. Offer unusual perspectives and make unexpected connections between ideas."
    );
  } else if (openness < LOW) {
    instructions.push(
      "Be practical and concrete. Stick to what's directly relevant and avoid abstract tangents."
    );
  }

  if (conscientiousness > HIGH) {
    instructions.push(
      "Be precise and organized in your responses. Use structured thinking and clear, actionable advice."
    );
  } else if (conscientiousness < LOW) {
    instructions.push(
      "Keep things casual and flexible. Don't over-structure your responses or give rigid plans."
    );
  }

  if (extraversion > HIGH) {
    instructions.push(
      "Be energetic and enthusiastic. Use varied vocabulary, explore multiple angles, and don't hold back."
    );
  } else if (extraversion < LOW) {
    instructions.push(
      "Be measured and thoughtful. Give space for reflection. Don't overwhelm with energy."
    );
  }

  if (agreeableness > HIGH) {
    instructions.push(
      "Be warm and supportive. Validate feelings before offering alternatives. Use a collaborative tone."
    );
  } else if (agreeableness < LOW) {
    instructions.push(
      "Be direct and straightforward. Don't sugarcoat. They appreciate honest, no-BS communication."
    );
  }

  if (neuroticism > HIGH) {
    instructions.push(
      "Be emotionally attuned and validating. Acknowledge complexity in feelings. Show you understand nuance."
    );
  } else if (neuroticism < LOW) {
    instructions.push(
      "Be steady and grounded. Don't over-dramatize or catastrophize. Keep an even keel."
    );
  }

  return instructions;
}

/**
 * Build stylometric instruction strings from writing fingerprint data.
 *
 * @param {Object} profile - Personality profile
 * @returns {string[]} Array of instruction strings
 */
function buildStyleInstructions(profile) {
  const instructions = [];

  const { avg_sentence_length, formality_score, emotional_expressiveness, humor_markers } = profile;

  if (avg_sentence_length != null) {
    let lengthLabel;
    if (avg_sentence_length < 10) {
      lengthLabel = 'short';
    } else if (avg_sentence_length > 20) {
      lengthLabel = 'long';
    } else {
      lengthLabel = 'medium';
    }
    instructions.push(`Match their writing style — they tend to use ${lengthLabel} sentences.`);
  }

  if (formality_score != null) {
    if (formality_score > 0.6) {
      instructions.push("Match their somewhat formal communication style.");
    } else if (formality_score < 0.3) {
      instructions.push("Match their casual, informal tone.");
    }
  }

  if (emotional_expressiveness != null && emotional_expressiveness > 0.05) {
    instructions.push(
      "They're expressive — match their energy with exclamations and emphasis when appropriate."
    );
  }

  if (humor_markers != null && humor_markers > 0.02) {
    instructions.push("They appreciate humor — weave in wit naturally.");
  }

  return instructions;
}

/**
 * Translates an OCEAN Big Five profile + stylometric fingerprint into a natural language
 * personality calibration block for injection into the twin system prompt.
 *
 * @param {Object|null} profile - Personality profile object with fields:
 *   openness, conscientiousness, extraversion, agreeableness, neuroticism,
 *   avg_sentence_length, vocabulary_richness, formality_score,
 *   emotional_expressiveness, humor_markers, confidence
 * @returns {string} Formatted personality calibration block, or empty string if profile
 *   is null or confidence is below 0.2
 */
export function buildPersonalityPrompt(profile) {
  if (!profile || profile.confidence < 0.2) {
    return '';
  }

  const instructions = [
    ...buildOceanInstructions(profile),
    ...buildStyleInstructions(profile),
  ];

  if (instructions.length === 0) {
    return '';
  }

  return `[PERSONALITY CALIBRATION]\n${instructions.join('\n')}`;
}
