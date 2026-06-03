/**
 * Shared Twin Context Builder
 *
 * Fetches all context layers needed for twin chat in parallel.
 * Used by both twin-chat.js (web) and MCP server.ts (Claude Desktop)
 * to ensure consistent context across all twin interfaces.
 */

import { supabaseAdmin } from './database.js';
import { getValidAccessToken } from './tokenRefreshService.js';
import { createLogger } from './logger.js';

const log = createLogger('TwinContextBuilder');
import { retrieveDiverseMemories } from './memoryStreamService.js';
import { getTwinSummary } from './twinSummaryService.js';
import { getUndeliveredInsights, getNudgeHistory } from './proactiveInsights.js';
import { getEnrichment } from './enrichment/enrichmentStore.js';
import { getActiveGoalContext } from './goalTrackingService.js';
import { getTopPatterns } from './twinPatternService.js';
import { inferIdentityContext } from './identityContextService.js';
import { getPendingProposals } from './departmentService.js';
import { getRelevantWikiPages } from './wikiCompilationService.js';
import { getActiveDirectives } from './twinSelfImprovement.js';
import axios from 'axios';
// Whoop analytics — run on-demand when the user's message asks an
// analytical question (trend, comparison, weekly recap). Snapshot still
// always fetches; analytics is the escalation path.
import { detectWhoopIntent } from './whoop/detectIntent.js';
import { createWhoopClient } from './whoop/client.js';
import { resolveDateExpression } from './whoop/dateUtils.js';
import {
  getTrend as whoopGetTrend,
  comparePeriods as whoopComparePeriods,
  getWeeklySummary as whoopGetWeeklySummary,
  getWorkouts as whoopGetWorkouts,
} from './whoop/analytics/index.js';
import {
  formatTrend,
  formatCompare,
  formatWeekly,
  formatWorkouts,
} from './whoop/formatAnalytics.js';

// Hard cap for the analytics tool call. Sits in POST-processing, after
// the 10s parent fan-out breaker, so it doesn't compete for that
// budget. The cap covers BOTH the second getValidAccessToken call
// (Nango proxy adds ~3s of overhead per call — measured 2026-06-02
// via scripts/_time-whoop-analytics.mjs) AND the analytics fetch
// itself. The Playwright UI verify (2026-06-03) caught strain trend 7d
// consistently failing in prod even after the 15s bump — local repro
// via scripts/_inspect-whoop-prompt.mjs showed analytics completing in
// 6.9s locally, but prod added ~10s on top from Nango contention +
// network. 25s is generous and covers the worst case I've measured.
// User is already waiting ~10-15s for an analytics question by the
// time the LLM streams; another 10s of upper-bound headroom is the
// cost of consistency. Future optimisation: reuse the snapshot's
// token instead of double-fetching.
const WHOOP_ANALYTICS_TIMEOUT_MS = 25000;

/**
 * Run a single Whoop analytics tool based on a detected intent. Returns
 * `{ kind, summary }` on success, `null` on intent === 'snapshot'|null
 * or any failure. Never throws — twin context must keep building even
 * if Whoop is down.
 *
 * @param {object} intent  Output of detectWhoopIntent
 * @param {string} accessToken
 */
async function runWhoopAnalytics(intent, accessToken) {
  if (!intent || intent.kind === 'snapshot' || intent.kind === null) return null;
  const client = createWhoopClient({ accessToken });
  try {
    if (intent.kind === 'trend') {
      const trend = await whoopGetTrend(client, {
        metric: intent.metric,
        days: intent.days,
      });
      return { kind: 'trend', summary: formatTrend(trend), raw: trend };
    }
    if (intent.kind === 'weekly') {
      const week = await whoopGetWeeklySummary(client, {
        week_start: intent.weekStart, // dateUtils handles the expression
      });
      return { kind: 'weekly', summary: formatWeekly(week), raw: week };
    }
    if (intent.kind === 'workouts') {
      const workouts = await whoopGetWorkouts(client, {
        days: intent.days,
      });
      return { kind: 'workouts', summary: formatWorkouts(workouts), raw: workouts };
    }
    if (intent.kind === 'compare') {
      // Convert the friendly period expressions into the ISO start/end
      // ranges comparePeriods expects.
      const a = resolveDateExpression(intent.periodA);
      const b = resolveDateExpression(intent.periodB);
      const cmp = await whoopComparePeriods(client, {
        period_a_start: a.start,
        period_a_end: a.end,
        period_b_start: b.start,
        period_b_end: b.end,
      });
      return { kind: 'compare', summary: formatCompare(cmp), raw: cmp };
    }
    return null;
  } catch (err) {
    log.warn(`Whoop analytics (${intent.kind}) failed: ${err?.message ?? err}`);
    return null;
  }
}

// Short-lived platform data cache to avoid redundant API calls within 5 minutes
const platformDataCache = new Map();
const PLATFORM_CACHE_TTL = 5 * 60 * 1000;
const PLATFORM_STALE_SERVE_MAX_MS = 30 * 60 * 1000; // 30 minutes
const pendingPlatformRefreshes = new Set();

// In-memory cache for stable data that rarely changes (avoids repeated proxy calls)
const stableDataCache = new Map();
const STABLE_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function getCached(key) {
  const entry = stableDataCache.get(key);
  if (!entry) return undefined;
  if ((Date.now() - entry.ts) < STABLE_CACHE_TTL) return entry.data;
  stableDataCache.delete(key); // Evict expired entry
  return undefined;
}
function setCache(key, data) {
  stableDataCache.set(key, { data, ts: Date.now() });
}

/**
 * Fetch all twin context layers in parallel.
 *
 * @param {string} userId - The user ID (public.users.id)
 * @param {string} userMessage - The user's message (used for memory retrieval relevance)
 * @param {object} [options]
 * @param {string[]} [options.platforms] - Platform slugs to fetch data for (default: ['spotify', 'calendar', 'whoop', 'web'])
 * @param {boolean} [options.getSoulSignature] - Whether to fetch soul signature (default: true)
 * @param {boolean} [options.getPlatformData] - Whether to fetch platform data (default: true)
 * @returns {Promise<TwinContext>}
 */
async function fetchTwinContext(userId, userMessage, options = {}) {
  const {
    platforms = ['spotify', 'calendar', 'whoop', 'web'],
    getSoulSignature: fetchSoul = true,
    getPlatformData: fetchPlatforms = true,
    memoryBudgets = {},
    memoryWeights = 'identity',
    contextVector = null,
  } = options;

  const ctxStart = Date.now();
  const ctxLog = (label) => log.info(`${label} (${Date.now() - ctxStart}ms)`);

  // Wrap each fetch with timing.
  //
  // audit-2026-05-15 follow-up: each leg now races against a 6s budget,
  // mirroring the per-sidecar timeout pattern in twinChatPreFlight.js (C3).
  // The audit found voiceExamples spiking to 8.4s on cold cache (3 parallel
  // JSONB queries across 19k memories) and dragging the whole Promise.all
  // past the 10s parent breaker. With per-leg timeouts, no single leg can
  // hold the fan-out beyond its budget — the slowest healthy legs are
  // bounded so the parent breaker only fires if multiple legs are bad.
  //
  // 6s gives a comfortable margin over the typical p95 healthy leg time
  // (300-1500ms) while protecting against the cold-DB-query tail. On
  // timeout the leg's caller .catch() returns a default (empty array,
  // null, etc.) and the chat continues without that leg's data.
  const timings = {};
  const PER_LEG_TIMEOUT_MS = 6000;
  const timed = (label, promise) => {
    const start = Date.now();
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        timings[label] = Date.now() - start;
        timings[`${label}TimedOut`] = true;
        log.warn(`twinContext leg timeout: ${label} exceeded ${PER_LEG_TIMEOUT_MS}ms — using default`);
        reject(new Error(`${label}_leg_timeout`));
      }, PER_LEG_TIMEOUT_MS);
    });
    return Promise.race([
      promise.then(r => {
        clearTimeout(timer);
        if (timings[`${label}TimedOut`] !== true) {
          timings[label] = Date.now() - start;
        }
        return r;
      }, err => {
        clearTimeout(timer);
        if (timings[`${label}TimedOut`] !== true) {
          timings[label] = Date.now() - start;
        }
        throw err;
      }),
      timeoutPromise,
    ]);
  };

  // Circuit breaker: if any single fetch hangs, cap total context build.
  // Uses individual tracked promises so the circuit breaker preserves
  // already-resolved results.
  //
  // audit-2026-05-11 C1 follow-up: bumped 7s → 10s. Post-deploy verification
  // showed has_memory_stream success rate climbed from 0% → 75% after the
  // HyDE-skip + graph-expansion-async fixes, but ~25% of cold-start
  // conversations still missed memories. retrieveDiverseMemories now has a
  // per-leg 5s timeout (memoryStreamService.js withLegTimeout) so any single
  // slow leg returns [] silently while the other 4 still contribute — but
  // the merge + cache write after the inner Promise.all also costs ~500ms,
  // and other fetches in this list (twinSummary, wikiPages, calibration)
  // can themselves be slow on cold-start pgbouncer queueing. 10s leaves
  // 3s of margin for the slow-but-recoverable tail while still being far
  // under the 60s Vercel function cap.
  const CONTEXT_TIMEOUT_MS = 10000;

  const defaults = [null, {}, null, [], null, [], { success: false, data: null }, [], null, [], null, null, [], [], [], []];

  const fetchPromises = [
    fetchSoul
      ? timed('soulSignature', _fetchSoulSignature(userId).catch(err => {
          log.warn('Soul signature fetch failed:', err.message);
          return null;
        }))
      : Promise.resolve(null),

    fetchPlatforms
      ? timed('platformData', _fetchPlatformData(userId, platforms).catch(err => {
          log.warn('Platform data fetch failed:', err.message);
          return {};
        }))
      : Promise.resolve({}),

    timed('writingProfile', _fetchWritingProfile(userId).catch(err => {
      log.warn('Writing profile fetch failed:', err.message);
      return null;
    })),

    // audit-2026-05-13 bottleneck follow-up: pull retrieveDiverseMemories'
    // per-leg durations onto the parent timings record so the hop_timings
    // ladder shows reflections / facts / platform_data / semantic_conv /
    // recent_conv breakdowns. The function attaches _legDurations as a
    // non-enumerable property on the returned array.
    timed('memories', retrieveDiverseMemories(userId, userMessage, memoryBudgets, memoryWeights, { contextVector })
      .then(combined => {
        const legs = combined?._legDurations;
        if (legs && typeof legs === 'object') {
          for (const [k, v] of Object.entries(legs)) {
            timings[`memLeg_${k}`] = v;
          }
        }
        return combined;
      })
      .catch(err => {
        log.warn('Memory retrieval failed:', err.message);
        return [];
      })),

    timed('twinSummary', getTwinSummary(userId).catch(err => {
      log.warn('Twin summary fetch failed:', err.message);
      return null;
    })),

    timed('proactiveInsights', getUndeliveredInsights(userId, 3).catch(err => {
      log.warn('Proactive insights fetch failed:', err.message);
      return [];
    })),

    // Enrichment fallback: fetch enriched_profiles for thin memory streams
    timed('enrichment', getEnrichment(userId).catch(err => {
      log.warn('Enrichment fetch failed:', err.message);
      return { success: false, data: null };
    })),

    // Voice examples: actual user messages for style mirroring
    timed('voiceExamples', _fetchVoiceExamples(userId).catch(err => {
      log.warn('Voice examples fetch failed:', err.message);
      return [];
    })),

    // Active goals: formatted context for goal accountability
    timed('activeGoals', (() => {
      const agk = `goals_${userId}`;
      const agv = getCached(agk);
      if (agv !== undefined) return Promise.resolve(agv);
      return getActiveGoalContext(userId)
        .then(r => { setCache(agk, r); return r; })
        .catch(err => { log.warn('Active goals fetch failed:', err.message); return null; });
    })()),

    // Top learned patterns (EWC++ confidence-weighted topic affinities)
    timed('patterns', (() => {
      const pk = `patterns_${userId}`;
      const pv = getCached(pk);
      if (pv !== undefined) return Promise.resolve(pv);
      return getTopPatterns(userId, 5)
        .then(r => { setCache(pk, r); return r; })
        .catch(err => { log.warn('Pattern fetch failed:', err.message); return []; });
    })()),

    // P8: Identity context (cached 24h — near-zero on repeat calls)
    timed('identityContext', inferIdentityContext(userId).catch(err => {
      log.warn('Identity context fetch failed:', err.message);
      return null;
    })),

    // P8: Deep interview calibration data
    timed('calibrationContext', (() => {
      const ck = `calib_${userId}`;
      const cv = getCached(ck);
      if (cv !== undefined) return Promise.resolve(cv);
      return _fetchCalibrationContext(userId)
        .then(r => { setCache(ck, r); return r; })
        .catch(err => { log.warn('Calibration context fetch failed:', err.message); return null; });
    })()),

    // Nudge history: recent evaluated nudges for embodied feedback loop
    timed('nudgeHistory', (() => {
      const nk = `nudge_${userId}`;
      const nv = getCached(nk);
      if (nv !== undefined) return Promise.resolve(nv);
      return getNudgeHistory(userId, 5)
        .then(r => { setCache(nk, r); return r; })
        .catch(err => { log.warn('Nudge history fetch failed:', err.message); return []; });
    })()),

    // SoulOS: Pending department proposals for twin-as-CEO briefing
    timed('departmentProposals', (() => {
      const dpk = `deptprops_${userId}`;
      const dpv = getCached(dpk);
      if (dpv !== undefined) return Promise.resolve(dpv);
      return getPendingProposals(userId)
        .then(r => { setCache(dpk, r); return r; })
        .catch(err => { log.warn('Department proposals fetch failed:', err.message); return []; });
    })()),

    // LLM Wiki: compiled knowledge pages (vector search by query)
    timed('wikiPages', getRelevantWikiPages(userId, contextVector, 3).catch(err => {
      log.warn('Wiki pages fetch failed:', err.message);
      return [];
    })),

    // Self-improving twin: directives learned from past user corrections
    // (pi-reflect pattern, askjo.ai-inspired). Injected into the system
    // prompt as sticky-note rules. Hot path — single indexed read.
    timed('directives', getActiveDirectives(userId).catch(err => {
      log.warn('Directives fetch failed:', err.message);
      return [];
    })),
  ];

  // Track resolved values via microtasks so circuit breaker can use them without waiting.
  // Microtasks (Promise.then) are always processed before macrotasks (setTimeout),
  // so resolvedValues[] is fully populated for settled promises when the timeout fires.
  const resolvedValues = new Array(fetchPromises.length).fill(undefined);
  fetchPromises.forEach((p, i) => {
    p.then(v => { resolvedValues[i] = v; }).catch(() => { resolvedValues[i] = defaults[i]; });
  });

  let contextResults;
  // audit-2026-05-13 bottleneck follow-up: track whether the circuit breaker
  // tripped so the hop_timings ladder can show it. Hop log can't be called
  // from inside this module (no logger pattern here), so we surface it via
  // the returned timings record — the route layer can fold it into the
  // context_fetch_done hop_timings entry.
  let circuitBreakerTripped = false;
  let degradationReason = null;
  try {
    contextResults = await Promise.race([
      Promise.all(fetchPromises),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('fetchTwinContext timeout')), CONTEXT_TIMEOUT_MS)
      ),
    ]);
  } catch (timeoutErr) {
    // Two graceful-degradation paths land here:
    //   1. The 10s global breaker timer fired — message ===
    //      'fetchTwinContext timeout'.
    //   2. One of the per-leg timed() wrappers fired its own 6s timer —
    //      message ends in '_leg_timeout' (e.g. 'platformData_leg_timeout').
    //
    // Both are EXPECTED outcomes when a backend is slow (cold-start
    // Nango token refresh, cold pgbouncer queueing on Supabase, etc.) —
    // they should never propagate to a 500 in the chat handler. Before
    // this fix only the global breaker degraded; leg timeouts re-threw,
    // which is what caused the cold-start 500 we hit during the Whoop
    // step-5 eval (the platformData leg timed out at 6s waiting on Nango).
    const isLegTimeout = /_leg_timeout$/.test(timeoutErr.message);
    const isGlobalTimeout = timeoutErr.message === 'fetchTwinContext timeout';
    if (isGlobalTimeout || isLegTimeout) {
      circuitBreakerTripped = true;
      degradationReason = timeoutErr.message;
      log.warn(`Circuit breaker tripped (${timeoutErr.message}) — returning partial context`);
      // Use already-resolved values; fall back to defaults for still-pending promises.
      contextResults = resolvedValues.map((v, i) => v !== undefined ? v : defaults[i]);
    } else {
      throw timeoutErr;
    }
  }
  timings._circuitBreakerTripped = circuitBreakerTripped;
  if (degradationReason) timings._circuitBreakerReason = degradationReason;
  timings._circuitBreakerMs = CONTEXT_TIMEOUT_MS;
  // audit-2026-05-13 bottleneck follow-up: mark the boundary between the
  // parallel-fetch race and the post-processing tail (enrichment fallback,
  // platform priorities, etc.). If the breaker tripped at 10s but the hop
  // shows 12.3s elapsed at context_fetch_done, the gap is post-processing.
  const postProcessingStart = Date.now();
  timings._fanoutMs = postProcessingStart - ctxStart;

  const [
    soulSignature,
    platformData,

    writingProfile,
    memories,
    twinSummary,
    proactiveInsights,
    enrichmentProfile,
    voiceExamples,
    activeGoals,
    patterns,
    identityContext,
    calibrationContext,
    nudgeHistory,
    departmentProposals,
    wikiPages,
    directives,
  ] = contextResults;

  ctxLog('All parallel fetches complete');

  // Belt-and-suspenders: if memory stream is thin (< 5 memories), inject enrichment
  // data directly so the twin has context even if memory seeding hasn't finished
  let enrichmentContext = null;
  if ((memories?.length || 0) < 5 && enrichmentProfile?.success && enrichmentProfile?.data) {
    const ep = enrichmentProfile.data;
    if (ep.source !== 'user_skipped') {
      const parts = [];
      if (ep.discovered_name) parts.push(`Name: ${ep.discovered_name}`);
      if (ep.discovered_title) parts.push(`Title: ${ep.discovered_title}`);
      if (ep.discovered_company) parts.push(`Company: ${ep.discovered_company}`);
      if (ep.discovered_location) parts.push(`Location: ${ep.discovered_location}`);
      if (ep.discovered_bio) parts.push(`Bio: ${ep.discovered_bio}`);
      if (ep.career_timeline) parts.push(`Career: ${typeof ep.career_timeline === 'string' ? ep.career_timeline : JSON.stringify(ep.career_timeline)}`);
      if (ep.education) parts.push(`Education: ${typeof ep.education === 'string' ? ep.education : JSON.stringify(ep.education)}`);
      if (ep.interests_and_hobbies) parts.push(`Interests: ${typeof ep.interests_and_hobbies === 'string' ? ep.interests_and_hobbies : JSON.stringify(ep.interests_and_hobbies)}`);
      if (ep.personality_traits) parts.push(`Personality: ${typeof ep.personality_traits === 'string' ? ep.personality_traits : JSON.stringify(ep.personality_traits)}`);
      if (ep.life_story) parts.push(`Life story: ${typeof ep.life_story === 'string' ? ep.life_story : JSON.stringify(ep.life_story)}`);
      if (parts.length > 0) {
        enrichmentContext = parts.join('\n');
        log.info(`Injecting enrichment fallback (${parts.length} fields) for user ${userId}`);
      }
    }
  }

  // Whoop analytics escalation. Lives OUTSIDE _fetchPlatformData so it
  // (a) has access to userMessage, which the cached platform fetchers
  // don't see, and (b) doesn't mutate the platformDataCache (the user's
  // next turn has a different message and needs different analytics).
  //
  // Deliberately does NOT predicate on platformData.whoop existing —
  // analytics has its OWN data path (direct Whoop v2 API via the
  // bearer token from getValidAccessToken, not the Nango proxy that
  // builds the snapshot). When the snapshot leg times out at 6s
  // (Nango on cold-start), the partial-context fallback gives us
  // platformData.whoop === undefined — but the user still asked
  // "what's my HRV trend?" and we owe them an answer. Caught via
  // scripts/_inspect-whoop-prompt.mjs on 2026-06-02: the local repro
  // showed platformData_leg_timeout → whoopAnalytics: null because
  // the precondition gated the entire block out.
  //
  // The merge is done LOCALLY on the returned platformData via a
  // shallow copy so downstream callers (twinPromptAssembly →
  // buildTwinSystemPrompt) see w.analytics, while the cached entry
  // stays pristine for the next turn's different message.
  let whoopAnalytics = null;
  if (userMessage) {
    try {
      const intent = detectWhoopIntent(userMessage);
      if (intent.kind && intent.kind !== 'snapshot') {
        const whoopAnalyticsStart = Date.now();
        const tok = await getValidAccessToken(userId, 'whoop');
        if (tok.success && tok.accessToken) {
          const analyticsPromise = runWhoopAnalytics(intent, tok.accessToken);
          const timeoutPromise = new Promise((resolve) =>
            setTimeout(() => resolve(null), WHOOP_ANALYTICS_TIMEOUT_MS),
          );
          whoopAnalytics = await Promise.race([analyticsPromise, timeoutPromise]);
        }
        timings.whoopAnalyticsMs = Date.now() - whoopAnalyticsStart;
        timings.whoopAnalyticsKind = intent.kind;
        timings.whoopAnalyticsHit = whoopAnalytics?.summary ? 'yes' : 'no';
      }
    } catch (err) {
      log.warn(`Whoop analytics escalation failed: ${err?.message ?? err}`);
    }
  }

  // Shallow-copy platformData so we can attach analytics for the
  // current turn without mutating the cached entry. If the snapshot
  // leg failed (platformData.whoop is undefined), we still create
  // platformData.whoop with just the analytics so the prompt builder's
  // existing `if (platformData.whoop)` path renders our line.
  let returnedPlatformData = platformData;
  if (whoopAnalytics?.summary) {
    returnedPlatformData = {
      ...(platformData ?? {}),
      whoop: { ...(platformData?.whoop ?? {}), analytics: whoopAnalytics },
    };
  }

  timings._postProcessingMs = Date.now() - postProcessingStart;
  log.info('Context build complete', { totalMs: Date.now() - ctxStart, timings });

  return {
    soulSignature,
    platformData: returnedPlatformData,
    whoopAnalytics,
    writingProfile,
    memories,
    twinSummary,
    proactiveInsights,
    enrichmentContext,
    voiceExamples,
    activeGoals,
    patterns,
    identityContext,
    calibrationContext,
    nudgeHistory,
    departmentProposals,
    wikiPages,
    directives,
    timings,
  };
}

/**
 * Build contextSources metadata for API response.
 * Provides a summary of what data was available for the twin's response.
 *
 * @param {TwinContext} context - The context object from fetchTwinContext
 * @returns {object} contextSources metadata
 */
function buildContextSourcesMeta(context) {
  const { soulSignature, platformData, memories, twinSummary, proactiveInsights, enrichmentContext, voiceExamples, activeGoals } = context;

  return {
    soulSignature: !!soulSignature,
    twinSummary: twinSummary ? twinSummary.substring(0, 200) : null,
    memoryStream: {
      total: memories?.length || 0,
      reflections: memories?.filter(m => m.memory_type === 'reflection').length || 0,
      facts: memories?.filter(m => m.memory_type === 'fact').length || 0,
    },
    proactiveInsights: proactiveInsights?.map(i => ({
      insight: i.insight, category: i.category, urgency: i.urgency
    })) || [],
    voiceExamples: voiceExamples?.length || 0,
    platformData: Object.keys(platformData || {}),
    enrichmentFallback: !!enrichmentContext,
    activeGoals: !!activeGoals,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers - replicate the same fetching logic from twin-chat.js
// ---------------------------------------------------------------------------

/**
 * Fetch diverse voice examples from the user's conversation history.
 * Returns 5-8 representative messages that capture the user's authentic voice:
 * their slang, rhythm, formality, sentence structure, and emotional expression.
 *
 * Strategy: Fetch a larger sample and select diverse messages (short + long,
 * questions + statements, emotional + factual) for best style coverage.
 */
async function _fetchVoiceExamples(userId) {
  const cacheKey = `voice_${userId}`;
  const cached = getCached(cacheKey);
  if (cached !== undefined) return cached;

  // Fetch real user messages from any first-party source that captures authentic voice.
  // Excludes test_script / dev artifacts; includes twin_chat + soul interviews + messaging
  // platforms (telegram, whatsapp) because those are often the richest voice samples.
  const VOICE_SOURCES = [
    'twin_chat',
    'onboarding_interview',
    'soul_interview_emotions',
    'soul_interview_fears',
    'soul_interview_goals',
    'soul_interview_habits',
    'soul_interview_identity',
    'soul_interview_joy',
    'soul_interview_relationships',
    'soul_interview_values',
    'soul_interview_work',
    'telegram',
    'whatsapp',
    'whatsapp_chat',
  ];

  // Sources whose memories are stored WITHOUT role='user' metadata
  // (chat-history imports: WhatsApp/Telegram). Their voice signal lives
  // in two memory shapes:
  //   - observation: "You wrote in <context>: \"<raw message>\""   (pure voice)
  //   - conversation: "In a chat (<name>), someone said: ... — you replied: \"<reply>\""
  const CHAT_IMPORT_SOURCES = ['whatsapp_chat', 'telegram', 'whatsapp'];

  // Query in parallel: (A) role-tagged conversations (twin_chat + interviews),
  // (B) untagged conversations from chat imports, (C) raw voice observations.
  const [
    { data: roleTagged, error: errA },
    { data: chatConvos, error: errB },
    { data: chatObs, error: errC },
  ] = await Promise.all([
    supabaseAdmin
      .from('user_memories')
      .select('content, metadata, created_at')
      .eq('user_id', userId)
      .eq('memory_type', 'conversation')
      .eq('metadata->>role', 'user')
      .in('metadata->>source', VOICE_SOURCES)
      .order('created_at', { ascending: false })
      .limit(60),
    supabaseAdmin
      .from('user_memories')
      .select('content, metadata, created_at')
      .eq('user_id', userId)
      .eq('memory_type', 'conversation')
      .in('metadata->>source', CHAT_IMPORT_SOURCES)
      .order('created_at', { ascending: false })
      .limit(80),
    supabaseAdmin
      .from('user_memories')
      .select('content, metadata, created_at')
      .eq('user_id', userId)
      .eq('memory_type', 'observation')
      .in('metadata->>source', CHAT_IMPORT_SOURCES)
      .order('created_at', { ascending: false })
      .limit(80),
  ]);

  if (errA || errB || errC) {
    log.warn('voice fetch partial error', { errA, errB, errC });
  }

  const rawRoleTagged = Array.isArray(roleTagged) ? roleTagged : [];
  const rawChatConvos = Array.isArray(chatConvos) ? chatConvos : [];
  const rawChatObs = Array.isArray(chatObs) ? chatObs : [];

  if (rawRoleTagged.length + rawChatConvos.length + rawChatObs.length === 0) {
    setCache(cacheKey, []);
    return [];
  }

  // Extract clean voice text from each shape
  const extractRoleTagged = (m) => {
    let t = m.content || '';
    if (t.startsWith('User said: ')) t = t.slice(11);
    if (t.startsWith('"') && t.endsWith('"')) t = t.slice(1, -1);
    return t.trim();
  };

  // "In a chat (<name>), someone said: "..." — you replied: "<reply>""
  const REPLY_RE = /you replied:\s*"([^"]+)"/i;
  const extractChatConvo = (m) => {
    const match = (m.content || '').match(REPLY_RE);
    return match ? match[1].trim() : '';
  };

  // "You wrote in <context>: "<raw>""
  const WROTE_RE = /^You wrote[^:]*:\s*"([\s\S]+)"\s*$/;
  const extractChatObs = (m) => {
    const match = (m.content || '').match(WROTE_RE);
    return match ? match[1].trim() : '';
  };

  const candidates = [
    ...rawRoleTagged.map(extractRoleTagged),
    ...rawChatConvos.map(extractChatConvo),
    ...rawChatObs.map(extractChatObs),
  ];

  const validMessages = candidates
    .filter(Boolean)
    .filter(m => m.length >= 15 && !m.startsWith('/') && !m.startsWith('['));

  if (validMessages.length === 0) {
    setCache(cacheKey, []);
    return [];
  }

  // Select diverse examples for maximum style coverage
  const examples = _selectDiverseExamples(validMessages, 8);

  log.info(`Selected ${examples.length} voice examples from ${validMessages.length} valid messages`);
  setCache(cacheKey, examples);
  return examples;
}

/**
 * Select diverse message examples that cover different aspects of the user's voice.
 * Picks a mix of: short/long, questions/statements, emotional/factual.
 */
function _selectDiverseExamples(messages, targetCount) {
  if (messages.length <= targetCount) return messages;

  const selected = [];
  const remaining = [...messages];

  // 1. Pick the shortest non-trivial message (shows brevity style)
  const shortIdx = remaining.reduce((best, m, i) =>
    m.length < remaining[best].length ? i : best, 0);
  selected.push(remaining.splice(shortIdx, 1)[0]);

  // 2. Pick the longest message (shows detail/depth style)
  const longIdx = remaining.reduce((best, m, i) =>
    m.length > remaining[best].length ? i : best, 0);
  selected.push(remaining.splice(longIdx, 1)[0]);

  // 3. Pick a question if available (shows curiosity style)
  const questionIdx = remaining.findIndex(m => m.includes('?'));
  if (questionIdx >= 0) {
    selected.push(remaining.splice(questionIdx, 1)[0]);
  }

  // 4. Pick an emotional message if available
  const emotionalIdx = remaining.findIndex(m =>
    /(!{2,}|\.{3}|feel|love|hate|excited|stressed|happy|sad|frustrated)/i.test(m));
  if (emotionalIdx >= 0) {
    selected.push(remaining.splice(emotionalIdx, 1)[0]);
  }

  // 5. Fill remaining slots with evenly spaced messages (for variety)
  const neededMore = targetCount - selected.length;
  if (neededMore > 0 && remaining.length > 0) {
    const step = Math.max(1, Math.floor(remaining.length / neededMore));
    for (let i = 0; i < remaining.length && selected.length < targetCount; i += step) {
      selected.push(remaining[i]);
    }
  }

  return selected;
}

async function _fetchSoulSignature(userId) {
  const cacheKey = `soul_${userId}`;
  const cached = getCached(cacheKey);
  if (cached !== undefined) return cached;

  // audit-2026-05-10 C2 follow-up: include `id` in the select so callers
  // (twin-chat.js logConversationToDatabase) can pass it through to
  // mcp_conversation_logs.soul_signature_id. Without it the C2 write-path
  // fix from 020e7ca6 silently wrote NULL because soulSignature?.id was
  // undefined at the time of the insert.
  //
  // audit-2026-05-27 task #11 (askjo SOUL.md analog): pull user_narrative
  // alongside the system-generated narrative. If the user has authored an
  // override, transparently swap it in as `narrative` so every downstream
  // consumer (twinSystemPromptBuilder, MCP log) sees the user's words as
  // the ground truth without needing to know about the override mechanism.
  const { data, error } = await supabaseAdmin
    .from('soul_signatures')
    .select('id, archetype_name, archetype_subtitle, narrative, user_narrative, user_narrative_updated_at, defining_traits, created_at, updated_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    setCache(cacheKey, null);
    return null;
  }

  // Single-source-of-truth swap: when the user has authored a non-empty
  // override, it BECOMES the narrative for downstream callers. We preserve
  // the original under narrative_system in case anything wants to compare.
  const hasUserOverride = typeof data.user_narrative === 'string'
    && data.user_narrative.trim().length > 0;
  const result = hasUserOverride
    ? { ...data, narrative: data.user_narrative, narrative_system: data.narrative, narrative_source: 'user' }
    : { ...data, narrative_source: 'system' };

  setCache(cacheKey, result);
  return result;
}

async function _fetchPersonalityScores(userId) {
  const cacheKey = `personality_${userId}`;
  const cached = getCached(cacheKey);
  if (cached !== undefined) return cached;

  const { data, error } = await supabaseAdmin
    .from('personality_scores')
    .select('openness, conscientiousness, extraversion, agreeableness, neuroticism, openness_confidence, conscientiousness_confidence, extraversion_confidence, agreeableness_confidence, neuroticism_confidence, analyzed_platforms, source_type')
    .eq('user_id', userId)
    .single();

  const result = (error || !data) ? null : data;
  setCache(cacheKey, result);
  return result;
}

async function _fetchWritingProfile(userId) {
  const cacheKey = `writing_${userId}`;
  const cached = getCached(cacheKey);
  if (cached !== undefined) return cached;

  const { data, error } = await supabaseAdmin
    .from('user_writing_patterns')
    .select('formality_score, emoji_frequency, question_frequency, avg_message_length, vocabulary_richness, curiosity_score, detail_orientation, assertiveness_score, common_topics, total_conversations, total_words_analyzed')
    .eq('user_id', userId)
    .single();

  if (error || !data) { setCache(cacheKey, null); return null; }

  const result = {
    communicationStyle: data.formality_score >= 60 ? 'formal' : data.formality_score >= 40 ? 'balanced' : 'casual',
    formalityScore: data.formality_score,
    usesEmojis: data.emoji_frequency > 0.5,
    asksQuestions: data.question_frequency > 0.3,
    messageLength: data.avg_message_length > 100 ? 'detailed' : data.avg_message_length > 30 ? 'moderate' : 'brief',
    vocabularyRichness: data.vocabulary_richness > 0.7 ? 'diverse' : data.vocabulary_richness > 0.5 ? 'moderate' : 'focused',
    personalityIndicators: {
      curiosity: data.curiosity_score,
      detailOrientation: data.detail_orientation,
      assertiveness: data.assertiveness_score,
    },
    commonTopics: data.common_topics,
    totalConversations: data.total_conversations,
    totalWordsAnalyzed: data.total_words_analyzed,
  };
  setCache(cacheKey, result);
  return result;
}

/**
 * Fetch live platform data for the given platforms.
 * Replicates the same logic from twin-chat.js getPlatformData.
 */
async function _fetchPlatformData(userId, platforms) {
  const cacheKey = userId;

  // Pre-flight: only fetch platforms the user actually has connected (skip wasted API calls)
  const connectedKey = `connected_${userId}`;
  let connectedPlatforms = getCached(connectedKey);
  if (connectedPlatforms === undefined) {
    try {
      const { data: connections } = await supabaseAdmin
        .from('platform_connections')
        .select('platform')
        .eq('user_id', userId);
      connectedPlatforms = new Set((connections || []).map(c => c.platform));
      setCache(connectedKey, connectedPlatforms);
    } catch (err) {
      log.warn('Connected platforms check failed, fetching all', { error: err });
      connectedPlatforms = new Set(platforms); // fallback: try all
    }
  }

  // Filter to only connected platforms (web doesn't need OAuth)
  const activePlatforms = platforms.filter(p => {
    if (p === 'web') return true;
    if (p === 'calendar') return connectedPlatforms.has('google_calendar') || connectedPlatforms.has('calendar');
    return connectedPlatforms.has(p);
  });

  if (activePlatforms.length < platforms.length) {
    log.info('Skipping disconnected platforms', {
      requested: platforms.length,
      active: activePlatforms.length,
      skipped: platforms.filter(p => !activePlatforms.includes(p))
    });
  }

  const cached = platformDataCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < PLATFORM_CACHE_TTL) {
    return cached.data;  // Fresh cache hit
  }
  // Stale-while-revalidate: serve stale data, refresh in background
  if (cached && (Date.now() - cached.timestamp) < PLATFORM_STALE_SERVE_MAX_MS) {
    if (!pendingPlatformRefreshes.has(cacheKey)) {
      pendingPlatformRefreshes.add(cacheKey);
      log.info('Platform data stale, background refreshing', { userId });
      _refreshPlatformData(userId, activePlatforms, cacheKey)
        .finally(() => pendingPlatformRefreshes.delete(cacheKey));
    }
    return cached.data;  // Return stale immediately
  }
  if (cached) platformDataCache.delete(cacheKey);  // Very stale, evict

  const data = {};

  // Fetch all active platforms in parallel instead of sequentially
  const platformFetchers = activePlatforms.map(platform => _fetchSinglePlatform(userId, platform).catch(err => {
    log.warn(`Error fetching ${platform} data:`, err.message);
    return null;
  }));

  const results = await Promise.all(platformFetchers);
  results.forEach((result, i) => {
    if (result) {
      Object.assign(data, result);
    }
  });

  platformDataCache.set(cacheKey, { data, timestamp: Date.now() });
  return data;
}

async function _refreshPlatformData(userId, platforms, cacheKey) {
  try {
    const data = {};
    const results = await Promise.all(
      platforms.map(p => _fetchSinglePlatform(userId, p).catch(() => null))
    );
    results.forEach(result => { if (result) Object.assign(data, result); });
    platformDataCache.set(cacheKey, { data, timestamp: Date.now() });
    log.info('Platform data background refresh complete', { userId });
  } catch (err) {
    log.warn('Platform data background refresh failed', { error: err });
  }
}

async function _fetchSinglePlatform(userId, platform) {
  const data = {};

  try {
    if (platform === 'spotify') {
        try {
          const tokenResult = await getValidAccessToken(userId, 'spotify');
          if (tokenResult.success && tokenResult.accessToken) {
            const headers = { Authorization: `Bearer ${tokenResult.accessToken}` };

            const PLATFORM_TIMEOUT = 3000;

            // Run ALL 5 Spotify calls in parallel (P2: was serial currently-playing first)
            const [currentRes, recentRes, topShortRes, topMedRes, topLongRes] = await Promise.all([
              axios.get('https://api.spotify.com/v1/me/player/currently-playing', { headers, timeout: PLATFORM_TIMEOUT }).catch(() => ({ data: null })),
              axios.get('https://api.spotify.com/v1/me/player/recently-played?limit=10', { headers, timeout: PLATFORM_TIMEOUT }),
              axios.get('https://api.spotify.com/v1/me/top/artists?limit=5&time_range=short_term', { headers, timeout: PLATFORM_TIMEOUT }),
              axios.get('https://api.spotify.com/v1/me/top/artists?limit=5&time_range=medium_term', { headers, timeout: PLATFORM_TIMEOUT }),
              axios.get('https://api.spotify.com/v1/me/top/artists?limit=5&time_range=long_term', { headers, timeout: PLATFORM_TIMEOUT }),
            ]);

            let currentlyPlaying = null;
            if (currentRes.data?.item) {
              currentlyPlaying = {
                name: currentRes.data.item.name,
                artist: currentRes.data.item.artists?.[0]?.name,
                isPlaying: currentRes.data.is_playing
              };
            }

            // All recent tracks regardless of age (up to 10)
            const recentTracks = recentRes.data?.items?.map(item => ({
              name: item.track?.name,
              artist: item.track?.artists?.[0]?.name,
              playedAt: item.played_at
            })) || [];

            const topShort = topShortRes.data?.items?.map(a => a.name) || [];
            const topMed   = topMedRes.data?.items?.map(a => a.name) || [];
            const topLong  = topLongRes.data?.items?.map(a => a.name) || [];
            const genres   = topShortRes.data?.items?.flatMap(a => a.genres?.slice(0, 2) || []).slice(0, 5) || [];

            data.spotify = {
              currentlyPlaying,
              recentTracks: recentTracks.slice(0, 8),
              topArtistsShortTerm: topShort,   // ~4 weeks
              topArtistsMediumTerm: topMed,    // ~6 months
              topArtistsLongTerm: topLong,     // all time
              genres,
              fetchedAt: new Date().toISOString()
            };
          }
        } catch (spotifyErr) {
          log.warn('Spotify fetch failed:', spotifyErr.message);
        }
      }

      if (platform === 'calendar' || platform === 'google_calendar') {
        try {
          const tokenResult = await getValidAccessToken(userId, 'google_calendar');
          if (tokenResult.success && tokenResult.accessToken) {
            const now = new Date();
            const todayEnd = new Date(now);
            todayEnd.setHours(23, 59, 59, 999);
            const weekFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

            const calRes = await axios.get('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
              headers: { Authorization: `Bearer ${tokenResult.accessToken}` },
              timeout: 3000,
              params: {
                timeMin: now.toISOString(),
                timeMax: weekFromNow.toISOString(),
                maxResults: 15,
                singleEvents: true,
                orderBy: 'startTime'
              }
            });

            const events = calRes.data?.items?.map(e => ({
              id: e.id,
              summary: e.summary,
              start: e.start?.dateTime || e.start?.date,
              isToday: new Date(e.start?.dateTime || e.start?.date) <= todayEnd
            })) || [];

            data.calendar = {
              todayEvents: events.filter(e => e.isToday).slice(0, 5),
              upcomingEvents: events.filter(e => !e.isToday).slice(0, 5),
              fetchedAt: new Date().toISOString()
            };
          }
        } catch (calErr) {
          log.warn('Calendar fetch failed:', calErr.message);
        }
      }

      if (platform === 'whoop') {
        try {
          const { data: whoopConn, error: whoopConnErr } = await supabaseAdmin
            .from('platform_connections')
            .select('access_token')
            .eq('user_id', userId)
            .eq('platform', 'whoop')
            .single();
          if (whoopConnErr && whoopConnErr.code !== 'PGRST116') log.warn('Whoop connection fetch failed:', whoopConnErr.message);

          if (whoopConn?.access_token === 'NANGO_MANAGED') {
            const nangoService = await import('./nangoService.js');
            const [recoveryResult, sleepResult] = await Promise.all([
              nangoService.whoop.getRecovery(userId, 1),
              nangoService.whoop.getSleep(userId, 5)
            ]);

            const latestRecovery = recoveryResult.success ? recoveryResult.data?.records?.[0] : null;
            const allSleeps = sleepResult.success ? (sleepResult.data?.records || []) : [];

            if (latestRecovery || allSleeps.length > 0) {
              const now = new Date();
              const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
              const todaysSleeps = allSleeps.filter(s => new Date(s.end) >= yesterday);

              let totalSleepMs = 0;
              todaysSleeps.forEach(sleep => {
                const stageSummary = sleep.score?.stage_summary || {};
                totalSleepMs += sleep.score?.total_sleep_time_milli ||
                               (stageSummary.total_in_bed_time_milli - (stageSummary.total_awake_time_milli || 0)) ||
                               stageSummary.total_in_bed_time_milli || 0;
              });

              const sleepHours = totalSleepMs / (1000 * 60 * 60);
              data.whoop = {
                recovery: latestRecovery?.score?.recovery_score || null,
                strain: latestRecovery?.score?.user_calibrating ? 'calibrating' : null,
                sleepHours: sleepHours > 0 ? sleepHours.toFixed(1) : null,
                sleepDescription: sleepHours > 0 ? `${sleepHours.toFixed(1)} hours${todaysSleeps.length > 1 ? ` (incl. ${todaysSleeps.length - 1} nap${todaysSleeps.length > 2 ? 's' : ''})` : ''}` : null,
                hrv: latestRecovery?.score?.hrv_rmssd_milli ? Math.round(latestRecovery.score.hrv_rmssd_milli) : null,
                restingHR: latestRecovery?.score?.resting_heart_rate ? Math.round(latestRecovery.score.resting_heart_rate) : null,
                fetchedAt: new Date().toISOString()
              };
            }
          } else {
            const tokenResult = await getValidAccessToken(userId, 'whoop');
            if (tokenResult.success && tokenResult.accessToken) {
              const headers = { Authorization: `Bearer ${tokenResult.accessToken}` };
              const [recoveryRes, sleepRes] = await Promise.all([
                axios.get('https://api.prod.whoop.com/developer/v2/recovery?limit=1', { headers }),
                axios.get('https://api.prod.whoop.com/developer/v2/activity/sleep?limit=5', { headers })
              ]);

              const latestRecovery = recoveryRes.data?.records?.[0];
              const allSleeps = sleepRes.data?.records || [];
              const now = new Date();
              const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
              const todaysSleeps = allSleeps.filter(s => new Date(s.end) >= yesterday);

              let totalSleepMs = 0;
              todaysSleeps.forEach(sleep => {
                const stageSummary = sleep.score?.stage_summary || {};
                totalSleepMs += sleep.score?.total_sleep_time_milli ||
                               (stageSummary.total_in_bed_time_milli - (stageSummary.total_awake_time_milli || 0)) ||
                               stageSummary.total_in_bed_time_milli || 0;
              });

              const sleepHours = totalSleepMs / (1000 * 60 * 60);
              data.whoop = {
                recovery: latestRecovery?.score?.recovery_score || null,
                strain: latestRecovery?.score?.user_calibrating ? 'calibrating' : null,
                sleepHours: sleepHours > 0 ? sleepHours.toFixed(1) : null,
                sleepDescription: sleepHours > 0 ? `${sleepHours.toFixed(1)} hours${todaysSleeps.length > 1 ? ` (incl. ${todaysSleeps.length - 1} nap${todaysSleeps.length > 2 ? 's' : ''})` : ''}` : null,
                hrv: latestRecovery?.score?.hrv_rmssd_milli ? Math.round(latestRecovery.score.hrv_rmssd_milli) : null,
                restingHR: latestRecovery?.score?.resting_heart_rate ? Math.round(latestRecovery.score.resting_heart_rate) : null,
                fetchedAt: new Date().toISOString()
              };
            }
          }
        } catch (whoopErr) {
          log.warn('Whoop fetch failed:', whoopErr.message);
        }
      }

      if (platform === 'web') {
        try {
          const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
          const { data: webEvents } = await supabaseAdmin
            .from('user_platform_data')
            .select('data_type, raw_data, created_at')
            .eq('user_id', userId)
            .eq('platform', 'web')
            .gte('created_at', sevenDaysAgo)
            .order('created_at', { ascending: false })
            .limit(25);

          if (webEvents?.length > 0) {
            const categories = {};
            const topics = {};
            const searches = [];
            const domains = {};

            for (const event of webEvents) {
              const raw = event.raw_data || {};
              const category = raw.category || raw.metadata?.category;
              if (category) categories[category] = (categories[category] || 0) + 1;

              const domain = raw.domain || raw.metadata?.domain;
              if (domain) domains[domain] = (domains[domain] || 0) + 1;

              const eventTopics = raw.topics || raw.metadata?.topics || [];
              for (const t of eventTopics) topics[t] = (topics[t] || 0) + 1;

              if (event.data_type === 'extension_search_query' && raw.query) {
                searches.push(raw.query);
              }
            }

            data.web = {
              hasExtensionData: true,
              totalEvents: webEvents.length,
              topCategories: Object.entries(categories).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c]) => c),
              topTopics: Object.entries(topics).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t]) => t),
              topDomains: Object.entries(domains).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([d]) => d),
              recentSearches: searches.slice(0, 5),
              fetchedAt: new Date().toISOString()
            };
          }
        } catch (webErr) {
          log.warn('Web browsing fetch failed:', webErr.message);
        }
      }
  } catch (err) {
    log.warn(`Error fetching ${platform} data:`, err.message);
  }

  return Object.keys(data).length > 0 ? data : null;
}

/**
 * Fetch deep interview calibration data for twin context injection.
 * Returns a formatted [YOUR STORY] block, or null if no interview exists.
 */
async function _fetchCalibrationContext(userId) {
  const { data, error } = await supabaseAdmin
    .from('onboarding_calibration')
    .select('personality_summary, insights, archetype_hint, domain_progress, questions_asked, completed_at')
    .eq('user_id', userId)
    .single();

  if (error || !data) return null;

  const lines = [];
  if (data.archetype_hint) lines.push(`Archetype: ${data.archetype_hint}`);
  if (data.personality_summary) lines.push(data.personality_summary.trim());
  const insights = Array.isArray(data.insights) ? data.insights : [];
  if (insights.length > 0) {
    lines.push('Key insights:');
    insights.slice(0, 8).forEach(i => lines.push(`- ${typeof i === 'string' ? i : i.insight || JSON.stringify(i)}`));
  }

  if (lines.length === 0) return null;
  return `[YOUR STORY — told in ${data.questions_asked || '?'} questions]\n${lines.join('\n')}`;
}

/**
 * Route memory context using pre-computed memory domain weights.
 * Converts context router weights into budget overrides for fetchTwinContext.
 *
 * This allows the agenticCore planner to request context that's weighted
 * toward the relevant memory types for the current task (e.g., heavy on
 * platform_data for schedule queries, heavy on reflections for identity queries).
 *
 * @param {string} userId - User ID
 * @param {string} userMessage - The user's message
 * @param {{ weights: object, domain: string }} memoryDomains - From contextRouter.routeContext()
 * @returns {Promise<TwinContext>}
 */
async function routeMemoryContext(userId, userMessage, memoryDomains = null) {
  if (!memoryDomains || !memoryDomains.weights) {
    // No routing info — use default fetchTwinContext behavior
    return fetchTwinContext(userId, userMessage);
  }

  const { weights } = memoryDomains;

  // Convert 0-1 weights into memory budgets
  // Platform budget scales with number of high-activity platforms (activity_score >= 50)
  let platformBudget = 4; // default
  try {
    const { data: activityData } = await supabaseAdmin
      .from('platform_connections')
      .select('activity_score')
      .eq('user_id', userId)
      .gte('activity_score', 50);
    const activePlatforms = activityData?.length || 0;
    // Scale: 0 active → 4, 1-2 → 6, 3-4 → 8, 5+ → 10
    platformBudget = Math.min(10, 4 + Math.floor(activePlatforms / 2) * 2);
  } catch (e) {
    // Non-fatal, use default
  }

  const baseBudgets = { reflections: 12, facts: 6, platformData: platformBudget, conversations: 10 };
  const memoryBudgets = {
    reflections: Math.max(1, Math.round(baseBudgets.reflections * (weights.reflections || 0.6))),
    facts: Math.max(1, Math.round(baseBudgets.facts * (weights.facts || 0.6))),
    platformData: Math.max(1, Math.round(baseBudgets.platformData * (weights.platform_data || 0.5))),
    conversations: Math.max(3, Math.round(baseBudgets.conversations * (weights.conversations || 0.8))),
  };

  // Choose retrieval weight preset based on domain
  const DOMAIN_TO_WEIGHTS = {
    identity: 'identity',
    recent_activity: 'recent',
    recall: 'default',
    goals: 'identity',
  };
  const memoryWeights = DOMAIN_TO_WEIGHTS[memoryDomains.domain] || 'default';

  log.info('Routing memory context', {
    userId,
    domain: memoryDomains.domain,
    budgets: memoryBudgets,
    weights: memoryWeights,
  });

  return fetchTwinContext(userId, userMessage, {
    memoryBudgets,
    memoryWeights,
  });
}

export { fetchTwinContext, buildContextSourcesMeta, routeMemoryContext };
