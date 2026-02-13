/**
 * Onboarding Calibration API
 *
 * AI-driven conversational Q&A that generates personalized questions
 * based on enrichment data (what we know and what we DON'T know).
 *
 * Used in the cofounder.co-style onboarding flow between Discovery and Platform Connect.
 * Uses TIER_CHAT for quality - these questions define the first impression.
 */

import express from 'express';
import { complete, TIER_CHAT } from '../services/llmGateway.js';
import { authenticateUser } from '../middleware/auth.js';
import { supabaseAdmin } from '../services/database.js';

const router = express.Router();

const MAX_QUESTIONS = 5;

/**
 * Build the system prompt for calibration questions.
 * The AI acts as a warm interviewer who already knows some things about the user
 * and asks targeted questions to fill gaps + reveal personality.
 */
function buildCalibrationPrompt(enrichmentContext, questionNumber, totalQuestions) {
  const known = [];
  const unknown = [];

  if (enrichmentContext.name) known.push(`Name: ${enrichmentContext.name}`);
  if (enrichmentContext.company) known.push(`Company: ${enrichmentContext.company}`);
  if (enrichmentContext.title) known.push(`Title: ${enrichmentContext.title}`);
  if (enrichmentContext.location) known.push(`Location: ${enrichmentContext.location}`);
  if (enrichmentContext.bio) known.push(`Bio: ${enrichmentContext.bio}`);
  if (enrichmentContext.github_url) known.push(`Has GitHub profile`);
  if (enrichmentContext.twitter_url) known.push(`Has Twitter/X profile`);

  if (!enrichmentContext.company && !enrichmentContext.title) unknown.push('work/career');
  if (!enrichmentContext.location) unknown.push('location');
  if (!enrichmentContext.bio) unknown.push('personal interests');

  return `You are a warm, perceptive interviewer for Twin Me - a platform that creates a "soul signature" from someone's digital life. You're having a brief getting-to-know-you conversation during onboarding.

WHAT YOU KNOW ABOUT THIS PERSON:
${known.length > 0 ? known.join('\n') : 'Very little - they just signed up.'}

WHAT YOU DON'T KNOW YET:
${unknown.length > 0 ? unknown.join(', ') : 'Basic facts are covered, focus on personality.'}

YOUR TASK:
Ask question ${questionNumber} of ${totalQuestions}. This is a SHORT calibration - not an interrogation.

QUESTION STRATEGY:
- Questions 1-2: Reference something specific from their profile to show you're paying attention, then ask something that reveals personality ("I see you're at ${enrichmentContext.company || 'a company'}. What drew you there originally?")
- Questions 3-4: Personality-revealing questions about preferences, habits, or values ("When you have a free Saturday with nothing planned, what do you actually end up doing?")
- Question 5: A forward-looking or reflective question ("What's something you're curious about lately that you haven't had time to explore?")
- If you DON'T know their work/career, weave that into early questions naturally
- If you DO know a lot about them, go deeper into personality territory

CONVERSATION STYLE:
- Be genuinely curious, not clinical
- One question at a time - never ask multiple questions
- Keep it SHORT (1-2 sentences max, plus the question)
- Reference their previous answers naturally when relevant
- NEVER say "Great answer!" or similar generic affirmations
- Instead, react specifically: "Film production - that explains the storytelling instinct."
- You can share a brief observation before asking the next question

RESPONSE FORMAT:
Respond with ONLY the message text. No labels, no "Question 3:", no formatting. Just the natural conversational message as you'd say it in a real conversation.

${questionNumber === totalQuestions ? 'This is the LAST question. Make it a good closing question that feels meaningful.' : ''}`;
}

/**
 * Build the summary prompt after all questions are answered.
 */
function buildSummaryPrompt(enrichmentContext) {
  return `You are analyzing a brief calibration conversation to extract personality insights for the Twin Me platform.

ENRICHMENT DATA:
${JSON.stringify(enrichmentContext, null, 2)}

Based on the conversation, extract 3-5 personality insights. Each insight should be:
- A specific observation, not a generic trait
- Something the person might not have realized about themselves
- Connected to evidence from their answers

Respond in this exact JSON format:
{
  "insights": [
    "Drawn to structured creativity - finds freedom within constraints",
    "Night owl energy - does their best thinking after hours",
    "Values depth over breadth in relationships and interests"
  ],
  "archetype_hint": "A short 2-3 word archetype like 'The Reflective Creator' or 'The Pragmatic Dreamer'",
  "summary": "A 1-2 sentence personality summary that feels like looking in a mirror"
}`;
}

/**
 * POST /api/onboarding/calibrate
 *
 * Generates the next calibration question based on enrichment data and conversation history.
 */
router.post('/calibrate', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id;
    const { enrichmentContext, conversationHistory, questionNumber } = req.body;

    if (!enrichmentContext || !questionNumber) {
      return res.status(400).json({ success: false, error: 'enrichmentContext and questionNumber required' });
    }

    const currentQ = Math.min(questionNumber, MAX_QUESTIONS);
    const isComplete = currentQ > MAX_QUESTIONS;

    // If all questions answered, generate summary insights
    if (isComplete) {
      const summaryResult = await complete({
        tier: TIER_CHAT,
        system: buildSummaryPrompt(enrichmentContext),
        messages: [
          ...(conversationHistory || []),
          { role: 'user', content: 'Based on our conversation, what are the key personality insights?' },
        ],
        maxTokens: 512,
        temperature: 0.7,
        userId,
        serviceName: 'onboarding-calibration-summary',
      });

      let insights = [];
      let archetypeHint = '';
      let summary = '';

      try {
        // Try to parse JSON from the response
        const jsonMatch = summaryResult.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          insights = parsed.insights || [];
          archetypeHint = parsed.archetype_hint || '';
          summary = parsed.summary || '';
        }
      } catch {
        // If JSON parsing fails, use raw content as summary
        summary = summaryResult.content;
      }

      // Save calibration data to database
      if (userId && supabaseAdmin) {
        supabaseAdmin
          .from('onboarding_calibration')
          .upsert({
            user_id: userId,
            enrichment_context: enrichmentContext,
            conversation_history: conversationHistory || [],
            insights,
            archetype_hint: archetypeHint,
            personality_summary: summary,
            completed_at: new Date().toISOString(),
          }, { onConflict: 'user_id' })
          .then(({ error }) => {
            if (error) console.warn('[Calibration] Save error:', error.message);
          });
      }

      return res.json({
        success: true,
        done: true,
        questionNumber: currentQ,
        totalQuestions: MAX_QUESTIONS,
        insights,
        archetypeHint,
        summary,
      });
    }

    // Generate next question
    const systemPrompt = buildCalibrationPrompt(enrichmentContext, currentQ, MAX_QUESTIONS);

    const messages = conversationHistory && conversationHistory.length > 0
      ? conversationHistory
      : [{ role: 'user', content: `Hi, I'm ${enrichmentContext.name || 'here'}. Ask me your first question.` }];

    const result = await complete({
      tier: TIER_CHAT,
      system: systemPrompt,
      messages,
      maxTokens: 256,
      temperature: 0.8,
      userId,
      serviceName: 'onboarding-calibration',
    });

    return res.json({
      success: true,
      done: false,
      message: result.content,
      questionNumber: currentQ,
      totalQuestions: MAX_QUESTIONS,
    });
  } catch (error) {
    console.error('[Calibration] Error:', error);
    return res.status(500).json({ success: false, error: 'Calibration failed' });
  }
});

/**
 * GET /api/onboarding/calibration-data/:userId
 *
 * Get saved calibration results for a user.
 */
router.get('/calibration-data/:userId', authenticateUser, async (req, res) => {
  try {
    const userId = req.params.userId;

    if (!supabaseAdmin) {
      return res.json({ success: true, data: null });
    }

    const { data, error } = await supabaseAdmin
      .from('onboarding_calibration')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.warn('[Calibration] Fetch error:', error.message);
    }

    return res.json({ success: true, data: data || null });
  } catch (error) {
    console.error('[Calibration] Fetch error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch calibration data' });
  }
});

export default router;
