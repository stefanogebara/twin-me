/**
 * onboardingWow — the M1 activation moment.
 *
 * Right after a user connects Gmail, we turn the cold "your twin is empty" first
 * run into "it already sounds like me and drafted my email": pick 1-2 inbox
 * threads genuinely awaiting the user's reply, draft each in their voice (reusing
 * the #163 voice-reply pipeline, so the drafts land as pending twin_actions in
 * the Today inbox), and show a one-line read of how they write.
 *
 * The two decisions that make or break the wow — WHICH threads, and the voice
 * read — are pure and tested here. The Gmail fetch + drafting are injected.
 */
import { createLogger } from './logger.js';

const log = createLogger('OnboardingWow');

const DEFAULT_LIMIT = 2;

// Senders we never draft replies to at onboarding — automated/no-reply mail is
// noise, and a "draft" to a newsletter would break the wow instead of making it.
const AUTOMATED_SENDER = /(no-?reply|do-?not-?reply|donotreply|noreply|mailer-daemon|postmaster|notifications?@|newsletter|updates?@|automated|@.*bounce|via\s)/i;

// ── pure: thread selection ───────────────────────────────────────────────────

/**
 * From a list of inbox threads, pick the ones the user actually owes a reply to.
 * @param {Array<{id?:string, subject?:string, messages?:Array<{from?:string, fromName?:string, text?:string, date?:string, isFromUser?:boolean}>}>} threads
 * @param {{userEmail?:string, limit?:number}} [opts]
 * @returns {Array<{threadRef:string|null, counterpart:{name:string, handle:string}, thread:{subject:string, messages:Array<{author:string,text:string}>}}>}
 */
export function selectReplyableThreads(threads, { userEmail, limit = DEFAULT_LIMIT } = {}) {
  if (!Array.isArray(threads)) return [];
  const me = String(userEmail || '').trim().toLowerCase();

  const eligible = [];
  for (const t of threads) {
    const msgs = Array.isArray(t?.messages) ? t.messages : [];
    if (msgs.length === 0) continue;

    const last = msgs[msgs.length - 1];
    if (isFromUser(last, me)) continue;                         // waiting on them, not us
    if (AUTOMATED_SENDER.test(String(last.from || ''))) continue; // automated sender
    const handle = emailOf(last.from);
    if (!handle) continue;

    eligible.push({
      threadRef: t.id ?? null,
      counterpart: { name: last.fromName || nameFromEmail(handle), handle },
      thread: {
        subject: t.subject || '',
        messages: msgs.map((m) => ({
          author: isFromUser(m, me) ? 'me' : (m.fromName || nameFromEmail(emailOf(m.from))),
          text: String(m.text || '').trim(),
        })),
      },
      _sort: dateMs(last.date),
    });
  }

  eligible.sort((a, b) => b._sort - a._sort); // newest first
  return eligible.slice(0, Math.max(0, limit)).map((e) => ({
    threadRef: e.threadRef,
    counterpart: e.counterpart,
    thread: e.thread,
  }));
}

// ── pure: the voice read ─────────────────────────────────────────────────────

/**
 * A single human sentence describing how the user writes, from their stylometric
 * profile. Graceful when the profile is thin — this is the wow, not a bug report.
 * @param {object|null} profile  a user_personality_profiles row (or null)
 * @returns {string}
 */
export function buildVoiceRead(profile) {
  if (!profile) {
    return "Your twin is still learning your voice — a few conversations and it'll write just like you.";
  }

  const traits = [];
  const f = profile.formality_score;
  if (typeof f === 'number') traits.push(f < 0.4 ? 'casually' : f > 0.7 ? 'formally' : 'plainly');

  const len = profile.avg_sentence_length;
  if (typeof len === 'number') traits.push(len < 12 ? 'in short, punchy sentences' : len > 22 ? 'in long, flowing sentences' : 'in balanced sentences');

  const e = profile.emotional_expressiveness;
  if (typeof e === 'number') traits.push(e > 0.6 ? 'and warm' : e < 0.3 ? 'and matter-of-fact' : 'and measured');

  const humor = profile.humor_markers;
  const hasHumor = typeof humor === 'number' ? humor > 0.3 : Boolean(humor);

  const core = traits.length ? joinNatural(traits) : 'in a natural, consistent voice';
  return `You write ${core}${hasHumor ? ', with a dry sense of humor' : ''}.`;
}

// ── orchestration ────────────────────────────────────────────────────────────

/**
 * Produce the onboarding wow payload: a voice read + freshly drafted replies.
 * @param {{userId:string, userEmail?:string, threads:Array}} input
 * @param {object} [deps]
 * @returns {Promise<{ok:boolean, voiceRead:string, drafts:Array, draftsCreated:number, error?:string}>}
 */
export async function generateWowDrafts({ userId, userEmail, threads } = {}, deps = makeDefaultDeps()) {
  if (!userId) return { ok: false, error: 'missing_input', voiceRead: buildVoiceRead(null), drafts: [], draftsCreated: 0 };

  const profile = await safe(() => deps.getProfile(userId), null, 'getProfile');
  const voiceRead = buildVoiceRead(profile);

  const selected = selectReplyableThreads(threads, { userEmail, limit: DEFAULT_LIMIT });
  const drafts = [];
  for (const s of selected) {
    const r = await safe(
      () => deps.draftReply({ userId, counterpart: s.counterpart, thread: s.thread, threadRef: s.threadRef, channel: 'gmail' }),
      null,
      'draftReply',
    );
    if (r && r.ok && r.action) drafts.push(r.action);
  }

  log.info('onboarding wow generated', { userId, candidates: selected.length, drafted: drafts.length });
  return { ok: true, voiceRead, drafts, draftsCreated: drafts.length };
}

// ── helpers ──────────────────────────────────────────────────────────────────

function emailOf(s) {
  const raw = String(s || '');
  const m = raw.match(/<([^>]+)>/);
  return (m ? m[1] : raw).trim().toLowerCase();
}

function isFromUser(msg, meLower) {
  if (typeof msg?.isFromUser === 'boolean') return msg.isFromUser;
  if (!meLower) return false;
  return emailOf(msg?.from) === meLower;
}

function nameFromEmail(addr) {
  const local = String(addr || '').split('@')[0] || '';
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ') || 'them';
}

function dateMs(d) {
  const t = d ? Date.parse(d) : NaN;
  return Number.isNaN(t) ? 0 : t;
}

function joinNatural(arr) {
  if (arr.length <= 1) return arr[0] || '';
  // the last trait already starts with "and " (e.g. "and warm")
  const last = arr[arr.length - 1];
  const head = arr.slice(0, -1).join(', ');
  return last.startsWith('and ') ? `${head}, ${last}` : `${head}, and ${last}`;
}

async function safe(fn, fallback, label) {
  try {
    const v = await fn();
    return v === undefined ? fallback : v;
  } catch (err) {
    log.warn(`onboarding wow ${label} failed`, { error: err?.message });
    return fallback;
  }
}

export function makeDefaultDeps() {
  return {
    async getProfile(userId) {
      const { getProfile } = await import('./personalityProfileService.js');
      return getProfile(userId);
    },
    async draftReply(input) {
      const { generateVoiceReply } = await import('./voiceReplyService.js');
      return generateVoiceReply(input);
    },
  };
}
