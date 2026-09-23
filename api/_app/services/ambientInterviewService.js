/**
 * Ambient Interview Service — the "keep learning" loop
 * ======================================================
 * The 3-question onboarding (reduced from 12 on 2026-04-20) targets the 3
 * highest-signal domains: motivation, personality, social. The other 2
 * domains (lifestyle, cultural) are intentionally deferred — platform data
 * (Spotify, Calendar, Whoop) covers them passively.
 *
 * But passive data misses nuance. Some things the twin only learns if the
 * user actually articulates them ("I write best at 5am"; "my favorite album
 * is the one my brother sent me in 2019").
 *
 * This service lets the twin organically weave ONE deep question into some
 * chat sessions, when:
 *   (a) there are thin domains (< THIN_THRESHOLD memory samples)
 *   (b) the session-lottery gate fires (stable hash per user-day)
 *
 * Output: a small system-prompt hint that suggests the twin ask a thin-
 * domain question IF the conversation naturally allows. Not forced — if
 * the user's message is task-focused, the twin should stay on task.
 *
 * Cost: 1 cheap Supabase count query per chat request (cached-style via
 * 30-min memoization would be nice but not required at this volume).
 */

import { supabaseAdmin } from './database.js';
import { createLogger } from './logger.js';

const log = createLogger('ambient-interview');

// Domain signal requirements — mirror onboarding-calibration.js schedule.
const ALL_DOMAINS = ['motivation', 'personality', 'social', 'lifestyle', 'cultural'];
const ONBOARDING_COVERED = new Set(['motivation', 'personality', 'social']);

// Thresholds
const THIN_THRESHOLD = 2;         // fewer than this = "thin"
const SESSION_GATE_EVERY_N = 3;   // fire ambient prompt ~1 in N sessions
const WINDOW_DAYS = 60;           // only count recent memories toward coverage

// Seed questions per domain — intentionally low-pressure, open-ended.
// Kept short so the twin can weave them into an existing response rather
// than derailing into a form.
const DOMAIN_SEEDS = {
  motivation: [
    'what you keep coming back to even when no one is asking',
    'what would you spend time on if money and status did not matter',
  ],
  personality: [
    'last time you felt totally yourself — what were you doing',
    'what does stress actually look like for you',
  ],
  social: [
    'who understands you best and what do they get that others do not',
    'how you recharge after being around people',
  ],
  lifestyle: [
    'what your ideal morning looks like vs what actually happens',
    'one habit that makes the rest of your life work',
  ],
  cultural: [
    'an album or show you keep coming back to',
    'a creator or artist you follow closely',
  ],
};

/**
 * Compute thin domains for the user from recent conversation memories.
 * Only looks at memories tagged as `onboarding_interview` or `ambient_interview`
 * because those are the explicit-question data points — platform data is
 * passive and doesn't count toward "did user articulate this."
 */
export async function getThinDomainsForUser(userId) {
  if (!userId || !supabaseAdmin) return [];

  const sinceIso = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // One query: pull metadata -> domain for all explicit-question memories.
  // This should be small (<30 rows per user on average).
  const { data, error } = await supabaseAdmin
    .from('user_memories')
    .select('metadata')
    .eq('user_id', userId)
    .in('memory_type', ['conversation'])
    .gte('created_at', sinceIso)
    .or('metadata->>source.eq.onboarding_interview,metadata->>source.eq.ambient_interview');

  if (error) {
    log.warn(`thin-domain query failed for user ${userId}: ${error.message}`);
    return [];
  }

  const domainCounts = Object.fromEntries(ALL_DOMAINS.map((d) => [d, 0]));
  for (const row of data || []) {
    const d = row?.metadata?.domain;
    if (d && domainCounts[d] !== undefined) domainCounts[d] += 1;
  }

  // Thin = below threshold. Prioritize domains we skipped in onboarding.
  return ALL_DOMAINS
    .filter((d) => domainCounts[d] < THIN_THRESHOLD)
    .sort((a, b) => {
      const aSkipped = !ONBOARDING_COVERED.has(a);
      const bSkipped = !ONBOARDING_COVERED.has(b);
      if (aSkipped !== bSkipped) return aSkipped ? -1 : 1;  // skipped first
      return domainCounts[a] - domainCounts[b];             // then thinnest first
    });
}

/**
 * Session-lottery gate — deterministic per (userId, date) so the decision
 * is stable within a day. Returns true for roughly 1 in N distinct sessions
 * across users, avoiding the "ask every time" annoyance.
 */
export function shouldAskAmbient(userId, dateIso = null) {
  if (!userId) return false;
  const day = (dateIso || new Date().toISOString().slice(0, 10));
  // Stable hash via FNV-1a — cheap, deterministic, no crypto dep.
  let h = 2166136261;
  const s = `${userId}:${day}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return (h % SESSION_GATE_EVERY_N) === 0;
}

/**
 * Build a small system-prompt suggestion block. Intentionally non-prescriptive —
 * the twin decides in-flow whether to weave the question in.
 *
 * @param {string[]} thinDomains — output of getThinDomainsForUser
 * @returns {string|null} — block to append to system prompt, or null if skip.
 */
export function buildAmbientQuestionHint(thinDomains) {
  if (!thinDomains?.length) return null;

  // Pick the top-priority thin domain; if it's skipped-in-onboarding this
  // will naturally be lifestyle or cultural, which is exactly what we want.
  const domain = thinDomains[0];
  const seeds = DOMAIN_SEEDS[domain] || [];
  if (!seeds.length) return null;

  // Two angles as options — let the LLM pick the one that fits the flow.
  const angles = seeds.slice(0, 2).map((s) => `"${s}"`).join(' OR ');

  return `

=== AMBIENT CALIBRATION (optional) ===
There are gaps in what I know about this person around "${domain}".
If — and ONLY if — the conversation naturally winds down or the user asks
an open-ended question back, feel free to gently ask about ${angles}.
Keep it conversational. Never force a question into a task-focused reply.
If the topic doesn't fit, skip it entirely.
`;
}

/**
 * Convenience — compose the decision in one call. Returns the hint string or null.
 */
export async function maybeBuildAmbientHint(userId) {
  if (!shouldAskAmbient(userId)) return null;
  const thin = await getThinDomainsForUser(userId);
  return buildAmbientQuestionHint(thin);
}
