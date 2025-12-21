/**
 * Personality Assessment Service
 *
 * Big Five (OCEAN) based personality assessment with 16personalities-style archetypes.
 * Uses scientifically validated BFI-2 question methodology.
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

// Big Five dimensions
export const DIMENSIONS = {
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
 * Calculate Big Five scores from responses
 * @param {Array} responses - Array of {question_id, value} where value is 1-5
 * @returns {Object} Big Five scores with confidence intervals
 */
export function calculateBigFiveScores(responses) {
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
      scores[dim] = 50; // Default to middle
      scores[`${dim}_ci`] = 25; // High uncertainty
      continue;
    }

    const adjustedScores = dimResponses.map(r => {
      const question = dimQuestions.find(q => q.id === r.question_id);
      const value = r.value;
      // Reverse score if needed (1-5 becomes 5-1)
      return question.reverse_scored ? (6 - value) : value;
    });

    // Calculate mean and convert to 0-100 scale
    const avgScore = adjustedScores.reduce((a, b) => a + b, 0) / adjustedScores.length;
    scores[dim] = ((avgScore - 1) / 4) * 100; // 1-5 -> 0-100

    // Calculate confidence interval based on response count and consistency
    scores[`${dim}_ci`] = calculateConfidenceInterval(adjustedScores, dimQuestions.length);
  }

  return scores;
}

/**
 * Calculate confidence interval for a dimension
 * Based on number of questions answered and response consistency
 */
function calculateConfidenceInterval(adjustedScores, totalQuestions) {
  const n = adjustedScores.length;

  if (n === 0) return 25; // Maximum uncertainty
  if (n === 1) return 20;

  // Calculate standard deviation
  const mean = adjustedScores.reduce((a, b) => a + b, 0) / n;
  const variance = adjustedScores.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n;
  const stdDev = Math.sqrt(variance);

  // Convert to percentage scale and adjust for sample size
  const baseCI = (stdDev / 4) * 100; // Convert from 1-5 scale to 0-100
  const completionFactor = Math.sqrt(totalQuestions / n); // Higher CI if fewer questions answered

  // CI ranges from ~5 (very confident) to ~25 (very uncertain)
  return Math.min(25, Math.max(5, baseCI * completionFactor));
}

/**
 * Map Big Five scores to 16personalities archetype
 * @param {Object} scores - Big Five scores (0-100)
 * @returns {Object} Archetype info
 */
export function mapToArchetype(scores) {
  // Map dimensions to MBTI letters
  // Extraversion >= 50 = E, else I
  // Openness >= 50 = N (iNtuitive), else S (Sensing)
  // Agreeableness >= 50 = F (Feeling), else T (Thinking)
  // Conscientiousness >= 50 = J (Judging), else P (Perceiving)

  const e = scores.extraversion >= 50 ? 'E' : 'I';
  const n = scores.openness >= 50 ? 'N' : 'S';
  const f = scores.agreeableness >= 50 ? 'F' : 'T';
  const j = scores.conscientiousness >= 50 ? 'J' : 'P';

  const code = `${e}${n}${f}${j}`;
  const archetype = ARCHETYPES[code];

  return {
    code,
    name: archetype?.name || 'Unknown',
    group: archetype?.group || 'Unknown',
    color: archetype?.color || '#6366f1',
    // Calculate how strongly the user fits this type (0-100)
    strength: calculateArchetypeStrength(scores)
  };
}

/**
 * Calculate how strongly user fits their archetype
 * Based on how far from 50 each dimension is
 */
function calculateArchetypeStrength(scores) {
  const dimensions = Object.values(DIMENSIONS).filter(d => d !== 'neuroticism');

  const totalDeviation = dimensions.reduce((sum, dim) => {
    return sum + Math.abs(scores[dim] - 50);
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

    // Calculate scores from all user responses
    const scores = calculateBigFiveScores(responses);
    const archetype = mapToArchetype(scores);

    // Upsert personality estimate
    const estimateRecord = {
      user_id: userId,
      openness: scores.openness,
      conscientiousness: scores.conscientiousness,
      extraversion: scores.extraversion,
      agreeableness: scores.agreeableness,
      neuroticism: scores.neuroticism,
      openness_ci: scores.openness_ci,
      conscientiousness_ci: scores.conscientiousness_ci,
      extraversion_ci: scores.extraversion_ci,
      agreeableness_ci: scores.agreeableness_ci,
      neuroticism_ci: scores.neuroticism_ci,
      archetype_code: archetype.code,
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

    const archetype = mapToArchetype({
      extraversion: estimate.extraversion,
      openness: estimate.openness,
      conscientiousness: estimate.conscientiousness,
      agreeableness: estimate.agreeableness,
      neuroticism: estimate.neuroticism
    });

    return {
      ...estimate,
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
    facet: q.facet,
    question_text: q.question_text,
    reverse_scored: q.reverse_scored,
    question_order: q.order,
    is_active: true
  }));

  const { error } = await supabase
    .from('personality_questions')
    .upsert(questionRecords, {
      onConflict: 'question_text',
      ignoreDuplicates: true
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
    // Set Big Five ranges based on archetype letters
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
 * @param {Object} scores - Big Five scores
 * @param {Object} archetype - Archetype info
 * @returns {Object} Explanation with insights, strengths, and growth areas
 */
export function generatePersonalityInsights(scores, archetype) {
  const insights = [];
  const strengths = [];
  const growthAreas = [];

  // Extraversion insights
  if (scores.extraversion >= 70) {
    insights.push({
      dimension: 'extraversion',
      trait: 'Highly Extraverted',
      description: 'You thrive on social interaction and feel energized by being around others.',
      musicImplication: 'You may prefer upbeat, social music and enjoy discovering new artists through friends.'
    });
    strengths.push('Natural energy and enthusiasm in social settings');
    strengths.push('Ability to network and connect with new people easily');
  } else if (scores.extraversion <= 30) {
    insights.push({
      dimension: 'extraversion',
      trait: 'Highly Introverted',
      description: 'You recharge through solitude and prefer deep one-on-one connections.',
      musicImplication: 'You may prefer intimate, introspective music and curated playlists over trending hits.'
    });
    strengths.push('Deep focus and concentration abilities');
    strengths.push('Strong capacity for meaningful one-on-one connections');
    growthAreas.push('Practice initiating conversations in larger group settings');
  } else {
    strengths.push('Balanced social energy - comfortable in both groups and solitude');
  }

  // Openness insights
  if (scores.openness >= 70) {
    insights.push({
      dimension: 'openness',
      trait: 'Highly Open',
      description: 'You embrace new ideas, creativity, and unconventional experiences.',
      musicImplication: 'You likely enjoy diverse genres and are open to experimental or world music.'
    });
    strengths.push('Creative thinking and appreciation for novel ideas');
    strengths.push('Intellectual curiosity and love of learning');
  } else if (scores.openness <= 30) {
    insights.push({
      dimension: 'openness',
      trait: 'Practical & Traditional',
      description: 'You prefer proven methods and familiar experiences.',
      musicImplication: 'You may prefer familiar songs and established artists over new releases.'
    });
    strengths.push('Practical, grounded approach to problem-solving');
    strengths.push('Reliability and consistency in preferences');
    growthAreas.push('Challenge yourself to try one new experience per week');
  } else {
    strengths.push('Good balance between creativity and practicality');
  }

  // Conscientiousness insights
  if (scores.conscientiousness >= 70) {
    insights.push({
      dimension: 'conscientiousness',
      trait: 'Highly Organized',
      description: 'You value structure, planning, and follow-through.',
      musicImplication: 'You may prefer well-organized playlists and use music to enhance productivity.'
    });
    strengths.push('Strong organizational skills and attention to detail');
    strengths.push('Excellent follow-through on commitments');
    growthAreas.push('Allow some flexibility for spontaneous opportunities');
  } else if (scores.conscientiousness <= 30) {
    insights.push({
      dimension: 'conscientiousness',
      trait: 'Spontaneous & Flexible',
      description: 'You prefer adaptability over rigid planning.',
      musicImplication: 'You may enjoy shuffle play and spontaneous music discovery.'
    });
    strengths.push('Adaptability and comfort with change');
    strengths.push('Creative, go-with-the-flow approach to challenges');
    growthAreas.push('Try setting small, achievable daily goals');
  } else {
    strengths.push('Healthy balance of structure and flexibility');
  }

  // Agreeableness insights
  if (scores.agreeableness >= 70) {
    insights.push({
      dimension: 'agreeableness',
      trait: 'Highly Empathetic',
      description: 'You prioritize harmony and deeply consider others\' feelings.',
      musicImplication: 'You may connect strongly with emotional lyrics and collaborative artists.'
    });
    strengths.push('Strong empathy and emotional intelligence');
    strengths.push('Natural ability to build harmonious relationships');
    growthAreas.push('Practice setting boundaries while staying kind');
  } else if (scores.agreeableness <= 30) {
    insights.push({
      dimension: 'agreeableness',
      trait: 'Independent Thinker',
      description: 'You value logic over emotion and speak your mind directly.',
      musicImplication: 'You may appreciate technical skill and innovative production over emotional appeal.'
    });
    strengths.push('Logical, objective decision-making');
    strengths.push('Ability to provide honest, direct feedback');
    growthAreas.push('Consider emotional impact alongside logical analysis');
  } else {
    strengths.push('Good balance of empathy and objectivity');
  }

  // Neuroticism insights
  if (scores.neuroticism >= 70) {
    insights.push({
      dimension: 'neuroticism',
      trait: 'Emotionally Sensitive',
      description: 'You experience emotions deeply and may be more affected by stress.',
      musicImplication: 'Music can be powerful for mood regulation - both matching and shifting your state.'
    });
    strengths.push('Deep emotional awareness and sensitivity');
    strengths.push('Ability to connect with art and music on a profound level');
    growthAreas.push('Develop stress management techniques like mindfulness');
    growthAreas.push('Build a toolkit of healthy coping strategies');
  } else if (scores.neuroticism <= 30) {
    insights.push({
      dimension: 'neuroticism',
      trait: 'Emotionally Stable',
      description: 'You maintain calm under pressure and recover quickly from setbacks.',
      musicImplication: 'You may use music more for enjoyment than emotional processing.'
    });
    strengths.push('Emotional resilience and stability under pressure');
    strengths.push('Quick recovery from setbacks and challenges');
  } else {
    strengths.push('Balanced emotional responsiveness');
  }

  // Add archetype-specific strengths
  const archetypeStrengths = getArchetypeStrengths(archetype.code);
  strengths.push(...archetypeStrengths.strengths);
  growthAreas.push(...archetypeStrengths.growthAreas);

  return {
    archetype,
    insights,
    strengths: [...new Set(strengths)], // Remove duplicates
    growthAreas: [...new Set(growthAreas)], // Remove duplicates
    summary: `As ${archetype.name} (${archetype.code}), you belong to the ${archetype.group} group. ` +
             `Your unique combination of traits shapes how you experience and connect with music.`
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
  ARCHETYPES,
  getQuestions,
  calculateBigFiveScores,
  mapToArchetype,
  saveAssessmentResponses,
  getPersonalityEstimate,
  seedQuestionsToDatabase,
  seedArchetypesToDatabase,
  generatePersonalityInsights
};
