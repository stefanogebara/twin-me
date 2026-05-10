/**
 * Twin Chat Pre-Flight Checks
 * ============================
 * Runs the four gating checks every chat message clears before expensive work:
 *   1. Feature flags
 *   2. Subscription (free plan: 1 reply, then paywall)
 *   3. Usage quota (Free=50, Plus=500, Pro=unlimited)
 *   4. Rate limit (200 msg/user/hour)
 *
 * Returns either the unlocked flag bag or a ready-to-send error response.
 *
 * Extracted from POST /api/chat/message during the 2026-05-09 monolith trim
 * (audit ARCH-1).
 */

import { supabaseAdmin } from './database.js';
import { getFeatureFlags } from './featureFlagsService.js';
import { getUserSubscription, PLAN_DISPLAY_NAMES } from './subscriptionService.js';
import { checkChatRateLimit } from './chatRateLimiter.js';
import { createLogger } from './logger.js';

import { getMonthlyUsage } from '../routes/chat-usage.js';

const log = createLogger('TwinChatPreFlightChecks');

function deriveFeatureFlagBooleans(featureFlags) {
  return {
    useExpertRouting: featureFlags.expert_routing !== false,
    useIdentityContext: featureFlags.identity_context !== false,
    useEmotionalState: featureFlags.emotional_state !== false,
    useNeurotransmitterModes: featureFlags.neurotransmitter_modes !== false,
    useConnectomeNeuropils: featureFlags.connectome_neuropils !== false,
    useEmbodiedFeedback: featureFlags.embodied_feedback_loop !== false,
    usePersonalityOracle: featureFlags.personality_oracle === true,
    useSmartRouting: featureFlags.smart_routing !== false,
  };
}

async function checkFreemiumPaywall(userId) {
  const { count } = await supabaseAdmin
    .from('twin_messages')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('role', 'assistant');
  if ((count ?? 0) >= 1) {
    return {
      ok: false,
      status: 403,
      body: {
        success: false,
        error: 'Upgrade required to continue chatting',
        code: 'UPGRADE_REQUIRED',
        requiredPlan: 'pro',
      },
    };
  }
  return { ok: true };
}

function checkMonthlyQuota(usage) {
  if (!usage) return { ok: true };
  if (usage.limit === Infinity || usage.used < usage.limit) return { ok: true };
  const displayName = PLAN_DISPLAY_NAMES[usage.tier] || usage.tier;
  return {
    ok: false,
    status: 429,
    body: {
      success: false,
      error: 'monthly_limit_reached',
      message: `You've used all ${usage.limit} ${displayName} messages this month. Upgrade for more conversations.`,
      usage: { used: usage.used, limit: usage.limit, tier: usage.tier },
    },
  };
}

async function checkRateLimit(userId) {
  const rateLimit = await checkChatRateLimit(userId);
  if (rateLimit.allowed) return { ok: true };
  log.warn('Rate limit exceeded', { userId, used: rateLimit.used, limit: rateLimit.limit });
  return {
    ok: false,
    status: 429,
    body: {
      success: false,
      error: 'hourly_rate_limit',
      message: `You've sent ${rateLimit.limit} messages in the last hour. Please wait before sending more.`,
      retryAfter: Math.ceil((rateLimit.retryAfterMs || 0) / 1000),
    },
  };
}

export async function runChatPreFlightChecks({ userId }) {
  const [featureFlags, sub, usage] = await Promise.all([
    getFeatureFlags(userId).catch(() => ({})),
    getUserSubscription(userId).catch(err => {
      log.warn('Subscription check failed, defaulting to free', { error: err?.message });
      return { plan: 'free' };
    }),
    getMonthlyUsage(userId).catch(err => {
      log.warn('Usage quota check failed, skipping limit', { error: err?.message });
      return null;
    }),
  ]);

  if (sub.plan === 'free') {
    const paywall = await checkFreemiumPaywall(userId);
    if (!paywall.ok) return paywall;
  }

  const quota = checkMonthlyQuota(usage);
  if (!quota.ok) return quota;

  const rate = await checkRateLimit(userId);
  if (!rate.ok) return rate;

  return {
    ok: true,
    featureFlags,
    flags: deriveFeatureFlagBooleans(featureFlags),
  };
}
