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
import { complete, TIER_ANALYSIS, TIER_CHAT } from '../services/llmGateway.js';
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

const MIN_QUESTIONS = 10;
const MAX_QUESTIONS = 12;
const QUESTIONS_PER_DOMAIN = 2;

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

// ====================================================================
// Helpers — adapted from onboarding-calibration.js
// ====================================================================

function classifyDomainByKeywords(question, answer) {
  const text = `${question} ${answer}`.toLowerCase();
  const scores = {};
  for (const [domain, { strong, weak }] of Object.entries(DOMAIN_KEYWORDS)) {
    const strongHits = strong.filter(kw => text.includes(kw)).length * 2;
    const weakHits = weak.filter(kw => text.includes(kw)).length;
    scores[domain] = strongHits + weakHits;
  }
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return sorted[0][1] >= 1 ? sorted[0][0] : 'motivation';
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

  for (let i = 0; i < conversation.length - 1; i++) {
    const msg = conversation[i];
    const next = conversation[i + 1];
    if (msg.role === 'assistant' && next.role === 'user') {
      const domain = classifyDomainByKeywords(msg.content, next.content);
      domainProgress[domain].asked += 1;
      if (domainProgress[domain].asked >= QUESTIONS_PER_DOMAIN) {
        domainProgress[domain].covered = true;
      }
    }
  }

  // Determine phase
  let phase;
  if (questionNumber <= 3) {
    phase = 'warmup';
  } else {
    const domainsWithCoverage = Object.values(domainProgress).filter(d => d.asked >= 2).length;
    phase = (questionNumber >= MIN_QUESTIONS && domainsWithCoverage >= 4) ? 'integration' : 'deepdive';
  }

  const domainsWithCoverage = Object.values(domainProgress).filter(d => d.asked >= 2).length;
  const shouldComplete = (questionNumber > MAX_QUESTIONS) ||
    (questionNumber > MIN_QUESTIONS && domainsWithCoverage >= 4);

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

  const uncovered = INTERVIEW_DOMAINS.filter(d => (domainProgress[d.id]?.asked || 0) < 2);
  const suggestedDomain = uncovered.length > 0 ? uncovered[0] : null;

  let phaseInstructions = '';
  if (phase === 'warmup') {
    phaseInstructions = `CURRENT PHASE: WARM-UP (questions 1-3)
Build rapport. Reference something specific from their profile. Ask easy-to-answer questions that reveal personality.`;
  } else if (phase === 'deepdive') {
    phaseInstructions = `CURRENT PHASE: DOMAIN DEEP-DIVE
DOMAIN COVERAGE:\n${domainStatus}
${suggestedDomain ? `SUGGESTED NEXT DOMAIN: "${suggestedDomain.name}" — ${suggestedDomain.description}` : 'All domains covered. Go deeper where answers were richest.'}
RULES: Rich answers → follow-up in same domain. Thin answers → switch domain.`;
  } else if (phase === 'integration') {
    phaseInstructions = `CURRENT PHASE: INTEGRATION (final questions)
Ask a reflective, forward-looking question that ties things together. Reference specific things they've shared.`;
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

    // Validate the ElevenLabs webhook secret
    const secret = req.headers['x-elevenlabs-secret'] || req.headers['authorization']?.replace('Bearer ', '');
    const expectedSecret = process.env.ELEVENLABS_WEBHOOK_SECRET;
    if (expectedSecret && secret !== expectedSecret) {
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
      // Return a farewell message — the frontend will handle summary generation
      const farewell = `This has been a really wonderful conversation. I feel like I have a genuine sense of who you are — what drives you, how you move through the world, what matters to you. Thank you for being so open. I'm going to take everything we've talked about and use it to build your digital twin. You can tap "Done" whenever you're ready to continue.`;

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
      tier: TIER_ANALYSIS,
      system: systemPrompt,
      messages: llmMessages,
      maxTokens: 200,
      temperature: 0.8,
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
