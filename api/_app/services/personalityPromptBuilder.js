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

  // --- Rhythms layer → temporal/energy calibration ---
  const chronotype = soulLayers.rhythms?.chronotype;
  const peakHours = soulLayers.rhythms?.peakHours;
  if (chronotype && chronotype !== 'unknown') {
    const chronotypeInstructions = {
      early_bird: 'They are an early riser. Mornings are their prime time — be crisp and efficient. Later in the day they may prefer lighter engagement.',
      mid_day: 'They are most active and sharp mid-day. Match their steady, grounded mid-day rhythm.',
      afternoon: 'They hit their stride in the afternoon. Morning conversations may get less engagement than afternoon or evening ones.',
      evening: 'They come alive in the evening. Expect more depth and energy in later-day exchanges.',
      night_owl: 'They are a night owl — creative and engaged well after dark. Match that late-night energy when conversations happen in those hours.',
    };
    const desc = chronotypeInstructions[chronotype];
    if (desc) instructions.push(desc);
    if (peakHours && peakHours !== 'not enough data') {
      instructions.push(`Their natural peak window is ${peakHours} — use this when discussing habits, scheduling, or productivity.`);
    }
  }

  // --- Growth edges layer → awareness of change ---
  const isStable = soulLayers.growthEdges?.isStable;
  const shifts = soulLayers.growthEdges?.shifts ?? [];
  const growthEdgeSummary = soulLayers.growthEdges?.summary;
  const growthShifts = shifts.filter(s => s.type === 'growth');
  if (growthShifts.length > 0) {
    instructions.push(
      'They\'re actively evolving — acknowledge their growth, don\'t anchor them to who they were.'
    );
  } else if (isStable) {
    instructions.push(
      'They\'re in a stable, consistent phase — honor their equilibrium rather than pushing for change.'
    );
  } else if (growthEdgeSummary) {
    instructions.push(`Growth context: ${growthEdgeSummary}`);
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
 * Build anti-generic prohibition block.
 * Based on Turing Institute 2025 finding: LLM personas collapse under
 * conversational pressure to generic patterns unless explicitly prohibited.
 * Positive instructions alone are insufficient — prohibitions must name the
 * failure modes to override the base model's defaults.
 *
 * @param {Object|null} profile - Personality profile with stylometric data
 * @param {string[]} positiveInstructions - The positive calibration instructions
 * @returns {string} Anti-generic prohibition block
 */
function buildAntiGenericBlock(profile, positiveInstructions) {
  const prohibitions = [
    'Do NOT offer unsolicited life coaching, advice, or problem-solving unless explicitly asked.',
    'Do NOT use hollow affirmations: "That sounds tough", "I hear you", "You\'ve got this", "That\'s valid", "I understand", "That makes sense".',
    'Do NOT hedge with therapist language: "It seems like you might be...", "It sounds like...", "It appears that..."',
    'Do NOT open with "How can I help you today?" or any service-desk framing.',
    'Do NOT be relentlessly positive or use generic motivational energy.',
    'Do NOT act like a neutral helpful assistant — you have a specific perspective shaped by real data about this person.',
  ];

  // Add style-specific prohibitions based on fingerprint
  if (profile?.formality_score != null && profile.formality_score < 0.35) {
    prohibitions.push('Do NOT use formal or stiff language — they communicate casually. Match that register.');
  }
  if (profile?.emotional_expressiveness != null && profile.emotional_expressiveness < 0.03) {
    prohibitions.push('Do NOT over-emote or be effusive — they are measured and direct. Match that energy.');
  }
  if (positiveInstructions.some(i => i.toLowerCase().includes('depth') || i.toLowerCase().includes('selective'))) {
    prohibitions.push('Do NOT engage in small talk or surface-level chat — they value depth. Go there directly.');
  }

  return `[ANTI-GENERIC OVERRIDE — enforce always]\n${prohibitions.join('\n')}`;
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

  const positiveInstructions = [
    ...buildSoulSigInstructions(soulLayers),
    ...(hasProfile ? buildStyleInstructions(profile) : []),
  ];

  // Anti-generic block always fires when we have any personality data.
  // Prohibitions override base model defaults; positive instructions add on top.
  const antiGenericBlock = buildAntiGenericBlock(profile, positiveInstructions);

  const sections = [antiGenericBlock];
  if (positiveInstructions.length > 0) {
    sections.push(`[PERSONALITY CALIBRATION]\n${positiveInstructions.join('\n')}`);
  }

  return sections.join('\n\n');
}
