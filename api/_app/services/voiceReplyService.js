/**
 * voiceReplyService — orchestration for the M1 voice-reply skill.
 *
 * The differentiating logic (prompt assembly + response parsing + honesty guard)
 * lives in the pure, tested ./voiceReplyPrompt.js. This module is the thin I/O
 * shell: gather VOICE + RELATIONSHIP + MEMORIES + DIRECTIVES around a thread the
 * caller already loaded, ask the model, parse, and persist a *pending*
 * `twin_actions` row for the action inbox. It never sends anything.
 *
 * Every collaborator is injected via `deps` (default: the real services) so the
 * pipeline's control flow is unit-tested without DB/LLM. Context gathering is
 * best-effort — a failing leg degrades to empty and the draft is still produced
 * (partial context > no draft), matching the twin-chat resilience posture.
 *
 * NOTE (dev-env): the default deps below wire the real services from the M1
 * spec; the exact call signatures of getProfile/buildPersonalityPrompt/
 * retrieveDiverseMemories should be confirmed against those modules (a plugin
 * hook was blocking reads at author time). The DI seam means that confirmation
 * is a localized change and never touches the tested core.
 */
import { buildVoiceReplyPrompt, parseDraftResponse } from './voiceReplyPrompt.js';
import { createLogger } from './logger.js';

const log = createLogger('VoiceReply');

/**
 * @param {{ userId:string, counterpart:{name?:string,handle?:string}, thread:object }} input
 *   `thread` is loaded by the caller (route/cron) from Gmail/WhatsApp:
 *   { subject, messages:[{author,text}] }
 * @param {object} [deps]  injectable collaborators (see makeDefaultDeps)
 * @returns {Promise<{ ok:boolean, action?:object, error?:string }>}
 */
export async function generateVoiceReply(input, deps = makeDefaultDeps()) {
  const { userId, counterpart, thread } = input || {};
  if (!userId || !thread) return { ok: false, error: 'missing_input' };

  const query = threadQuery(thread);

  // Gather context in parallel; each leg degrades to a safe default on failure.
  const [voice, register, memories, directives] = await Promise.all([
    safe(() => deps.getVoice(userId), { instructions: '', stylometrics: null }, 'getVoice'),
    safe(() => deps.getRegister(userId, counterpart), null, 'getRegister'),
    safe(() => deps.getMemories(userId, query), [], 'getMemories'),
    safe(() => deps.getDirectives(userId), [], 'getDirectives'),
  ]);

  const promptCtx = {
    counterpart,
    voiceInstructions: voice?.instructions || '',
    stylometrics: voice?.stylometrics || null,
    register,
    memories,
    directives,
    thread,
  };
  const prompt = buildVoiceReplyPrompt(promptCtx);

  let modelOut;
  try {
    modelOut = await deps.callModel(prompt);
  } catch (err) {
    log.warn('voice-reply model call failed', { userId, error: err?.message });
    return { ok: false, error: 'model_failed' };
  }

  const parsed = parseDraftResponse(modelOut, { memories, directives });
  if (!parsed.ok) {
    log.warn('voice-reply draft unusable', { userId, reason: parsed.error });
    return { ok: false, error: parsed.error };
  }

  const row = {
    user_id: userId,
    type: 'voice_reply',
    status: 'pending',
    channel: input.channel || 'gmail',
    thread_ref: input.threadRef || null,
    recipient: counterpart?.handle || counterpart?.name || null,
    draft_text: parsed.draft,
    why_signals: parsed.why,
  };

  try {
    const action = await deps.persist(row);
    return { ok: true, action };
  } catch (err) {
    log.error('voice-reply persist failed', { userId, error: err?.message });
    return { ok: false, error: 'persist_failed' };
  }
}

// Build the retrieval query from the thread (subject + latest inbound message).
function threadQuery(thread) {
  const last = (Array.isArray(thread?.messages) ? thread.messages : []).slice(-1)[0];
  return [thread?.subject, last?.text].filter(Boolean).join(' — ').slice(0, 300);
}

// Run a leg, log+fallback on failure so one slow/broken source can't kill the draft.
async function safe(fn, fallback, label) {
  try {
    const v = await fn();
    return v === undefined || v === null ? fallback : v;
  } catch (err) {
    log.warn(`voice-reply ${label} failed`, { error: err?.message });
    return fallback;
  }
}

/**
 * Real collaborators. Kept in a factory so tests inject fakes and prod code
 * lazy-imports the heavy modules only when a draft is actually generated.
 */
export function makeDefaultDeps() {
  return {
    async getVoice(userId) {
      const [{ getProfile }, { buildPersonalityPrompt }] = await Promise.all([
        import('./personalityProfileService.js'),
        import('./personalityPromptBuilder.js'),
      ]);
      const profile = await getProfile(userId);
      // buildPersonalityPrompt(profile, soulLayers) → instruction string.
      const instructions = profile ? buildPersonalityPrompt(profile, profile.soulLayers || null) : '';
      return { instructions: instructions || '', stylometrics: profile?.stylometrics || null };
    },

    // Relationship register from prior replies to this counterpart. Left as an
    // explicit fill-in for M1.1 — until then the pure core's no-history fallback
    // applies, which is correct behaviour, not a bug.
    async getRegister(/* userId, counterpart */) {
      return null;
    },

    async getMemories(userId, query) {
      const { retrieveDiverseMemories } = await import('./memoryStreamService.js');
      const res = await retrieveDiverseMemories(userId, query, { facts: 3, reflections: 3 }, 'identity');
      const rows = Array.isArray(res) ? res : (res?.memories || []);
      return rows.slice(0, 4).map(m => ({ content: m.content })).filter(m => m.content);
    },

    async getDirectives(userId) {
      const { getActiveDirectives } = await import('./twinSelfImprovement.js');
      const rows = await getActiveDirectives(userId);
      return (rows || []).map(d => ({ content: d.content })).filter(d => d.content);
    },

    async callModel(prompt) {
      const { complete, TIER_ANALYSIS } = await import('./llmGateway.js');
      return complete({ tier: TIER_ANALYSIS, messages: prompt.messages, temperature: 0.6, maxTokens: 600 });
    },

    async persist(row) {
      const { supabaseAdmin } = await import('./database.js');
      const { data, error } = await supabaseAdmin
        .from('twin_actions')
        .insert(row)
        .select('id, status, draft_text, why_signals, created_at')
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
  };
}
