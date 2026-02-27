/**
 * Persona Block Builder
 *
 * Pure function service (deterministic, no LLM calls, no async).
 * Translates personality data into prescriptive behavioral rules for the LLM.
 *
 * Problem: Twin summary says "This person is introverted" (descriptive, 3rd person)
 * but never tells the LLM "Go deep on single topics, be reflective over reactive".
 *
 * This module bridges that gap by converting personality scores, soul signature,
 * and platform data into specific behavioral directives.
 */

const MAX_PERSONA_BLOCK_CHARS = 2000;

/**
 * Build the complete persona block from all available personality data.
 *
 * @param {object} params
 * @param {object|null} params.personalityScores - Big Five scores + confidence
 * @param {object|null} params.soulSignature - Soul signature (archetype, traits, narrative)
 * @param {string|null} params.twinSummary - Dynamic twin summary text
 * @param {object|null} params.writingProfile - Writing style analysis
 * @param {object|null} params.platformData - Live platform data (spotify, calendar, whoop)
 * @returns {string} Persona block text, or empty string if no meaningful data
 */
export function buildPersonaBlock({ personalityScores = null, soulSignature = null, twinSummary = null, writingProfile = null, platformData = null } = {}) {
  const sections = [];

  const identity = buildIdentityStatement(twinSummary, soulSignature);
  if (identity) sections.push(identity);

  const styleRules = buildCommunicationStyleRules(personalityScores, writingProfile);
  const unique = buildUniqueRules(personalityScores, soulSignature, writingProfile);

  if (styleRules && unique) {
    sections.push(styleRules + ' ' + unique);
  } else if (styleRules) {
    sections.push(styleRules);
  } else if (unique) {
    sections.push(`How I communicate: ${unique}`);
  }

  const emotional = buildEmotionalState(platformData);
  if (emotional) sections.push(emotional);

  if (sections.length === 0) return '';

  let block = `MY PERSONA (who I am and how I communicate):\n${sections.join('\n')}`;

  if (block.length > MAX_PERSONA_BLOCK_CHARS) {
    block = block.substring(0, MAX_PERSONA_BLOCK_CHARS - 3) + '...';
  }

  return block;
}

/**
 * Convert twin summary from 3rd person descriptive to 1st person identity.
 * Falls back to soul signature archetype + narrative snippet.
 *
 * @param {string|null} twinSummary
 * @param {object|null} soulSignature
 * @returns {string}
 */
export function buildIdentityStatement(twinSummary, soulSignature) {
  if (twinSummary) {
    let converted = convertToFirstPerson(twinSummary);
    converted = truncateAtSentence(converted, 300);
    if (converted) return `How I am: ${converted}`;
  }

  if (soulSignature) {
    const archetype = soulSignature.archetype_name || soulSignature.title || '';
    const narrative = soulSignature.narrative || '';
    const subtitle = soulSignature.archetype_subtitle || soulSignature.subtitle || '';

    if (archetype || narrative) {
      const parts = [];
      if (archetype) parts.push(`I am "${archetype}"${subtitle ? ` - ${subtitle}` : ''}.`);
      if (narrative) parts.push(truncateAtSentence(narrative, 200));
      return `How I am: ${parts.join(' ')}`;
    }
  }

  return '';
}

/**
 * Translate Big Five personality scores into prescriptive communication rules.
 * Only includes traits with confidence > 40%.
 * Writing profile overrides when available.
 *
 * @param {object|null} personalityScores
 * @param {object|null} writingProfile
 * @returns {string}
 */
export function buildCommunicationStyleRules(personalityScores, writingProfile) {
  const rules = [];

  if (personalityScores) {
    const p = personalityScores;

    // Openness
    if (hasConfidence(p, 'openness')) {
      if (p.openness >= 70) {
        rules.push('Explore tangents freely, use metaphors, ask "what if" questions');
      } else if (p.openness <= 35) {
        rules.push('Stay concrete and factual, avoid abstract tangents');
      }
    }

    // Conscientiousness
    if (hasConfidence(p, 'conscientiousness')) {
      if (p.conscientiousness >= 70) {
        rules.push('I appreciate plans and follow-through — reference them');
      } else if (p.conscientiousness <= 35) {
        rules.push('Keep it loose — topic-jumping is fine');
      }
    }

    // Extraversion
    if (hasConfidence(p, 'extraversion')) {
      if (p.extraversion >= 70) {
        rules.push('Be enthusiastic and expressive, high energy');
      } else if (p.extraversion <= 35) {
        rules.push('Go deep rather than wide, think before reacting');
      }
    }

    // Agreeableness
    if (hasConfidence(p, 'agreeableness')) {
      if (p.agreeableness >= 70) {
        rules.push('Lead with warmth, soften any criticism');
      } else if (p.agreeableness <= 35) {
        rules.push('Be direct and honest, no sugarcoating');
      }
    }

    // Neuroticism
    if (hasConfidence(p, 'neuroticism')) {
      if (p.neuroticism >= 70) {
        rules.push("Let things land — don't rush to fix");
      } else if (p.neuroticism <= 35) {
        rules.push('Stay calm and steady, even-keeled tone');
      }
    }
  }

  // Writing profile overrides add specificity
  if (writingProfile) {
    if (writingProfile.communicationStyle === 'casual') {
      rules.push('Keep it casual - slang ok, no formal language');
    } else if (writingProfile.communicationStyle === 'formal') {
      rules.push('Maintain a more polished, articulate tone');
    }

    if (writingProfile.messageLength === 'brief') {
      rules.push('Keep responses short and punchy');
    } else if (writingProfile.messageLength === 'detailed') {
      rules.push('Give thorough, detailed responses');
    }

    if (writingProfile.usesEmojis) {
      rules.push('Use emojis naturally in responses');
    }

    if (writingProfile.personalityIndicators?.assertiveness > 0.7) {
      rules.push('State opinions confidently, take clear positions');
    }
  }

  if (rules.length === 0) return '';

  return `How I communicate: ${rules.join('. ')}.`;
}

/**
 * Derive emotional state from cross-referencing platform data.
 * Whoop recovery + calendar density + music mood.
 *
 * @param {object|null} platformData
 * @returns {string}
 */
export function buildEmotionalState(platformData) {
  if (!platformData) return '';

  const whoop = platformData.whoop;
  const calendar = platformData.calendar;

  // Need at least one signal
  if (!whoop && !calendar) return '';

  const recovery = whoop?.recovery;
  const eventCount = calendar?.todayEvents?.length || 0;
  const hasHighStress = eventCount >= 4;
  const hasFreeDay = eventCount <= 1;
  const hasLowEnergy = recovery !== null && recovery !== undefined && recovery < 50;
  const hasHighEnergy = recovery !== null && recovery !== undefined && recovery >= 67;

  let directive = '';

  if (hasLowEnergy && hasHighStress) {
    directive = 'Be gentle and keep things light - low energy with a packed schedule today';
  } else if (hasHighEnergy && hasFreeDay) {
    directive = 'Deeper conversations welcome - high energy and free time today';
  } else if (hasLowEnergy && hasFreeDay) {
    directive = 'Be mellow and reflective - low energy but no pressure today';
  } else if (hasHighEnergy && hasHighStress) {
    directive = 'Be efficient but add humor - high energy powering through a busy day';
  } else if (hasLowEnergy) {
    directive = 'Take it easy - energy is low today';
  } else if (hasHighStress) {
    directive = 'Be supportive - it\'s a busy day';
  }

  if (!directive) return '';

  return `Right now: ${directive}.`;
}

/**
 * Generate 2-3 distinctive behavioral rules from personality combinations.
 *
 * @param {object|null} personalityScores
 * @param {object|null} soulSignature
 * @param {object|null} writingProfile
 * @returns {string}
 */
export function buildUniqueRules(personalityScores, soulSignature, writingProfile) {
  const rules = [];

  if (personalityScores) {
    const p = personalityScores;

    // Humor style
    if (p.openness >= 65 && p.agreeableness <= 40) {
      rules.push('Use dry wit and irony');
    } else if (p.openness >= 65 && p.agreeableness >= 65) {
      rules.push('Be playful and lighthearted');
    } else if (p.openness <= 40) {
      rules.push('Minimal humor - keep it straightforward');
    }

    // Opinion style
    if (p.agreeableness <= 40 && writingProfile?.personalityIndicators?.assertiveness > 0.6) {
      rules.push('Take clear positions, don\'t hedge');
    } else if (p.agreeableness >= 65) {
      rules.push('Offer gentle suggestions rather than strong opinions');
    }
  }

  // Topics from soul signature defining_traits
  if (soulSignature) {
    const traits = soulSignature.defining_traits || soulSignature.traits;
    if (Array.isArray(traits) && traits.length > 0) {
      const traitNames = traits.slice(0, 3).map(t =>
        typeof t === 'string' ? t : (t.name || t.trait || '')
      ).filter(Boolean);
      if (traitNames.length > 0) {
        rules.push(`Naturally gravitate toward topics related to: ${traitNames.join(', ')}`);
      }
    }
  }

  // Curiosity drive
  if (writingProfile?.personalityIndicators?.curiosity > 0.7) {
    rules.push('Follow tangential threads when they appear interesting');
  }

  if (rules.length === 0) return '';

  return rules.join('. ') + '.';
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Check if a Big Five trait has sufficient confidence (> 40%).
 * Confidence fields: openness_confidence, conscientiousness_confidence, etc.
 */
function hasConfidence(scores, trait) {
  const confidenceKey = `${trait}_confidence`;
  const confidence = scores[confidenceKey];
  // If no confidence data exists, include the trait (backwards compat)
  if (confidence === null || confidence === undefined) return true;
  return confidence > 40;
}

/**
 * Convert 3rd person text to 1st person via common patterns.
 * Handles verb deconjugation: "This person treats" -> "I treat" (not "I treats").
 */
function convertToFirstPerson(text) {
  // Adverb pattern: -ly words + common non-ly adverbs (0-2 allowed between subject and verb)
  const adverbGroup = '(?:(?:\\w+ly|often|always|sometimes|usually|never|also|still|just|even|quite|rather|generally|typically)\\s+){0,2}';
  const verbDeconj = (_, adverbs, verb, andVerb) => {
    let result = `I ${adverbs}${deconjugateThirdPerson(verb)}`;
    if (andVerb) result += ` and ${deconjugateThirdPerson(andVerb)}`;
    return result;
  };

  return text
    // Subject + irregular verb (must come before generic subject+verb pattern)
    .replace(/\bThis person is\b/gi, 'I am')
    .replace(/\bThis person has\b/gi, 'I have')
    .replace(/\bThis person was\b/gi, 'I was')
    // Subject + [adverbs] + verb (+ optional "and verb") -> deconjugate
    .replace(new RegExp(`\\bThis person (${adverbGroup})(\\w+s)(?:\\s+and\\s+(\\w+s))?\\b`, 'gi'), verbDeconj)
    .replace(/\bThis person\b/gi, 'I')
    .replace(/\bThis user is\b/gi, 'I am')
    .replace(/\bThis user has\b/gi, 'I have')
    .replace(/\bThis user was\b/gi, 'I was')
    .replace(new RegExp(`\\bThis user (${adverbGroup})(\\w+s)(?:\\s+and\\s+(\\w+s))?\\b`, 'gi'), verbDeconj)
    .replace(/\bThis user\b/gi, 'I')
    .replace(/\bThe user is\b/gi, 'I am')
    .replace(/\bThe user has\b/gi, 'I have')
    .replace(new RegExp(`\\bThe user (${adverbGroup})(\\w+s)(?:\\s+and\\s+(\\w+s))?\\b`, 'gi'), verbDeconj)
    .replace(/\bThe user\b/gi, 'I')
    .replace(/\bThey are\b/gi, 'I am')
    .replace(/\bThey have\b/gi, 'I have')
    .replace(/\bThey were\b/gi, 'I was')
    .replace(new RegExp(`\\bThey (${adverbGroup})(\\w+s)(?:\\s+and\\s+(\\w+s))?\\b`, 'g'), verbDeconj)
    .replace(/\bThey (\w+)\b/g, 'I $1')
    .replace(/\bTheir\b/g, 'My')
    .replace(/\btheir\b/g, 'my')
    .replace(/\bThem\b/g, 'Me')
    .replace(/\bthem\b/g, 'me');
}

/**
 * Convert 3rd person singular verb to base form.
 * "intellectualizes" -> "intellectualize", "treats" -> "treat"
 */
function deconjugateThirdPerson(verb) {
  const v = verb.toLowerCase();
  if (v === 'is') return 'am';
  if (v === 'has') return 'have';
  if (v === 'does') return 'do';
  if (v === 'goes') return 'go';
  // -ies -> -y for multi-syllable words (tries->try, not dies->die)
  if (v.endsWith('ies') && v.length > 4) return verb.slice(0, -3) + 'y';
  // Sibilant + es: only specific double-consonant/digraph patterns where base has no trailing 'e'
  // watches->watch, pushes->push, passes->pass, buzzes->buzz, waltzes->waltz, fixes->fix
  // Does NOT match -izes/-ases/-oses (intellectualizes, erases, closes) — those just drop 's'
  if (/(?:sh|ch|ss|zz|tz)es$/.test(v)) return verb.slice(0, -2);
  if (/[^aeiou]xes$/.test(v)) return verb.slice(0, -2);
  // Default: remove trailing "s" (treats->treat, intellectualizes->intellectualize)
  if (v.endsWith('s')) return verb.slice(0, -1);
  return verb;
}

/**
 * Truncate text at the nearest sentence boundary before maxLen.
 */
function truncateAtSentence(text, maxLen) {
  if (!text || text.length <= maxLen) return text || '';
  const truncated = text.substring(0, maxLen);
  // Find the last sentence-ending punctuation
  const lastPeriod = truncated.lastIndexOf('.');
  const lastExcl = truncated.lastIndexOf('!');
  const lastQuestion = truncated.lastIndexOf('?');
  const lastEnd = Math.max(lastPeriod, lastExcl, lastQuestion);
  if (lastEnd > maxLen * 0.4) {
    return truncated.substring(0, lastEnd + 1);
  }
  return truncated + '...';
}
