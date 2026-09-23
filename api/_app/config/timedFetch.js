/**
 * A fetch that gives up (2026-09-21).
 *
 * A Supabase call has no timeout of its own: on a dropped link, POST /auth/refresh waited
 * sixteen minutes on one while the route's 504 had long gone out. Every request the two
 * Supabase clients make goes through this, so a call that gets no answer fails in seconds
 * and the handler can say so. A caller's own signal still wins.
 */
export const DEFAULT_SUPABASE_TIMEOUT_MS = 25_000;

export function supabaseTimeoutMs(env = process.env) {
  const n = Number(env.SUPABASE_REQUEST_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_SUPABASE_TIMEOUT_MS;
}

/** fetch bound to a deadline: rejects with an AbortError named for the deadline. */
export function timedFetch(ms = supabaseTimeoutMs(), baseFetch = globalThis.fetch) {
  return (input, init = {}) => {
    const deadline = AbortSignal.timeout(ms);
    const signal = init.signal ? AbortSignal.any([init.signal, deadline]) : deadline;
    return baseFetch(input, { ...init, signal });
  };
}
