/**
 * Archetype Engine
 * ================
 * Maps OCEAN Big Five scores (0-1) to human-readable archetypes.
 * Each archetype has a name, tagline, and description.
 *
 * Scoring: find the archetype whose OCEAN signature best matches
 * the user's profile via cosine similarity.
 */

export interface Archetype {
  name: string;
  tagline: string;
  description: string;
  /** Ideal OCEAN profile for this archetype [O, C, E, A, N] */
  signature: [number, number, number, number, number];
}

const ARCHETYPES: Archetype[] = [
  {
    name: 'The Architect',
    tagline: 'Builds invisible bridges between worlds',
    description: 'Highly creative and disciplined, you design systems in solitude. Your mind is a workshop — always constructing, always refining. You see patterns others miss and build things that last.',
    signature: [0.9, 0.8, 0.3, 0.6, 0.4],
  },
  {
    name: 'The Explorer',
    tagline: 'Chases horizons others can\'t see',
    description: 'Endlessly curious with a restless spirit. You dive deep into new domains, collect experiences like currency, and connect ideas across disciplines. Routine is your kryptonite.',
    signature: [0.9, 0.4, 0.7, 0.6, 0.5],
  },
  {
    name: 'The Anchor',
    tagline: 'The steady force others orbit around',
    description: 'Reliable, grounding, and deeply loyal. You bring order to chaos and warmth to cold rooms. People gravitate to your stability without realizing how much weight you carry.',
    signature: [0.4, 0.8, 0.5, 0.8, 0.3],
  },
  {
    name: 'The Poet',
    tagline: 'Feels everything, says it differently',
    description: 'Your inner world is vast and vivid. You process life through emotion and metaphor, turning pain into art and observation into insight. Vulnerability is your superpower.',
    signature: [0.8, 0.4, 0.3, 0.7, 0.8],
  },
  {
    name: 'The Catalyst',
    tagline: 'Starts fires in the best way',
    description: 'High energy, high ideas, high impact. You light up rooms and launch movements. Your enthusiasm is contagious — you see possibility where others see problems.',
    signature: [0.8, 0.5, 0.9, 0.7, 0.4],
  },
  {
    name: 'The Strategist',
    tagline: 'Three moves ahead, always',
    description: 'Analytical and composed, you play the long game. You read situations like chess boards and people like open books. Your calm is earned, not given.',
    signature: [0.7, 0.9, 0.4, 0.5, 0.3],
  },
  {
    name: 'The Healer',
    tagline: 'Makes the broken feel whole',
    description: 'Deeply empathetic with an instinct for what others need. You absorb the room\'s energy and transform it. Your presence alone changes the temperature of a conversation.',
    signature: [0.6, 0.5, 0.5, 0.9, 0.6],
  },
  {
    name: 'The Maverick',
    tagline: 'Plays by rules that don\'t exist yet',
    description: 'Unconventional and unapologetic. You challenge norms not for rebellion but because you genuinely see a better way. Your confidence is quiet but absolute.',
    signature: [0.9, 0.3, 0.6, 0.4, 0.5],
  },
  {
    name: 'The Guardian',
    tagline: 'Protects what matters, silently',
    description: 'Loyal, principled, and deeply responsible. You carry more than anyone knows and never complain. Your strength is invisible to everyone except those closest to you.',
    signature: [0.4, 0.7, 0.4, 0.8, 0.5],
  },
  {
    name: 'The Alchemist',
    tagline: 'Turns chaos into gold',
    description: 'You thrive in uncertainty and transform it into something beautiful. Where others see noise, you hear music. Your mind connects the unconnectable.',
    signature: [0.9, 0.5, 0.5, 0.5, 0.6],
  },
  {
    name: 'The Commander',
    tagline: 'Born to lead, built to decide',
    description: 'Decisive, driven, and direct. You cut through ambiguity and rally people toward a vision. Your energy is magnetic — people follow because you move first.',
    signature: [0.6, 0.8, 0.8, 0.4, 0.3],
  },
  {
    name: 'The Dreamer',
    tagline: 'Lives in a world worth building',
    description: 'Idealistic and imaginative, you see the world not as it is but as it could be. Your inner life is rich, your ambitions are quiet, and your vision is decades ahead.',
    signature: [0.9, 0.3, 0.3, 0.6, 0.7],
  },
];

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

export interface ArchetypeResult {
  archetype: Archetype;
  similarity: number;
  runner_up: Archetype;
}

/**
 * Determine the user's archetype from OCEAN scores.
 * All scores should be 0-1. Returns best match + runner-up.
 */
export function determineArchetype(
  openness: number,
  conscientiousness: number,
  extraversion: number,
  agreeableness: number,
  neuroticism: number,
): ArchetypeResult {
  const userProfile = [openness, conscientiousness, extraversion, agreeableness, neuroticism];

  const scored = ARCHETYPES
    .map(a => ({ archetype: a, similarity: cosineSimilarity(userProfile, a.signature) }))
    .sort((a, b) => b.similarity - a.similarity);

  return {
    archetype: scored[0].archetype,
    similarity: scored[0].similarity,
    runner_up: scored[1].archetype,
  };
}

/**
 * Generate trait badges from OCEAN scores + expert insights.
 * Returns 6-8 short, punchy labels.
 */
export function generateTraitBadges(
  openness: number,
  conscientiousness: number,
  extraversion: number,
  agreeableness: number,
  neuroticism: number,
): string[] {
  const badges: string[] = [];

  // OCEAN-derived badges
  if (openness > 0.75) badges.push('Curious Mind');
  if (openness > 0.85) badges.push('Pattern Seeker');
  if (conscientiousness > 0.75) badges.push('Deep Worker');
  if (conscientiousness > 0.85) badges.push('Systems Thinker');
  if (extraversion < 0.4) badges.push('Small Circle');
  if (extraversion > 0.7) badges.push('Social Spark');
  if (agreeableness > 0.75) badges.push('Quiet Listener');
  if (agreeableness < 0.4) badges.push('Truth Teller');
  if (neuroticism > 0.65) badges.push('Deep Feeler');
  if (neuroticism < 0.35) badges.push('Unshakeable');

  // Limit to 8 badges max
  return badges.slice(0, 8);
}

/**
 * Extract the best 1-liner from an array of expert insight paragraphs.
 * Takes the first sentence of the first insight, cleaned up.
 */
export function extractOneLiner(insights: string[]): string {
  if (!insights || insights.length === 0) return '';

  // Take first insight, strip markdown bold
  let text = insights[0].replace(/\*\*/g, '').replace(/\*/g, '').trim();

  // Remove leading quotes
  if (text.startsWith('"')) text = text.slice(1);
  if (text.endsWith('"')) text = text.slice(0, -1);

  // Get first sentence (up to first period followed by space or end)
  const match = text.match(/^(.+?[.!?])(?:\s|$)/);
  if (match) return match[1].trim();

  // Fallback: first 120 chars
  return text.length > 120 ? text.slice(0, 117) + '...' : text;
}
