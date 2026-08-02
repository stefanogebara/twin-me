/**
 * Insight Utility Gate (R3 — Simile deep-dive, Gumbo expected-utility rule)
 * =========================================================================
 * Principled replacement for urgency-enum delivery ordering, from GUM's
 * Gumbo assistant (Horvitz's mixed-initiative principles, CHI'99):
 *
 *   E[interrupt] = p*B - (1-p)*C_FP        (helps, or annoys for nothing)
 *   E[silent]    = -p*C_FN                  (misses a real need)
 *   deliver iff E[interrupt] > E[silent]
 *   => EV = p*B - (1-p)*C_FP + p*C_FN, deliver iff EV > 0
 *
 * p (probability the insight helps), B (benefit if it lands), C_FP (cost
 * of a useless interruption), C_FN (cost of staying silent when it was
 * real) are LLM-estimated PER INSIGHT at generation time — an insight
 * during a packed workday and one during idle evening browsing get
 * different costs — and stored in proactive_insights.metadata.utility.
 *
 * Rows without a utility block (legacy insights, chapter nudges,
 * correlation insights) FAIL OPEN: they deliver, ranked by an urgency
 * prior on the same EV scale. A daily token bucket caps total deliveries
 * regardless of EV. Pure computation — no LLM, no DB.
 */

/** Max insights delivered into chat context per rolling 24h. */
export const DAILY_DELIVERY_CAP = 5;

/**
 * Ranking prior for rows without EV, on the same scale as typical EV
 * values (EV range is roughly [-10, 20]; a solid insight lands ~2-8).
 * 'high' outranks a modest positive EV; 'low' only beats gated-out rows.
 */
export const URGENCY_PRIOR = { high: 3, medium: 1.5, low: 0.5 };

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/**
 * Validate + clamp an LLM-emitted utility block.
 * Returns { p_useful, benefit, cost_fp, cost_fn } or null when malformed.
 */
export function sanitizeUtility(utility) {
  if (!utility || typeof utility !== 'object') return null;
  const p = Number(utility.p_useful);
  const b = Number(utility.benefit);
  const cfp = Number(utility.cost_fp);
  const cfn = Number(utility.cost_fn);
  if (![p, b, cfp, cfn].every(Number.isFinite)) return null;
  return {
    p_useful: clamp(p, 0, 1),
    benefit: clamp(b, 0, 10),
    cost_fp: clamp(cfp, 0, 10),
    cost_fn: clamp(cfn, 0, 10),
  };
}

/** The Gumbo rule. Assumes a sanitized block; returns the scalar EV. */
export function computeExpectedUtility({ p_useful, benefit, cost_fp, cost_fn }) {
  return p_useful * benefit - (1 - p_useful) * cost_fp + p_useful * cost_fn;
}

/**
 * Delivery decision for one insight row.
 * Returns { deliver, ev } — ev is null when no valid utility block exists
 * (fail-open: legacy rows and deterministic nudges always deliver).
 */
export function shouldDeliverInsight(insight) {
  const utility = sanitizeUtility(insight?.metadata?.utility);
  if (!utility) return { deliver: true, ev: null };
  const ev = computeExpectedUtility(utility);
  return { deliver: ev > 0, ev };
}

/**
 * Filter gated-out insights and rank the rest for delivery.
 * Sort key: EV where present, urgency prior otherwise — one scale, so a
 * high-urgency legacy row can still outrank a marginal-EV insight.
 * Returns a new array; does not mutate the input.
 */
export function rankForDelivery(insights) {
  return (insights || [])
    .map(insight => ({ insight, decision: shouldDeliverInsight(insight) }))
    .filter(({ decision }) => decision.deliver)
    .sort((a, b) => sortScore(b) - sortScore(a))
    .map(({ insight }) => insight);
}

function sortScore({ insight, decision }) {
  if (decision.ev !== null) return decision.ev;
  return URGENCY_PRIOR[insight?.urgency] ?? URGENCY_PRIOR.low;
}

/**
 * Token bucket: how many insights may still be delivered now, given how
 * many were already delivered in the trailing window.
 */
export function applyDailyCap(requestedLimit, deliveredToday, cap = DAILY_DELIVERY_CAP) {
  const delivered = Number.isFinite(deliveredToday) ? deliveredToday : 0;
  const remaining = Math.max(0, cap - delivered);
  return Math.max(0, Math.min(requestedLimit, remaining));
}
