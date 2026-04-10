/**
 * personalityPromptBuilder.js
 *
 * Translates soul signature layers + stylometric fingerprint into natural language
 * behavioral instructions for the twin's system prompt. Pure function, zero LLM cost.
 */

/**
 * Build soul-signature-layer-based behavioral instruction strings.
 * Maps the 5 layers (values, rhythms, taste, connections, growthEdges) to
 * concrete behavioral calibrations for the twin's voice.
 *
 * @param {Object|null} soulLayers - Soul signature layers object
 * @returns {string[]} Array of instruction strings
 */
function buildSoulSigInstructions(soulLayers) {
  if (!soulLayers) return [];

  const instructions = [];

  // --- Values layer → communication priorities ---
  const values = soulLayers.values?.values ?? [];
  const topValues = values.filter(v => (v.strength ?? 0) >= 0.65).map(v => v.name);

  if (topValues.includes('Curiosity') || topValues.includes('Stimulation')) {
    instructions.push(
      'Be intellectually curious and exploratory. Offer unexpected angles and connections between ideas.'
    );
  }
  if (topValues.includes('Achievement') || topValues.includes('Power')) {
    instructions.push(
      'Be direct and results-focused. They value clear, actionable thinking — skip filler.'
    );
  }
  if (topValues.includes('Benevolence') || topValues.includes('Universalism')) {
    instructions.push(
      'Lead with warmth and genuine care. Acknowledge feelings before jumping to solutions.'
    );
  }
  if (topValues.includes('Security') || topValues.includes('Conformity')) {
    instructions.push(
      'Be reliable and grounded. Avoid unnecessary risk-taking in tone or suggestions.'
    );
  }
  if (topValues.includes('Creativity') || topValues.includes('Self-Direction') || topValues.includes('Freedom')) {
    instructions.push(
      'Be open-ended and non-prescriptive. They dislike being boxed in — offer possibilities, not mandates.'
    );
  }

  // --- Taste layer → aesthetic calibration ---
  const tasteStatement = soulLayers.taste?.statement;
  const diversity = soulLayers.taste?.diversity ?? 0.5;
  if (tasteStatement) {
    instructions.push(
      `Match their aesthetic sensibility: ${tasteStatement}`
    );
  } else if (diversity > 0.7) {
    instructions.push('Their taste is eclectic — embrace range and avoid clichés.');
  } else if (diversity < 0.3) {
    instructions.push('Their taste runs deep in specific areas — lean into those spaces.');
  }

  // --- Connections layer → social calibration ---
  const connectionStyle = soulLayers.connections?.style;
  if (connectionStyle === 'social_butterfly' || connectionStyle === 'community_builder') {
    instructions.push(
      'They thrive on connection — be warm, enthusiastic, and willing to range across topics.'
    );
  } else if (connectionStyle === 'lone_wolf') {
    instructions.push(
      'They value space and independence — be present without being needy. Don\'t over-share.'
    );
  } else if (connectionStyle === 'selective_engager' || connectionStyle === 'deep_connector') {
    instructions.push(
      'They prefer depth over breadth — go deep on what matters, skip small talk.'
    );
  }

  // --- Growth edges layer → awareness of change ---
  const isStable = soulLayers.growthEdges?.isStable;
  const shifts = soulLayers.growthEdges?.shifts ?? [];
  const growthShifts = shifts.filter(s => s.type === 'growth');
  if (growthShifts.length > 0) {
    instructions.push(
      `They\'re actively evolving — acknowledge their growth, don\'t anchor them to who they were.`
    );
  } else if (isStable) {
    instructions.push(
      'They\'re in a stable, consistent phase — honor their equilibrium rather than pushing for change.'
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
 * Translates soul signature layers + stylometric fingerprint into a natural language
 * personality calibration block for injection into the twin system prompt.
 *
 * @param {Object|null} profile - Personality profile (stylometrics + confidence)
 * @param {Object|null} soulLayers - Soul signature layers (values, rhythms, taste, connections, growthEdges)
 * @returns {string} Formatted personality calibration block, or empty string
 */
export function buildPersonalityPrompt(profile, soulLayers) {
  const hasSoulLayers = soulLayers && Object.keys(soulLayers).length > 0;
  const hasProfile = profile && (profile.confidence ?? 0) >= 0.2;

  if (!hasSoulLayers && !hasProfile) {
    return '';
  }

  const instructions = [
    ...buildSoulSigInstructions(soulLayers),
    ...(hasProfile ? buildStyleInstructions(profile) : []),
  ];

  if (instructions.length === 0) {
    return '';
  }

  return `[PERSONALITY CALIBRATION]\n${instructions.join('\n')}`;
}
