/**
 * llmBudgetGuard — Redis-independent backstops against runaway LLM spend.
 *
 * llmGateway already has a SOFT daily budget (LLM_DAILY_BUDGET_USD, default $10)
 * that downgrades to the cheapest tier when exceeded, plus a per-user cap. Both
 * read the day's spend from llm_usage_log (DB), so they survive a Redis outage.
 *
 * Two gaps that a runaway loop at scale can still exploit, closed here:
 *
 *   1. Per-instance call ceiling — the soft cap reads a 60s-cached daily total,
 *      so a tight loop on ONE lambda can fire thousands of calls before the
 *      figure refreshes. This counter bounds a single instance regardless of
 *      Redis or cache freshness. Resets on cold start (new lambda).
 *
 *   2. Daily HARD kill-switch — complete() only DOWNGRADES at the soft cap, so a
 *      runaway accrues cheap-tier cost indefinitely. This is the absolute
 *      ceiling at which calls are refused outright.
 *
 * All helpers read env at call time so limits are configurable and testable.
 */

// Per-instance (per-lambda) LLM call counter. Module-level = per process.
let instanceCalls = 0;

/** Read the per-instance ceiling from env at call time (default 5000). */
export function perInstanceMaxCalls() {
  const n = parseInt(process.env.LLM_PER_INSTANCE_MAX_CALLS, 10);
  return Number.isFinite(n) && n > 0 ? n : 5000;
}

/** Record one real (billable) LLM call on this instance. Returns the new total. */
export function recordLlmCall() {
  instanceCalls += 1;
  return instanceCalls;
}

/** Calls this instance has made since cold start. */
export function getInstanceCalls() {
  return instanceCalls;
}

/** True once this instance has hit its call ceiling. */
export function instanceCeilingExceeded() {
  return instanceCalls >= perInstanceMaxCalls();
}

/** Test-only: reset the per-instance counter (also models a cold start). */
export function __resetInstanceCalls() {
  instanceCalls = 0;
}

/**
 * The absolute daily spend ceiling (USD). An explicit LLM_DAILY_HARD_LIMIT_USD
 * wins; otherwise default to max(3x the soft budget, $30) so a brief overshoot
 * only downgrades (soft cap) while a true runaway hard-stops.
 */
export function dailyHardLimitUsd() {
  const explicit = parseFloat(process.env.LLM_DAILY_HARD_LIMIT_USD);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const soft = parseFloat(process.env.LLM_DAILY_BUDGET_USD) || 10;
  return Math.max(soft * 3, 30);
}

/** True when today's spend has reached the hard ceiling. */
export function dailyHardLimitExceeded(dailyCostUsd) {
  return Number(dailyCostUsd) >= dailyHardLimitUsd();
}
