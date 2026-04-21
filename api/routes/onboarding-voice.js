/**
 * Voice Interview — OpenAI-Compatible Custom LLM Wrapper
 * =======================================================
 * Thin adapter for ElevenLabs Conversational AI Agent.
 * ElevenLabs sends messages in OpenAI chat completion format,
 * we run our calibration logic and return the next question.
 *
 * The existing /calibrate endpoint stays untouched — this wrapper
 * re-uses the same internal logic (domain classification, phase
 * detection, prompt building) in a format ElevenLabs understands.
 */

import express from 'express';
import crypto from 'crypto';
import { complete, TIER_ANALYSIS, TIER_EXTRACTION, TIER_CHAT } from '../services/llmGateway.js';
import { authenticateUser } from '../middleware/auth.js';
import { supabaseAdmin } from '../services/database.js';
import { addMemory, addConversationMemory } from '../services/memoryStreamService.js';
import { shouldTriggerReflection, generateReflections } from '../services/reflectionEngine.js';
import { generateGoalSuggestions } from '../services/goalTrackingService.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('VoiceInterview');

const router = express.Router();

// ====================================================================
// Config — mirrors onboarding-calibration.js
// ====================================================================

const MIN_QUESTIONS = 3;
const MAX_QUESTIONS = 3;
const QUESTIONS_PER_DOMAIN = 1;
// Priority domains: the 3 we ask directly. Lifestyle + cultural inferred from platform data.
const PRIORITY_DOMAINS = new Set(['motivation', 'personality', 'social']);

const INTERVIEW_DOMAINS = [
  { id: 'motivation', name: 'Motivation & Work', expertPersona: 'Motivation Analyst', description: 'What drives this person, their career arc, ambitions' },
  { id: 'lifestyle', name: 'Lifestyle & Rhythms', expertPersona: 'Lifestyle Analyst', description: 'Daily patterns, energy management, health, routines' },
  { id: 'personality', name: 'Personality & Emotions', expertPersona: 'Personality Psychologist', description: 'Emotional processing, stress responses, coping' },
  { id: 'cultural', name: 'Cultural Identity', expertPersona: 'Cultural Identity Expert', description: 'Music, media, aesthetics, creative expression' },
  { id: 'social', name: 'Social Dynamics', expertPersona: 'Social Dynamics Analyst', description: 'Relationships, communication style, social energy' },
];

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

// Deterministic domain schedule — 3-question interview.
// Lifestyle + cultural are inferred from platform data (Spotify, Calendar, Whoop).
const QUESTION_DOMAIN_SCHEDULE = {
  1: 'motivation',   // Q1: What drives them (warm opener + identity)
  2: 'personality',  // Q2: Emotional texture / how they feel most themselves
  3: 'social',       // Q3: Social/relational close, reflective
};

// ====================================================================
// Helpers — adapted from onboarding-calibration.js
// ====================================================================

function classifyDomainByKeywords(question, answer, questionNumber) {
  const text = `${question} ${answer}`.toLowerCase();
  const scores = {};
  for (const [domain, { strong, weak }] of Object.entries(DOMAIN_KEYWORDS)) {
    const strongHits = strong.filter(kw => text.includes(kw)).length * 2;
    const weakHits = weak.filter(kw => text.includes(kw)).length;
    scores[domain] = strongHits + weakHits;
  }
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  // Use schedule-aware fallback instead of always defaulting to 'motivation'
  const scheduledDomain = questionNumber ? QUESTION_DOMAIN_SCHEDULE[questionNumber] : null;
  return sorted[0][1] >= 1 ? sorted[0][0] : (scheduledDomain || 'personality');
}

/**
 * Derive interview state from the raw OpenAI-format messages.
 * ElevenLabs sends the full conversation each time, so we reconstruct
 * questionNumber and domainProgress from the message history.
 */
function deriveInterviewState(messages) {
  // Filter out system messages — ElevenLabs includes its own system prompt
  const conversation = messages.filter(m => m.role !== 'system');

  // Count assistant messages = questions asked so far
  const assistantMessages = conversation.filter(m => m.role === 'assistant');
  const questionNumber = assistantMessages.length + 1; // next question to ask

  // Build domain progress from Q&A pairs
  const domainProgress = {};
  INTERVIEW_DOMAINS.forEach(d => {
    domainProgress[d.id] = { asked: 0, covered: false };
  });

  let qIdx = 1;
  for (let i = 0; i < conversation.length - 1; i++) {
    const msg = conversation[i];
    const next = conversation[i + 1];
    if (msg.role === 'assistant' && next.role === 'user') {
      // Use scheduled domain when available, fall back to keyword classification
      const scheduledDomain = QUESTION_DOMAIN_SCHEDULE[qIdx];
      const domain = scheduledDomain || classifyDomainByKeywords(msg.content, next.content, qIdx);
      domainProgress[domain].asked += 1;
      if (domainProgress[domain].asked >= QUESTIONS_PER_DOMAIN) {
        domainProgress[domain].covered = true;
      }
      qIdx++;
    }
  }

  // Determine phase (3-question interview)
  let phase;
  if (questionNumber <= 1) {
    phase = 'warmup';
  } else if (questionNumber === 2) {
    phase = 'deepdive';
  } else {
    phase = 'integration';
  }

  const domainsWithCoverage = Object.values(domainProgress).filter(d => d.asked >= 1).length;
  const shouldComplete = (questionNumber > MAX_QUESTIONS) ||
    (questionNumber > MIN_QUESTIONS && domainsWithCoverage >= 2);

  return { questionNumber, domainProgress, phase, shouldComplete, domainsWithCoverage, conversation };
}

/**
 * Build the interview system prompt — same logic as onboarding-calibration.js
 * but adapted for voice (slightly shorter responses, conversational tone).
 */
function buildVoiceInterviewPrompt(enrichmentContext, questionNumber, domainProgress, phase) {
  const known = [];
  if (enrichmentContext?.name) known.push(`Name: ${enrichmentContext.name}`);
  if (enrichmentContext?.company) known.push(`Company: ${enrichmentContext.company}`);
  if (enrichmentContext?.title) known.push(`Title: ${enrichmentContext.title}`);
  if (enrichmentContext?.location) known.push(`Location: ${enrichmentContext.location}`);
  if (enrichmentContext?.bio) known.push(`Bio: ${enrichmentContext.bio}`);

  const domainStatus = INTERVIEW_DOMAINS.map(d => {
    const progress = domainProgress[d.id] || { asked: 0, covered: false };
    const status = progress.covered ? 'COVERED' : progress.asked > 0 ? `${progress.asked} asked` : 'NOT YET';
    return `  - ${d.name}: ${status}`;
  }).join('\n');

  // Look up required domain from the deterministic schedule
  const scheduledDomainId = QUESTION_DOMAIN_SCHEDULE[questionNumber] || null;
  const scheduledDomain = scheduledDomainId
    ? INTERVIEW_DOMAINS.find(d => d.id === scheduledDomainId)
    : null;

  let phaseInstructions = '';
  if (phase === 'warmup' && questionNumber === 1) {
    phaseInstructions = `CURRENT PHASE: OPENING
This is question 1. Reference something from their profile to create an instant personal connection. Ask what draws them to their work or what moment in their day makes them feel most alive.`;
  } else if (phase === 'warmup') {
    phaseInstructions = `CURRENT PHASE: WARM-UP
Build rapport. Follow up on what they just shared. Start revealing what motivates them.`;
  } else if (phase === 'deepdive' && scheduledDomain) {
    phaseInstructions = `CURRENT PHASE: DEEP-DIVE
REQUIRED DOMAIN: "${scheduledDomain.name}" — ${scheduledDomain.description}
You MUST ask about this domain. Your question MUST relate to ${scheduledDomain.name.toLowerCase()}.
If the previous answer naturally connects to this domain, bridge from it. Otherwise, make a smooth transition.
DO NOT ask about a different domain.`;
  } else if (phase === 'deepdive') {
    phaseInstructions = `CURRENT PHASE: DEEP-DIVE
DOMAIN COVERAGE:\n${domainStatus}
Go deeper where answers were richest. Follow the natural thread of conversation.`;
  } else if (phase === 'integration') {
    phaseInstructions = `CURRENT PHASE: INTEGRATION (final question)
Ask ONE reflective question that ties together themes from the entire conversation. Reference specific things they shared — their ${Object.keys(domainProgress).filter(d => (domainProgress[d]?.asked || 0) >= 2).join(', ')} patterns. This is the last question.`;
  }

  return `You are a warm, perceptive interviewer for Twin Me — a platform that builds a digital twin of someone's personality. You're conducting the initial deep interview VIA VOICE.

WHAT YOU KNOW:
${known.length > 0 ? known.join('\n') : 'Very little yet.'}

${phaseInstructions}

QUESTION NUMBER: ${questionNumber}

VOICE CONVERSATION RULES:
- ONE question at a time
- Keep responses SHORT — this is spoken aloud, not read. 1-2 sentences of reaction + the question (3 sentences max)
- React SPECIFICALLY to what they said, never generic ("That's interesting!")
- Sound like a perceptive friend, not a therapist or interviewer
- Questions should make someone pause and think
- NO markdown, NO formatting, NO labels — just natural speech
- Use conversational language (contractions, casual tone)
- NEVER say "Question 5:" or any numbering`;
}

// ====================================================================
// Route: OpenAI-Compatible Chat Completion
// ====================================================================

/**
 * POST /api/onboarding/voice/v1/chat/completions
 *
 * ElevenLabs Conversational AI sends requests here in OpenAI format.
 * We derive interview state from the messages, generate the next question,
 * and return it in OpenAI format.
 */
router.post('/v1/chat/completions', async (req, res) => {
  try {
    const { messages, stream } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array required' });
    }

    // Validate the ElevenLabs webhook secret (timing-safe comparison)
    const secret = req.headers['x-elevenlabs-secret'] || req.headers['authorization']?.replace('Bearer ', '');
    const expectedSecret = process.env.ELEVENLABS_WEBHOOK_SECRET;
    if (!expectedSecret || !secret) {
      log.warn('Missing ElevenLabs webhook secret');
      return res.status(401).json({ error: 'Unauthorized' });
    }
    let isSecretValid = false;
    try {
      isSecretValid = crypto.timingSafeEqual(
        Buffer.from(secret, 'utf8'),
        Buffer.from(expectedSecret, 'utf8')
      );
    } catch {
      isSecretValid = false; // length mismatch
    }
    if (!isSecretValid) {
      log.warn('Invalid ElevenLabs webhook secret');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Extract enrichment context from the system message (injected via conversation_config_override)
    let enrichmentContext = {};
    let userId = null;
    const systemMsg = messages.find(m => m.role === 'system');
    if (systemMsg?.content) {
      try {
        // Look for JSON enrichment block in system message
        const enrichmentMatch = systemMsg.content.match(/ENRICHMENT_JSON:({.*?})END_ENRICHMENT/s);
        if (enrichmentMatch) {
          const parsed = JSON.parse(enrichmentMatch[1]);
          enrichmentContext = parsed.enrichmentContext || {};
          userId = parsed.userId || null;
        }
      } catch {
        log.warn('Failed to parse enrichment from system message');
      }
    }

    // Auto-enrich from database if we have userId
    if (userId && supabaseAdmin && !enrichmentContext.company) {
      try {
        const { data: profile } = await supabaseAdmin
          .from('enriched_profiles')
          .select('company, title, location, bio, career_timeline, education')
          .eq('user_id', userId)
          .maybeSingle();
        if (profile) {
          enrichmentContext = { ...enrichmentContext, ...profile };
        }
      } catch { /* non-fatal */ }
    }

    // Derive interview state from conversation history
    const { questionNumber, domainProgress, phase, shouldComplete, conversation } = deriveInterviewState(messages);

    log.info('Voice interview turn', { questionNumber, phase, userId: userId?.substring(0, 8) });

    if (shouldComplete) {
      // Return a short farewell — the agent should wrap up naturally
      const farewell = `That was really wonderful. I feel like I genuinely know you now — what drives you, how you recharge, what matters most. Thank you for being so open. Your twin is going to be something special.`;

      // Fire-and-forget: store memories in the background
      if (userId) {
        storeVoiceInterviewMemories(userId, conversation, enrichmentContext).catch(err =>
          log.error('Background memory storage failed', { error: err })
        );
      }

      return res.json({
        id: `chatcmpl-voice-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        choices: [{
          index: 0,
          message: { role: 'assistant', content: farewell },
          finish_reason: 'stop',
        }],
      });
    }

    // Build prompt and generate next question
    const systemPrompt = buildVoiceInterviewPrompt(enrichmentContext, questionNumber, domainProgress, phase);

    // Trim conversation for LLM context (same strategy as text calibration)
    const MAX_LLM_MESSAGES = 6;
    let llmMessages;
    if (conversation.length <= MAX_LLM_MESSAGES) {
      llmMessages = conversation.length > 0
        ? conversation
        : [{ role: 'user', content: `Hi, I'm ${enrichmentContext.name || 'here'}. Ask me your first question.` }];
    } else {
      const earlier = conversation.slice(0, conversation.length - MAX_LLM_MESSAGES);
      const recapParts = [];
      for (let i = 0; i < earlier.length - 1; i += 2) {
        const q = earlier[i]?.content?.substring(0, 60) || '';
        const a = earlier[i + 1]?.content?.substring(0, 100) || '';
        if (q && a) recapParts.push(`Q: ${q}... A: ${a}...`);
      }
      const recap = recapParts.length > 0
        ? [{ role: 'user', content: `[Earlier conversation recap]\n${recapParts.join('\n')}` },
           { role: 'assistant', content: 'Got it, I have context from our earlier conversation. Let me continue.' }]
        : [];
      llmMessages = [...recap, ...conversation.slice(-MAX_LLM_MESSAGES)];
    }

    const result = await complete({
      tier: TIER_EXTRACTION, // Mistral Small — 2x faster than DeepSeek for short responses
      system: systemPrompt,
      messages: llmMessages,
      maxTokens: 100, // Voice responses should be SHORT (1-2 sentences)
      temperature: 0.75,
      userId,
      serviceName: 'voice-interview',
    });

    const responseContent = result.content || 'Tell me more about yourself.';

    // Return OpenAI-compatible response
    return res.json({
      id: `chatcmpl-voice-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      choices: [{
        index: 0,
        message: { role: 'assistant', content: responseContent },
        finish_reason: 'stop',
      }],
    });
  } catch (error) {
    log.error('Voice interview error', { error });
    return res.status(500).json({
      error: {
        message: 'Voice interview failed',
        type: 'server_error',
      },
    });
  }
});

// ====================================================================
// Voice Interview Completion — generates summary + calibration record
// ====================================================================

/**
 * POST /api/onboarding/voice/complete
 *
 * Called by the frontend when voice session ends.
 * Runs the same calibration pipeline as text interview:
 * classify domains, generate summary, store memories, return archetype.
 */
router.post('/complete', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'User ID required' });

    const { conversationHistory, enrichmentContext } = req.body;
    if (!conversationHistory || !Array.isArray(conversationHistory) || conversationHistory.length < 4) {
      return res.status(400).json({ error: 'Conversation history too short' });
    }

    log.info('Voice interview completion', { userId: userId.substring(0, 8), messages: conversationHistory.length });

    // Build domain progress from conversation
    const domainProgress = {};
    INTERVIEW_DOMAINS.forEach(d => { domainProgress[d.id] = { asked: 0, insights: [] }; });

    const qaPairs = [];
    let qIdx = 1;
    for (let i = 0; i < conversationHistory.length - 1; i++) {
      const msg = conversationHistory[i];
      const next = conversationHistory[i + 1];
      if (msg.role === 'assistant' && next.role === 'user') {
        const scheduledDomain = QUESTION_DOMAIN_SCHEDULE[qIdx];
        const domain = scheduledDomain || classifyDomainByKeywords(msg.content, next.content, qIdx);
        qaPairs.push({ question: msg.content, answer: next.content, domain });
        domainProgress[domain].asked += 1;
        qIdx++;
      }
    }

    // Generate summary via TIER_CHAT (Claude Sonnet — same quality as text interview)
    const summaryPrompt = `You are analyzing a deep personality interview. Extract structured insights.

INTERVIEW TRANSCRIPT:
${qaPairs.map((qa, i) => `Q${i + 1} [${qa.domain}]: ${qa.question}\nA: ${qa.answer}`).join('\n\n')}

Return a JSON object with:
{
  "domain_insights": {
    "motivation": ["insight1", "insight2"],
    "lifestyle": ["insight1", "insight2"],
    "personality": ["insight1", "insight2"],
    "cultural": ["insight1", "insight2"],
    "social": ["insight1", "insight2"]
  },
  "archetype_hint": "A short archetype name (3-5 words, e.g. 'The Midnight Alchemist')",
  "summary": "A 2-3 sentence personality summary that captures their essence"
}

Be specific and reference actual things they said. Make the archetype evocative and personal.`;

    const summaryResult = await complete({
      tier: TIER_CHAT,
      system: 'You are a personality analyst. Return ONLY valid JSON.',
      messages: [{ role: 'user', content: summaryPrompt }],
      maxTokens: 800,
      temperature: 0.7,
      userId,
      serviceName: 'voice-interview-summary',
    });

    let insights = {};
    let archetype = 'The Explorer';
    let summary = '';
    try {
      const jsonMatch = summaryResult.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        insights = parsed.domain_insights || {};
        archetype = parsed.archetype_hint || archetype;
        summary = parsed.summary || '';
      }
    } catch { log.warn('Failed to parse voice summary JSON'); }

    // Store to onboarding_calibration table (same as text interview)
    if (supabaseAdmin) {
      try {
        await supabaseAdmin.from('onboarding_calibration').upsert({
          user_id: userId,
          enrichment_context: enrichmentContext || {},
          conversation_history: conversationHistory,
          domain_progress: domainProgress,
          archetype_hint: archetype,
          personality_summary: summary,
          insights: Object.values(insights).flat(),
          domain_insights: insights,
          input_method: 'voice',
          completed_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
      } catch (err) { log.error('Failed to store calibration', { error: err }); }
    }

    // Store memories (awaited, not fire-and-forget)
    await storeVoiceInterviewMemories(userId, conversationHistory.filter(m => m.role !== 'system'), enrichmentContext);

    // Store archetype + summary as high-importance memories
    try {
      await addMemory(userId, `Soul archetype: ${archetype}. ${summary}`, 'fact', {
        importance_score: 9,
        source: 'onboarding_interview',
        input_method: 'voice',
        domain: 'personality',
      });
    } catch { /* non-fatal */ }

    return res.json({
      success: true,
      done: true,
      archetype_hint: archetype,
      personality_summary: summary,
      domain_insights: insights,
      insights: Object.values(insights).flat(),
    });
  } catch (error) {
    log.error('Voice completion error', { error });
    return res.status(500).json({ error: 'Voice completion failed' });
  }
});

// ====================================================================
// Background memory storage for voice interviews
// ====================================================================

async function storeVoiceInterviewMemories(userId, conversation, enrichmentContext) {
  try {
    // Delete old interview memories
    if (supabaseAdmin) {
      await supabaseAdmin
        .from('user_memories')
        .delete()
        .eq('user_id', userId)
        .contains('metadata', { source: 'onboarding_interview' });
    }

    // Store each Q&A pair as a conversation memory
    for (let i = 0; i < conversation.length - 1; i++) {
      const msg = conversation[i];
      const next = conversation[i + 1];
      if (msg.role === 'assistant' && next.role === 'user') {
        const domain = classifyDomainByKeywords(msg.content, next.content);
        await addConversationMemory(userId, next.content, msg.content, {
          source: 'onboarding_interview',
          input_method: 'voice',
          domain,
          expertPersona: INTERVIEW_DOMAINS.find(d => d.id === domain)?.expertPersona || null,
        });
      }
    }

    log.info('Stored voice interview memories', { userId: userId.substring(0, 8) });

    // Trigger reflections if threshold met
    try {
      const shouldReflect = await shouldTriggerReflection(userId);
      if (shouldReflect) {
        generateReflections(userId).catch(err =>
          log.warn('Post-voice-interview reflection error', { error: err })
        );
      }
    } catch { /* non-fatal */ }

    // Generate goal suggestions
    generateGoalSuggestions(userId).catch(() => {});
  } catch (err) {
    log.error('Voice memory storage failed', { error: err });
  }
}

export default router;
