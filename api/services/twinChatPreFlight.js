/**
 * Twin Chat Pre-Flight Context Fetch
 * ===================================
 * Single Promise.all that fans out to every read the twin needs before
 * building a system prompt: twin context, user location/timezone,
 * personality profile, soul-signature layers, optional personality-oracle
 * draft, and the workspace-actions tool prompt.
 *
 * Each non-essential dependency is wrapped so individual failures don't
 * abort the others — only the twinContext fetch can throw upward.
 *
 * Extracted from POST /api/chat/message during the 2026-05-09 monolith trim
 * (audit ARCH-1).
 */

import { supabaseAdmin } from './database.js';
import { fetchTwinContext } from './twinContextBuilder.js';
import { getProfile, getSoulSignatureLayers } from './personalityProfileService.js';
import { getOracleDraft } from './finetuning/personalityOracle.js';
import { buildWorkspaceActionsPrompt } from './tools/workspaceActionParser.js';
import { createLogger } from './logger.js';

const log = createLogger('TwinChatPreFlight');

const DEFAULT_PLATFORMS = ['spotify', 'calendar', 'whoop', 'web'];

function mapNeuropilWeightsToPreset(weights) {
  if (!weights) return null;
  if (weights.recency >= 0.8) return 'recent';
  if (weights.importance >= 0.8) return 'identity';
  return 'identity';
}

function buildContextOptions({ platforms, neuropilResult }) {
  const opts = { platforms: platforms || DEFAULT_PLATFORMS };
  if (neuropilResult?.neuropilId && neuropilResult.budgets) {
    opts.memoryBudgets = neuropilResult.budgets;
  }
  if (neuropilResult?.neuropilId && neuropilResult.weights) {
    const preset = mapNeuropilWeightsToPreset(neuropilResult.weights);
    if (preset) opts.memoryWeights = preset;
  }
  return opts;
}

async function fetchUserLocation(userId) {
  try {
    const { data } = await supabaseAdmin
      .from('users')
      .select('last_location, timezone')
      .eq('id', userId)
      .single();
    if (data?.last_location) return data.last_location;
    if (data?.timezone) return { timezone: data.timezone, source: 'browser-timezone' };
    return null;
  } catch {
    return null;
  }
}

/**
 * Record-and-await helper: invokes a sidecar fetch and records its wall
 * time into `timings[key]`. The audit-2026-05-13 follow-up wired these
 * leg timings into the chat hop log so the per-request trace shows
 * which preflight leg dominates on slow requests.
 *
 * audit-2026-05-15 C3: each sidecar now races against a per-leg
 * timeout (default 5s — well under the 10s twinContext breaker). The
 * 2026-05-15 audit found legPersonalityMs spiked to 48.8s on a worst-
 * case cold start, blocking the entire chat for ~49s before the LLM
 * call even started. Without per-leg timeouts, the only safety net was
 * Vercel's 60s function timeout. Now each leg returns its default
 * (undefined/null) on timeout, which the existing optional-leg handling
 * already gracefully accepts.
 */
const DEFAULT_LEG_TIMEOUT_MS = 5000;

function timeLeg(timings, key, fn, timeoutMs = DEFAULT_LEG_TIMEOUT_MS) {
  const t0 = Date.now();
  let timer;
  let timedOut = false;
  const timeoutPromise = new Promise((resolve) => {
    timer = setTimeout(() => {
      timedOut = true;
      timings[key] = Date.now() - t0;
      // Record a separate flag so hop_timings can distinguish a budget
      // hit from a normal slow leg. The actual completion duration of
      // the underlying fn (if it ever finishes) is lost — that's the
      // trade-off for not hanging the chat behind a slow leg.
      timings[`${key}TimedOut`] = true;
      log.warn(`Preflight leg timeout: ${key} exceeded ${timeoutMs}ms — using default`);
      resolve(undefined);
    }, timeoutMs);
  });
  return Promise.race([
    fn().finally(() => {
      clearTimeout(timer);
      // Only record duration if we won the race — otherwise the timeout
      // already wrote both the duration and the TimedOut flag, and
      // overwriting them here would lose the timeout signal.
      if (!timedOut) timings[key] = Date.now() - t0;
    }),
    timeoutPromise,
  ]);
}

export async function fetchChatPreFlight({
  userId,
  message,
  context,
  neuropilResult,
  usePersonalityOracle = false,
}) {
  const contextOptions = buildContextOptions({
    platforms: context?.platforms,
    neuropilResult,
  });

  let userLocation = null;
  let personalityProfile = null;
  let soulLayers = null;
  let oracleDraft = null;
  let workspaceBlock = null;
  const _legTimings = {};

  const sidecars = [
    timeLeg(_legTimings, 'legUserLocationMs', () =>
      fetchUserLocation(userId).then(loc => { userLocation = loc; })),
    timeLeg(_legTimings, 'legPersonalityMs', () =>
      getProfile(userId)
        .then(p => { personalityProfile = p; })
        .catch(err => { log.warn('Personality profile fetch failed', { error: err?.message }); })),
    timeLeg(_legTimings, 'legSoulLayersMs', () =>
      getSoulSignatureLayers(userId)
        .then(layers => { soulLayers = layers; })
        .catch(err => { log.warn('Soul signature layers fetch failed', { error: err?.message }); })),
    timeLeg(_legTimings, 'legWorkspacePromptMs', () =>
      buildWorkspaceActionsPrompt(userId)
        .then(block => { workspaceBlock = block; })
        .catch(() => { /* non-fatal */ })),
  ];

  if (usePersonalityOracle) {
    sidecars.push(
      timeLeg(_legTimings, 'legOracleDraftMs', () =>
        getOracleDraft(userId, message)
          .then(draft => { oracleDraft = draft; })
          .catch(() => { /* graceful fallback — oracle is optional */ }))
    );
  }

  const twinCtxStart = Date.now();
  const [twinContext] = await Promise.all([
    fetchTwinContext(userId, message, contextOptions),
    ...sidecars,
  ]);
  _legTimings.legTwinContextMs = Date.now() - twinCtxStart;

  return {
    twinContext,
    userLocation,
    personalityProfile,
    soulLayers,
    oracleDraft,
    workspaceBlock,
    _legTimings,
  };
}
