/**
 * Onboarding Calibration API — Deep Adaptive Interview
 * =====================================================
 * Inspired by Park et al. 2024 ("Generative Agent Simulations of 1,000 People")
 * where 2-hour interviews across life domains created high-fidelity agent simulations.
 *
 * This is TwinMe's compressed version: 12-18 adaptive questions across 5 expert domains,
 * designed to feel like a warm conversation while systematically building the memory
 * foundation for the twin's personality model.
 *
 * Interview Architecture:
 *   Phase 1: WARM-UP (2-3 questions) — Reference enrichment data, build rapport
 *   Phase 2: DOMAIN DEEP-DIVES (8-12 questions) — Cover all 5 expert domains
 *   Phase 3: INTEGRATION (1-2 questions) — Cross-domain reflection, forward-looking
 *
 * Domain alignment (matches Expert Reflection Personas):
 *   1. Motivation & Work — ambitions, career arc, what drives you
 *   2. Lifestyle & Rhythms — daily patterns, energy, health, routines
 *   3. Personality & Emotions — emotional processing, stress, coping
 *   4. Cultural Identity — music, media, aesthetics, creative expression
 *   5. Social Dynamics — relationships, communication style, social energy
 *
 * Adaptive behavior:
 *   - Rich answers get follow-ups within the same domain
 *   - Thin answers trigger domain switch
 *   - AI interviewer receives domain coverage tracking + decides flow
 *   - Each Q&A pair is stored in memory stream with domain tags
 */

import express from 'express';
import { complete, TIER_CHAT, TIER_ANALYSIS } from '../services/llmGateway.js';
import { authenticateUser } from '../middleware/auth.js';
import { supabaseAdmin } from '../services/database.js';
import { addMemory, addConversationMemory } from '../services/memoryStreamService.js';

const router = express.Router();

// ====================================================================
// Interview Configuration
// ====================================================================

const MIN_QUESTIONS = 12;
const MAX_QUESTIONS = 18;
const QUESTIONS_PER_DOMAIN = 3; // Target: 2-3 per domain

/**
 * The 5 interview domains, aligned with the Expert Reflection Personas.
 * Each domain has seed questions the AI can draw from (not prescriptive —
 * the AI adapts based on enrichment data and previous answers).
 */
const INTERVIEW_DOMAINS = [
  {
    id: 'motivation',
    name: 'Motivation & Work',
    expertPersona: 'Motivation Analyst',
    description: 'What drives this person, their career arc, ambitions, decision-making style',
    seedQuestions: [
      'What made you choose the path you\'re on right now?',
      'When you have a completely free day, what do you actually end up doing?',
      'What\'s something you keep coming back to, even when no one\'s asking you to?',
      'If money and status didn\'t matter at all, what would you spend your time doing?',
      'What does "success" actually look like to you — not the resume version, the real one?',
    ],
  },
  {
    id: 'lifestyle',
    name: 'Lifestyle & Rhythms',
    expertPersona: 'Lifestyle Analyst',
    description: 'Daily patterns, energy management, health, routines vs spontaneity',
    seedQuestions: [
      'Are you more of a morning person or a night owl? And does that match what your schedule actually looks like?',
      'What does your ideal morning look like vs what actually happens?',
      'How do you recharge when you\'re running on empty?',
      'What\'s one habit or routine that makes everything else in your life work better?',
      'Do you track anything about your health or energy? What have you noticed?',
    ],
  },
  {
    id: 'personality',
    name: 'Personality & Emotions',
    expertPersona: 'Personality Psychologist',
    description: 'Emotional processing, stress responses, coping mechanisms, self-awareness',
    seedQuestions: [
      'When you\'re stressed, what\'s your go-to coping mechanism?',
      'What kind of environments make you feel most like yourself?',
      'Is there something people consistently get wrong about you on first impression?',
      'What emotion do you find hardest to sit with?',
      'How do you make big decisions — gut instinct, analysis, or talking it out?',
    ],
  },
  {
    id: 'cultural',
    name: 'Cultural Identity',
    expertPersona: 'Cultural Identity Expert',
    description: 'Music taste, media preferences, aesthetic sensibilities, creative expression',
    seedQuestions: [
      'What kind of music or content do you reach for when you need to feel something?',
      'Is there a movie, book, or song that shaped how you see the world?',
      'How would you describe your aesthetic — in how you dress, your space, your taste?',
      'What\'s something you\'re passionate about that surprises people who know you?',
      'Do you have a creative outlet? Something where you make things, not just consume them?',
    ],
  },
  {
    id: 'social',
    name: 'Social Dynamics',
    expertPersona: 'Social Dynamics Analyst',
    description: 'Relationship patterns, communication style, social energy management',
    seedQuestions: [
      'How do you prefer to communicate — texts, calls, in person? Does it depend on who?',
      'After a big social event, do you feel energized or drained?',
      'What does your closest circle look like — a few deep friendships or a wide network?',
      'How do you handle disagreements with people you care about?',
      'Is there a type of person you\'re naturally drawn to as friends?',
    ],
  },
];

// ====================================================================
// Prompt Builders
// ====================================================================

/**
 * Build the system prompt for the adaptive interview.
 * The AI receives full context: enrichment data, domain coverage, conversation so far.
 */
function buildInterviewPrompt(enrichmentContext, questionNumber, domainProgress, phase) {
  const known = [];
  if (enrichmentContext.name) known.push(`Name: ${enrichmentContext.name}`);
  if (enrichmentContext.company) known.push(`Company: ${enrichmentContext.company}`);
  if (enrichmentContext.title) known.push(`Title: ${enrichmentContext.title}`);
  if (enrichmentContext.location) known.push(`Location: ${enrichmentContext.location}`);
  if (enrichmentContext.bio) known.push(`Bio: ${enrichmentContext.bio}`);
  if (enrichmentContext.github_url) known.push(`Has GitHub profile`);
  if (enrichmentContext.twitter_url) known.push(`Has Twitter/X profile`);
  if (enrichmentContext.career_timeline) known.push(`Career: ${enrichmentContext.career_timeline.substring(0, 200)}`);
  if (enrichmentContext.education) known.push(`Education: ${enrichmentContext.education.substring(0, 150)}`);

  // Build domain coverage status
  const domainStatus = INTERVIEW_DOMAINS.map(d => {
    const progress = domainProgress[d.id] || { asked: 0, covered: false };
    const status = progress.covered ? 'COVERED' : progress.asked > 0 ? `${progress.asked} asked` : 'NOT YET';
    return `  - ${d.name}: ${status}`;
  }).join('\n');

  // Determine which domains still need coverage
  const uncovered = INTERVIEW_DOMAINS.filter(d => {
    const p = domainProgress[d.id] || { asked: 0 };
    return p.asked < 2;
  });

  const suggestedDomain = uncovered.length > 0 ? uncovered[0] : null;

  // Phase-specific instructions
  let phaseInstructions = '';
  if (phase === 'warmup') {
    phaseInstructions = `CURRENT PHASE: WARM-UP (questions 1-3)
You're building rapport. Reference something specific from their profile data to show you already know them.
Ask questions that are easy to answer but reveal personality. Start broad, then narrow.
If you know their company/role, reference it. If you know very little, ask about their life in a friendly way.
Naturally weave in questions about what they do and what draws them to it.`;
  } else if (phase === 'deepdive') {
    phaseInstructions = `CURRENT PHASE: DOMAIN DEEP-DIVE (questions 4-${MAX_QUESTIONS - 2})
You're exploring specific life domains to deeply understand this person.

DOMAIN COVERAGE:
${domainStatus}

${suggestedDomain ? `SUGGESTED NEXT DOMAIN: "${suggestedDomain.name}" — ${suggestedDomain.description}
Example angles: ${suggestedDomain.seedQuestions.slice(0, 2).join(' / ')}` : 'All domains have some coverage. Go deeper where answers were richest.'}

ADAPTIVE RULES:
- If the previous answer was RICH (detailed, emotional, revealing), ask a follow-up within the SAME domain
- If the previous answer was THIN (brief, surface-level), acknowledge briefly and switch to a new domain
- Cover at least 4 of the 5 domains before moving to integration phase
- Don't just go through a checklist — let the conversation flow naturally between domains`;
  } else if (phase === 'integration') {
    phaseInstructions = `CURRENT PHASE: INTEGRATION (final 1-2 questions)
You've covered the main domains. Now ask a reflective or forward-looking question that ties things together.
Reference specific things they've shared to show you've been listening deeply.
Make this feel like a meaningful closing — not just another question.`;
  }

  return `You are a perceptive, warm interviewer for Twin Me — a platform that builds a digital twin of someone's personality from their real life data. You're conducting the initial deep interview during onboarding.

Your goal: Understand who this person REALLY is — not their resume, but their authentic self. What drives them, how they process the world, what their daily life actually looks like, what matters to them.

WHAT YOU KNOW ABOUT THIS PERSON:
${known.length > 0 ? known.join('\n') : 'Very little yet.'}

${phaseInstructions}

QUESTION NUMBER: ${questionNumber}

CONVERSATION RULES:
- ONE question at a time — never ask two questions in one message
- Keep messages SHORT: 1-2 sentences of reaction/observation + the question (3 sentences max total)
- NEVER use generic affirmations ("Great answer!", "That's interesting!", "Thanks for sharing!")
- Instead, react SPECIFICALLY to what they said: "Jazz for focus, Drake for release — that's a deliberate emotional toolkit."
- Reference their previous answers to show you're building a picture
- Be genuinely curious, not clinical. This should feel like talking to a perceptive friend, not a therapist
- Ask questions that go BENEATH the surface — not "what do you do" but "what keeps you coming back to it"
- Questions should be the kind that make someone pause and think, not rattle off a quick answer

RESPONSE FORMAT:
Return ONLY the conversational message. No labels, no "Question 5:", no formatting, no markdown. Just natural speech.`;
}

/**
 * Determine the current interview phase and domain progress from conversation history.
 */
function analyzeProgress(conversationHistory, questionNumber) {
  const domainProgress = {};
  INTERVIEW_DOMAINS.forEach(d => {
    domainProgress[d.id] = { asked: 0, covered: false, lastAnswer: '' };
  });

  // Phase determination
  let phase;
  if (questionNumber <= 3) {
    phase = 'warmup';
  } else if (questionNumber >= MIN_QUESTIONS) {
    // Check if we have enough domain coverage to move to integration
    const domainsWithCoverage = INTERVIEW_DOMAINS.filter(d =>
      (domainProgress[d.id]?.asked || 0) >= 2
    ).length;
    phase = domainsWithCoverage >= 4 ? 'integration' : 'deepdive';
  } else {
    phase = 'deepdive';
  }

  return { domainProgress, phase };
}

/**
 * Use LLM to classify which domain a Q&A pair belongs to.
 * This is lightweight (TIER_ANALYSIS) and lets us track domain coverage accurately.
 */
async function classifyDomain(question, answer) {
  try {
    const result = await complete({
      tier: TIER_ANALYSIS,
      messages: [{
        role: 'user',
        content: `Classify this Q&A into exactly ONE domain. Return ONLY the domain ID.

Domains:
- motivation (work, career, ambitions, what drives them, goals, decision-making)
- lifestyle (daily routines, energy, sleep, health, habits, schedule)
- personality (emotions, stress, coping, self-perception, feelings, temperament)
- cultural (music, media, movies, books, aesthetics, taste, creativity, hobbies)
- social (relationships, communication, friends, social energy, disagreements)

Q: ${question.substring(0, 200)}
A: ${answer.substring(0, 300)}

Domain ID:`,
      }],
      maxTokens: 10,
      temperature: 0,
      serviceName: 'calibration-classify',
    });

    const domain = (result.content || '').trim().toLowerCase().replace(/[^a-z]/g, '');
    const validDomains = ['motivation', 'lifestyle', 'personality', 'cultural', 'social'];
    return validDomains.includes(domain) ? domain : 'motivation';
  } catch {
    return 'motivation'; // Safe fallback
  }
}

/**
 * Build the enhanced summary prompt for the end of the interview.
 * Now produces domain-structured insights aligned with expert personas.
 */
function buildSummaryPrompt(enrichmentContext, domainInsights) {
  return `You are analyzing an in-depth onboarding interview to extract personality insights for the Twin Me platform. This data will seed the person's digital twin.

ENRICHMENT DATA:
${JSON.stringify(enrichmentContext, null, 2)}

INTERVIEW DOMAIN COVERAGE:
${domainInsights || 'Full conversation available in history.'}

Based on the full conversation, extract insights organized by domain. Be SPECIFIC — cite evidence from their answers. Each insight should reveal something about their authentic self.

Respond in this exact JSON format:
{
  "domain_insights": {
    "motivation": ["insight 1", "insight 2"],
    "lifestyle": ["insight 1", "insight 2"],
    "personality": ["insight 1", "insight 2"],
    "cultural": ["insight 1", "insight 2"],
    "social": ["insight 1", "insight 2"]
  },
  "archetype_hint": "A 2-4 word archetype like 'The Reflective Builder' or 'The Pragmatic Dreamer'",
  "summary": "A 2-3 sentence personality summary that feels like looking in a mirror. Be specific, not generic."
}

RULES:
- Each insight should be 1 sentence, specific, evidence-based
- Include 1-3 insights per domain (skip domains with insufficient data)
- The summary should make the person feel SEEN, not categorized
- The archetype should feel authentic, not flattering`;
}

// ====================================================================
// Route Handlers
// ====================================================================

/**
 * POST /api/onboarding/calibrate
 *
 * Generates the next interview question or completes the interview.
 * Now supports adaptive domain-structured questioning.
 *
 * Request body:
 *   enrichmentContext — what we know from enrichment
 *   conversationHistory — full chat history [{role, content}]
 *   questionNumber — current question number (1-indexed)
 *   domainProgress — (optional) tracked domain coverage from client
 */
router.post('/calibrate', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id;
    const { enrichmentContext, conversationHistory, questionNumber, domainProgress: clientDomainProgress } = req.body;

    if (!enrichmentContext || !questionNumber) {
      return res.status(400).json({ success: false, error: 'enrichmentContext and questionNumber required' });
    }

    const currentQ = Math.min(questionNumber, MAX_QUESTIONS);

    // Classify the last answer's domain (if we have a new answer)
    let lastDomain = null;
    const history = conversationHistory || [];
    if (history.length >= 2) {
      const lastAssistant = [...history].reverse().find(m => m.role === 'assistant');
      const lastUser = [...history].reverse().find(m => m.role === 'user');
      if (lastAssistant && lastUser && history.indexOf(lastUser) > history.indexOf(lastAssistant)) {
        lastDomain = await classifyDomain(lastAssistant.content, lastUser.content);
      }
    }

    // Update domain progress
    const domainProgress = clientDomainProgress || {};
    INTERVIEW_DOMAINS.forEach(d => {
      if (!domainProgress[d.id]) domainProgress[d.id] = { asked: 0, covered: false };
    });
    if (lastDomain && domainProgress[lastDomain]) {
      domainProgress[lastDomain].asked = (domainProgress[lastDomain].asked || 0) + 1;
      if (domainProgress[lastDomain].asked >= QUESTIONS_PER_DOMAIN) {
        domainProgress[lastDomain].covered = true;
      }
    }

    // Check completion conditions
    const domainsWithCoverage = Object.values(domainProgress).filter(d => d.asked >= 2).length;
    const shouldComplete = (currentQ > MAX_QUESTIONS) ||
      (currentQ > MIN_QUESTIONS && domainsWithCoverage >= 4);

    if (shouldComplete) {
      // ============================================================
      // INTERVIEW COMPLETE — Generate summary + store memories
      // ============================================================

      // Build domain insights summary for the prompt
      const domainInsightText = INTERVIEW_DOMAINS.map(d => {
        const p = domainProgress[d.id] || { asked: 0 };
        return `${d.name}: ${p.asked} questions asked${p.covered ? ' (well covered)' : ''}`;
      }).join('\n');

      const summaryResult = await complete({
        tier: TIER_CHAT,
        system: buildSummaryPrompt(enrichmentContext, domainInsightText),
        messages: [
          ...history,
          { role: 'user', content: 'Based on our entire conversation, analyze my personality across all domains.' },
        ],
        maxTokens: 800,
        temperature: 0.6,
        userId,
        serviceName: 'onboarding-calibration-summary',
      });

      let domainInsights = {};
      let insights = [];
      let archetypeHint = '';
      let summary = '';

      try {
        const jsonMatch = summaryResult.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          domainInsights = parsed.domain_insights || {};
          // Flatten domain insights into a single array for backward compat
          insights = Object.values(domainInsights).flat().filter(Boolean);
          archetypeHint = parsed.archetype_hint || '';
          summary = parsed.summary || '';
        }
      } catch {
        summary = summaryResult.content;
      }

      // Save to database
      if (userId && supabaseAdmin) {
        supabaseAdmin
          .from('onboarding_calibration')
          .upsert({
            user_id: userId,
            enrichment_context: enrichmentContext,
            conversation_history: history,
            insights,
            archetype_hint: archetypeHint,
            personality_summary: summary,
            domain_progress: domainProgress,
            questions_asked: currentQ - 1,
            completed_at: new Date().toISOString(),
          }, { onConflict: 'user_id' })
          .then(({ error }) => {
            if (error) console.warn('[Calibration] Save error:', error.message);
          });
      }

      // Fire-and-forget: Store rich domain-tagged memories
      if (userId) {
        storeInterviewMemories(userId, history, domainInsights, archetypeHint, summary);
      }

      console.log(`[Calibration] Interview complete: ${currentQ - 1} questions, ${domainsWithCoverage}/5 domains covered`);

      return res.json({
        success: true,
        done: true,
        questionNumber: currentQ,
        totalQuestions: currentQ - 1,
        insights,
        domainInsights,
        archetypeHint,
        summary,
        domainProgress,
      });
    }

    // ============================================================
    // GENERATE NEXT QUESTION
    // ============================================================

    const { phase } = analyzeProgress(history, currentQ);
    const systemPrompt = buildInterviewPrompt(enrichmentContext, currentQ, domainProgress, phase);

    const messages = history.length > 0
      ? history
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

    // Estimate total based on domain coverage
    const estimatedTotal = Math.max(MIN_QUESTIONS,
      Math.min(MAX_QUESTIONS, MIN_QUESTIONS + (5 - domainsWithCoverage) * 2));

    return res.json({
      success: true,
      done: false,
      message: result.content,
      questionNumber: currentQ,
      totalQuestions: estimatedTotal,
      phase,
      currentDomain: lastDomain,
      domainProgress,
    });
  } catch (error) {
    console.error('[Calibration] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Calibration failed',
      message: error?.message || 'Unknown error',
      stack: process.env.NODE_ENV !== 'production' ? error?.stack : undefined,
    });
  }
});

/**
 * Store interview Q&A pairs and insights in the memory stream,
 * tagged with their domains for the expert reflection system.
 */
async function storeInterviewMemories(userId, history, domainInsights, archetypeHint, summary) {
  try {
    // Store each Q&A pair as a conversation memory
    for (let i = 0; i < history.length - 1; i++) {
      const msg = history[i];
      const next = history[i + 1];
      if (msg.role === 'assistant' && next.role === 'user') {
        const domain = await classifyDomain(msg.content, next.content);
        await addConversationMemory(userId, next.content, msg.content, {
          source: 'onboarding_interview',
          domain,
          expertPersona: INTERVIEW_DOMAINS.find(d => d.id === domain)?.expertPersona || null,
        });
      }
    }

    // Store domain-tagged insights as facts
    for (const [domain, insightList] of Object.entries(domainInsights)) {
      if (!Array.isArray(insightList)) continue;
      const expertPersona = INTERVIEW_DOMAINS.find(d => d.id === domain)?.expertPersona || null;
      for (const insight of insightList) {
        if (insight && insight.length > 10) {
          await addMemory(userId, insight, 'fact', {
            source: 'onboarding_interview',
            domain,
            expertPersona,
          });
        }
      }
    }

    // Store archetype and summary as high-level facts
    if (archetypeHint) {
      await addMemory(userId, `Personality archetype from deep interview: ${archetypeHint}`, 'fact', {
        source: 'onboarding_interview',
        domain: 'personality',
      });
    }
    if (summary) {
      await addMemory(userId, `Personality summary from deep interview: ${summary}`, 'fact', {
        source: 'onboarding_interview',
        domain: 'personality',
      });
    }

    console.log(`[Calibration] Stored interview memories for user ${userId}`);
  } catch (err) {
    console.warn('[Calibration] Memory storage failed:', err.message);
  }
}

/**
 * GET /api/onboarding/calibration-data/:userId
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
