/**
 * voiceReplyLearning — closes the M1 loop: an edit or reject of a voice-reply
 * draft teaches the twin, so it visibly gets more "you" each week.
 *
 * It reuses the proven self-improvement pipeline rather than reinventing it: a
 * resolution becomes the (prevTwin, userMsg) pair the directive extractor
 * already understands —
 *   - REJECT: the draft is what the twin "said"; the reject reason is the
 *     correction. → extract directives, merge into twin_directives.
 *   - EDIT:   the draft is what the twin "said"; the user's edited version is
 *     the correction (the delta carries the lesson).
 *   - SEND:   approved as-is — no correction signal.
 *
 * Called fire-and-forget from the inbox route AFTER the resolve succeeds: a
 * learning failure must never affect the user's approval response, and the
 * extraction is a cheap TIER_EXTRACTION call gated to only fire when there is
 * an actual signal (early-returns otherwise).
 *
 * buildLearningSignal is pure (tested directly); the LLM extraction + merge are
 * injected via `deps` (default: twinSelfImprovement) so the flow is tested with
 * no LLM/DB.
 */
import { createLogger } from './logger.js';

const log = createLogger('VoiceReplyLearning');

const LEARNED_OUTCOMES = new Set(['directive_created', 'directive_reinforced']);

/**
 * Pure: map a resolved twin_actions row to the extractor's input pair.
 * @param {{status?:string, draft_text?:string, final_text?:string, reject_reason?:string}} action
 * @returns {{shouldLearn:true, prevTwin:string, userMsg:string} | {shouldLearn:false, reason:string}}
 */
export function buildLearningSignal(action = {}) {
  const draft = typeof action.draft_text === 'string' ? action.draft_text.trim() : '';
  if (!draft) return { shouldLearn: false, reason: 'no_draft' };

  if (action.status === 'rejected') {
    const reason = typeof action.reject_reason === 'string' ? action.reject_reason.trim() : '';
    if (!reason) return { shouldLearn: false, reason: 'no_reason' };
    return { shouldLearn: true, prevTwin: draft, userMsg: reason };
  }

  if (action.status === 'edited') {
    const final = typeof action.final_text === 'string' ? action.final_text.trim() : '';
    if (!final || normalize(final) === normalize(draft)) {
      return { shouldLearn: false, reason: 'no_change' };
    }
    return { shouldLearn: true, prevTwin: draft, userMsg: `I edited the draft. What I would actually send: """${final}"""` };
  }

  return { shouldLearn: false, reason: 'approved' }; // 'sent' — nothing to correct
}

/**
 * Extract directives from the correction signal and merge them into the twin.
 * @returns {Promise<{learned:number, skipped?:string}>}
 */
export async function learnFromResolution({ userId, action } = {}, deps = makeDefaultDeps()) {
  if (!userId || !action) return { learned: 0, skipped: 'missing_input' };

  const signal = buildLearningSignal(action);
  if (!signal.shouldLearn) return { learned: 0, skipped: signal.reason };

  let candidates;
  try {
    candidates = await deps.extract(signal.userMsg, signal.prevTwin);
  } catch (err) {
    log.warn('directive extraction failed', { userId, error: err?.message });
    return { learned: 0, skipped: 'extract_failed' };
  }
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return { learned: 0, skipped: 'no_candidates' };
  }

  let learned = 0;
  for (const candidate of candidates) {
    try {
      const res = await deps.merge({ userId, candidate, sourceMessageId: null, sourceConversationId: null });
      if (res && LEARNED_OUTCOMES.has(res.outcome)) learned += 1;
    } catch (err) {
      log.warn('directive merge failed', { userId, error: err?.message });
    }
  }

  log.info('voice-reply learning applied', { userId, actionId: action.id, from: action.status, learned });
  return { learned };
}

// ── helpers ────────────────────────────────────────────────────────────────

function normalize(s) {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Real collaborators (twinSelfImprovement). Injected in tests. */
export function makeDefaultDeps() {
  return {
    async extract(userMsg, prevTwin) {
      const { generateDirectiveCandidates } = await import('./twinSelfImprovement.js');
      return generateDirectiveCandidates(userMsg, prevTwin);
    },
    async merge(args) {
      const { mergeOrInsertDirective } = await import('./twinSelfImprovement.js');
      return mergeOrInsertDirective(args);
    },
  };
}
