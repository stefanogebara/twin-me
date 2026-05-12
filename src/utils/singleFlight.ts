/**
 * singleFlight — collapse concurrent invocations of an async function into a
 * single in-flight promise.
 *
 * Use when:
 *  - A network call has side effects on the SERVER that can't be safely
 *    repeated (e.g. /auth/refresh rotates the refresh token — calling it
 *    twice in parallel invalidates the second caller).
 *  - React 18 StrictMode double-fires useEffect and you don't want a duplicate
 *    request to race.
 *  - Multiple components mount simultaneously after a hard nav and all ask
 *    for the same expensive resource.
 *
 * Bug C1 (audit-2026-05-12): magic-link signin landed users on
 * /auth?error=session_expired because StrictMode fired two concurrent
 * /auth/refresh calls. The first succeeded (server rotated RT, set new cookie),
 * the second saw the just-rotated RT and 401'd, tripping the session-disabled
 * guard. Wrapping refreshAccessToken with singleFlight collapses both calls
 * into one network round-trip and one promise resolution.
 *
 * Semantics:
 *  - While the wrapped fn is running, every additional call returns the SAME
 *    promise (no extra invocations of `fn`).
 *  - When the promise settles (resolve OR reject), the in-flight slot is
 *    cleared, so the NEXT call after settle starts fresh.
 *  - Returns a tuple-like API: the wrapped function plus an `isInFlight`
 *    inspector (handy for tests / debugging).
 */
export interface SingleFlightWrapped<T> {
  (): Promise<T>;
  isInFlight: () => boolean;
  // Test-only: forcibly clear the in-flight slot (e.g. between unit tests).
  reset: () => void;
}

export function singleFlight<T>(fn: () => Promise<T>): SingleFlightWrapped<T> {
  let inFlight: Promise<T> | null = null;

  const wrapped = (() => {
    if (inFlight) return inFlight;
    inFlight = fn().finally(() => {
      inFlight = null;
    });
    return inFlight;
  }) as SingleFlightWrapped<T>;

  wrapped.isInFlight = () => inFlight !== null;
  wrapped.reset = () => {
    inFlight = null;
  };

  return wrapped;
}
