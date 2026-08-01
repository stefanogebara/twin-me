/**
 * Life Story Interview Engine (Story Chapters)
 * =============================================
 * Phase 0 engine for the chaptered life-story interview (Plan:
 * .claude/plans/2026-08-01-twin-interview/README.md).
 *
 * Implements the Park et al. 2024 interviewer pattern:
 *  - scripted questions asked verbatim on first ask
 *  - per-turn "objective achieved?" assessment deciding follow-up vs advance
 *  - dynamic follow-ups bounded by turnBudget (TwinMe dropout history says
 *    depth must be capped — see onboarding-calibration.js header)
 *  - running reflection notes (compact bullet dictionary) instead of
 *    re-feeding full transcripts across chapters
 *  - privacy pivot: a decline is always honored by moving on
 *
 * All LLM-output handling fails OPEN to advancing: a parse failure or
 * gateway error must never trap the user on a question.
 *
 * Persistence (sessions, memory writes) is Phase 1 — this module is
 * deliberately DB-free.
 */

import { complete, TIER_ANALYSIS } from './llmGateway.js';
import { LIFE_STORY_CHAPTERS, DEFAULT_TURN_BUDGET } from '../config/lifeStoryScript.js';
import { createLogger } from './logger.js';

const log = createLogger('LifeStory');

// ====================================================================
// Script access
// ====================================================================

export function getChapter(chapterId) {
  return LIFE_STORY_CHAPTERS.find(c => c.id === chapterId) || null;
}

export function listChapters(completedIds = []) {
  const completed = new Set(completedIds);
  return LIFE_STORY_CHAPTERS.map(c => ({
    id: c.id,
    title: c.title,
    intro: c.intro,
    estimatedMinutes: c.estimatedMinutes,
    questionCount: c.questions.length,
    completed: completed.has(c.id),
  }));
}

// ====================================================================
// Pure engine logic
// ====================================================================

/**
 * Decide the next step after a user answer, given the LLM assessment.
 *
 * Advance conditions (any one suffices):
 *  - the objective is achieved
 *  - the user declined for privacy (always honored, never pressed)
 *  - the follow-up budget for this question is exhausted
 *  - the assessment produced no usable follow-up text
 *
 * Returns { action: 'followup'|'advance'|'chapter_done', questionIndex, followupsUsed }.
 */
export function nextStep({ chapter, questionIndex, followupsUsed, assessment }) {
  const question = chapter.questions[questionIndex];
  const budget = question?.turnBudget ?? DEFAULT_TURN_BUDGET;

  const followUpText = typeof assessment?.followUp === 'string' ? assessment.followUp.trim() : '';
  const canFollowUp =
    !assessment?.objectiveAchieved &&
    !assessment?.privacyDeclined &&
    followupsUsed < budget &&
    followUpText.length > 0;

  if (canFollowUp) {
    return { action: 'followup', questionIndex, followupsUsed: followupsUsed + 1 };
  }

  const nextIndex = questionIndex + 1;
  if (nextIndex >= chapter.questions.length) {
    return { action: 'chapter_done', questionIndex: nextIndex, followupsUsed: 0 };
  }
  return { action: 'advance', questionIndex: nextIndex, followupsUsed: 0 };
}

/**
 * Merge running reflection notes with updates from the latest turn.
 * Immutable; updates win on collision; only non-empty string values kept.
 */
export function mergeReflectionNotes(existing, updates) {
  const base = existing && typeof existing === 'object' ? existing : {};
  const merged = { ...base };
  if (updates && typeof updates === 'object') {
    for (const [key, value] of Object.entries(updates)) {
      if (typeof value === 'string' && value.trim().length > 0) {
        merged[key] = value.trim();
      }
    }
  }
  return merged;
}

/**
 * Parse the assessment JSON out of raw LLM output.
 * Fails OPEN: anything unparseable becomes { objectiveAchieved: true } so the
 * interview always moves forward rather than looping on a broken turn.
 */
export function parseAssessment(rawContent) {
  const failOpen = { objectiveAchieved: true, followUp: null, bridge: '', notes: {}, privacyDeclined: false };
  if (!rawContent || typeof rawContent !== 'string') return failOpen;

  const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return failOpen;

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      objectiveAchieved: Boolean(parsed.objectiveAchieved),
      followUp: typeof parsed.followUp === 'string' && parsed.followUp.trim() ? parsed.followUp.trim() : null,
      bridge: typeof parsed.bridge === 'string' ? parsed.bridge.trim() : '',
      notes: parsed.notes && typeof parsed.notes === 'object' ? parsed.notes : {},
      privacyDeclined: Boolean(parsed.privacyDeclined),
    };
  } catch (err) {
    // Fail-open is deliberate (never trap the user), but the malformed output
    // is still a signal worth having in logs.
    log.warn('Assessment parse failed, failing open to advance', {
      preview: rawContent.substring(0, 120),
      error: err.message,
    });
    return failOpen;
  }
}

// ====================================================================
// Prompt construction
// ====================================================================

function formatNotes(reflectionNotes) {
  const entries = Object.entries(reflectionNotes || {});
  if (entries.length === 0) return 'Nothing yet — this may be an early chapter.';
  return entries.map(([k, v]) => `- ${k}: ${v}`).join('\n');
}

function formatTranscript(transcript, maxChars = 5000) {
  const lines = (transcript || []).map(
    m => `${m.role === 'assistant' ? 'Interviewer' : 'Them'}: ${m.content}`
  );
  let text = lines.join('\n');
  // Paper protocol: recent window only — reflection notes carry older context.
  if (text.length > maxChars) text = text.slice(-maxChars);
  return text;
}

/**
 * Build the per-turn assessment prompt (system message).
 * Mirrors the Park et al. interviewer: objective assessment + next utterance,
 * conditioned on running notes + recent transcript window.
 */
export function buildAssessmentPrompt({ chapter, question, reflectionNotes }) {
  return `You are the interviewer for Twin Me's life-story interview — warm, perceptive, genuinely curious. You are working through the chapter "${chapter.title}".

CURRENT QUESTION (already asked): "${question.text}"
LEARNING OBJECTIVE for this question: ${question.objective}

WHAT YOU HAVE LEARNED ABOUT THEM SO FAR (running notes from all chapters):
${formatNotes(reflectionNotes)}

YOUR TASK — assess the conversation and decide the next move:
1. Has the learning objective been reasonably achieved by their answers so far? Do not demand exhaustive detail — a genuine, specific answer achieves the objective.
2. If NOT achieved, write ONE short follow-up question that advances the objective. It must react specifically to what they said, not generically.
3. Write a one-sentence "bridge" reacting to their last answer — specific, warm, no generic affirmations.
4. Extract any new durable facts about them as short note entries (snake_case keys, short string values).

RULES:
- NEVER use generic affirmations ("Great answer!", "That's so interesting!", "Thanks for sharing!"). React to the CONTENT of what they said.
- NEVER ask "tell me more" or "what specifically?" — a follow-up must add a new, concrete angle.
- NEVER press on a topic they deflect or decline. PRIVACY RULE: if they decline, deflect, or show discomfort — even implicitly — set privacyDeclined true and move on gracefully. Their boundary is always honored.
- If their answer is short but complete, that counts as achieved. Depth is invited, never demanded.
- Follow-ups are a scarce resource. Only follow up when the objective is genuinely unmet AND they seem engaged.

Return ONLY this JSON (no markdown, no commentary):
{
  "objectiveAchieved": true or false,
  "privacyDeclined": true or false,
  "followUp": "one follow-up question" or null,
  "bridge": "one specific sentence reacting to their last answer",
  "notes": { "snake_case_key": "short fact about them" }
}`;
}

// ====================================================================
// Turn processing (LLM)
// ====================================================================

/**
 * Process one user answer: assess it, then return the interviewer's next
 * move as { kind: 'followup'|'question'|'chapter_done', utterance, questionIndex,
 * followupsUsed, noteUpdates, bridge }.
 *
 * On advance, the next scripted question is delivered VERBATIM, prefixed by
 * the LLM's bridge sentence. On LLM failure, fails open to advancing.
 */
export async function assessTurn({
  userId,
  chapter,
  questionIndex,
  followupsUsed,
  transcript,
  reflectionNotes,
}) {
  const question = chapter.questions[questionIndex];
  if (!question) {
    return { kind: 'chapter_done', utterance: '', questionIndex, followupsUsed: 0, noteUpdates: {}, bridge: '' };
  }

  let assessment;
  try {
    const result = await complete({
      tier: TIER_ANALYSIS,
      system: buildAssessmentPrompt({ chapter, question, reflectionNotes }),
      messages: [{ role: 'user', content: formatTranscript(transcript) }],
      maxTokens: 400,
      temperature: 0.6,
      userId,
      serviceName: 'life-story-assess',
    });
    assessment = parseAssessment(result.content);
  } catch (err) {
    log.warn('Assessment LLM call failed, failing open to advance', { userId, error: err.message });
    assessment = { objectiveAchieved: true, followUp: null, bridge: '', notes: {}, privacyDeclined: false };
  }

  const step = nextStep({ chapter, questionIndex, followupsUsed, assessment });
  const noteUpdates = assessment.notes || {};

  if (step.action === 'followup') {
    return {
      kind: 'followup',
      utterance: assessment.followUp,
      questionIndex: step.questionIndex,
      followupsUsed: step.followupsUsed,
      noteUpdates,
      bridge: assessment.bridge,
    };
  }

  if (step.action === 'chapter_done') {
    return {
      kind: 'chapter_done',
      utterance: assessment.bridge || '',
      questionIndex: step.questionIndex,
      followupsUsed: 0,
      noteUpdates,
      bridge: assessment.bridge,
    };
  }

  // Advance: verbatim next scripted question, bridged for warmth.
  const nextQuestion = chapter.questions[step.questionIndex];
  const utterance = assessment.bridge
    ? `${assessment.bridge} ${nextQuestion.text}`
    : nextQuestion.text;

  return {
    kind: 'question',
    utterance,
    questionIndex: step.questionIndex,
    followupsUsed: 0,
    noteUpdates,
    bridge: assessment.bridge,
  };
}
