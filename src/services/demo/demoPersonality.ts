/**
 * Demo Personality Data
 * Personality scores, archetypes, behavioral features, and MBTI assessment for demo mode
 */

// =====================================================
// SOUL SIGNATURE DASHBOARD - Personality Scores
// =====================================================

export interface DemoPersonalityScores {
  id: string;
  mind?: number;
  energy?: number;
  nature?: number;
  tactics?: number;
  identity?: number;
  mind_ci?: number;
  energy_ci?: number;
  nature_ci?: number;
  tactics_ci?: number;
  identity_ci?: number;
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
  openness_confidence: number;
  conscientiousness_confidence: number;
  extraversion_confidence: number;
  agreeableness_confidence: number;
  neuroticism_confidence: number;
  archetype_code?: string;
  analyzed_platforms: string[];
  sample_size: number;
}

export const DEMO_PERSONALITY_SCORES: DemoPersonalityScores = {
  id: 'demo-scores',
  mind: 72,
  energy: 78,
  nature: 45,
  tactics: 65,
  identity: 68,
  mind_ci: 12,
  energy_ci: 15,
  nature_ci: 18,
  tactics_ci: 14,
  identity_ci: 16,
  archetype_code: 'ENTJ-A',
  openness: 78,
  conscientiousness: 65,
  extraversion: 72,
  agreeableness: 45,
  neuroticism: 32,
  openness_confidence: 85,
  conscientiousness_confidence: 86,
  extraversion_confidence: 88,
  agreeableness_confidence: 82,
  neuroticism_confidence: 84,
  analyzed_platforms: ['spotify', 'google_calendar'],
  sample_size: 47
};

// =====================================================
// SOUL SIGNATURE DASHBOARD - Archetype (different from DEMO_SOUL_SIGNATURE)
// =====================================================

export interface DemoSoulArchetype {
  id: string;
  archetype_name: string;
  archetype_subtitle: string;
  narrative: string;
  defining_traits: Array<{
    trait: string;
    score: number;
    evidence: string;
  }>;
  color_scheme: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
  };
  icon_type: string;
}

export const DEMO_SOUL_ARCHETYPE: DemoSoulArchetype = {
  id: 'demo-signature',
  archetype_name: 'The Creative Explorer',
  archetype_subtitle: 'Curious mind with a passion for discovery',
  narrative: 'You are driven by an insatiable curiosity and a desire to understand the world around you. Your eclectic taste in music and content reveals a mind that thrives on variety and novelty. You connect deeply with others while maintaining your unique perspective, making you both relatable and distinctively original.',
  defining_traits: [
    { trait: 'Intellectual Curiosity', score: 92, evidence: 'Diverse music genres in Spotify history' },
    { trait: 'Work-Life Balance', score: 78, evidence: 'Healthy mix of meetings and focus time' },
    { trait: 'Emotional Depth', score: 74, evidence: 'Music choices reflect mood awareness' }
  ],
  color_scheme: {
    primary: '#C1C0B6',
    secondary: '#A8A79E',
    accent: '#D4D3CC',
    background: '#2D2D29',
    text: '#C1C0B6'
  },
  icon_type: 'compass'
};

// =====================================================
// SOUL SIGNATURE DASHBOARD - Behavioral Features
// =====================================================

export interface DemoBehavioralFeature {
  id: string;
  platform: string;
  feature_type: string;
  feature_value: number;
  contributes_to: string;
  confidence_score: number;
}

export const DEMO_BEHAVIORAL_FEATURES: DemoBehavioralFeature[] = [
  { id: 'f1', platform: 'spotify', feature_type: 'music_diversity', feature_value: 85, contributes_to: 'openness', confidence_score: 90 },
  { id: 'f2', platform: 'google_calendar', feature_type: 'focus_time_ratio', feature_value: 67, contributes_to: 'conscientiousness', confidence_score: 78 },
  { id: 'f3', platform: 'google_calendar', feature_type: 'social_events_ratio', feature_value: 68, contributes_to: 'extraversion', confidence_score: 85 }
];

// =====================================================
// PERSONALITY ASSESSMENT - MBTI Questions
// =====================================================

export interface DemoMBTIQuestion {
  id: string;
  dimension: string;
  facet: string;
  question: string;
  order: number;
}

export const DEMO_MBTI_QUESTIONS: DemoMBTIQuestion[] = [
  // Mind (I/E) - 3 questions
  { id: 'IE1', dimension: 'mind', facet: 'social_energy', question: 'I feel energized after spending time with a large group of people.', order: 1 },
  { id: 'IE2', dimension: 'mind', facet: 'social_preference', question: 'I prefer working in teams rather than alone.', order: 2 },
  { id: 'IE3', dimension: 'mind', facet: 'external_processing', question: 'I often think out loud and process ideas by talking to others.', order: 3 },
  // Energy (S/N) - 3 questions
  { id: 'SN1', dimension: 'energy', facet: 'abstract_thinking', question: 'I enjoy exploring abstract theories and hidden meanings.', order: 4 },
  { id: 'SN2', dimension: 'energy', facet: 'future_focus', question: 'I spend more time thinking about future possibilities than past experiences.', order: 5 },
  { id: 'SN3', dimension: 'energy', facet: 'pattern_recognition', question: 'I often notice patterns and connections that others might miss.', order: 6 },
  // Nature (T/F) - 3 questions
  { id: 'TF1', dimension: 'nature', facet: 'decision_logic', question: 'When making decisions, I prioritize logic over people\'s feelings.', order: 7 },
  { id: 'TF2', dimension: 'nature', facet: 'objectivity', question: 'I believe being objective is more important than being tactful.', order: 8 },
  { id: 'TF3', dimension: 'nature', facet: 'criticism', question: 'I can easily give critical feedback without worrying about hurting feelings.', order: 9 },
  // Tactics (J/P) - 3 questions
  { id: 'JP1', dimension: 'tactics', facet: 'planning', question: 'I prefer having a detailed plan before starting a project.', order: 10 },
  { id: 'JP2', dimension: 'tactics', facet: 'structure', question: 'I feel most comfortable when I have a clear schedule and routine.', order: 11 },
  { id: 'JP3', dimension: 'tactics', facet: 'closure', question: 'I like to complete tasks well before deadlines.', order: 12 },
  // Identity (A/T) - 3 questions
  { id: 'AT1', dimension: 'identity', facet: 'self_assurance', question: 'I rarely worry about how others perceive me.', order: 13 },
  { id: 'AT2', dimension: 'identity', facet: 'stress_response', question: 'I handle stressful situations calmly without much anxiety.', order: 14 },
  { id: 'AT3', dimension: 'identity', facet: 'confidence', question: 'I feel confident in my abilities even when facing new challenges.', order: 15 },
];

// MBTI Archetype definitions
export const MBTI_ARCHETYPES: Record<string, { name: string; title: string; description: string }> = {
  'INTJ': { name: 'The Architect', title: 'Strategic and Independent Thinker', description: 'Architects are imaginative and strategic thinkers with a plan for everything. They value intelligence and competence, and typically have high standards for themselves and others.' },
  'INTP': { name: 'The Logician', title: 'Innovative Inventor', description: 'Logicians are innovative inventors with an unquenchable thirst for knowledge. They love to analyze theories and ideas, searching for the truth.' },
  'ENTJ': { name: 'The Commander', title: 'Bold and Imaginative Leader', description: 'Commanders are bold, imaginative and strong-willed leaders, always finding a way \u2013 or making one. They are strategic thinkers with clear visions.' },
  'ENTP': { name: 'The Debater', title: 'Smart and Curious Thinker', description: 'Debaters are smart and curious thinkers who cannot resist an intellectual challenge. They love to challenge conventions and find new solutions.' },
  'INFJ': { name: 'The Advocate', title: 'Quiet and Mystical Idealist', description: 'Advocates are quiet and mystical, yet very inspiring and tireless idealists. They are principled and dedicated to helping others.' },
  'INFP': { name: 'The Mediator', title: 'Poetic and Kind Idealist', description: 'Mediators are poetic, kind and altruistic people, always eager to help a good cause. They are guided by principles rather than logic.' },
  'ENFJ': { name: 'The Protagonist', title: 'Charismatic and Inspiring Leader', description: 'Protagonists are charismatic and inspiring leaders, able to mesmerize their listeners. They are natural teachers who are passionate about helping others grow.' },
  'ENFP': { name: 'The Campaigner', title: 'Enthusiastic and Creative Free Spirit', description: 'Campaigners are enthusiastic, creative and sociable free spirits, who can always find a reason to smile. They see life as full of possibilities.' },
  'ISTJ': { name: 'The Logistician', title: 'Practical and Fact-minded', description: 'Logisticians are practical and fact-minded individuals, whose reliability cannot be doubted. They take responsibility and honor their commitments.' },
  'ISFJ': { name: 'The Defender', title: 'Dedicated and Warm Protector', description: 'Defenders are very dedicated and warm protectors, always ready to defend their loved ones. They are supportive and reliable.' },
  'ESTJ': { name: 'The Executive', title: 'Excellent Administrator', description: 'Executives are excellent administrators, unsurpassed at managing things and people. They have a clear vision of how things should be done.' },
  'ESFJ': { name: 'The Consul', title: 'Caring and Social Caretaker', description: 'Consuls are extraordinarily caring, social and popular people, always eager to help. They value tradition and are very loyal.' },
  'ISTP': { name: 'The Virtuoso', title: 'Bold and Practical Experimenter', description: 'Virtuosos are bold and practical experimenters, masters of all kinds of tools. They are highly practical and enjoy exploring with their hands.' },
  'ISFP': { name: 'The Adventurer', title: 'Flexible and Charming Artist', description: 'Adventurers are flexible and charming artists, always ready to explore and experience something new. They live in the moment.' },
  'ESTP': { name: 'The Entrepreneur', title: 'Smart and Energetic Perceiver', description: 'Entrepreneurs are smart, energetic and very perceptive people, who truly enjoy living on the edge. They love being the center of attention.' },
  'ESFP': { name: 'The Entertainer', title: 'Spontaneous and Energetic Entertainer', description: 'Entertainers are spontaneous, energetic and enthusiastic people \u2013 life is never boring around them. They love to be the life of the party.' },
};

// Generate demo personality result from responses
export function generateDemoPersonalityResult(responses: Map<string, number>) {
  const dimensionScores: Record<string, number[]> = {
    mind: [],
    energy: [],
    nature: [],
    tactics: [],
    identity: [],
  };

  responses.forEach((value, questionId) => {
    const question = DEMO_MBTI_QUESTIONS.find(q => q.id === questionId);
    if (question && dimensionScores[question.dimension]) {
      const normalizedScore = ((value - 1) / 6) * 100;
      dimensionScores[question.dimension].push(normalizedScore);
    }
  });

  const scores = {
    extraversion: dimensionScores.mind.length > 0
      ? dimensionScores.mind.reduce((a, b) => a + b, 0) / dimensionScores.mind.length
      : 50,
    openness: dimensionScores.energy.length > 0
      ? dimensionScores.energy.reduce((a, b) => a + b, 0) / dimensionScores.energy.length
      : 50,
    agreeableness: 100 - (dimensionScores.nature.length > 0
      ? dimensionScores.nature.reduce((a, b) => a + b, 0) / dimensionScores.nature.length
      : 50),
    conscientiousness: dimensionScores.tactics.length > 0
      ? dimensionScores.tactics.reduce((a, b) => a + b, 0) / dimensionScores.tactics.length
      : 50,
    neuroticism: 100 - (dimensionScores.identity.length > 0
      ? dimensionScores.identity.reduce((a, b) => a + b, 0) / dimensionScores.identity.length
      : 50),
  };

  const letters = {
    e: scores.extraversion >= 50 ? 'E' : 'I',
    n: scores.openness >= 50 ? 'N' : 'S',
    f: scores.agreeableness >= 50 ? 'F' : 'T',
    j: scores.conscientiousness >= 50 ? 'J' : 'P',
    identity: scores.neuroticism < 50 ? 'A' : 'T',
  };

  const code = `${letters.e}${letters.n}${letters.f}${letters.j}`;
  const fullCode = `${code}-${letters.identity}`;
  const archetype = MBTI_ARCHETYPES[code] || { name: 'The Explorer', title: 'Unique Individual', description: 'Your personality defies easy categorization.' };

  return {
    scores,
    archetype: {
      code,
      fullCode,
      name: archetype.name,
      title: archetype.title,
      description: archetype.description,
      identity: letters.identity,
      identityLabel: letters.identity === 'A' ? 'Assertive' : 'Turbulent',
    },
    insights: {
      strengths: [
        scores.extraversion >= 50 ? 'Natural ability to connect with others and energize teams' : 'Deep focus and ability to work independently',
        scores.openness >= 50 ? 'Creative thinking and openness to new ideas' : 'Practical approach and attention to concrete details',
        scores.conscientiousness >= 50 ? 'Strong organizational skills and reliability' : 'Flexibility and adaptability to change',
      ],
      growthAreas: [
        scores.extraversion >= 50 ? 'Practice quiet reflection and solo activities' : 'Challenge yourself to engage more in group settings',
        scores.neuroticism >= 50 ? 'Develop stress management techniques' : 'Stay connected to your emotional responses',
      ],
      summary: `As ${archetype.name}, you bring unique strengths to your interactions and work style. Your ${letters.identity === 'A' ? 'assertive' : 'turbulent'} identity means you ${letters.identity === 'A' ? 'approach challenges with confidence' : 'continuously strive for self-improvement'}.`,
    },
    questionsAnswered: responses.size,
    totalQuestions: 60,
    completionPercentage: Math.round((responses.size / 60) * 100),
  };
}
