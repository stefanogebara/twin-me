/**
 * Twin Chat Pre-Flight Checks
 * ============================
 * Runs the four gating checks every chat message clears before expensive work:
 *   1. Feature flags
 *   2. Subscription paywall (free plan: 403 UPGRADE_REQUIRED at monthly cap)
 *   3. Usage quota (Free=100/mo, Plus=1500/mo, Pro=unlimited)
 *   4. Rate limit (200 msg/user/hour)
 *
 * Returns either the unlocked flag bag or a ready-to-send error response.
 *
 * Extracted from POST /api/chat/message during the 2026-05-09 monolith trim
 * (audit ARCH-1).
 */

import { getFeatureFlags } from './featureFlagsService.js';
import {
  getUserSubscription,
  getMonthlyUsage,
  PLAN_DISPLAY_NAMES,
} from './subscriptionService.js';
import { checkChatRateLimit } from './chatRateLimiter.js';
import { createLogger } from './logger.js';

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

/**
 * Free-tier paywall gate.
 *
 * Audit M4 (2026-05-15): the old version queried twin_messages and gated at
 * 1 assistant reply EVER — which contradicted PLAN_LIMITS.free.chatMessages
 * (100) and the UI copy ("100 chat messages / month"). The fix reuses the
 * monthly `usage` already computed above. Free users get 100 messages per
 * calendar month; the 101st message returns 403 UPGRADE_REQUIRED so the FE
 * renders the PaywallModal (not the LimitReachedBanner which is the 429
 * code path for paid tiers).
 *
 * Pure function — takes the usage object the caller already fetched.
 */
function checkFreemiumPaywall(usage) {
  if (!usage) return { ok: true };
  if (usage.used < usage.limit) return { ok: true };
  return {
    ok: false,
    status: 403,
    body: {
      success: false,
      error: 'Upgrade required to continue chatting',
      code: 'UPGRADE_REQUIRED',
      requiredPlan: 'pro',
      usage: { used: usage.used, limit: usage.limit, tier: usage.tier },
    },
  };
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

// Unlimited tiers short-circuit BOTH the monthly quota and the per-user
// rate limiter. Audit bug C2 (2026-05-12): max-plan user hit 429 because the
// per-minute limiter still fired even though their monthly quota was
// Infinity, and the UI then rendered TWO conflicting copy strings
// simultaneously ("Take a breath..." + "You've reached this month's limit").
// Tier gate lives here so it stays consistent if the route grows new checks.
//
// Audit H4 (2026-05-15): past_due users were treated as still-unlimited
// because getUserSubscription returns plan: 'max' for any of
// ('active','trialing','past_due'). Stripe's dunning window is 7-14 days, so
// a failed-payment user used to keep unlimited access the whole time.
// Require an actively-paying status to grant the unlimited bypass — past_due
// still gets their tier features (memory days, integrations) but quota-gated
// like the 'pro' tier.
function isUnlimitedTier(sub) {
  if (!sub || sub.plan !== 'max') return false;
  return sub.status === 'active' || sub.status === 'trialing';
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
    const paywall = checkFreemiumPaywall(usage);
    if (!paywall.ok) return paywall;
  }

  // Max tier (unlimited) bypasses both the monthly quota and the hourly
  // rate limiter. The route is still abuse-protected by upstream auth,
  // pre-flight feature flags, and the 50s SSE timeout.
  if (!isUnlimitedTier(sub)) {
    const quota = checkMonthlyQuota(usage);
    if (!quota.ok) return quota;

    const rate = await checkRateLimit(userId);
    if (!rate.ok) return rate;
  }

  return {
    ok: true,
    featureFlags,
    flags: deriveFeatureFlagBooleans(featureFlags),
  };
}
