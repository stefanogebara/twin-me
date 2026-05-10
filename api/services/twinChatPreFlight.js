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

  const sidecars = [
    fetchUserLocation(userId).then(loc => { userLocation = loc; }),
    getProfile(userId)
      .then(p => { personalityProfile = p; })
      .catch(err => { log.warn('Personality profile fetch failed', { error: err?.message }); }),
    getSoulSignatureLayers(userId)
      .then(layers => { soulLayers = layers; })
      .catch(err => { log.warn('Soul signature layers fetch failed', { error: err?.message }); }),
    buildWorkspaceActionsPrompt(userId)
      .then(block => { workspaceBlock = block; })
      .catch(() => { /* non-fatal */ }),
  ];

  if (usePersonalityOracle) {
    sidecars.push(
      getOracleDraft(userId, message)
        .then(draft => { oracleDraft = draft; })
        .catch(() => { /* graceful fallback — oracle is optional */ })
    );
  }

  const [twinContext] = await Promise.all([
    fetchTwinContext(userId, message, contextOptions),
    ...sidecars,
  ]);

  return {
    twinContext,
    userLocation,
    personalityProfile,
    soulLayers,
    oracleDraft,
    workspaceBlock,
  };
}
