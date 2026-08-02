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
 * Phase 1 adds the session lifecycle: life_story_sessions holds the live
 * transcript; chapter completion writes Q&A pairs + extracted facts + a
 * summary reflection into the memory stream and updates life_story_state
 * (running notes, completed chapters).
 */

import { complete, TIER_ANALYSIS } from './llmGateway.js';
import { LIFE_STORY_CHAPTERS, DEFAULT_TURN_BUDGET } from '../config/lifeStoryScript.js';
import { supabaseAdmin } from './database.js';
import { addMemory } from './memoryStreamService.js';
import { shouldTriggerReflection, generateReflections } from './reflectionEngine.js';
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

// ====================================================================
// Session lifecycle (Phase 1)
// ====================================================================

/**
 * Safety cap on transcript entries per session. A chapter has <= 6 questions
 * with <= 3 follow-ups each, so a legitimate session never approaches this;
 * hitting it means something is looping — force-complete rather than keep
 * burning LLM calls.
 */
export const MAX_TRANSCRIPT_ENTRIES = 60;

async function getState(userId) {
  const { data, error } = await supabaseAdmin
    .from('life_story_state')
    .select('reflection_notes, chapters_completed, nudges')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    log.warn('Failed to load life story state', { userId, error: error.message });
  }
  return {
    reflection_notes: data?.reflection_notes || {},
    chapters_completed: data?.chapters_completed || [],
    nudges: data?.nudges || {},
  };
}

async function saveState(userId, state) {
  const { error } = await supabaseAdmin.from('life_story_state').upsert(
    {
      user_id: userId,
      reflection_notes: state.reflection_notes,
      chapters_completed: state.chapters_completed,
      nudges: state.nudges,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );
  if (error) {
    log.warn('Failed to save life story state', { userId, error: error.message });
  }
}

/**
 * Chapter list + progress for the UI, with a suggested next chapter
 * (first incomplete, in script order — chapter 1 first).
 */
export async function getLifeStoryStatus(userId) {
  const state = await getState(userId);
  const chapters = listChapters(state.chapters_completed);
  const suggested = chapters.find(c => !c.completed);
  return {
    chapters,
    completedCount: chapters.filter(c => c.completed).length,
    totalChapters: chapters.length,
    suggestedNext: suggested ? suggested.id : null,
  };
}

/**
 * Begin a chapter, or resume the user's active session for it.
 * Fresh sessions open with the chapter intro + the first scripted question
 * (verbatim), persisted into the transcript at insert time so a refresh
 * before the first answer resumes cleanly.
 */
export async function startSession(userId, chapterId) {
  const chapter = getChapter(chapterId);
  if (!chapter) throw new Error(`Unknown chapter: ${chapterId}`);

  const { data: existing, error: findError } = await supabaseAdmin
    .from('life_story_sessions')
    .select('id, chapter_id, status, transcript, question_index, followups_used')
    .eq('user_id', userId)
    .eq('chapter_id', chapterId)
    .eq('status', 'active')
    .order('started_at', { ascending: false })
    .limit(1);
  if (findError) {
    log.warn('Active-session lookup failed', { userId, chapterId, error: findError.message });
  }

  const active = Array.isArray(existing) ? existing[0] : null;
  if (active) {
    const lastAssistant = [...(active.transcript || [])]
      .reverse()
      .find(m => m.role === 'assistant');
    return {
      sessionId: active.id,
      chapterId,
      resumed: true,
      utterance: lastAssistant?.content || chapter.questions[active.question_index]?.text || chapter.questions[0].text,
      questionIndex: active.question_index,
    };
  }

  const opening = `${chapter.intro} ${chapter.questions[0].text}`;
  const { data: created, error: insertError } = await supabaseAdmin
    .from('life_story_sessions')
    .insert({
      user_id: userId,
      chapter_id: chapterId,
      transcript: [{ role: 'assistant', content: opening, questionId: chapter.questions[0].id }],
      question_index: 0,
      followups_used: 0,
    })
    .select('id')
    .single();
  if (insertError || !created) {
    throw new Error(`Failed to create session: ${insertError?.message || 'no row returned'}`);
  }

  return {
    sessionId: created.id,
    chapterId,
    resumed: false,
    utterance: opening,
    questionIndex: 0,
  };
}

/**
 * Process one user answer for a session. Returns the interviewer's move
 * ({ kind, utterance, questionIndex, done }) or null when the session does
 * not exist / belong to this user / is not active.
 */
export async function processTurn(userId, sessionId, answer) {
  const { data: session, error } = await supabaseAdmin
    .from('life_story_sessions')
    .select('id, user_id, chapter_id, status, transcript, question_index, followups_used')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();
  if (error) {
    log.warn('Session load failed', { userId, sessionId, error: error.message });
  }
  if (!session) return null;

  const chapter = getChapter(session.chapter_id);
  if (!chapter) return null;

  const state = await getState(userId);
  const transcript = [
    ...(session.transcript || []),
    {
      role: 'user',
      content: String(answer).trim(),
      questionId: chapter.questions[session.question_index]?.id || null,
    },
  ];

  // Runaway safety: force-complete instead of assessing another turn.
  if (transcript.length >= MAX_TRANSCRIPT_ENTRIES) {
    log.warn('Transcript safety cap hit, force-completing chapter', { userId, sessionId });
    const mirror = await completeChapter({ userId, session, chapter, transcript, state, noteUpdates: {} });
    return { kind: 'chapter_done', utterance: mirror, questionIndex: session.question_index, done: true };
  }

  const move = await assessTurn({
    userId,
    chapter,
    questionIndex: session.question_index,
    followupsUsed: session.followups_used,
    transcript,
    reflectionNotes: state.reflection_notes,
  });

  if (move.kind === 'chapter_done') {
    const mirror = await completeChapter({
      userId,
      session,
      chapter,
      transcript,
      state,
      noteUpdates: move.noteUpdates,
    });
    // The synthesis mirror line is the chapter-end payoff; fall back to the
    // turn assessment's bridge if synthesis produced nothing.
    return {
      kind: 'chapter_done',
      utterance: mirror || move.utterance || '',
      questionIndex: move.questionIndex,
      done: true,
    };
  }

  const updatedTranscript = [
    ...transcript,
    {
      role: 'assistant',
      content: move.utterance,
      questionId: chapter.questions[move.questionIndex]?.id || null,
    },
  ];

  const { error: updateError } = await supabaseAdmin
    .from('life_story_sessions')
    .update({
      transcript: updatedTranscript,
      question_index: move.questionIndex,
      followups_used: move.followupsUsed,
    })
    .eq('id', session.id);
  if (updateError) {
    log.warn('Session update failed', { userId, sessionId, error: updateError.message });
  }

  const mergedNotes = mergeReflectionNotes(state.reflection_notes, move.noteUpdates);
  await saveState(userId, { ...state, reflection_notes: mergedNotes });

  return {
    kind: move.kind,
    utterance: move.utterance,
    questionIndex: move.questionIndex,
    done: false,
  };
}

/**
 * Build the chapter synthesis prompt: facts + summary + the mirror line
 * (the chapter-end payoff the user sees — specific, second person).
 */
function buildSynthesisPrompt(chapter, reflectionNotes) {
  return `You are analyzing one completed chapter ("${chapter.title}") of a life-story interview for Twin Me. The full chapter transcript follows as the user message.

WHAT IS ALREADY KNOWN (running notes from other chapters):
${formatNotes(reflectionNotes)}

Extract:
1. "facts": 3-6 standalone facts about the person from THIS chapter (third person, "they", specific — not generic).
2. "summary": a 2-3 sentence synthesis of what this chapter revealed about who they are.
3. "mirror": ONE sentence spoken directly to them (second person) reflecting something specific and non-obvious this chapter revealed. It should land like being seen, not like a compliment. No generic affirmations.
4. "notes": new durable note entries (snake_case keys, short string values) not already in the running notes.

Return ONLY this JSON:
{ "facts": ["..."], "summary": "...", "mirror": "...", "notes": { } }`;
}

function parseSynthesis(rawContent) {
  const fallback = { facts: [], summary: '', mirror: '', notes: {} };
  if (!rawContent || typeof rawContent !== 'string') return fallback;
  const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return fallback;
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      facts: Array.isArray(parsed.facts) ? parsed.facts.filter(f => typeof f === 'string' && f.length > 5) : [],
      summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : '',
      mirror: typeof parsed.mirror === 'string' ? parsed.mirror.trim() : '',
      notes: parsed.notes && typeof parsed.notes === 'object' ? parsed.notes : {},
    };
  } catch (err) {
    log.warn('Synthesis parse failed', { preview: rawContent.substring(0, 120), error: err.message });
    return fallback;
  }
}

/**
 * Finalize a chapter: synthesize, write memories, close the session, update
 * state, fire the reflection hook. Returns the mirror line for the user.
 *
 * Memory layout (mirrors the validated soul-interview pattern):
 *  - each Q&A pair  → conversation memory, importance 8 (skipImportance)
 *  - each fact      → fact memory, importance 8
 *  - chapter summary → reflection memory, importance 9
 * All tagged { source: 'life_story', chapter, question_id? }.
 */
async function completeChapter({ userId, session, chapter, transcript, state, noteUpdates }) {
  let synthesis = { facts: [], summary: '', mirror: '', notes: {} };
  try {
    const result = await complete({
      tier: TIER_ANALYSIS,
      system: buildSynthesisPrompt(chapter, state.reflection_notes),
      messages: [{ role: 'user', content: formatTranscript(transcript, 12000) }],
      maxTokens: 700,
      temperature: 0.5,
      userId,
      serviceName: 'life-story-synthesis',
    });
    synthesis = parseSynthesis(result.content);
  } catch (err) {
    log.warn('Chapter synthesis failed (chapter still completes)', { userId, error: err.message });
  }

  // Q&A pairs: pair each assistant utterance with the following user answer.
  const memoryWrites = [];
  for (let i = 0; i < transcript.length - 1; i++) {
    const q = transcript[i];
    const a = transcript[i + 1];
    if (q.role === 'assistant' && a.role === 'user') {
      memoryWrites.push(
        addMemory(
          userId,
          `Life story (${chapter.title}) — Q: "${q.content.substring(0, 300)}" A: "${a.content.substring(0, 800)}"`,
          'conversation',
          { source: 'life_story', chapter: chapter.id, question_id: q.questionId || null },
          { importanceScore: 8, skipImportance: true }
        )
      );
    }
  }
  for (const fact of synthesis.facts) {
    memoryWrites.push(
      addMemory(
        userId,
        fact,
        'fact',
        { source: 'life_story', chapter: chapter.id },
        { importanceScore: 8, skipImportance: true }
      )
    );
  }
  if (synthesis.summary) {
    memoryWrites.push(
      addMemory(
        userId,
        `Life story chapter (${chapter.title}): ${synthesis.summary}`,
        'reflection',
        { source: 'life_story', chapter: chapter.id },
        { importanceScore: 9, skipImportance: true }
      )
    );
  }
  const results = await Promise.allSettled(memoryWrites);
  const failed = results.filter(r => r.status === 'rejected').length;
  if (failed > 0) {
    log.warn('Some chapter memory writes failed', { userId, chapter: chapter.id, failed });
  }

  const { error: closeError } = await supabaseAdmin
    .from('life_story_sessions')
    .update({
      transcript,
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', session.id);
  if (closeError) {
    log.warn('Failed to close session', { userId, sessionId: session.id, error: closeError.message });
  }

  const mergedNotes = mergeReflectionNotes(
    mergeReflectionNotes(state.reflection_notes, noteUpdates),
    synthesis.notes
  );
  const chaptersCompleted = state.chapters_completed.includes(chapter.id)
    ? state.chapters_completed
    : [...state.chapters_completed, chapter.id];
  await saveState(userId, {
    ...state,
    reflection_notes: mergedNotes,
    chapters_completed: chaptersCompleted,
  });

  // Post-chapter reflection hook — same pattern as onboarding-calibration.
  try {
    const shouldReflect = await shouldTriggerReflection(userId);
    if (shouldReflect) {
      generateReflections(userId).catch(err =>
        log.warn('Post-chapter reflection error', { userId, error: err.message })
      );
    }
  } catch (err) {
    log.warn('Reflection trigger check failed', { userId, error: err.message });
  }

  log.info('Chapter completed', { userId, chapter: chapter.id, facts: synthesis.facts.length });
  return synthesis.mirror;
}

// ====================================================================
// Twin-initiated chapter nudges (Phase 3)
// ====================================================================

export const NUDGE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_IGNORES_PER_CHAPTER = 2;

/**
 * Deterministic per-chapter nudge lines — zero LLM cost by design (this
 * runs on the observation-ingestion path, where the cost rule is: guards
 * and static content first, LLM never). The twin voices delivery itself
 * when the insight is injected into chat context.
 */
const CHAPTER_NUDGE_LINES = {
  your_story: 'I know your patterns, but I have never heard your life story from you directly — where you come from, in your own words. The Your Story chapter on the Story page takes about 5 minutes.',
  work_purpose: 'I see what you work on every day, but not why. The Work & Purpose chapter on the Story page would tell me what actually drives you — about 4 minutes.',
  people: 'I know your schedule better than I know the people in it. The People chapter on the Story page is about 4 minutes.',
  values_beliefs: 'I can predict what you will do, but not yet what you would never do. The Values & Beliefs chapter on the Story page is about 4 minutes.',
  day_in_life: 'I see fragments of your days from your platforms. The real version, told by you, would sharpen everything — A Day in the Life, about 3 minutes on the Story page.',
  taste_joy: 'I know what you listen to, but not what it means to you. The Taste & Joy chapter on the Story page is about 3 minutes.',
  hard_times: 'The hardest parts of a story are usually the most defining, and I only know yours secondhand. The Hard Times chapter on the Story page is about 4 minutes — share only what you want.',
  the_future: 'I know your past patterns well. Where you are trying to go matters more — The Future chapter on the Story page, about 3 minutes.',
};

/**
 * Evaluate stale nudges (revealed-preference ignore tracking), then maybe
 * generate ONE chapter nudge through the proactive_insights channel.
 *
 * Rules: max 1 nudge per NUDGE_COOLDOWN_MS across all chapters; a nudge
 * unanswered for a full cooldown counts as an ignore; a chapter ignored
 * MAX_IGNORES_PER_CHAPTER times is never nudged again. Insight rows use
 * category 'nudge' WITHOUT nudge_action so evaluateNudgeOutcomes marks
 * them checked-but-unknown rather than "not followed".
 *
 * Returns { chapterId } when a nudge was created, else null.
 */
export async function maybeGenerateChapterNudge(userId) {
  const state = await getState(userId);
  const completed = new Set(state.chapters_completed);
  const nudges = { ...(state.nudges || {}) };

  // 1) Ignore evaluation: any unevaluated nudge older than one cooldown
  //    whose chapter is still incomplete counts as ignored.
  let nudgesChanged = false;
  for (const chapter of LIFE_STORY_CHAPTERS) {
    const entry = nudges[chapter.id];
    if (!entry || entry.evaluated || !entry.last_sent_at) continue;
    if (Date.now() - new Date(entry.last_sent_at).getTime() < NUDGE_COOLDOWN_MS) continue;
    nudges[chapter.id] = {
      ...entry,
      ignored: (entry.ignored || 0) + (completed.has(chapter.id) ? 0 : 1),
      evaluated: true,
    };
    nudgesChanged = true;
  }

  const remaining = LIFE_STORY_CHAPTERS.filter(c => !completed.has(c.id));
  if (remaining.length === 0) {
    if (nudgesChanged) await saveState(userId, { ...state, nudges });
    return null;
  }

  // 2) Global cooldown.
  const lastNudgeAt = nudges.last_nudge_at ? new Date(nudges.last_nudge_at).getTime() : 0;
  if (Date.now() - lastNudgeAt < NUDGE_COOLDOWN_MS) {
    if (nudgesChanged) await saveState(userId, { ...state, nudges });
    return null;
  }

  // 3) Target: first incomplete chapter not yet nudge-retired.
  const target = remaining.find(c => (nudges[c.id]?.ignored || 0) < MAX_IGNORES_PER_CHAPTER);
  if (!target) {
    if (nudgesChanged) await saveState(userId, { ...state, nudges });
    return null;
  }

  const insight =
    CHAPTER_NUDGE_LINES[target.id] ||
    `The ${target.title} chapter on the Story page takes about ${target.estimatedMinutes} minutes and would teach me a lot about you.`;

  const { error: insertError } = await supabaseAdmin.from('proactive_insights').insert({
    user_id: userId,
    insight,
    urgency: 'low',
    category: 'nudge',
  });
  if (insertError) {
    log.warn('Chapter nudge insert failed', { userId, chapter: target.id, error: insertError.message });
    if (nudgesChanged) await saveState(userId, { ...state, nudges });
    return null;
  }

  const now = new Date().toISOString();
  const prev = nudges[target.id] || { sent: 0, ignored: 0 };
  await saveState(userId, {
    ...state,
    nudges: {
      ...nudges,
      [target.id]: { ...prev, sent: (prev.sent || 0) + 1, last_sent_at: now, evaluated: false },
      last_nudge_at: now,
    },
  });

  log.info('Chapter nudge generated', { userId, chapter: target.id });
  return { chapterId: target.id };
}
