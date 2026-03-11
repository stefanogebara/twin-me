/**
 * InCharacter Personality Evaluation (Weekly)
 * ============================================
 * Automated Big Five + MBTI personality assessment from memory stream.
 * Runs weekly to track personality drift over time.
 *
 * Based on: "InCharacter: Evaluating Personality Fidelity in Role-Playing Agents"
 * (Wang et al., ACL 2024, arXiv 2310.17976)
 *
 * Uses TIER_ANALYSIS (DeepSeek) — ~$0.05/evaluation
 */

import { complete, TIER_ANALYSIS } from './llmGateway.js';
import { supabaseAdmin } from './database.js';
import { getRecentMemories } from './memoryStreamService.js';
import { createLogger } from './logger.js';

const log = createLogger('PersonalityEvaluation');

const BIG_FIVE_TRAITS = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism'];
const MBTI_DIMENSIONS = [
  { axis: 'EI', labels: ['Extraversion', 'Introversion'] },
  { axis: 'SN', labels: ['Sensing', 'Intuition'] },
  { axis: 'TF', labels: ['Thinking', 'Feeling'] },
  { axis: 'JP', labels: ['Judging', 'Perceiving'] },
];

/**
 * Run a personality evaluation for a single user.
 *
 * @param {string} userId
 * @returns {Promise<Object|null>} Assessment result or null if insufficient data
 */
export async function evaluatePersonality(userId) {
  // Fetch top 50 diverse memories for analysis
  const memories = await getRecentMemories(userId, 50);
  if (!memories || memories.length < 10) {
    log.info(`Skipping user ${userId}: insufficient memories (${memories?.length || 0})`);
    return null;
  }

  // Build memory digest for the LLM
  const memoryDigest = memories.map((m, i) =>
    `[${i + 1}] (${m.memory_type}) ${m.content.substring(0, 200)}`
  ).join('\n');

  // Fetch existing twin summary for richer context
  const { data: summary } = await supabaseAdmin
    .from('twin_summaries')
    .select('summary_text')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const summaryContext = summary?.summary_text
    ? `\nTWIN SUMMARY:\n${summary.summary_text.substring(0, 500)}`
    : '';

  const result = await complete({
    tier: TIER_ANALYSIS,
    system: `You are a personality psychologist. Analyze the user's memory stream and twin summary to produce a personality assessment.

Return ONLY valid JSON with this exact structure:
{
  "big_five": {
    "openness": { "score": <1-100>, "confidence": <0.0-1.0>, "evidence": "<brief quote or pattern>" },
    "conscientiousness": { "score": <1-100>, "confidence": <0.0-1.0>, "evidence": "<brief>" },
    "extraversion": { "score": <1-100>, "confidence": <0.0-1.0>, "evidence": "<brief>" },
    "agreeableness": { "score": <1-100>, "confidence": <0.0-1.0>, "evidence": "<brief>" },
    "neuroticism": { "score": <1-100>, "confidence": <0.0-1.0>, "evidence": "<brief>" }
  },
  "mbti": {
    "EI": { "score": <-100 to 100, negative=I, positive=E>, "label": "<E or I>" },
    "SN": { "score": <-100 to 100, negative=N, positive=S>, "label": "<S or N>" },
    "TF": { "score": <-100 to 100, negative=F, positive=T>, "label": "<T or F>" },
    "JP": { "score": <-100 to 100, negative=P, positive=J>, "label": "<J or P>" }
  },
  "summary": "<2-3 sentence personality portrait>"
}

Be evidence-based. Low confidence (< 0.5) if insufficient evidence for a trait. Score 50 = average.`,
    messages: [
      {
        role: 'user',
        content: `MEMORY STREAM (${memories.length} memories):\n${memoryDigest}${summaryContext}\n\nAnalyze this person's personality. Return JSON only.`,
      },
    ],
    maxTokens: 1024,
    temperature: 0.3,
    userId,
    serviceName: 'personality-evaluation',
  });

  const text = result?.content || result?.text || '';

  // Extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    log.warn('Failed to parse LLM response');
    return null;
  }

  try {
    const scores = JSON.parse(jsonMatch[0]);

    // Validate structure
    if (!scores.big_five || !scores.mbti) {
      log.warn('Invalid scores structure');
      return null;
    }

    // Store in database
    const { data: assessment, error } = await supabaseAdmin
      .from('personality_assessments')
      .insert({
        user_id: userId,
        assessment_type: 'weekly',
        scores,
        summary: scores.summary || null,
        memory_count: memories.length,
      })
      .select('id')
      .single();

    if (error) {
      // Unique constraint = already assessed this week
      if (error.code === '23505') {
        log.info(`Already assessed user ${userId} this week`);
        return null;
      }
      log.warn('Insert error:', error.message);
      return null;
    }

    log.info(`Assessment complete for user ${userId}: ${assessment.id}`);
    return { id: assessment.id, scores };
  } catch (parseErr) {
    log.warn('JSON parse error:', parseErr.message);
    return null;
  }
}

/**
 * Get personality assessment history for a user.
 *
 * @param {string} userId
 * @param {number} limit - Max number of assessments to return (default 12)
 * @returns {Promise<Array>}
 */
export async function getPersonalityHistory(userId, limit = 12) {
  const { data, error } = await supabaseAdmin
    .from('personality_assessments')
    .select('id, scores, summary, memory_count, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}
