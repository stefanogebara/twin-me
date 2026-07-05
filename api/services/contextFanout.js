/**
 * raceContextFanout — the graceful-degradation core of fetchTwinContext.
 *
 * Extracted from twinContextBuilder.js so the twin-chat hot path's most
 * incident-prone logic can be unit-tested in isolation. TWO production 500s
 * traced back to earlier versions of this behaviour (a cold-start Whoop eval
 * and a Nango 6s leg timeout that re-threw instead of degrading), so the
 * contract is pinned by characterization tests in
 * tests/api/services/contextFanout.test.js.
 *
 * This module is intentionally dependency-free (no DB, no logger, no network):
 * the caller injects logging via the `onDegrade` callback. That keeps it a pure
 * function of its inputs and its tests a plain input matrix.
 *
 * Contract:
 *  - Each leg is expected to self-catch its own errors and — via the caller's
 *    `timed()` wrapper — reject with `<label>_leg_timeout` if it blows its
 *    per-leg budget.
 *  - A single leg timeout degrades ONLY that leg to its default; the other
 *    still-in-flight legs run to completion (they are NOT discarded). This is
 *    the fix the extracted code documents: before it, the first leg to hit its
 *    timer rejected Promise.all and every in-flight sibling was thrown away.
 *  - The global timer is the hard cap: when it fires, already-resolved legs
 *    keep their values and still-pending legs fall back to their defaults.
 *  - A leg that rejects with a NON-timeout error propagates (rethrows) — in
 *    practice legs self-catch, so this signals a genuine unexpected failure and
 *    should not be silently swallowed.
 *
 * @param {Promise<any>[]} fetchPromises  per-leg fetch promises (order matters)
 * @param {any[]} defaults                per-leg fallback values, same length/order
 * @param {number} timeoutMs             global circuit-breaker budget in ms
 * @param {{ onDegrade?: (reason: string) => void }} [opts]
 * @returns {Promise<{ contextResults: any[], circuitBreakerTripped: boolean, degradationReason: string|null }>}
 */
export async function raceContextFanout(fetchPromises, defaults, timeoutMs, { onDegrade } = {}) {
  // Track resolved values via microtasks so the breaker can use them without
  // waiting. Microtasks (Promise.then) are always processed before macrotasks
  // (setTimeout), so resolvedValues[] is fully populated for settled promises
  // when the global timeout fires.
  const resolvedValues = new Array(fetchPromises.length).fill(undefined);
  fetchPromises.forEach((p, i) => {
    p.then(v => { resolvedValues[i] = v; }).catch(() => { resolvedValues[i] = defaults[i]; });
  });

  // A per-leg timeout must degrade ONLY that leg, not abort the whole fan-out.
  // Guard each leg so a `_leg_timeout` rejection resolves to its default instead
  // of rejecting Promise.all — that way Promise.all below only rejects on the
  // genuine global breaker, and any single leg timeout falls back to its default
  // while the others run to completion.
  const guardedPromises = fetchPromises.map((p, i) =>
    p.catch(err => {
      if (/_leg_timeout$/.test(err?.message)) return defaults[i];
      throw err;
    })
  );

  let globalTimer;
  try {
    const contextResults = await Promise.race([
      Promise.all(guardedPromises),
      new Promise((_, reject) => {
        globalTimer = setTimeout(() => reject(new Error('fetchTwinContext timeout')), timeoutMs);
      }),
    ]);
    return { contextResults, circuitBreakerTripped: false, degradationReason: null };
  } catch (timeoutErr) {
    // Two graceful-degradation paths land here:
    //   1. The global breaker timer fired — message === 'fetchTwinContext timeout'.
    //   2. A per-leg timed() wrapper fired its own timer — message ends in
    //      '_leg_timeout' (e.g. 'platformData_leg_timeout').
    // Both are EXPECTED when a backend is slow (cold-start token refresh, cold
    // pgbouncer queueing) and must never propagate to a 500 in the chat handler.
    const isLegTimeout = /_leg_timeout$/.test(timeoutErr?.message);
    const isGlobalTimeout = timeoutErr?.message === 'fetchTwinContext timeout';
    if (isGlobalTimeout || isLegTimeout) {
      if (onDegrade) onDegrade(timeoutErr.message);
      // Use already-resolved values; fall back to defaults for still-pending legs.
      const contextResults = resolvedValues.map((v, i) => (v !== undefined ? v : defaults[i]));
      return { contextResults, circuitBreakerTripped: true, degradationReason: timeoutErr.message };
    }
    throw timeoutErr;
  } finally {
    // Clear the global timer so a late no-op rejection doesn't dangle after the
    // race has already settled (the original inline version leaked this timer).
    clearTimeout(globalTimer);
  }
}
