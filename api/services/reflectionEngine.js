/**
 * Expert Reflection Engine
 * ========================
 * Inspired by "Generative Agent Simulations of 1,000 People" (Park et al., 2024)
 * and the original Generative Agents (Park et al., UIST 2023).
 *
 * Instead of the original generic 3-question approach, this engine uses 5 domain-
 * specific expert personas that each analyze memories from their own perspective.
 * This mirrors Paper 2's use of expert reflections (Psychologist, Behavioral
 * Economist, Political Scientist, Demographer) which generated 5-20 observations
 * per persona per person, dramatically improving agent fidelity.
 *
 * Expert Personas (adapted for digital twin context):
 *   1. Personality Psychologist - Emotional patterns, coping, attachment style
 *   2. Lifestyle Analyst - Daily rhythms, energy, health-behavior connections
 *   3. Cultural Identity Expert - Aesthetic preferences, media taste, expression
 *   4. Social Dynamics Analyst - Communication style, relationship patterns
 *   5. Motivation Analyst - Work patterns, ambitions, decision-making style
 *
 * Process:
 *   1. Gather N recent memories (all types)
 *   2. For each expert (in parallel):
 *      a. Retrieve domain-relevant memories via vector search
 *      b. Expert analyzes combined evidence and generates 2-3 observations
 *      c. Store each observation as memory_type='reflection' with expert metadata
 *   3. Reflections become retrievable in future queries (recursive improvement)
 *
 * Trigger conditions:
 *   - After twin chat when accumulated importance > 15
 *   - After platform data sync completes
 *   - Can be called manually for seeding initial reflections
 *
 * Usage:
 *   import { generateReflections, shouldTriggerReflection } from './reflectionEngine.js';
 *   if (await shouldTriggerReflection(userId)) {
 *     generateReflections(userId).catch(console.error); // Run in background
 *   }
 */

import { complete, TIER_ANALYSIS } from './llmGateway.js';
import {
  getRecentMemories,
  retrieveMemories,
  addReflection,
  getRecentImportanceSum,
} from './memoryStreamService.js';

// Reflection threshold: trigger when sum of recent importance scores exceeds this
// Lowered from 50 to 15 so new users trigger reflections earlier (~3 memories rated 5)
export const IMPORTANCE_THRESHOLD = 15;

// Max recursive reflection depth (paper allows reflections on reflections)
const MAX_REFLECTION_DEPTH = 3;

// Cooldown: don't reflect more than once per hour per user
const reflectionCooldowns = new Map();
const REFLECTION_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

// ====================================================================
// Expert Persona Definitions
// ====================================================================

/**
 * Each expert has:
 * - id: Short identifier for metadata/logging
 * - name: Display name
 * - retrievalQuery: Domain-specific query to find relevant memories via vector search
 * - prompt: The expert's analysis prompt (receives {observations} and {evidence})
 */
const EXPERT_PERSONAS = [
  {
    id: 'personality_psychologist',
    name: 'Personality Psychologist',
    retrievalQuery: "emotional reactions, stress responses, coping mechanisms, mood patterns, feelings about relationships and self",
    prompt: `You are an expert personality psychologist analyzing behavioral data about a person to understand their psychological profile.

Your domain: emotional patterns, attachment style, coping mechanisms, stress responses, emotional regulation, Big Five personality traits as revealed through behavior (not self-report).

Recent observations about this person:
{observations}

Additional evidence from their life (retrieved by relevance to your domain):
{evidence}

Based on this evidence, generate 2-3 specific psychological observations about this person. Each observation should be:
- Grounded in the specific evidence provided (cite what you see)
- Written as a concise insight (1-2 sentences)
- In third person ("This person...")
- A genuine psychological pattern, NOT a surface description

Focus on patterns they might not notice themselves: emotional triggers, coping strategies, attachment behaviors, how their mood connects to their activities.

If the evidence is insufficient for your domain, return "INSUFFICIENT_EVIDENCE".

Return each observation on a new line, prefixed with a number (1., 2., 3.). No other text.`
  },
  {
    id: 'lifestyle_analyst',
    name: 'Lifestyle Analyst',
    retrievalQuery: "daily routine, sleep patterns, exercise habits, energy levels, health metrics, time management, work-life balance",
    prompt: `You are an expert lifestyle analyst studying a person's daily patterns to understand their rhythms and habits.

Your domain: daily routines, energy patterns, sleep-wake cycles, health-behavior connections, routine vs spontaneity balance, how physical state affects decisions and mood.

Recent observations about this person:
{observations}

Additional evidence from their life (retrieved by relevance to your domain):
{evidence}

Based on this evidence, generate 2-3 specific lifestyle observations about this person. Each observation should be:
- Grounded in the specific evidence provided (cite what you see)
- Written as a concise insight (1-2 sentences)
- In third person ("This person...")
- A genuine behavioral pattern, NOT a surface description

Focus on cross-domain connections: how sleep affects their music choices, how meeting density correlates with listening habits, recovery trends and their relationship to schedule patterns.

If the evidence is insufficient for your domain, return "INSUFFICIENT_EVIDENCE".

Return each observation on a new line, prefixed with a number (1., 2., 3.). No other text.`
  },
  {
    id: 'cultural_identity',
    name: 'Cultural Identity Expert',
    retrievalQuery: "music taste, content preferences, aesthetic choices, media consumption, creative interests, cultural references, hobbies",
    prompt: `You are a cultural identity expert analyzing a person's media consumption and aesthetic choices to understand their identity.

Your domain: music taste and what it reveals, content preferences, aesthetic sensibilities, cultural markers, creative expression, how media choices reflect inner states and values.

Recent observations about this person:
{observations}

Additional evidence from their life (retrieved by relevance to your domain):
{evidence}

Based on this evidence, generate 2-3 specific cultural identity observations about this person. Each observation should be:
- Grounded in the specific evidence provided (cite what you see)
- Written as a concise insight (1-2 sentences)
- In third person ("This person...")
- A genuine identity pattern, NOT a surface description

Focus on what their choices reveal: genre shifts as emotional barometers, comfort artists vs exploration, content that signals deeper values or aspirations.

If the evidence is insufficient for your domain, return "INSUFFICIENT_EVIDENCE".

Return each observation on a new line, prefixed with a number (1., 2., 3.). No other text.`
  },
  {
    id: 'social_dynamics',
    name: 'Social Dynamics Analyst',
    retrievalQuery: "communication style, social interactions, meeting patterns, relationship dynamics, how they talk to others, social energy management",
    prompt: `You are a social dynamics analyst studying a person's communication patterns and social behaviors.

Your domain: communication style, social energy management, introversion/extraversion as revealed by behavior, relationship maintenance patterns, how they structure their social world.

Recent observations about this person:
{observations}

Additional evidence from their life (retrieved by relevance to your domain):
{evidence}

Based on this evidence, generate 2-3 specific social dynamics observations about this person. Each observation should be:
- Grounded in the specific evidence provided (cite what you see)
- Written as a concise insight (1-2 sentences)
- In third person ("This person...")
- A genuine social pattern, NOT a surface description

Focus on: how they structure their social calendar, patterns in when they seek vs avoid interaction, communication patterns that reveal their social identity, how social load affects other behaviors.

If the evidence is insufficient for your domain, return "INSUFFICIENT_EVIDENCE".

Return each observation on a new line, prefixed with a number (1., 2., 3.). No other text.`
  },
  {
    id: 'motivation_analyst',
    name: 'Motivation Analyst',
    retrievalQuery: "work patterns, goals, ambitions, decision making, career interests, what drives them, productivity patterns, focus sessions, goal streaks, commitment patterns",
    prompt: `You are a motivation analyst studying a person's drive patterns and decision-making to understand what moves them.

Your domain: work patterns, goal orientation, intrinsic vs extrinsic motivation, decision-making style, how they allocate their most productive time, what they prioritize when constrained, goal commitment and follow-through patterns.

Recent observations about this person:
{observations}

Additional evidence from their life (retrieved by relevance to your domain):
{evidence}

Based on this evidence, generate 2-3 specific motivation observations about this person. Each observation should be:
- Grounded in the specific evidence provided (cite what you see)
- Written as a concise insight (1-2 sentences)
- In third person ("This person...")
- A genuine motivational pattern, NOT a surface description

Focus on: what they do when they have free time (reveals intrinsic motivation), how they handle competing priorities, patterns in when they're most engaged, what their browsing and content consumption reveal about aspirations. If goal-related data exists, analyze their commitment patterns - do they maintain streaks? What triggers falling off track?

If the evidence is insufficient for your domain, return "INSUFFICIENT_EVIDENCE".

Return each observation on a new line, prefixed with a number (1., 2., 3.). No other text.`
  },
];

// ====================================================================
// Core Expert Reflection Pipeline
// ====================================================================

/**
 * Run a single expert persona against a user's memories.
 * Returns an array of generated reflections (0-3).
 */
async function runExpertAnalysis(userId, expert, formattedObservations, depth) {
  try {
    // Retrieve domain-relevant memories via vector search (reflection weights: relevance dominant, no recency bias)
    const domainMemories = await retrieveMemories(userId, expert.retrievalQuery, 10, 'reflection');

    const evidence = domainMemories.length > 0
      ? domainMemories
          .map(m => `- ${m.content.substring(0, 250)}`)
          .join('\n')
      : 'No additional domain-specific evidence available.';

    // Run expert analysis
    const result = await complete({
      tier: TIER_ANALYSIS,
      messages: [{
        role: 'user',
        content: expert.prompt
          .replace('{observations}', formattedObservations)
          .replace('{evidence}', evidence),
      }],
      maxTokens: 400,
      temperature: 0.4,
      serviceName: `reflection-${expert.id}`,
    });

    const responseText = (result.content || '').trim();

    // Check for insufficient evidence
    if (responseText === 'INSUFFICIENT_EVIDENCE' || responseText.length < 20) {
      console.log(`[Reflection] ${expert.name}: insufficient evidence`);
      return [];
    }

    // Parse numbered observations
    const observations = responseText
      .split('\n')
      .map(line => line.replace(/^\d+\.\s*/, '').trim())
      .filter(obs => obs.length > 20 && obs !== 'INSUFFICIENT_EVIDENCE');

    // Store each observation as a reflection
    const stored = [];
    const evidenceIds = domainMemories.map(m => m.id);

    for (const observation of observations.slice(0, 3)) {
      const reflectionResult = await addReflection(userId, observation, evidenceIds, {
        expert: expert.id,
        expertName: expert.name,
        reflectionDepth: depth,
        evidenceCount: domainMemories.length,
      });

      if (reflectionResult) {
        stored.push(observation);
        console.log(`[Reflection] ${expert.name}: "${observation.substring(0, 70)}..."`);
      }
    }

    return stored;
  } catch (error) {
    console.warn(`[Reflection] ${expert.name} error:`, error.message);
    return [];
  }
}

/**
 * Generate reflections for a user using the expert persona system.
 * Runs all 5 experts in parallel for efficiency.
 * Returns the number of reflections generated.
 */
async function generateReflections(userId, depth = 0) {
  if (depth >= MAX_REFLECTION_DEPTH) {
    console.log(`[Reflection] Max depth (${MAX_REFLECTION_DEPTH}) reached for user ${userId}`);
    return 0;
  }

  // Check cooldown (only on initial call, not recursive ones)
  if (depth === 0) {
    const lastReflection = reflectionCooldowns.get(userId);
    if (lastReflection && (Date.now() - lastReflection) < REFLECTION_COOLDOWN_MS) {
      console.log(`[Reflection] Skipping - cooldown active for user ${userId}`);
      return 0;
    }
  }

  try {
    console.log(`[Reflection] Starting expert reflection generation (depth ${depth}) for user ${userId}`);

    // Step 1: Gather recent memories
    const recentMemories = await getRecentMemories(userId, 100);
    if (recentMemories.length < 3) {
      console.log(`[Reflection] Not enough memories (${recentMemories.length}) to reflect`);
      return 0;
    }

    // Format observations for the experts (shared context)
    const formattedObservations = recentMemories
      .slice(0, 30) // Cap at 30 for prompt size
      .map((m, i) => {
        const timeAgo = getTimeAgoShort(m.created_at);
        const type = m.memory_type === 'reflection' ? '[insight]' : `[${m.memory_type}]`;
        return `${i + 1}. ${type} (${timeAgo}) ${m.content.substring(0, 200)}`;
      })
      .join('\n');

    // Step 2: Run all experts in parallel
    console.log(`[Reflection] Running ${EXPERT_PERSONAS.length} expert analyses in parallel...`);

    const expertResults = await Promise.all(
      EXPERT_PERSONAS.map(expert =>
        runExpertAnalysis(userId, expert, formattedObservations, depth)
      )
    );

    // Count total reflections generated
    let reflectionsGenerated = 0;
    for (let i = 0; i < EXPERT_PERSONAS.length; i++) {
      const result = expertResults[i];
      if (!Array.isArray(result)) {
        console.warn(`[Reflection] Expert ${EXPERT_PERSONAS[i].id} returned invalid result`);
        continue;
      }
      const count = result.length;
      if (count > 0) {
        console.log(`[Reflection] ${EXPERT_PERSONAS[i].name}: ${count} reflections`);
      }
      reflectionsGenerated += count;
    }

    // Recursive reflection: if new reflections pushed importance back over threshold
    if (reflectionsGenerated > 0 && depth < MAX_REFLECTION_DEPTH - 1) {
      const newSum = await getRecentImportanceSum(userId, 2);
      if (newSum >= IMPORTANCE_THRESHOLD) {
        console.log(`[Reflection] Importance ${newSum} >= ${IMPORTANCE_THRESHOLD} after depth ${depth}, recursing...`);
        reflectionsGenerated += await generateReflections(userId, depth + 1);
      }
    }

    // Set cooldown (only on initial call) and auto-expire to prevent memory leak
    if (depth === 0) {
      reflectionCooldowns.set(userId, Date.now());
      setTimeout(() => reflectionCooldowns.delete(userId), REFLECTION_COOLDOWN_MS);
    }

    console.log(`[Reflection] Completed depth ${depth}: ${reflectionsGenerated} reflections from ${EXPERT_PERSONAS.length} experts for user ${userId}`);
    return reflectionsGenerated;
  } catch (error) {
    console.error('[Reflection] generateReflections error:', error.message);
    return 0;
  }
}

/**
 * Check if reflection should be triggered based on accumulated importance.
 */
async function shouldTriggerReflection(userId) {
  // Check cooldown first (cheap)
  const lastReflection = reflectionCooldowns.get(userId);
  if (lastReflection && (Date.now() - lastReflection) < REFLECTION_COOLDOWN_MS) {
    return false;
  }

  // Check accumulated importance
  const importanceSum = await getRecentImportanceSum(userId, 2);
  return importanceSum >= IMPORTANCE_THRESHOLD;
}

/**
 * Seed initial reflections for a user from their existing memory base.
 * Useful for bootstrapping the reflection layer for existing users.
 */
async function seedReflections(userId) {
  console.log(`[Reflection] Seeding initial reflections for user ${userId}`);
  // Clear cooldown to allow immediate reflection
  reflectionCooldowns.delete(userId);
  return generateReflections(userId);
}

// ====================================================================
// Helpers
// ====================================================================

function getTimeAgoShort(timestamp) {
  if (!timestamp) return 'recently';
  const diffMs = Date.now() - new Date(timestamp).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

export {
  generateReflections,
  shouldTriggerReflection,
  seedReflections,
  EXPERT_PERSONAS,
};
