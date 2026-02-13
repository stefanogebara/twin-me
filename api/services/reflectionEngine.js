/**
 * Reflection Engine
 * =================
 * Inspired by Generative Agents (Park et al., UIST 2023).
 *
 * Periodically synthesizes raw observations into higher-level insights ("reflections")
 * that capture patterns, preferences, and personality traits the user might not notice.
 *
 * Process:
 *   1. Gather N recent memories (all types)
 *   2. Ask LLM: "What are 3 salient questions about this person's patterns?"
 *   3. For each question, retrieve relevant memories via vector search
 *   4. Ask LLM: "What insights can you infer? Cite evidence."
 *   5. Store each insight as memory_type='reflection' with high importance (7-9)
 *   6. Reflections become retrievable in future queries (recursive improvement)
 *
 * Trigger conditions:
 *   - After twin chat when accumulated importance > 25
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
const IMPORTANCE_THRESHOLD = 25;

// Cooldown: don't reflect more than once per hour per user
const reflectionCooldowns = new Map();
const REFLECTION_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

// ====================================================================
// Core Reflection Pipeline
// ====================================================================

const QUESTION_GENERATION_PROMPT = `You are analyzing observations about a person to understand their deeper patterns and personality.

Given these recent observations, generate exactly 3 salient questions that would help understand this person's patterns, preferences, or personality at a deeper level. Focus on:
- Cross-platform patterns (connections between music, health, schedule, etc.)
- Emotional patterns and coping mechanisms
- Identity and values (what drives them, what they care about)

Observations:
{observations}

Return exactly 3 questions, one per line, numbered 1-3. No other text.`;

const INSIGHT_GENERATION_PROMPT = `You are synthesizing observations about a person to extract a deep insight.

Question: {question}

Relevant evidence from their life:
{evidence}

Based on this evidence, write ONE concise insight (2-3 sentences) about this person's pattern, preference, or personality trait. Be specific and cite the evidence naturally. Write in third person ("This person...").

If the evidence is insufficient to draw a meaningful insight, respond with "INSUFFICIENT_EVIDENCE".

Insight:`;

/**
 * Generate reflections for a user by synthesizing recent observations.
 * Returns the number of reflections generated.
 */
async function generateReflections(userId) {
  // Check cooldown
  const lastReflection = reflectionCooldowns.get(userId);
  if (lastReflection && (Date.now() - lastReflection) < REFLECTION_COOLDOWN_MS) {
    console.log(`[Reflection] Skipping - cooldown active for user ${userId}`);
    return 0;
  }

  try {
    console.log(`[Reflection] Starting reflection generation for user ${userId}`);

    // Step 1: Gather recent memories
    const recentMemories = await getRecentMemories(userId, 50);
    if (recentMemories.length < 5) {
      console.log(`[Reflection] Not enough memories (${recentMemories.length}) to reflect`);
      return 0;
    }

    // Format observations for the LLM
    const observations = recentMemories
      .slice(0, 30) // Cap at 30 for prompt size
      .map((m, i) => {
        const timeAgo = getTimeAgoShort(m.created_at);
        const type = m.memory_type === 'reflection' ? '[insight]' : `[${m.memory_type}]`;
        return `${i + 1}. ${type} (${timeAgo}) ${m.content.substring(0, 200)}`;
      })
      .join('\n');

    // Step 2: Generate salient questions
    const questionResult = await complete({
      tier: TIER_ANALYSIS,
      messages: [{
        role: 'user',
        content: QUESTION_GENERATION_PROMPT.replace('{observations}', observations),
      }],
      maxTokens: 200,
      temperature: 0.7,
      serviceName: 'reflectionEngine-questions',
    });

    const questionText = questionResult.content || '';
    const questions = questionText
      .split('\n')
      .map(line => line.replace(/^\d+\.\s*/, '').trim())
      .filter(q => q.length > 10)
      .slice(0, 3);

    if (questions.length === 0) {
      console.warn('[Reflection] No valid questions generated');
      return 0;
    }

    console.log(`[Reflection] Generated ${questions.length} questions for user ${userId}`);

    // Steps 3-5: For each question, retrieve evidence and generate insight
    let reflectionsGenerated = 0;

    for (const question of questions) {
      try {
        // Step 3: Retrieve relevant memories via vector search
        const relevantMemories = await retrieveMemories(userId, question, 8);

        if (relevantMemories.length < 2) {
          console.log(`[Reflection] Insufficient evidence for: "${question.substring(0, 50)}..."`);
          continue;
        }

        // Step 4: Generate insight
        const evidence = relevantMemories
          .map((m, i) => `- ${m.content.substring(0, 200)}`)
          .join('\n');

        const insightResult = await complete({
          tier: TIER_ANALYSIS,
          messages: [{
            role: 'user',
            content: INSIGHT_GENERATION_PROMPT
              .replace('{question}', question)
              .replace('{evidence}', evidence),
          }],
          maxTokens: 200,
          temperature: 0.3,
          serviceName: 'reflectionEngine-insight',
        });

        const insight = (insightResult.content || '').trim();

        if (!insight || insight === 'INSUFFICIENT_EVIDENCE' || insight.length < 20) {
          continue;
        }

        // Step 5: Store reflection
        const evidenceIds = relevantMemories.map(m => m.id);
        const result = await addReflection(userId, insight, evidenceIds, {
          question,
          evidenceCount: relevantMemories.length,
        });

        if (result) {
          reflectionsGenerated++;
          console.log(`[Reflection] Generated insight: "${insight.substring(0, 80)}..."`);
        }
      } catch (questionError) {
        console.warn(`[Reflection] Error processing question:`, questionError.message);
      }
    }

    // Set cooldown
    reflectionCooldowns.set(userId, Date.now());

    console.log(`[Reflection] Completed: ${reflectionsGenerated} reflections for user ${userId}`);
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
  IMPORTANCE_THRESHOLD,
};
