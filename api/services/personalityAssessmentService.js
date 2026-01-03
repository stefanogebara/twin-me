/**
 * Personality Assessment Service
 *
 * 16Personalities-style MBTI assessment with 5 dimensions:
 * - Mind (I/E): Introversion vs Extraversion
 * - Energy (S/N): Sensing vs Intuition
 * - Nature (T/F): Thinking vs Feeling
 * - Tactics (J/P): Judging vs Perceiving
 * - Identity (A/T): Assertive vs Turbulent
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { supabaseAdmin } from '../config/supabase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Use shared Supabase client
const supabase = supabaseAdmin;

// Load personality questions from JSON
let PERSONALITY_QUESTIONS = null;

function loadQuestions() {
  if (PERSONALITY_QUESTIONS) return PERSONALITY_QUESTIONS;

  try {
    const questionsPath = join(__dirname, '../data/personality-questions.json');
    const data = JSON.parse(readFileSync(questionsPath, 'utf-8'));
    PERSONALITY_QUESTIONS = data;
    console.log(`[PersonalityAssessment] Loaded ${data.questions.length} personality questions`);
    return PERSONALITY_QUESTIONS;
  } catch (error) {
    console.error('[PersonalityAssessment] Failed to load questions:', error);
    return null;
  }
}

// MBTI dimensions (16personalities-style)
export const DIMENSIONS = {
  MIND: 'mind',           // I/E - Introversion vs Extraversion
  ENERGY: 'energy',       // S/N - Sensing vs Intuition
  NATURE: 'nature',       // T/F - Thinking vs Feeling
  TACTICS: 'tactics',     // J/P - Judging vs Perceiving
  IDENTITY: 'identity'    // A/T - Assertive vs Turbulent
};

// Legacy Big Five mapping for backward compatibility
export const LEGACY_DIMENSIONS = {
  EXTRAVERSION: 'extraversion',
  OPENNESS: 'openness',
  CONSCIENTIOUSNESS: 'conscientiousness',
  AGREEABLENESS: 'agreeableness',
  NEUROTICISM: 'neuroticism'
};

// 16personalities archetype definitions
export const ARCHETYPES = {
  // Analysts (NT)
  INTJ: { name: 'The Architect', group: 'Analysts', color: '#88619a' },
  INTP: { name: 'The Logician', group: 'Analysts', color: '#88619a' },
  ENTJ: { name: 'The Commander', group: 'Analysts', color: '#88619a' },
  ENTP: { name: 'The Debater', group: 'Analysts', color: '#88619a' },

  // Diplomats (NF)
  INFJ: { name: 'The Advocate', group: 'Diplomats', color: '#33a474' },
  INFP: { name: 'The Mediator', group: 'Diplomats', color: '#33a474' },
  ENFJ: { name: 'The Protagonist', group: 'Diplomats', color: '#33a474' },
  ENFP: { name: 'The Campaigner', group: 'Diplomats', color: '#33a474' },

  // Sentinels (SJ)
  ISTJ: { name: 'The Logistician', group: 'Sentinels', color: '#4298b4' },
  ISFJ: { name: 'The Defender', group: 'Sentinels', color: '#4298b4' },
  ESTJ: { name: 'The Executive', group: 'Sentinels', color: '#4298b4' },
  ESFJ: { name: 'The Consul', group: 'Sentinels', color: '#4298b4' },

  // Explorers (SP)
  ISTP: { name: 'The Virtuoso', group: 'Explorers', color: '#e4ae3a' },
  ISFP: { name: 'The Adventurer', group: 'Explorers', color: '#e4ae3a' },
  ESTP: { name: 'The Entrepreneur', group: 'Explorers', color: '#e4ae3a' },
  ESFP: { name: 'The Entertainer', group: 'Explorers', color: '#e4ae3a' }
};

/**
 * Get questions for assessment
 * @param {string} mode - 'quick_pulse' for 12 questions, 'full' for all 60, 'deep' for remaining 48
 * @returns {Array} Questions array
 */
export function getQuestions(mode = 'quick_pulse') {
  const data = loadQuestions();
  if (!data) return [];

  const sortedQuestions = [...data.questions].sort((a, b) => a.order - b.order);

  switch (mode) {
    case 'quick_pulse':
      return sortedQuestions.filter(q => q.quick_pulse === true);
    case 'deep':
      return sortedQuestions.filter(q => q.quick_pulse !== true);
    case 'full':
    default:
      return sortedQuestions;
  }
}

/**
 * Calculate MBTI dimension scores from responses
 * @param {Array} responses - Array of {question_id, value} where value is 1-7
 * @returns {Object} MBTI dimension scores (0-100 scale) with confidence intervals
 *
 * Scoring: Each dimension has a positive pole (E, N, F, J, A)
 * - Score > 50 = positive pole letter
 * - Score < 50 = negative pole letter (I, S, T, P, T)
 */
export function calculateMBTIScores(responses) {
  const data = loadQuestions();
  if (!data) return null;

  const dimensions = Object.values(DIMENSIONS);
  const scores = {};

  for (const dim of dimensions) {
    const dimQuestions = data.questions.filter(q => q.dimension === dim);
    const dimResponses = responses.filter(r => {
      const question = dimQuestions.find(q => q.id === r.question_id);
      return question !== undefined;
    });

    if (dimResponses.length === 0) {
      scores[dim] = 50; // Default to middle (no preference)
      scores[`${dim}_ci`] = 25; // High uncertainty
      continue;
    }

    const adjustedScores = dimResponses.map(r => {
      const question = dimQuestions.find(q => q.id === r.question_id);
      const value = r.value;
      // Reverse score if needed (1-7 becomes 7-1)
      // reverse_scored=true means the question targets the negative pole
      return question.reverse_scored ? (8 - value) : value;
    });

    // Calculate mean and convert to 0-100 scale
    // 7-point scale: 1-7 maps to 0-100
    const avgScore = adjustedScores.reduce((a, b) => a + b, 0) / adjustedScores.length;
    scores[dim] = ((avgScore - 1) / 6) * 100; // 1-7 -> 0-100

    // Calculate confidence interval based on response count and consistency
    scores[`${dim}_ci`] = calculateConfidenceInterval(adjustedScores, dimQuestions.length, 7);
  }

  return scores;
}

/**
 * Legacy function for backward compatibility
 * @deprecated Use calculateMBTIScores instead
 */
export function calculateBigFiveScores(responses) {
  // Convert old responses to new format if needed
  return calculateMBTIScores(responses);
}

/**
 * Calculate confidence interval for a dimension
 * Based on number of questions answered and response consistency
 * @param {Array} adjustedScores - Array of adjusted response values
 * @param {number} totalQuestions - Total questions in this dimension
 * @param {number} scaleMax - Maximum value on the scale (5 for old, 7 for new)
 */
function calculateConfidenceInterval(adjustedScores, totalQuestions, scaleMax = 7) {
  const n = adjustedScores.length;

  if (n === 0) return 25; // Maximum uncertainty
  if (n === 1) return 20;

  // Calculate standard deviation
  const mean = adjustedScores.reduce((a, b) => a + b, 0) / n;
  const variance = adjustedScores.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n;
  const stdDev = Math.sqrt(variance);

  // Convert to percentage scale and adjust for sample size
  // Scale range is (scaleMax - 1), e.g., 6 for 1-7 scale
  const scaleRange = scaleMax - 1;
  const baseCI = (stdDev / scaleRange) * 100;
  const completionFactor = Math.sqrt(totalQuestions / n); // Higher CI if fewer questions answered

  // CI ranges from ~5 (very confident) to ~25 (very uncertain)
  return Math.min(25, Math.max(5, baseCI * completionFactor));
}

/**
 * Map MBTI dimension scores to 16personalities archetype
 * @param {Object} scores - MBTI dimension scores (0-100)
 * @returns {Object} Archetype info with full type code (e.g., "INTJ-A")
 */
export function mapToArchetype(scores) {
  // Map dimensions to MBTI letters
  // Each dimension > 50% gets the positive pole letter
  //
  // Mind (I/E): >= 50 = E (Extraversion), < 50 = I (Introversion)
  // Energy (S/N): >= 50 = N (Intuition), < 50 = S (Sensing)
  // Nature (T/F): >= 50 = F (Feeling), < 50 = T (Thinking)
  // Tactics (J/P): >= 50 = J (Judging), < 50 = P (Perceiving)
  // Identity (A/T): >= 50 = A (Assertive), < 50 = T (Turbulent)

  // Support both new MBTI dimensions and legacy Big Five dimensions
  const mindScore = scores.mind ?? scores.extraversion ?? 50;
  const energyScore = scores.energy ?? scores.openness ?? 50;
  const natureScore = scores.nature ?? scores.agreeableness ?? 50;
  const tacticsScore = scores.tactics ?? scores.conscientiousness ?? 50;
  const identityScore = scores.identity ?? 50;

  const letters = {
    e: mindScore >= 50 ? 'E' : 'I',
    n: energyScore >= 50 ? 'N' : 'S',
    f: natureScore >= 50 ? 'F' : 'T',
    j: tacticsScore >= 50 ? 'J' : 'P',
    identity: identityScore >= 50 ? 'A' : 'T'
  };

  const code = `${letters.e}${letters.n}${letters.f}${letters.j}`;
  const fullCode = `${code}-${letters.identity}`; // e.g., "INTJ-A"
  const archetype = ARCHETYPES[code];

  return {
    code,
    fullCode,
    name: archetype?.name || 'Unknown',
    group: archetype?.group || 'Unknown',
    color: archetype?.color || '#6366f1',
    identity: letters.identity,
    identityLabel: letters.identity === 'A' ? 'Assertive' : 'Turbulent',
    // Calculate how strongly the user fits this type (0-100)
    strength: calculateArchetypeStrength(scores),
    // Include percentage for each dimension for display
    percentages: {
      mind: mindScore,
      energy: energyScore,
      nature: natureScore,
      tactics: tacticsScore,
      identity: identityScore
    }
  };
}

/**
 * Calculate how strongly user fits their archetype
 * Based on how far from 50 each dimension is (excluding identity)
 */
function calculateArchetypeStrength(scores) {
  // Use the 4 core MBTI dimensions (excluding identity)
  const coreDimensions = ['mind', 'energy', 'nature', 'tactics'];

  // Also support legacy dimension names
  const legacyMap = {
    mind: 'extraversion',
    energy: 'openness',
    nature: 'agreeableness',
    tactics: 'conscientiousness'
  };

  const totalDeviation = coreDimensions.reduce((sum, dim) => {
    const score = scores[dim] ?? scores[legacyMap[dim]] ?? 50;
    return sum + Math.abs(score - 50);
  }, 0);

  // Max deviation is 200 (4 dimensions * 50 max each)
  // Convert to 0-100 percentage
  return (totalDeviation / 200) * 100;
}

/**
 * Save responses and update personality estimate
 * @param {string} userId - User ID
 * @param {Array} responses - Array of {question_id, value, response_time_ms}
 * @param {string} sessionId - Session ID for this assessment
 * @returns {Object} Updated personality estimate with archetype
 */
export async function saveAssessmentResponses(userId, responses, sessionId = null) {
  const data = loadQuestions();
  if (!data) throw new Error('Failed to load questions');

  const session = sessionId || crypto.randomUUID();

  try {
    // Save individual responses
    const responseRecords = responses.map(r => {
      const question = data.questions.find(q => q.id === r.question_id);
      return {
        user_id: userId,
        question_id: r.question_id,
        response_value: r.value,
        response_time_ms: r.response_time_ms || null,
        session_id: session
      };
    });

    // First, we need to ensure questions exist in the database
    // Get question IDs from database
    const { data: existingQuestions } = await supabase
      .from('personality_questions')
      .select('id, question_text');

    // If no questions in DB, seed them first
    if (!existingQuestions || existingQuestions.length === 0) {
      await seedQuestionsToDatabase();
    }

    // Map our JSON question IDs to database UUIDs
    const { data: dbQuestions } = await supabase
      .from('personality_questions')
      .select('id, question_text, dimension, reverse_scored');

    if (!dbQuestions || dbQuestions.length === 0) {
      throw new Error('No questions found in database');
    }

    // Create a map from question text to database ID
    const questionMap = new Map();
    for (const q of data.questions) {
      const dbQ = dbQuestions.find(dbq => dbq.question_text === q.question_text);
      if (dbQ) {
        questionMap.set(q.id, dbQ.id);
      }
    }

    // Transform responses to use database IDs
    const dbResponseRecords = responses
      .filter(r => questionMap.has(r.question_id))
      .map(r => ({
        user_id: userId,
        question_id: questionMap.get(r.question_id),
        response_value: r.value,
        response_time_ms: r.response_time_ms || null,
        session_id: session
      }));

    if (dbResponseRecords.length > 0) {
      const { error: insertError } = await supabase
        .from('personality_responses')
        .upsert(dbResponseRecords, {
          onConflict: 'user_id,question_id,session_id',
          ignoreDuplicates: false
        });

      if (insertError) {
        console.error('[PersonalityAssessment] Failed to save responses:', insertError);
      }
    }

    // Calculate scores from all user responses using new MBTI scoring
    const scores = calculateMBTIScores(responses);
    const archetype = mapToArchetype(scores);

    // Upsert personality estimate with both new MBTI dimensions and legacy Big Five
    // This maintains backward compatibility while supporting new dimension names
    const estimateRecord = {
      user_id: userId,
      // New MBTI dimension columns
      mind: scores.mind,
      energy: scores.energy,
      nature: scores.nature,
      tactics: scores.tactics,
      identity: scores.identity,
      mind_ci: scores.mind_ci,
      energy_ci: scores.energy_ci,
      nature_ci: scores.nature_ci,
      tactics_ci: scores.tactics_ci,
      identity_ci: scores.identity_ci,
      // Legacy Big Five columns (mapped from MBTI for backward compatibility)
      extraversion: scores.mind,           // Mind (I/E) maps to Extraversion
      openness: scores.energy,             // Energy (S/N) maps to Openness
      agreeableness: scores.nature,        // Nature (T/F) maps to Agreeableness
      conscientiousness: scores.tactics,   // Tactics (J/P) maps to Conscientiousness
      neuroticism: 100 - (scores.identity ?? 50), // Identity inverted -> Neuroticism
      extraversion_ci: scores.mind_ci,
      openness_ci: scores.energy_ci,
      agreeableness_ci: scores.nature_ci,
      conscientiousness_ci: scores.tactics_ci,
      neuroticism_ci: scores.identity_ci,
      // Archetype code now includes identity suffix (e.g., "INTJ-A")
      archetype_code: archetype.fullCode || archetype.code,
      questionnaire_score_weight: 1.0,
      last_questionnaire_at: new Date().toISOString(),
      total_questions_answered: responses.length,
      updated_at: new Date().toISOString()
    };

    const { data: estimate, error: estimateError } = await supabase
      .from('personality_estimates')
      .upsert(estimateRecord, { onConflict: 'user_id' })
      .select()
      .single();

    if (estimateError) {
      console.error('[PersonalityAssessment] Failed to save estimate:', estimateError);
    }

    console.log(`[PersonalityAssessment] Saved ${responses.length} responses for user ${userId}`);
    console.log(`[PersonalityAssessment] Archetype: ${archetype.code} - ${archetype.name}`);

    return {
      scores,
      archetype,
      estimate,
      questionsAnswered: responses.length,
      totalQuestions: data.questions.length,
      completionPercentage: (responses.length / data.questions.length) * 100
    };

  } catch (error) {
    console.error('[PersonalityAssessment] Error saving assessment:', error);
    throw error;
  }
}

/**
 * Get user's personality estimate
 * @param {string} userId - User ID
 * @returns {Object} Personality estimate with archetype
 */
export async function getPersonalityEstimate(userId) {
  try {
    const { data: estimate, error } = await supabase
      .from('personality_estimates')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !estimate) {
      return null;
    }

    // Support both new MBTI dimensions and legacy Big Five dimensions
    const scores = {
      // Prefer new MBTI dimensions if available, fall back to legacy
      mind: estimate.mind ?? estimate.extraversion,
      energy: estimate.energy ?? estimate.openness,
      nature: estimate.nature ?? estimate.agreeableness,
      tactics: estimate.tactics ?? estimate.conscientiousness,
      identity: estimate.identity ?? (100 - (estimate.neuroticism ?? 50)),
      // Also include legacy names for backward compatibility
      extraversion: estimate.extraversion ?? estimate.mind,
      openness: estimate.openness ?? estimate.energy,
      agreeableness: estimate.agreeableness ?? estimate.nature,
      conscientiousness: estimate.conscientiousness ?? estimate.tactics,
      neuroticism: estimate.neuroticism ?? (100 - (estimate.identity ?? 50))
    };

    const archetype = mapToArchetype(scores);

    return {
      ...estimate,
      // Include both dimension naming conventions
      scores,
      archetype
    };

  } catch (error) {
    console.error('[PersonalityAssessment] Error getting estimate:', error);
    return null;
  }
}

/**
 * Seed questions to database
 */
export async function seedQuestionsToDatabase() {
  const data = loadQuestions();
  if (!data) throw new Error('Failed to load questions');

  console.log('[PersonalityAssessment] Seeding questions to database...');

  const questionRecords = data.questions.map(q => ({
    dimension: q.dimension,
    facet: q.facet || q.target_pole, // Use target_pole as facet for new questions
    target_pole: q.target_pole, // New field for MBTI questions
    question_text: q.question_text,
    reverse_scored: q.reverse_scored,
    question_order: q.order,
    quick_pulse: q.quick_pulse || false, // Mark quick pulse questions
    is_active: true
  }));

  const { error } = await supabase
    .from('personality_questions')
    .upsert(questionRecords, {
      onConflict: 'question_text',
      ignoreDuplicates: false // Update existing questions with new fields
    });

  if (error) {
    console.error('[PersonalityAssessment] Failed to seed questions:', error);
    throw error;
  }

  console.log(`[PersonalityAssessment] Seeded ${questionRecords.length} questions`);
}

/**
 * Seed archetypes to database
 */
export async function seedArchetypesToDatabase() {
  console.log('[PersonalityAssessment] Seeding archetypes to database...');

  const archetypeRecords = Object.entries(ARCHETYPES).map(([code, info]) => ({
    code,
    name: info.name,
    group_name: info.group,
    color_primary: info.color,
    color_secondary: info.color,
    // New MBTI dimension ranges
    mind_min: code[0] === 'E' ? 50 : 0,
    mind_max: code[0] === 'E' ? 100 : 50,
    energy_min: code[1] === 'N' ? 50 : 0,
    energy_max: code[1] === 'N' ? 100 : 50,
    nature_min: code[2] === 'F' ? 50 : 0,
    nature_max: code[2] === 'F' ? 100 : 50,
    tactics_min: code[3] === 'J' ? 50 : 0,
    tactics_max: code[3] === 'J' ? 100 : 50,
    // Legacy Big Five ranges (for backward compatibility)
    extraversion_min: code[0] === 'E' ? 50 : 0,
    extraversion_max: code[0] === 'E' ? 100 : 50,
    openness_min: code[1] === 'N' ? 50 : 0,
    openness_max: code[1] === 'N' ? 100 : 50,
    agreeableness_min: code[2] === 'F' ? 50 : 0,
    agreeableness_max: code[2] === 'F' ? 100 : 50,
    conscientiousness_min: code[3] === 'J' ? 50 : 0,
    conscientiousness_max: code[3] === 'J' ? 100 : 50
  }));

  const { error } = await supabase
    .from('personality_archetypes')
    .upsert(archetypeRecords, { onConflict: 'code' });

  if (error) {
    console.error('[PersonalityAssessment] Failed to seed archetypes:', error);
    throw error;
  }

  console.log(`[PersonalityAssessment] Seeded ${archetypeRecords.length} archetypes`);
}

/**
 * Generate explanation of user's personality
 * @param {Object} scores - MBTI dimension scores (supports both new and legacy names)
 * @param {Object} archetype - Archetype info
 * @returns {Object} Explanation with insights, strengths, and growth areas
 */
export function generatePersonalityInsights(scores, archetype) {
  const insights = [];
  const strengths = [];
  const growthAreas = [];

  // Get scores using both new MBTI and legacy Big Five names
  const mindScore = scores.mind ?? scores.extraversion ?? 50;
  const energyScore = scores.energy ?? scores.openness ?? 50;
  const natureScore = scores.nature ?? scores.agreeableness ?? 50;
  const tacticsScore = scores.tactics ?? scores.conscientiousness ?? 50;
  const identityScore = scores.identity ?? (100 - (scores.neuroticism ?? 50));

  // Mind (I/E) insights
  if (mindScore >= 70) {
    insights.push({
      dimension: 'mind',
      mbtiLetter: 'E',
      trait: 'Extraversion',
      percentage: mindScore,
      description: 'You thrive on social interaction and feel energized by being around others.',
      musicImplication: 'You may prefer upbeat, social music and enjoy discovering new artists through friends.'
    });
    strengths.push('Natural energy and enthusiasm in social settings');
    strengths.push('Ability to network and connect with new people easily');
  } else if (mindScore <= 30) {
    insights.push({
      dimension: 'mind',
      mbtiLetter: 'I',
      trait: 'Introversion',
      percentage: 100 - mindScore,
      description: 'You recharge through solitude and prefer deep one-on-one connections.',
      musicImplication: 'You may prefer intimate, introspective music and curated playlists over trending hits.'
    });
    strengths.push('Deep focus and concentration abilities');
    strengths.push('Strong capacity for meaningful one-on-one connections');
    growthAreas.push('Practice initiating conversations in larger group settings');
  } else {
    strengths.push('Balanced social energy - comfortable in both groups and solitude');
  }

  // Energy (S/N) insights
  if (energyScore >= 70) {
    insights.push({
      dimension: 'energy',
      mbtiLetter: 'N',
      trait: 'Intuition',
      percentage: energyScore,
      description: 'You embrace abstract ideas, patterns, and future possibilities.',
      musicImplication: 'You likely enjoy diverse genres and are open to experimental or world music.'
    });
    strengths.push('Creative thinking and appreciation for novel ideas');
    strengths.push('Ability to see patterns and possibilities others miss');
  } else if (energyScore <= 30) {
    insights.push({
      dimension: 'energy',
      mbtiLetter: 'S',
      trait: 'Sensing/Observant',
      percentage: 100 - energyScore,
      description: 'You focus on concrete facts, details, and present realities.',
      musicImplication: 'You may prefer familiar songs and established artists over new releases.'
    });
    strengths.push('Practical, grounded approach to problem-solving');
    strengths.push('Strong attention to detail and present moment');
    growthAreas.push('Challenge yourself to explore abstract possibilities');
  } else {
    strengths.push('Good balance between abstract thinking and practical focus');
  }

  // Nature (T/F) insights
  if (natureScore >= 70) {
    insights.push({
      dimension: 'nature',
      mbtiLetter: 'F',
      trait: 'Feeling',
      percentage: natureScore,
      description: 'You prioritize values, harmony, and how decisions affect people.',
      musicImplication: 'You may connect strongly with emotional lyrics and collaborative artists.'
    });
    strengths.push('Strong empathy and emotional intelligence');
    strengths.push('Natural ability to build harmonious relationships');
    growthAreas.push('Practice setting boundaries while staying kind');
  } else if (natureScore <= 30) {
    insights.push({
      dimension: 'nature',
      mbtiLetter: 'T',
      trait: 'Thinking',
      percentage: 100 - natureScore,
      description: 'You prioritize logic, objectivity, and rational analysis.',
      musicImplication: 'You may appreciate technical skill and innovative production over emotional appeal.'
    });
    strengths.push('Logical, objective decision-making');
    strengths.push('Ability to provide honest, direct feedback');
    growthAreas.push('Consider emotional impact alongside logical analysis');
  } else {
    strengths.push('Good balance of empathy and objectivity');
  }

  // Tactics (J/P) insights
  if (tacticsScore >= 70) {
    insights.push({
      dimension: 'tactics',
      mbtiLetter: 'J',
      trait: 'Judging',
      percentage: tacticsScore,
      description: 'You value structure, planning, and decisive action.',
      musicImplication: 'You may prefer well-organized playlists and use music to enhance productivity.'
    });
    strengths.push('Strong organizational skills and attention to detail');
    strengths.push('Excellent follow-through on commitments');
    growthAreas.push('Allow some flexibility for spontaneous opportunities');
  } else if (tacticsScore <= 30) {
    insights.push({
      dimension: 'tactics',
      mbtiLetter: 'P',
      trait: 'Perceiving/Prospecting',
      percentage: 100 - tacticsScore,
      description: 'You prefer flexibility, adaptability, and keeping options open.',
      musicImplication: 'You may enjoy shuffle play and spontaneous music discovery.'
    });
    strengths.push('Adaptability and comfort with change');
    strengths.push('Creative, go-with-the-flow approach to challenges');
    growthAreas.push('Try setting small, achievable daily goals');
  } else {
    strengths.push('Healthy balance of structure and flexibility');
  }

  // Identity (A/T) insights
  if (identityScore >= 70) {
    insights.push({
      dimension: 'identity',
      mbtiLetter: 'A',
      trait: 'Assertive',
      percentage: identityScore,
      description: 'You are self-assured, even-tempered, and resistant to stress.',
      musicImplication: 'You may use music more for enjoyment than emotional processing.'
    });
    strengths.push('Emotional resilience and stability under pressure');
    strengths.push('Confidence in your decisions and abilities');
  } else if (identityScore <= 30) {
    insights.push({
      dimension: 'identity',
      mbtiLetter: 'T',
      trait: 'Turbulent',
      percentage: 100 - identityScore,
      description: 'You are self-conscious, sensitive to stress, and driven by perfectionism.',
      musicImplication: 'Music can be powerful for mood regulation - both matching and shifting your state.'
    });
    strengths.push('Deep emotional awareness and sensitivity');
    strengths.push('Driven to improve and achieve high standards');
    growthAreas.push('Develop stress management techniques like mindfulness');
    growthAreas.push('Practice self-compassion when things don\'t go perfectly');
  } else {
    strengths.push('Balanced emotional responsiveness');
  }

  // Add archetype-specific strengths
  const archetypeStrengths = getArchetypeStrengths(archetype.code);
  strengths.push(...archetypeStrengths.strengths);
  growthAreas.push(...archetypeStrengths.growthAreas);

  // Use fullCode if available (e.g., "INTJ-A" instead of "INTJ")
  const displayCode = archetype.fullCode || archetype.code;
  const identityLabel = archetype.identityLabel ? ` (${archetype.identityLabel})` : '';

  return {
    archetype,
    insights,
    strengths: [...new Set(strengths)], // Remove duplicates
    growthAreas: [...new Set(growthAreas)], // Remove duplicates
    summary: `As ${archetype.name} (${displayCode})${identityLabel}, you belong to the ${archetype.group} group. ` +
             `Your unique combination of traits shapes how you experience and connect with the world.`,
    dimensionPercentages: {
      mind: { score: mindScore, letter: mindScore >= 50 ? 'E' : 'I' },
      energy: { score: energyScore, letter: energyScore >= 50 ? 'N' : 'S' },
      nature: { score: natureScore, letter: natureScore >= 50 ? 'F' : 'T' },
      tactics: { score: tacticsScore, letter: tacticsScore >= 50 ? 'J' : 'P' },
      identity: { score: identityScore, letter: identityScore >= 50 ? 'A' : 'T' }
    }
  };
}

/**
 * Get archetype-specific strengths and growth areas
 */
function getArchetypeStrengths(code) {
  const archetypeTraits = {
    // Analysts (NT)
    INTJ: {
      strengths: ['Strategic long-term planning', 'Independent problem-solving'],
      growthAreas: ['Express appreciation for others more openly']
    },
    INTP: {
      strengths: ['Deep analytical thinking', 'Innovation and creativity'],
      growthAreas: ['Follow through on ideas to completion']
    },
    ENTJ: {
      strengths: ['Natural leadership abilities', 'Decisive action under pressure'],
      growthAreas: ['Show patience with those who process differently']
    },
    ENTP: {
      strengths: ['Quick thinking and adaptability', 'Generating innovative solutions'],
      growthAreas: ['Focus on completing projects before starting new ones']
    },
    // Diplomats (NF)
    INFJ: {
      strengths: ['Deep insight into others', 'Strong sense of purpose'],
      growthAreas: ['Share your needs as readily as you help others']
    },
    INFP: {
      strengths: ['Authentic self-expression', 'Deep empathy and idealism'],
      growthAreas: ['Take action on your ideals, not just dream about them']
    },
    ENFJ: {
      strengths: ['Inspiring and motivating others', 'Creating harmonious environments'],
      growthAreas: ['Prioritize your own needs alongside others']
    },
    ENFP: {
      strengths: ['Enthusiasm that inspires others', 'Seeing potential everywhere'],
      growthAreas: ['Ground your visions with practical steps']
    },
    // Sentinels (SJ)
    ISTJ: {
      strengths: ['Reliability and dependability', 'Thorough attention to detail'],
      growthAreas: ['Stay open to unconventional solutions']
    },
    ISFJ: {
      strengths: ['Caring for others\' practical needs', 'Creating stability and security'],
      growthAreas: ['Advocate for your own needs more directly']
    },
    ESTJ: {
      strengths: ['Organizing people and resources efficiently', 'Clear communication'],
      growthAreas: ['Consider emotional factors in decisions']
    },
    ESFJ: {
      strengths: ['Building community and connection', 'Remembering personal details'],
      growthAreas: ['Form opinions independent of group consensus']
    },
    // Explorers (SP)
    ISTP: {
      strengths: ['Hands-on problem solving', 'Staying calm in crisis'],
      growthAreas: ['Share your thoughts and feelings more openly']
    },
    ISFP: {
      strengths: ['Living authentically in the moment', 'Artistic sensitivity'],
      growthAreas: ['Plan ahead for important long-term goals']
    },
    ESTP: {
      strengths: ['Quick thinking and action', 'Reading situations accurately'],
      growthAreas: ['Consider long-term consequences before acting']
    },
    ESFP: {
      strengths: ['Bringing joy and energy to others', 'Living fully in the present'],
      growthAreas: ['Follow through on commitments even when excitement fades']
    }
  };

  return archetypeTraits[code] || { strengths: [], growthAreas: [] };
}

export default {
  DIMENSIONS,
  LEGACY_DIMENSIONS,
  ARCHETYPES,
  getQuestions,
  calculateMBTIScores,
  calculateBigFiveScores, // Legacy alias
  mapToArchetype,
  saveAssessmentResponses,
  getPersonalityEstimate,
  seedQuestionsToDatabase,
  seedArchetypesToDatabase,
  generatePersonalityInsights
};
