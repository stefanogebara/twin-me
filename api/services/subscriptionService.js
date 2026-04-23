// api/services/subscriptionService.js
//
// Littlebird pricing model:
//   free  → "Free"    $0/mo   — 100 msgs/mo, 2 platforms, 7-day memory
//   pro   → "Plus"   $20/mo   — 1500 msgs/mo, 5 platforms, 90-day memory, expert personas, email digest
//   max   → "Pro"   $100/mo   — Unlimited, all platforms, full history, best models, priority support
//
// DB enum stays ('free','pro','max') — display names differ.
// Message caps bumped 2026-04-23 (free 50→100, pro 500→1500) to give beta users
// more room before the paywall triggers. Max stays Infinity.
import { supabaseAdmin } from './database.js';

const PLAN_LIMITS = {
  free: {
    chatMessages: 100,
    platformConnections: 2,
    memoryDays: 7,
    reflections: false,
    emailDigest: false,
    bestModels: false,
  },
  pro: {
    chatMessages: 1500,
    platformConnections: 5,
    memoryDays: 90,
    reflections: true,
    emailDigest: true,
    bestModels: false,
  },
  max: {
    chatMessages: Infinity,
    platformConnections: Infinity,
    memoryDays: Infinity,
    reflections: true,
    emailDigest: true,
    bestModels: true,
  },
};

// Display names for each DB plan key
export const PLAN_DISPLAY_NAMES = {
  free: 'Free',
  pro: 'Plus',
  max: 'Pro',
};

export async function getUserSubscription(userId) {
  const { data } = await supabaseAdmin
    .from('user_subscriptions')
    .select('plan, status, current_period_end, cancel_at_period_end')
    .eq('user_id', userId)
    .single();

  if (!data) return { plan: 'free', status: 'active' };
  const isActive = ['active', 'trialing', 'past_due'].includes(data.status);
  return {
    plan: isActive ? data.plan : 'free',
    status: data.status,
    currentPeriodEnd: data.current_period_end,
    cancelAtPeriodEnd: data.cancel_at_period_end,
  };
}

export function getPlanLimits(plan) {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
}

export async function requirePlan(userId, minimumPlan) {
  const sub = await getUserSubscription(userId);
  const order = ['free', 'pro', 'max'];
  if (order.indexOf(sub.plan) < order.indexOf(minimumPlan)) {
    const err = new Error(`Requires ${minimumPlan} plan`);
    err.statusCode = 403;
    err.code = 'UPGRADE_REQUIRED';
    err.requiredPlan = minimumPlan;
    throw err;
  }
  return sub;
}
