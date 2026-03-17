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
import { complete, TIER_CHAT, TIER_ANALYSIS, TIER_EXTRACTION } from '../services/llmGateway.js';
import { authenticateUser } from '../middleware/auth.js';
import { supabaseAdmin } from '../services/database.js';
import { addMemory, addConversationMemory } from '../services/memoryStreamService.js';
import { shouldTriggerReflection, generateReflections } from '../services/reflectionEngine.js';
import { generateGoalSuggestions } from '../services/goalTrackingService.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('OnboardingCalibration');

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
// Keyword-based domain classification — zero-cost, instant, works offline
// Keywords are weighted: strong (2pts) = highly domain-specific, weak (1pt) = could appear in other contexts
const DOMAIN_KEYWORDS = {
  motivation: {
    strong: ['career', 'ambition', 'startup', 'entrepreneur', 'professional', 'promotion', 'resume', 'hiring', 'salary'],
    weak: ['goal', 'drive', 'purpose', 'mission', 'success', 'achieve', 'passion'],
  },
  lifestyle: {
    strong: ['routine', 'sleep', 'morning person', 'night owl', 'gym', 'exercise', 'diet', 'wake up', 'commute', 'recharge'],
    weak: ['morning', 'evening', 'schedule', 'health', 'energy', 'habit', 'coffee', 'weekend', 'daily'],
  },
  personality: {
    strong: ['stress', 'anxious', 'introvert', 'extrovert', 'temperament', 'overwhelm', 'vulnerable', 'insecure', 'coping'],
    weak: ['emotion', 'feel', 'cope', 'mood', 'confident', 'react', 'afraid', 'self-aware'],
  },
  cultural: {
    strong: ['music', 'movie', 'album', 'artist', 'film', 'podcast', 'genre', 'aesthetic', 'pagode', 'sertanejo', 'drake'],
    weak: ['book', 'art', 'taste', 'creative', 'song', 'show', 'style', 'culture', 'food', 'cook', 'travel'],
  },
  social: {
    strong: ['friend', 'relationship', 'family', 'partner', 'introvert', 'extrovert', 'circle', 'networking'],
    weak: ['communicate', 'social', 'people', 'group', 'alone', 'lonely', 'trust', 'conflict', 'disagree'],
  },
};

function classifyDomainByKeywords(question, answer) {
  const text = `${question} ${answer}`.toLowerCase();
  const scores = {};
  for (const [domain, { strong, weak }] of Object.entries(DOMAIN_KEYWORDS)) {
    const strongHits = strong.filter(kw => text.includes(kw)).length * 2;
    const weakHits = weak.filter(kw => text.includes(kw)).length;
    scores[domain] = strongHits + weakHits;
  }
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [top, second] = sorted;
  // Require clear winner: top score > 0 AND at least 2-point margin over runner-up
  // Otherwise fall through to LLM classifier for better accuracy
  if (top[1] >= 2 && (top[1] - second[1]) >= 2) return top[0];
  return null; // ambiguous — let LLM decide
}

async function classifyDomain(question, answer) {
  // Try keyword classification first — free and instant
  const keywordDomain = classifyDomainByKeywords(question, answer);

  // Use LLM when keywords are ambiguous (no clear winner)
  if (keywordDomain) return keywordDomain;

  try {
    const result = await complete({
      tier: TIER_EXTRACTION,
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
    return 'motivation'; // Last resort fallback
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
// Quick Questions — Personalized 5-question fast path
// ====================================================================

/**
 * Fallback questions when LLM generation fails.
 * These are enriched versions of the original hardcoded questions,
 * each mapped to an expert domain.
 */
const FALLBACK_QUICK_QUESTIONS = [
  {
    id: 'motivation_q',
    text: "What pulls you out of bed on the days you're most excited?",
    options: ['A creative project', 'Solving a hard problem', 'Connecting with people', 'Exploring something new'],
    domain: 'motivation',
  },
  {
    id: 'lifestyle_q',
    text: "It's Saturday morning, you...",
    options: ['Sleep in', 'Go for a run', 'Start a project', 'Brunch with friends'],
    domain: 'lifestyle',
  },
  {
    id: 'personality_q',
    text: 'When something stresses you out, your first instinct is to...',
    options: ['Process it alone', 'Talk it through', 'Physical activity', 'Distract yourself'],
    domain: 'personality',
  },
  {
    id: 'cultural_q',
    text: 'The content you reach for to feel something is...',
    options: ['Music that matches my mood', 'A gripping podcast or book', 'A cinematic experience', 'Something I can create'],
    domain: 'cultural',
  },
  {
    id: 'social_q',
    text: 'After a long social event, you need...',
    options: ['Quiet alone time', 'One close friend to decompress', 'More energy — keep going', 'A creative outlet'],
    domain: 'social',
  },
];

/**
 * POST /api/onboarding/quick-questions
 *
 * Generates 5 personalized questions based on enrichment data.
 * Fast path: Uses TIER_EXTRACTION for speed and cost efficiency.
 *
 * Request:  { enrichmentContext: { name, company, title, bio, location } }
 * Response: { questions: [{ id, text, options: [4 strings], domain }] }
 */
router.post('/quick-questions', authenticateUser, async (req, res) => {
  try {
    const { enrichmentContext } = req.body;

    if (!enrichmentContext) {
      return res.json({ success: true, questions: FALLBACK_QUICK_QUESTIONS });
    }

    // Build context string from enrichment data
    const contextParts = [];
    if (enrichmentContext.name) contextParts.push(`Name: ${enrichmentContext.name}`);
    if (enrichmentContext.company) contextParts.push(`Company: ${enrichmentContext.company}`);
    if (enrichmentContext.title) contextParts.push(`Title: ${enrichmentContext.title}`);
    if (enrichmentContext.bio) contextParts.push(`Bio: ${enrichmentContext.bio}`);
    if (enrichmentContext.location) contextParts.push(`Location: ${enrichmentContext.location}`);

    // If we have no enrichment data at all, return enriched fallback
    if (contextParts.length === 0) {
      return res.json({ success: true, questions: FALLBACK_QUICK_QUESTIONS });
    }

    const prompt = `Generate 5 quick personality questions for someone during onboarding. Each question should feel personal and reference their actual context where possible.

PERSON CONTEXT:
${contextParts.join('\n')}

RULES:
- Each question should map to exactly one domain: motivation, lifestyle, personality, cultural, social
- One question per domain, in that order
- Questions should be SHORT (under 15 words) and feel conversational
- Each question gets exactly 4 answer options (3-5 words each)
- Reference their company/title/location naturally when relevant (e.g. "As a ${enrichmentContext.title || 'professional'} at ${enrichmentContext.company || 'your company'}...")
- Questions should make them think, not just pick the obvious answer
- Don't start every question with "As someone who..."

Return ONLY this JSON array (no markdown, no explanation):
[
  {"id":"motivation_q","text":"question text","options":["opt1","opt2","opt3","opt4"],"domain":"motivation"},
  {"id":"lifestyle_q","text":"question text","options":["opt1","opt2","opt3","opt4"],"domain":"lifestyle"},
  {"id":"personality_q","text":"question text","options":["opt1","opt2","opt3","opt4"],"domain":"personality"},
  {"id":"cultural_q","text":"question text","options":["opt1","opt2","opt3","opt4"],"domain":"cultural"},
  {"id":"social_q","text":"question text","options":["opt1","opt2","opt3","opt4"],"domain":"social"}
]`;

    const result = await complete({
      tier: TIER_EXTRACTION,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 600,
      temperature: 0.8,
      userId: req.user?.id,
      serviceName: 'onboarding-quick-questions',
    });

    // Parse the JSON response
    const jsonMatch = (result.content || '').match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const questions = JSON.parse(jsonMatch[0]);
      // Validate structure
      const validDomains = new Set(['motivation', 'lifestyle', 'personality', 'cultural', 'social']);
      const isValid = Array.isArray(questions) &&
        questions.length === 5 &&
        questions.every(q =>
          q.id && q.text && Array.isArray(q.options) &&
          q.options.length === 4 && validDomains.has(q.domain)
        );

      if (isValid) {
        return res.json({ success: true, questions });
      }
    }

    // Fallback if LLM output is malformed
    log.warn('LLM output malformed, using fallback');
    return res.json({ success: true, questions: FALLBACK_QUICK_QUESTIONS });
  } catch (error) {
    log.error('QuickQuestions error', { error });
    return res.json({ success: true, questions: FALLBACK_QUICK_QUESTIONS });
  }
});

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
    let { enrichmentContext, conversationHistory, questionNumber, domainProgress: clientDomainProgress } = req.body;

    if (!enrichmentContext || !questionNumber) {
      return res.status(400).json({ success: false, error: 'enrichmentContext and questionNumber required' });
    }

    // Auto-enrich from enriched_profiles if frontend only sent name
    if (userId && supabaseAdmin && !enrichmentContext.company && !enrichmentContext.title) {
      try {
        const { data: profile } = await supabaseAdmin
          .from('enriched_profiles')
          .select('company, title, location, bio, career_timeline, education, github_url, twitter_url')
          .eq('user_id', userId)
          .maybeSingle();
        if (profile) {
          enrichmentContext = { ...enrichmentContext, ...profile };
        }
      } catch {
        // Non-fatal — proceed with whatever the frontend sent
      }
    }

    // Cap conversation history to prevent oversized LLM payloads
    // 18-question interview = 36+ messages, so cap at 40 and trim from the start
    let history_raw = Array.isArray(conversationHistory) ? conversationHistory : [];
    if (history_raw.length > 40) {
      history_raw = history_raw.slice(-40);
    }

    const currentQ = Math.min(questionNumber, MAX_QUESTIONS);

    // Classify the last answer's domain (if we have a new answer)
    let lastDomain = null;
    const history = history_raw;
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
    const shouldComplete = (currentQ >= MAX_QUESTIONS) ||
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
        maxTokens: 1500,
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
          // Handle both underscore and hyphenated keys (LLMs vary)
          domainInsights = parsed.domain_insights || parsed['domain-insights'] || {};
          // Flatten domain insights into a single array for backward compat
          insights = Object.values(domainInsights).flat().filter(Boolean);
          archetypeHint = parsed.archetype_hint || parsed['archetype-hint'] || '';
          summary = parsed.summary || '';
        }
      } catch {
        // JSON parse failed (truncated or malformed) — never show raw JSON to user
        log.warn('Failed to parse summary JSON, extracting fallback');
        summary = '';
      }

      // Safety: if summary looks like JSON, discard it
      if (summary.includes('"domain_insights"') || summary.includes('"domain-insights"') || summary.startsWith('{')) {
        summary = '';
      }

      // Save to database — await so data is persisted before we respond
      if (userId && supabaseAdmin) {
        const { error: saveError } = await supabaseAdmin
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
          }, { onConflict: 'user_id' });
        if (saveError) log.warn('Save error', { error: saveError });
      }

      // Store rich domain-tagged memories — await to ensure they're persisted before responding
      if (userId) {
        try {
          await storeInterviewMemories(userId, history, domainInsights, archetypeHint, summary);
        } catch (memErr) {
          log.error('Memory storage failed (non-fatal)', { error: memErr });
        }
      }

      log.info('Interview complete', { questions: currentQ - 1, domainsCovered: domainsWithCoverage });

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

    // Trim conversation for LLM to prevent timeouts on long interviews.
    // Keep last 10 messages (5 Q&A pairs) for direct context.
    // Summarize earlier messages as a compact recap in the first user message.
    const MAX_LLM_MESSAGES = 10;
    let llmMessages;
    if (history.length <= MAX_LLM_MESSAGES) {
      llmMessages = history.length > 0
        ? history
        : [{ role: 'user', content: `Hi, I'm ${enrichmentContext.name || 'here'}. Ask me your first question.` }];
    } else {
      // Build compact recap of earlier Q&A pairs
      const earlier = history.slice(0, history.length - MAX_LLM_MESSAGES);
      const recapParts = [];
      for (let i = 0; i < earlier.length - 1; i += 2) {
        const q = earlier[i]?.content?.substring(0, 80) || '';
        const a = earlier[i + 1]?.content?.substring(0, 120) || '';
        if (q && a) recapParts.push(`Q: ${q}... → A: ${a}...`);
      }
      const recap = recapParts.length > 0
        ? [{ role: 'user', content: `[Earlier conversation recap — ${recapParts.length} exchanges]\n${recapParts.join('\n')}` },
           { role: 'assistant', content: 'Got it, I have context from our earlier conversation. Let me continue.' }]
        : [];
      llmMessages = [...recap, ...history.slice(-MAX_LLM_MESSAGES)];
    }

    const result = await complete({
      tier: TIER_CHAT,
      system: systemPrompt,
      messages: llmMessages,
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
    log.error('Calibration error', { error });
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
    // Delete old interview memories before inserting new ones (handles re-interview)
    if (supabaseAdmin) {
      const { error: delErr } = await supabaseAdmin
        .from('user_memories')
        .delete()
        .eq('user_id', userId)
        .contains('metadata', { source: 'onboarding_interview' });
      if (delErr) log.warn('Failed to delete old interview memories', { error: delErr });
      else log.info('Cleared old interview memories', { userId });
    }

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

    log.info('Stored interview memories', { userId });

    // Post-interview hooks: trigger reflections + goal suggestions
    try {
      const shouldReflect = await shouldTriggerReflection(userId);
      if (shouldReflect) {
        log.info('Triggering post-interview reflections', { userId });
        generateReflections(userId).catch(err =>
          log.warn('Post-interview reflection error', { error: err })
        );
      }
    } catch (reflErr) {
      log.warn('Reflection trigger failed', { error: reflErr });
    }

    // Generate goal suggestions from interview insights
    generateGoalSuggestions(userId).catch(err =>
      log.warn('Goal suggestion error', { error: err })
    );
  } catch (err) {
    log.warn('Memory storage failed', { error: err });
  }
}

/**
 * GET /api/onboarding/calibration-data/:userId
 */
router.get('/calibration-data/:userId', authenticateUser, async (req, res) => {
  try {
    const userId = req.params.userId;

    if (userId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden', message: 'Access denied' });
    }

    if (!supabaseAdmin) {
      return res.json({ success: true, data: null });
    }

    const { data, error } = await supabaseAdmin
      .from('onboarding_calibration')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      log.warn('Fetch error', { error });
    }

    return res.json({ success: true, data: data || null });
  } catch (error) {
    log.error('Fetch error', { error });
    return res.status(500).json({ success: false, error: 'Failed to fetch calibration data' });
  }
});

/**
 * GET /api/onboarding/new-user-check
 * Returns whether the user needs to complete the cinematic onboarding flow.
 * Checks calibration completion + memory count to distinguish new vs returning users.
 * Used by AuthContext on sign-in to gate the OnboardingFlow.
 */
router.get('/new-user-check', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!supabaseAdmin) {
      return res.json({ success: true, isNew: false, memoriesCount: 0, hasCalibration: false });
    }

    const [calibRes, memRes] = await Promise.all([
      supabaseAdmin
        .from('onboarding_calibration')
        .select('completed_at')
        .eq('user_id', userId)
        .maybeSingle(),
      supabaseAdmin
        .from('user_memories')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId),
    ]);

    const hasCalibration = !!(calibRes.data?.completed_at);
    const memoriesCount = memRes.count ?? 0;
    const isNew = !hasCalibration && memoriesCount < 5;

    return res.json({ success: true, isNew, memoriesCount, hasCalibration });
  } catch (error) {
    log.error('Status check error', { error });
    return res.status(500).json({ success: false, error: 'Failed to check onboarding status' });
  }
});

export default router;
