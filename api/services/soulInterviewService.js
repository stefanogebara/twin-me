/**
 * Soul Interview Service
 * ======================
 * Cold start solver inspired by Delphi.ai's Interview Mode.
 *
 * The twin interviews the user through 10 deep categories to rapidly build
 * a personality model, instead of waiting for platform data to accumulate.
 *
 * Categories are skipped when platform data already covers them (e.g., skip
 * music questions if Spotify is connected). Answers are stored as high-importance
 * memories (8-9) for immediate twin context.
 *
 * Usage:
 *   import { generateInterviewQuestion, processInterviewAnswer } from './soulInterviewService.js';
 *   const { question, category } = await generateInterviewQuestion(userId, answered, connected);
 *   const { facts } = await processInterviewAnswer(userId, category, question, answer);
 */

import { complete, TIER_EXTRACTION, TIER_ANALYSIS } from './llmGateway.js';
import { addMemory } from './memoryStreamService.js';
import { supabaseAdmin } from './database.js';
import { createLogger } from './logger.js';

const log = createLogger('SoulInterview');

// ====================================================================
// Interview Categories & Questions
// ====================================================================

const INTERVIEW_CATEGORIES = [
  {
    id: 'identity',
    label: 'Identity',
    defaultQuestion: "What do people consistently get wrong about you?",
    skipWhenConnected: [],
  },
  {
    id: 'values',
    label: 'Values',
    defaultQuestion: "What's something you'd never compromise on, even if it cost you?",
    skipWhenConnected: [],
  },
  {
    id: 'relationships',
    label: 'Relationships',
    defaultQuestion: "Describe your ideal Saturday with someone you love.",
    skipWhenConnected: [],
  },
  {
    id: 'work',
    label: 'Work & Flow',
    defaultQuestion: "When you're in flow, what are you usually doing?",
    skipWhenConnected: ['github', 'linkedin'],
  },
  {
    id: 'emotions',
    label: 'Emotions',
    defaultQuestion: "What's the last thing that genuinely surprised you about yourself?",
    skipWhenConnected: ['whoop'],
  },
  {
    id: 'culture',
    label: 'Culture & Taste',
    defaultQuestion: "What song do you keep coming back to, and why?",
    skipWhenConnected: ['spotify', 'youtube'],
  },
  {
    id: 'habits',
    label: 'Daily Life',
    defaultQuestion: "Walk me through your morning — the real version, not the aspirational one.",
    skipWhenConnected: ['calendar', 'whoop'],
  },
  {
    id: 'goals',
    label: 'Goals & Ambitions',
    defaultQuestion: "If you could mass-delete one thing from your life and replace it with something better, what would it be?",
    skipWhenConnected: [],
  },
  {
    id: 'fears',
    label: 'Vulnerabilities',
    defaultQuestion: "What's a truth about yourself you don't often share with people?",
    skipWhenConnected: [],
  },
  {
    id: 'joy',
    label: 'Joy & Play',
    defaultQuestion: "When did you last lose track of time doing something purely for fun?",
    skipWhenConnected: ['twitch', 'youtube'],
  },
];

// Platform keys that indicate data already exists for a category
const PLATFORM_CATEGORY_MAP = {
  spotify: ['culture'],
  youtube: ['culture', 'joy'],
  calendar: ['habits'],
  whoop: ['habits', 'emotions'],
  github: ['work'],
  linkedin: ['work'],
  twitch: ['joy'],
};

/**
 * Get interview categories that should be asked, filtering out those
 * already answered or covered by connected platforms.
 */
export function getAvailableCategories(answeredCategories = [], connectedPlatforms = []) {
  const answered = new Set(answeredCategories);
  const connected = new Set(connectedPlatforms);

  return INTERVIEW_CATEGORIES.filter(cat => {
    if (answered.has(cat.id)) return false;
    // Skip only if ALL skip platforms are connected
    if (cat.skipWhenConnected.length > 0) {
      const allConnected = cat.skipWhenConnected.every(p => connected.has(p));
      if (allConnected) return false;
    }
    return true;
  });
}

/**
 * Check if a user should be prompted for the Soul Interview.
 * Returns true if < 50 memories and interview not completed.
 */
export async function shouldShowInterview(userId) {
  if (!userId) return false;

  try {
    const { count, error } = await supabaseAdmin
      .from('user_memories')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (error) {
      log.warn('Failed to check memory count', { userId, error: error.message });
      return false;
    }

    return (count ?? 0) < 50;
  } catch (err) {
    log.warn('shouldShowInterview error', { userId, error: err.message });
    return false;
  }
}

/**
 * Get the interview progress for a user — which categories have been answered.
 */
export async function getInterviewStatus(userId) {
  if (!userId) throw new Error('userId required');

  const { data, error } = await supabaseAdmin
    .from('user_memories')
    .select('metadata')
    .eq('user_id', userId)
    .eq('memory_type', 'fact')
    .like('metadata->>source', 'soul_interview_%');

  if (error) {
    log.warn('Failed to get interview status', { userId, error: error.message });
    return { answeredCategories: [], totalCategories: INTERVIEW_CATEGORIES.length, completed: false };
  }

  const answeredCategories = [...new Set(
    (data || [])
      .map(row => {
        const source = row.metadata?.source || '';
        return source.replace('soul_interview_', '');
      })
      .filter(cat => INTERVIEW_CATEGORIES.some(c => c.id === cat))
  )];

  return {
    answeredCategories,
    totalCategories: INTERVIEW_CATEGORIES.length,
    completed: answeredCategories.length >= INTERVIEW_CATEGORIES.length,
  };
}

/**
 * Generate the next interview question. Uses LLM to personalize the question
 * based on prior answers, with a pre-written fallback.
 */
export async function generateInterviewQuestion(userId, answeredCategories = [], connectedPlatforms = []) {
  if (!userId) throw new Error('userId required');

  const available = getAvailableCategories(answeredCategories, connectedPlatforms);

  if (available.length === 0) {
    return { done: true, question: null, category: null, remaining: 0 };
  }

  const nextCategory = available[0];
  let question = nextCategory.defaultQuestion;

  // If we have prior answers, personalize the question
  if (answeredCategories.length > 0) {
    try {
      const { data: priorFacts } = await supabaseAdmin
        .from('user_memories')
        .select('content')
        .eq('user_id', userId)
        .eq('memory_type', 'fact')
        .like('metadata->>source', 'soul_interview_%')
        .order('created_at', { ascending: false })
        .limit(10);

      const priorContext = (priorFacts || []).map(f => f.content).join('\n');

      if (priorContext.length > 20) {
        const result = await complete({
          tier: TIER_EXTRACTION,
          messages: [{
            role: 'user',
            content: `You're conducting a deep soul interview. The person has already shared these things about themselves:

${priorContext}

Now you need to ask about their "${nextCategory.label}" (${nextCategory.id}).
The default question is: "${nextCategory.defaultQuestion}"

Generate a personalized version of this question that builds on what you already know about them. Make it feel like a natural continuation of the conversation — warm, curious, not clinical. One question only, no preamble.`
          }],
          maxTokens: 150,
          temperature: 0.7,
          serviceName: 'soul-interview-question',
        });

        const personalized = (result.content || '').trim();
        if (personalized.length > 10 && personalized.length < 500) {
          question = personalized;
        }
      }
    } catch (err) {
      log.warn('Question personalization failed, using default', { category: nextCategory.id, error: err.message });
    }
  }

  return {
    done: false,
    question,
    category: nextCategory.id,
    categoryLabel: nextCategory.label,
    remaining: available.length - 1,
    totalAvailable: available.length,
  };
}

/**
 * Process an interview answer: extract facts and store as high-importance memories.
 * Returns the extracted facts for display.
 */
export async function processInterviewAnswer(userId, category, question, answer) {
  if (!userId) throw new Error('userId required');
  if (!answer || answer.trim().length < 3) {
    return { facts: [], skipped: true };
  }

  const trimmedAnswer = answer.trim();

  // Extract facts from the answer using EXTRACTION tier
  let extractedFacts = [];
  try {
    const result = await complete({
      tier: TIER_EXTRACTION,
      messages: [{
        role: 'user',
        content: `Extract 2-4 key personality facts from this interview answer. Each fact should be a standalone sentence about the person (use "they" pronouns). Be specific, not generic.

Category: ${category}
Question: ${question}
Answer: ${trimmedAnswer}

Return ONLY a JSON array of strings. Example: ["They value honesty above career advancement", "They feel most alive when creating music"]`
      }],
      maxTokens: 300,
      temperature: 0.2,
      serviceName: 'soul-interview-extraction',
    });

    const text = (result.content || '').trim();
    // Parse JSON array from response (handle markdown code blocks)
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      extractedFacts = JSON.parse(jsonMatch[0]);
    }
  } catch (err) {
    log.warn('Fact extraction failed, storing raw answer', { userId, category, error: err.message });
  }

  // Store each extracted fact as a high-importance memory
  const storedMemories = [];
  const factsToStore = extractedFacts.length > 0
    ? extractedFacts
    : [`In a soul interview about ${category}, they said: "${trimmedAnswer.substring(0, 300)}"`];

  for (const fact of factsToStore) {
    try {
      const mem = await addMemory(userId, fact, 'fact', {
        source: `soul_interview_${category}`,
        interview_question: question,
        interview_category: category,
      }, {
        importanceScore: extractedFacts.length > 0 ? 8 : 7,
        skipImportance: true,
      });

      if (mem) storedMemories.push(mem);
    } catch (err) {
      log.warn('Failed to store interview fact', { userId, category, fact, error: err.message });
    }
  }

  // Also store the raw answer as a conversation-type memory for full context
  try {
    await addMemory(
      userId,
      `Soul Interview — ${category}: Q: "${question}" A: "${trimmedAnswer.substring(0, 500)}"`,
      'conversation',
      { source: `soul_interview_${category}`, interview_category: category },
      { importanceScore: 9, skipImportance: true }
    );
  } catch (err) {
    log.warn('Failed to store raw interview answer', { userId, category, error: err.message });
  }

  return {
    facts: extractedFacts.length > 0 ? extractedFacts : factsToStore,
    stored: storedMemories.length,
    skipped: false,
  };
}

/**
 * Generate a personality summary after the interview is complete.
 * Uses ANALYSIS tier for deeper synthesis.
 */
export async function generateInterviewSummary(userId) {
  if (!userId) throw new Error('userId required');

  // Fetch all interview facts
  const { data: interviewFacts, error } = await supabaseAdmin
    .from('user_memories')
    .select('content, metadata')
    .eq('user_id', userId)
    .eq('memory_type', 'fact')
    .like('metadata->>source', 'soul_interview_%')
    .order('created_at', { ascending: true });

  if (error || !interviewFacts || interviewFacts.length === 0) {
    log.warn('No interview facts found for summary', { userId });
    return { summary: null };
  }

  const factsText = interviewFacts.map(f => `- ${f.content}`).join('\n');

  try {
    const result = await complete({
      tier: TIER_ANALYSIS,
      messages: [{
        role: 'user',
        content: `Based on these personality facts gathered from a deep soul interview, write a warm, concise personality portrait of this person in 3 SHORT paragraphs (max 150 words total). Write in second person ("you"). Be specific — reference actual details from their answers. End with one bold, surprising insight that connects dots they might not have noticed.

Keep it punchy. Every sentence should feel like a revelation, not a description. No filler.

Facts:
${factsText}

Write the portrait directly, no title or preamble.`
      }],
      maxTokens: 400,
      temperature: 0.6,
      serviceName: 'soul-interview-summary',
    });

    const summary = (result.content || '').trim();

    // Store the summary as a high-importance reflection
    if (summary.length > 50) {
      await addMemory(userId, `Soul Interview Portrait: ${summary}`, 'reflection', {
        source: 'soul_interview_summary',
        interview_facts_count: interviewFacts.length,
      }, {
        importanceScore: 9,
        skipImportance: true,
      });
    }

    return { summary, factsCount: interviewFacts.length };
  } catch (err) {
    log.error('Interview summary generation failed', { userId, error: err.message });
    return { summary: null, error: err.message };
  }
}

export { INTERVIEW_CATEGORIES };
